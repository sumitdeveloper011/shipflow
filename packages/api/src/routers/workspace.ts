import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.workspace.findMany({
      where: {
        members: { some: { userId: ctx.session.user.id } },
      },
      include: {
        members: { include: { user: true } },
        billing: true,
        _count: { select: { projects: true, repositories: true } },
      },
    });
  }),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await ctx.db.workspace.findUnique({
        where: { slug: input.slug },
        include: {
          members: { include: { user: true } },
          billing: true,
          githubInstallation: true,
          _count: { select: { projects: true, repositories: true } },
        },
      });
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND" });

      const isMember = workspace.members.some(
        (m) => m.userId === ctx.session.user.id
      );
      if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });

      return workspace;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        slug: z
          .string()
          .min(2)
          .max(30)
          .regex(/^[a-z0-9-]+$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.workspace.findUnique({
        where: { slug: input.slug },
      });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });

      return ctx.db.workspace.create({
        data: {
          name: input.name,
          slug: input.slug,
          members: {
            create: { userId: ctx.session.user.id, role: "OWNER" },
          },
          billing: {
            create: { plan: "FREE", aiCreditsLimit: 10, repoLimit: 1 },
          },
        },
      });
    }),

  updateName: protectedProcedure
    .input(z.object({ workspaceId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.workspaceId);
      return ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: { name: input.name },
      });
    }),

  inviteMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx, input.workspaceId);
      const user = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      return ctx.db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: user.id } },
        create: { workspaceId: input.workspaceId, userId: user.id, role: input.role },
        update: { role: input.role },
      });
    }),

  getMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      return ctx.db.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId },
        include: { user: true },
      });
    }),

  removeMember: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx, input.workspaceId);

      // Cannot remove the owner
      const target = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the workspace owner" });
      }

      return ctx.db.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      });
    }),

  leaveWorkspace: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: ctx.session.user.id } },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });
      if (member.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Transfer ownership before leaving" });
      }
      return ctx.db.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: ctx.session.user.id } },
      });
    }),

  saveGithubInstallation: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      installationId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx, input.workspaceId);
      let accountLogin = "github-user";
      let accountType = "User";
      try {
        const { githubApp } = await import("../github");
        if (githubApp) {
          const octokit = await githubApp.getInstallationOctokit(input.installationId);
          const { data } = await octokit.request("GET /app/installations/{installation_id}", {
            installation_id: input.installationId,
          });
          accountLogin = data.account?.login ?? accountLogin;
          accountType = data.account?.type ?? accountType;
        }
      } catch { /* use placeholder */ }
      return ctx.db.githubInstallation.upsert({
        where: { workspaceId: input.workspaceId },
        create: { workspaceId: input.workspaceId, installationId: input.installationId, accountLogin, accountType },
        update: { installationId: input.installationId, accountLogin, accountType },
      });
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      userId: z.string(),
      role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx, input.workspaceId);
      const target = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot change the owner's role" });
      }
      return ctx.db.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        data: { role: input.role },
      });
    }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
  return m;
}

async function assertMember(ctx: any, workspaceId: string) {
  return getMember(ctx, workspaceId);
}

async function assertAdmin(ctx: any, workspaceId: string) {
  const m = await getMember(ctx, workspaceId);
  if (!["OWNER", "ADMIN"].includes(m.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return m;
}

async function assertOwner(ctx: any, workspaceId: string) {
  const m = await getMember(ctx, workspaceId);
  if (m.role !== "OWNER") throw new TRPCError({ code: "FORBIDDEN" });
  return m;
}
