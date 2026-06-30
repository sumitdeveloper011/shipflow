import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const prdRouter = router({
  getByFeatureRequest: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      return ctx.db.pRD.findUnique({
        where: { featureRequestId: input.featureRequestId },
        include: { tasks: { orderBy: { order: "asc" } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        prdId: z.string(),
        problemStatement: z.string().optional(),
        goals: z.array(z.string()).optional(),
        nonGoals: z.array(z.string()).optional(),
        userStories: z.any().optional(),
        acceptanceCriteria: z.any().optional(),
        edgeCases: z.array(z.string()).optional(),
        successMetrics: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { prdId, ...data } = input;
      const prd = await ctx.db.pRD.findUnique({
        where: { id: prdId },
        include: {
          featureRequest: { include: { project: { select: { workspaceId: true } } } },
        },
      });
      if (!prd) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, prd.featureRequest.project.workspaceId);

      return ctx.db.pRD.update({ where: { id: prdId }, data });
    }),

  approve: protectedProcedure
    .input(z.object({ prdId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prd = await ctx.db.pRD.findUnique({
        where: { id: input.prdId },
        include: {
          featureRequest: { include: { project: { select: { workspaceId: true } } } },
        },
      });
      if (!prd) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, prd.featureRequest.project.workspaceId);

      await ctx.db.pRD.update({ where: { id: input.prdId }, data: { status: "APPROVED" } });
      await ctx.db.featureRequest.update({
        where: { id: prd.featureRequestId },
        data: { status: "PLANNING" },
      });

      return { ok: true, prdId: input.prdId };
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}
