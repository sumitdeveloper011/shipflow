import { inngest } from "../inngest";
import { db } from "@shipflow/db";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

async function setWorkflowStep(featureRequestId: string, step: string, allSteps: string[]) {
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

const READINESS_STEPS = [
  "Gathering feature and PR context",
  "Analyzing task completion and blockers",
  "Running AI release readiness check",
  "Saving readiness report",
];

export const checkReleaseReadiness = inngest.createFunction(
  { id: "release-readiness", name: "AI: Release Readiness Check" },
  { event: "release/readiness-check" },
  async ({ event, step }) => {
    const { featureRequestId, releaseId } = event.data;

    // Gather all context needed for readiness check
    const context = await step.run("fetch-context", async () => {
      await setWorkflowStep(featureRequestId, READINESS_STEPS[0]!, READINESS_STEPS);
      const fr = await db.featureRequest.findUniqueOrThrow({
        where: { id: featureRequestId },
        include: {
          prd: { include: { tasks: true } },
          pullRequests: {
            include: {
              reviews: {
                include: { issues: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });
      return fr;
    });

    // Run AI readiness check
    const readiness = await step.run("ai-readiness-check", async () => {
      await setWorkflowStep(featureRequestId, READINESS_STEPS[1]!, READINESS_STEPS);
      const prd = context.prd;
      const tasks = (prd?.tasks ?? []) as Array<{ status: string; title: string; priority: string }>;
      const prs = context.pullRequests ?? [];

      const todoTasks = tasks.filter((t) => t.status === "TODO");
      const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
      const doneTasks = tasks.filter((t) => t.status === "DONE");

      const latestReview = prs[0]?.reviews?.[0];
      const blockingIssues = latestReview?.issues?.filter((i: { severity: string }) => i.severity === "BLOCKING") ?? [];
      const openBlockingIssues = blockingIssues.filter((i: { resolved: boolean }) => !i.resolved);

      await setWorkflowStep(featureRequestId, READINESS_STEPS[2]!, READINESS_STEPS);
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are a release manager performing the final readiness gate before a feature ships to production.\n" +
              "Your assessment will be read by a human reviewer who makes the final approval decision.\n\n" +
              "Standards for SHIP recommendation:\n" +
              "- All BLOCKING AI review issues must be resolved\n" +
              "- At least one pull request must be connected and reviewed\n" +
              "- Core acceptance criteria must have passed QA validation\n" +
              "- No CRITICAL priority tasks should remain in TODO status\n\n" +
              "For each blocker and warning:\n" +
              "- State WHAT the problem is\n" +
              "- Explain WHY it is a risk to production (user impact, data integrity, security, etc.)\n" +
              "- Be specific, not generic (e.g. not just no tests but no tests for the payment validation path which handles money)\n\n" +
              "Be conservative — a delayed release is recoverable; a broken production release is not.\n" +
              "Respond ONLY with valid JSON — no markdown, no code fences.",
          },
          {
            role: "user",
            content: "Feature: " + context.title + "\n\n" +
              "PRD Status:\n" +
              "- Problem Statement: " + (prd?.problemStatement || "Not defined") + "\n" +
              "- Goals: " + (prd?.goals ?? []).join(", ") + "\n" +
              "- Acceptance Criteria: " + JSON.stringify(prd?.acceptanceCriteria || []) + "\n\n" +
              "Task Completion:\n" +
              "- Total Tasks: " + tasks.length + "\n" +
              "- Done: " + doneTasks.length + "\n" +
              "- In Progress: " + inProgressTasks.length + "\n" +
              "- Todo (remaining): " + todoTasks.length + "\n" +
              "- Critical tasks still TODO: " + tasks.filter((t) => t.priority === "CRITICAL" && t.status === "TODO").map((t) => t.title).join(", ") + "\n" +
              "- Completion Rate: " + (tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0) + "%\n\n" +
              "Pull Requests: " + prs.length + " connected\n" +
              "Latest AI Review: " + (latestReview ? "Verdict: " + latestReview.verdict + ", Requirements Coverage: " + latestReview.requirementsCoverage + "%" : "No AI review yet") + "\n" +
              "Open Blocking Issues: " + openBlockingIssues.length + "\n" +
              (openBlockingIssues.length > 0 ? "Blocking Issue Titles: " + openBlockingIssues.map((i: { title: string }) => i.title).join("; ") + "\n" : "") + "\n" +
              "Assess release readiness with SPECIFIC, ACTIONABLE feedback. Respond with:\n" +
              "{\n" +
              "  \"isReady\": boolean,\n" +
              "  \"score\": number 0-100,\n" +
              "  \"blockers\": [\"string - WHAT the problem is + WHY it is a production risk (be specific, not generic)\"],\n" +
              "  \"warnings\": [\"string - non-critical concern + what could go wrong if ignored\"],\n" +
              "  \"summary\": \"string - 3-4 sentence executive summary covering overall quality, key risks, and your recommendation rationale\",\n" +
              "  \"recommendation\": \"SHIP|HOLD|FIX_REQUIRED\"\n" +
              "}",
          },
        ],
      });

      try {
        return JSON.parse(text) as {
          isReady: boolean;
          score: number;
          blockers: string[];
          warnings: string[];
          summary: string;
          recommendation: "SHIP" | "HOLD" | "FIX_REQUIRED";
        };
      } catch {
        // Derive from data if AI fails
        const prs_done = prs.length > 0;
        const tasks_done = tasks.length === 0 || doneTasks.length / tasks.length >= 0.8;
        const no_blockers = openBlockingIssues.length === 0;
        const has_review = !!latestReview && latestReview.verdict !== "BLOCKED";

        return {
          isReady: prs_done && tasks_done && no_blockers && has_review,
          score: Math.round(
            (Number(prs_done) * 25 + Number(tasks_done) * 25 + Number(no_blockers) * 25 + Number(has_review) * 25)
          ),
          blockers: [
            ...(!prs_done ? ["No pull requests connected"] : []),
            ...(!no_blockers ? [`${openBlockingIssues.length} blocking issues unresolved`] : []),
          ],
          warnings: [...(!tasks_done ? ["Tasks not fully completed"] : [])],
          summary: "Automated readiness check completed.",
          recommendation: no_blockers && prs_done ? "SHIP" : "FIX_REQUIRED",
        };
      }
    });

    // Update release with readiness report
    await step.run("save-readiness", async () => {
      await setWorkflowStep(featureRequestId, READINESS_STEPS[3]!, READINESS_STEPS);
      await db.release.update({
        where: { id: releaseId },
        data: {
          readinessReport: readiness,
          readinessScore: readiness.score,
        },
      });
      // Clear workflow step on completion
      const freshFr = await db.featureRequest.findUnique({ where: { id: featureRequestId }, select: { aiMessages: true } });
      const cleanMsgs = ((freshFr?.aiMessages as Record<string, unknown>[]) || []).filter((m) => m["role"] !== "workflow");
      await db.featureRequest.update({
        where: { id: featureRequestId },
        data: { aiMessages: cleanMsgs },
      });
    });

    return { success: true, featureRequestId, readiness };
  }
);
