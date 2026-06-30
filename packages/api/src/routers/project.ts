import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const projectRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      return ctx.db.project.findMany({
        where: { workspaceId: input.workspaceId, status: "ACTIVE" },
        include: {
          repository: true,
          _count: { select: { featureRequests: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        include: { repository: true, workspace: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, project.workspaceId);
      return project;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        repositoryId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      return ctx.db.project.create({ data: input });
    }),

  update: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        repositoryId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      const project = await ctx.db.project.findUnique({ where: { id: projectId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, project.workspaceId);
      return ctx.db.project.update({ where: { id: projectId }, data });
    }),

  archive: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, project.workspaceId);
      return ctx.db.project.update({
        where: { id: input.projectId },
        data: { status: "ARCHIVED" },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, project.workspaceId);
      return ctx.db.project.delete({ where: { id: input.projectId } });
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}

