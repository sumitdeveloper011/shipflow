export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { githubApp, inngest } from "@shipflow/api";
import { db } from "@shipflow/db";

// Try to auto-match a PR branch to a feature request.
// Convention: branches named feat/FR_ID, feature/FR_ID, shipflow/FR_ID, or
// containing the cuid of a feature request get auto-linked.
async function autoMatchFeatureRequest(
  workspaceId: string,
  headBranch: string
): Promise<string | null> {
  // Look for a cuid-like segment (24 chars, starts with c) in the branch name
  const cuidRegex = /c[a-z0-9]{23}/g;
  const matches = headBranch.match(cuidRegex) ?? [];

  for (const candidate of matches) {
    const fr = await db.featureRequest.findFirst({
      where: {
        id: candidate,
        project: { workspaceId },
      },
      select: { id: true },
    });
    if (fr) return fr.id;
  }

  // Also try slug-style: feat/my-feature-title — match by title slug (best-effort)
  return null;
}

export async function POST(req: NextRequest) {
  if (!githubApp) {
    return NextResponse.json({ ok: true, note: "GitHub App not configured" });
  }

  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const event = req.headers.get("x-github-event") ?? "";
  const deliveryId = req.headers.get("x-github-delivery") ?? "";

  try {
    await githubApp.webhooks.verifyAndReceive({
      id: deliveryId,
      name: event as any,
      signature,
      payload: body,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);

  try {
    if (event === "pull_request") {
      const repo = await db.repository.findUnique({
        where: { githubRepoId: BigInt(payload.repository.id) },
      });
      if (!repo) return NextResponse.json({ ok: true });

      const prData = payload.pull_request;
      const state: "OPEN" | "CLOSED" | "MERGED" =
        prData.state === "open" ? "OPEN" : prData.merged ? "MERGED" : "CLOSED";

      // Auto-detect feature request from branch name
      const detectedFrId = await autoMatchFeatureRequest(
        repo.workspaceId,
        prData.head.ref
      );

      const pr = await db.pullRequest.upsert({
        where: { repositoryId_number: { repositoryId: repo.id, number: prData.number } },
        create: {
          repositoryId: repo.id,
          githubPrId: BigInt(prData.id),
          number: prData.number,
          title: prData.title,
          body: prData.body ?? null,
          state,
          headBranch: prData.head.ref,
          baseBranch: prData.base.ref,
          htmlUrl: prData.html_url,
          authorLogin: prData.user.login,
          featureRequestId: detectedFrId,
        },
        update: {
          title: prData.title,
          body: prData.body ?? null,
          state,
          // Only set featureRequestId if we found one and it wasn't set before
          ...(detectedFrId ? { featureRequestId: detectedFrId } : {}),
        },
      });

      // When PR is opened: if linked to a feature request in IN_DEVELOPMENT, move it to IN_REVIEW
      if (
        payload.action === "opened" &&
        (pr.featureRequestId || detectedFrId)
      ) {
        const frId = pr.featureRequestId ?? detectedFrId;
        if (frId) {
          const fr = await db.featureRequest.findUnique({ where: { id: frId } });
          if (fr && fr.status === "IN_DEVELOPMENT") {
            await db.featureRequest.update({
              where: { id: frId },
              data: { status: "IN_REVIEW" },
            });
          }

          // Auto-trigger AI review when PR is opened
          const review = await db.aIReview.create({
            data: {
              pullRequestId: pr.id,
              summary: "",
              verdict: "NEEDS_CHANGES",
              requirementsCoverage: 0,
              status: "PENDING",
            },
          });

          await inngest.send({
            name: "review/run",
            data: {
              reviewId: review.id,
              pullRequestId: pr.id,
              featureRequestId: frId,
              workspaceId: repo.workspaceId,
            },
          });
        }
      }

      // On synchronize (push to PR): re-run AI review
      if (payload.action === "synchronize") {
        // Re-fetch PR to get latest featureRequestId (may have been linked after initial push)
        const freshPR = await db.pullRequest.findUnique({
          where: { id: pr.id },
          select: { featureRequestId: true },
        });
        const frId = freshPR?.featureRequestId ?? detectedFrId ?? null;

        const newReview = await db.aIReview.create({
          data: {
            pullRequestId: pr.id,
            summary: "",
            verdict: "NEEDS_CHANGES",
            requirementsCoverage: 0,
            status: "PENDING",
          },
        });

        await inngest.send({
          name: "review/run",
          data: {
            reviewId: newReview.id,
            pullRequestId: pr.id,
            featureRequestId: frId,
            workspaceId: repo.workspaceId,
          },
        });

        // Move feature back to IN_REVIEW if it was FIX_NEEDED
        if (frId) {
          const fr = await db.featureRequest.findUnique({ where: { id: frId } });
          if (fr?.status === "FIX_NEEDED") {
            await db.featureRequest.update({
              where: { id: frId },
              data: { status: "IN_REVIEW" },
            });
          }
        }
      }

      // On merge: move linked feature to HUMAN_REVIEW if it was in IN_REVIEW / FIX_NEEDED
      if (payload.action === "closed" && prData.merged && pr.featureRequestId) {
        const fr = await db.featureRequest.findUnique({
          where: { id: pr.featureRequestId },
        });
        if (fr && ["IN_REVIEW", "FIX_NEEDED"].includes(fr.status)) {
          await db.featureRequest.update({
            where: { id: pr.featureRequestId },
            data: { status: "HUMAN_REVIEW" },
          });
        }
      }
    }

    // Handle GitHub App installation/uninstallation events
    if (event === "installation") {
      if (payload.action === "deleted") {
        // GitHub App was uninstalled — remove the installation record
        const installationId = payload.installation?.id;
        if (installationId) {
          await db.githubInstallation.deleteMany({
            where: { installationId },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
