import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { inngest } from "../inngest";

export const reviewRouter = router({
  listByPR: protectedProcedure
    .input(z.object({ pullRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pr = await ctx.db.pullRequest.findUnique({
        where: { id: input.pullRequestId },
        include: { repository: true },
      });
      if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, pr.repository.workspaceId);

      return ctx.db.aIReview.findMany({
        where: { pullRequestId: input.pullRequestId },
        include: { issues: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ reviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.db.aIReview.findUnique({
        where: { id: input.reviewId },
        include: {
          issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
          pullRequest: { include: { repository: true } },
        },
      });
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, review.pullRequest.repository.workspaceId);
      return review;
    }),

  triggerReview: protectedProcedure
    .input(
      z.object({
        pullRequestId: z.string(),
        featureRequestId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pr = await ctx.db.pullRequest.findUnique({
        where: { id: input.pullRequestId },
        include: { repository: true },
      });
      if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, pr.repository.workspaceId);

      const billing = await ctx.db.billing.findUnique({
        where: { workspaceId: pr.repository.workspaceId },
      });
      if (billing && billing.aiCreditsUsed >= billing.aiCreditsLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "AI review credits exhausted. Upgrade your plan.",
        });
      }

      const review = await ctx.db.aIReview.create({
        data: {
          pullRequestId: input.pullRequestId,
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
          pullRequestId: input.pullRequestId,
          featureRequestId: input.featureRequestId ?? pr.featureRequestId ?? undefined,
          workspaceId: pr.repository.workspaceId,
        },
      });

      return review;
    }),

  resolveIssue: protectedProcedure
    .input(z.object({ issueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.reviewIssue.update({
        where: { id: input.issueId },
        data: { resolved: true },
      });
    }),

  listByWorkspace: protectedProcedure
    .input(z.object({ workspaceId: z.string(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);

      const repos = await ctx.db.repository.findMany({
        where: { workspaceId: input.workspaceId },
        select: { id: true },
      });
      const repoIds = repos.map((r) => r.id);

      const reviews = await ctx.db.aIReview.findMany({
        where: {
          pullRequest: { repositoryId: { in: repoIds } },
          status: "COMPLETED",
        },
        include: {
          pullRequest: {
            include: { repository: { select: { name: true } } },
          },
          issues: { select: { severity: true, resolved: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      return reviews.map((r) => ({
        id: r.id,
        verdict: r.verdict,
        status: r.status,
        summary: r.summary,
        requirementsCoverage: r.requirementsCoverage,
        createdAt: r.createdAt,
        blockingIssues: r.issues.filter((i) => i.severity === "BLOCKING" && !i.resolved).length,
        nonBlockingIssues: r.issues.filter((i) => i.severity === "NON_BLOCKING" && !i.resolved).length,
        resolvedIssues: r.issues.filter((i) => i.resolved).length,
        pullRequest: {
          id: r.pullRequest.id,
          number: r.pullRequest.number,
          title: r.pullRequest.title,
          htmlUrl: r.pullRequest.htmlUrl,
          headBranch: r.pullRequest.headBranch,
          repository: r.pullRequest.repository,
        },
      }));
    }),

  /** Latest review for a feature request (across all linked PRs) */
  getLatestForFeature: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      return ctx.db.aIReview.findFirst({
        where: {
          pullRequest: { featureRequestId: input.featureRequestId },
          status: "COMPLETED",
        },
        include: {
          issues: {
            where: { resolved: false },
            orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
          },
          pullRequest: { select: { number: true, title: true, htmlUrl: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** All reviews for a feature request (review cycle history) */
  listByFeature: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      const reviews = await ctx.db.aIReview.findMany({
        where: {
          pullRequest: { featureRequestId: input.featureRequestId },
        },
        include: {
          issues: { select: { severity: true, resolved: true } },
          pullRequest: { select: { number: true, title: true, headBranch: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return reviews.map((r) => ({
        id: r.id,
        verdict: r.verdict,
        status: r.status,
        summary: r.summary,
        requirementsCoverage: r.requirementsCoverage,
        createdAt: r.createdAt,
        blockingCount: r.issues.filter((i) => i.severity === "BLOCKING").length,
        nonBlockingCount: r.issues.filter((i) => i.severity === "NON_BLOCKING").length,
        resolvedCount: r.issues.filter((i) => i.resolved).length,
        pullRequest: r.pullRequest,
      }));
    }),

  /** Mark all RUNNING/PENDING reviews for a workspace as FAILED — clears stuck reviews */
  resetStuckReviews: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      const result = await ctx.db.aIReview.updateMany({
        where: {
          status: { in: ["RUNNING", "PENDING"] },
          pullRequest: { repository: { workspaceId: input.workspaceId } },
        },
        data: { status: "FAILED", summary: "Manually cancelled — workflow did not complete." },
      });
      return { count: result.count };
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}
