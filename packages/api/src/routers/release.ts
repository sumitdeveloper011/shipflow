import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { inngest } from "../inngest";

export const releaseRouter = router({
  getByFeatureRequest: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      return ctx.db.release.findUnique({
        where: { featureRequestId: input.featureRequestId },
        include: { reviewedBy: { select: { id: true, name: true, image: true } } },
      });
    }),

  /** Full review package for human approver: PRD, tasks, PRs, AI reviews */
  getReviewPackage: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: {
          project: { select: { workspaceId: true, name: true } },
          createdBy: { select: { name: true } },
          prd: { include: { tasks: { orderBy: { order: "asc" } } } },
          pullRequests: {
            include: {
              reviews: {
                include: { issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] } },
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
            orderBy: { updatedAt: "desc" },
          },
          release: { include: { reviewedBy: { select: { id: true, name: true } } } },
        },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);
      return fr;
    }),

  requestApproval: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      await ctx.db.featureRequest.update({
        where: { id: input.featureRequestId },
        data: { status: "HUMAN_REVIEW" },
      });

      const release = await ctx.db.release.upsert({
        where: { featureRequestId: input.featureRequestId },
        create: { featureRequestId: input.featureRequestId, status: "PENDING" },
        update: { status: "PENDING" },
      });

      await inngest.send({
        name: "release/readiness-check",
        data: { featureRequestId: input.featureRequestId, releaseId: release.id },
      });

      return release;
    }),

  approve: protectedProcedure
    .input(z.object({ featureRequestId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdmin(ctx, fr.project.workspaceId);

      await ctx.db.featureRequest.update({
        where: { id: input.featureRequestId },
        data: { status: "APPROVED" },
      });

      return ctx.db.release.update({
        where: { featureRequestId: input.featureRequestId },
        data: {
          status: "APPROVED",
          reviewedById: ctx.session.user.id,
          approvedAt: new Date(),
          notes: input.notes,
        },
      });
    }),

  reject: protectedProcedure
    .input(z.object({ featureRequestId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdmin(ctx, fr.project.workspaceId);

      await ctx.db.featureRequest.update({
        where: { id: input.featureRequestId },
        data: { status: "FIX_NEEDED" },
      });

      return ctx.db.release.update({
        where: { featureRequestId: input.featureRequestId },
        data: { status: "REJECTED", reviewedById: ctx.session.user.id, notes: input.notes },
      });
    }),

  ship: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdmin(ctx, fr.project.workspaceId);
      if (fr.status !== "APPROVED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Feature must be APPROVED before shipping." });
      }

      await ctx.db.featureRequest.update({
        where: { id: input.featureRequestId },
        data: { status: "SHIPPED" },
      });

      return ctx.db.release.update({
        where: { featureRequestId: input.featureRequestId },
        data: { status: "SHIPPED" },
      });
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}

async function assertAdmin(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m || !["OWNER", "ADMIN"].includes(m.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can approve releases." });
  }
}
