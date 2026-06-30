import { inngest } from "../inngest";
import { db } from "@shipflow/db";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getPRDiff, postReviewComment } from "../github";

// ── Helper: write current workflow step into featureRequest.aiMessages ─────────
async function setWorkflowStep(featureRequestId: string | null | undefined, step: string, allSteps: string[]) {
  if (!featureRequestId) return;
  const fr = await db.featureRequest.findUnique({
    where: { id: featureRequestId },
    select: { aiMessages: true },
  });
  const msgs = (fr?.aiMessages as Record<string, unknown>[]) || [];
  const withoutWorkflow = msgs.filter((m) => m["role"] !== "workflow");
  await db.featureRequest.update({
    where: { id: featureRequestId },
    data: {
      aiMessages: [
        ...withoutWorkflow,
        { role: "workflow", step, steps: allSteps, timestamp: new Date().toISOString() },
      ],
    },
  });
}

const REVIEW_STEPS = [
  "Fetching PR context and PRD",
  "Downloading code diff from GitHub",
  "Validating acceptance criteria (QA pass)",
  "Running comprehensive code review",
  "Saving review results",
  "Posting review to GitHub PR",
];

export const runAIReview = inngest.createFunction(
  {
    id: "review-run",
    name: "AI: Code Review Against PRD",
    retries: 2,
  },
  { event: "review/run" },
  async ({ event, step }) => {
    const { reviewId, pullRequestId, featureRequestId, workspaceId } = event.data;

    // Wrap everything in try-catch so a crash always marks the review as FAILED
    const runWithErrorGuard = async () => {
    // Mark review as running
    await step.run("mark-running", async () => {
      await setWorkflowStep(featureRequestId, REVIEW_STEPS[0]!, REVIEW_STEPS);
      return db.aIReview.update({
        where: { id: reviewId },
        data: { status: "RUNNING" },
      });
    });

    // Fetch all context
    const context = await step.run("fetch-context", async () => {
      const [pr, installation, fr] = await Promise.all([
        db.pullRequest.findUnique({
          where: { id: pullRequestId },
          include: { repository: true },
        }),
        db.githubInstallation.findUnique({ where: { workspaceId } }),
        featureRequestId
          ? db.featureRequest.findUnique({
              where: { id: featureRequestId },
              include: { prd: { include: { tasks: true } } },
            })
          : null,
      ]);
      return { pr, installation, fr };
    });

    if (!context.pr || !context.installation) throw new Error("PR or installation not found");

    // Fetch real diff from GitHub
    const diffData = await step.run("fetch-diff", async () => {
      await setWorkflowStep(featureRequestId, REVIEW_STEPS[1]!, REVIEW_STEPS);
      return getPRDiff(
        context.installation!.installationId,
        context.pr!.repository.owner,
        context.pr!.repository.name,
        context.pr!.number
      );
    });

    // Build review prompt
    const prdContext = context.fr?.prd
      ? `
PRD Context:
Problem Statement: ${context.fr.prd.problemStatement}
Goals: ${context.fr.prd.goals.join(", ")}
Acceptance Criteria: ${JSON.stringify(context.fr.prd.acceptanceCriteria, null, 2)}
Edge Cases: ${context.fr.prd.edgeCases.join(", ")}
Engineering Tasks: ${(context.fr.prd.tasks as Array<{ status: string; title: string }>).map((t) => `- [${t.status}] ${t.title}`).join("\n")}
`
      : "No PRD context available — review code quality only.";

    const changedFiles = diffData.files
      .map(
        (f: { filename: string; status: string; additions: number; deletions: number; patch?: string }) =>
          `\n### ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n\`\`\`diff\n${f.patch?.slice(0, 3000) || "(binary or empty)"}\n\`\`\``
      )
      .join("\n");

    // ── QA Validation: check each Acceptance Criterion individually ─────────
    const qaIssues = await step.run("qa-validation", async () => {
      await setWorkflowStep(featureRequestId, REVIEW_STEPS[2]!, REVIEW_STEPS);
      if (!context.fr?.prd?.acceptanceCriteria || (context.fr.prd.acceptanceCriteria as unknown[]).length === 0) {
        return [] as Array<{
          category: string; severity: string; title: string;
          description: string; filePath: null; lineNumber: null; suggestion: string;
        }>;
      }

      const acList = context.fr.prd.acceptanceCriteria as Array<{ id: string; description: string; testable: boolean }>;

      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are Taylor, a QA lead with 8 years of acceptance testing experience." +
              " For each AC: PASS only when the code clearly implements it end-to-end. PARTIAL if the logic exists but edge cases are missing. FAIL if the implementation is absent or broken." +
              " Be concrete: name the file and line that proves your verdict, or name exactly what is missing." +
              " Respond ONLY with valid JSON - no markdown, no code fences."          },
          {
            role: "user",
            content: "PR #" + context.pr!.number + ": " + context.pr!.title + "\n\n" +
              "Acceptance Criteria to validate:\n" + JSON.stringify(acList, null, 2) + "\n\n" +
              "Code changes:\n" + changedFiles + "\n\n" +
              "For each AC, return JSON:\n" +
              "{\n" +
              "  \"results\": [\n" +
              "    {\n" +
              "      \"acId\": \"string - the AC id\",\n" +
              "      \"acDescription\": \"string - the AC text\",\n" +
              "      \"status\": \"PASS|FAIL|PARTIAL\",\n" +
              "      \"evidence\": \"string - specific file/line that proves PASS, or exactly what is missing for FAIL/PARTIAL\",\n" +
              "      \"severity\": \"BLOCKING|NON_BLOCKING\"\n" +
              "    }\n" +
              "  ]\n" +
              "}",
          },
        ],
      });

      try {
        const parsed = JSON.parse(text) as {
          results: Array<{
            acId: string;
            acDescription: string;
            status: "PASS" | "FAIL" | "PARTIAL";
            evidence: string;
            severity: "BLOCKING" | "NON_BLOCKING";
          }>;
        };

        // Convert failing ACs into review issues
        return parsed.results
          .filter((r) => r.status !== "PASS")
          .map((r) => ({
            category: "ACCEPTANCE_CRITERIA",
            severity: r.severity,
            title: "[" + r.status + "] AC " + r.acId + ": " + r.acDescription.slice(0, 80),
            description: "Acceptance criterion " + r.acId + " is " + r.status + ". " + r.evidence +
              " WHY this matters: this criterion was explicitly agreed upon as the definition of done for this feature.",
            filePath: null as null,
            lineNumber: null as null,
            suggestion: "Implement or complete: " + r.acDescription,
          }));
      } catch {
        return [] as Array<{
          category: string; severity: string; title: string;
          description: string; filePath: null; lineNumber: null; suggestion: string;
        }>;
      }
    });

    // ── Main AI Code Review ────────────────────────────────────────────────
    const reviewData = await step.run("run-review", async () => {
      await setWorkflowStep(featureRequestId, REVIEW_STEPS[3]!, REVIEW_STEPS);
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are Alex, a staff engineer who has reviewed thousands of PRs and cares deeply about production reliability.\n" +
              "Review this PR: does it implement what the PRD asked? Any security holes? Will it hold under load? What will break in 6 months?\n" +
              "For every issue: explain what it is, the production risk (data loss, latency, auth bypass, etc.), and give a concrete fix.\n" +
              "BLOCKING = must fix before merge. NON_BLOCKING = should fix but can ship.\n" +
              "Skip anything already flagged in the AC validation step above.\n" +
              "Respond ONLY with valid JSON - no markdown, no code fences.",
          },
          {
            role: "user",
            content: "PR #" + context.pr!.number + ": " + context.pr!.title + "\n" +
              (context.pr!.body || "No description") + "\n\n" +
              prdContext + "\n\n" +
              "Changed Files:\n" + changedFiles + "\n\n" +
              "Review this PR for security, performance, edge cases, and code quality. Return JSON:\n" +
              "{\n" +
              "  \"summary\": \"string - 2-3 sentence executive summary of overall quality and readiness\",\n" +
              "  \"verdict\": \"APPROVED|NEEDS_CHANGES|BLOCKED\",\n" +
              "  \"requirementsCoverage\": 85,\n" +
              "  \"issues\": [\n" +
              "    {\n" +
              "      \"category\": \"REQUIREMENTS|SECURITY|PERFORMANCE|CODE_QUALITY|EDGE_CASE\",\n" +
              "      \"severity\": \"BLOCKING|NON_BLOCKING\",\n" +
              "      \"title\": \"string - concise issue title\",\n" +
              "      \"description\": \"string - explain WHY this is an issue and what breaks in production if not fixed\",\n" +
              "      \"filePath\": \"string or null\",\n" +
              "      \"lineNumber\": null,\n" +
              "      \"suggestion\": \"string - specific, actionable fix with example code if helpful\"\n" +
              "    }\n" +
              "  ]\n" +
              "}",
          },
        ],
      });

      try {
        return JSON.parse(text) as {
          summary: string;
          verdict: "APPROVED" | "NEEDS_CHANGES" | "BLOCKED";
          requirementsCoverage: number;
          issues: Array<{
            category: string;
            severity: string;
            title: string;
            description: string;
            filePath: string | null;
            lineNumber: number | null;
            suggestion: string;
          }>;
        };
      } catch {
        return {
          summary: "AI review completed. Manual review recommended.",
          verdict: "NEEDS_CHANGES" as const,
          requirementsCoverage: 0,
          issues: [],
        };
      }
    });

    // Merge QA issues into review data
    reviewData.issues = [...qaIssues, ...(reviewData.issues ?? [])];
    if (qaIssues.some((i) => i.severity === "BLOCKING") && reviewData.verdict === "APPROVED") {
      reviewData.verdict = "NEEDS_CHANGES";
    }

    // Save review results
    await step.run("save-review", async () => {
      await setWorkflowStep(featureRequestId, REVIEW_STEPS[4]!, REVIEW_STEPS);
      await db.aIReview.update({
        where: { id: reviewId },
        data: {
          summary: reviewData.summary,
          verdict: reviewData.verdict,
          requirementsCoverage: reviewData.requirementsCoverage,
          status: "COMPLETED",
        },
      });

      if (reviewData.issues?.length > 0) {
        await db.reviewIssue.createMany({
          data: reviewData.issues.map((issue) => ({
            reviewId,
            category: issue.category as "REQUIREMENTS" | "SECURITY" | "PERFORMANCE" | "CODE_QUALITY" | "EDGE_CASE" | "ACCEPTANCE_CRITERIA",
            severity: issue.severity as "BLOCKING" | "NON_BLOCKING",
            title: issue.title,
            description: issue.description,
            filePath: issue.filePath || null,
            lineNumber: issue.lineNumber || null,
            suggestion: issue.suggestion,
          })),
        });
      }
    });

    // Post comment to GitHub PR
    await step.run("post-github-comment", async () => {
      await setWorkflowStep(featureRequestId, REVIEW_STEPS[5]!, REVIEW_STEPS);
      const blockingIssues = reviewData.issues?.filter((i) => i.severity === "BLOCKING") || [];
      const nonBlockingIssues = reviewData.issues?.filter((i) => i.severity === "NON_BLOCKING") || [];

      const verdictEmoji = { APPROVED: "✅", NEEDS_CHANGES: "⚠️", BLOCKED: "🚫" }[reviewData.verdict] || "🔍";

      const commentBody = `## ${verdictEmoji} ShipFlow AI Review

**Verdict:** ${reviewData.verdict}
**Requirements Coverage:** ${reviewData.requirementsCoverage}%

### Summary
${reviewData.summary}

${blockingIssues.length > 0 ? `### 🚫 Blocking Issues (${blockingIssues.length})
${blockingIssues.map((i) => `- **${i.title}** (${i.category})\n  ${i.description}\n  💡 *${i.suggestion}*`).join("\n\n")}` : ""}

${nonBlockingIssues.length > 0 ? `### ⚠️ Non-Blocking Issues (${nonBlockingIssues.length})
${nonBlockingIssues.map((i) => `- **${i.title}** (${i.category})\n  ${i.description}`).join("\n\n")}` : ""}

---
*Reviewed by ShipFlow AI · [View full review](${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://shipflow.app"})*`;

      return postReviewComment(
        context.installation!.installationId,
        context.pr!.repository.owner,
        context.pr!.repository.name,
        context.pr!.number,
        commentBody
      );
    });

    // Update feature request status
    if (featureRequestId) {
      await step.run("update-fr-status", async () => {
        const status = reviewData.verdict === "BLOCKED" || reviewData.verdict === "NEEDS_CHANGES"
          ? "FIX_NEEDED"
          : "IN_REVIEW";
        const freshFr = await db.featureRequest.findUnique({ where: { id: featureRequestId }, select: { aiMessages: true } });
        const cleanMsgs = ((freshFr?.aiMessages as Record<string, unknown>[]) || []).filter((m) => m["role"] !== "workflow");
        return db.featureRequest.update({
          where: { id: featureRequestId },
          data: { status, aiMessages: cleanMsgs },
        });
      });
    }

    // Decrement AI credits
    await step.run("decrement-credits", async () => {
      return db.billing.update({
        where: { workspaceId },
        data: { aiCreditsUsed: { increment: 1 } },
      });
    });

    return { success: true, verdict: reviewData.verdict };
    }; // end runWithErrorGuard

    try {
      return await runWithErrorGuard();
    } catch (err) {
      // Mark the review as FAILED so it doesn't stay stuck as RUNNING
      await db.aIReview.update({
        where: { id: reviewId },
        data: {
          status: "FAILED",
          summary: `Review failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      }).catch(() => {}); // ignore if review record doesn't exist
      throw err; // re-throw so Inngest shows the error
    }
  }
);

// ─── Re-review when PR is synchronized (new commits pushed) ────────────────

export const onPRSynchronize = inngest.createFunction(
  {
    id: "pr-synchronize",
    name: "AI: Re-review on PR Update",
    retries: 2,
  },
  { event: "github/pull_request.synchronize" },
  async ({ event, step }) => {
    const { pullRequestId, workspaceId, featureRequestId } = event.data;

    // Create a new review record
    const review = await step.run("create-review", async () => {
      return db.aIReview.create({
        data: {
          pullRequestId,
          summary: "Re-review triggered by new commits.",
          verdict: "NEEDS_CHANGES",
          requirementsCoverage: 0,
          status: "PENDING",
        },
      });
    });

    // Trigger the full review workflow (reuse review/run event)
    await step.sendEvent("trigger-review", {
      name: "review/run",
      data: {
        reviewId: review.id,
        pullRequestId,
        featureRequestId,
        workspaceId,
      },
    });

    return { reviewId: review.id };
  }
);
