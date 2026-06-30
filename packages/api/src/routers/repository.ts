import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { getOctokitForInstallation, getOpenPRsForRepo } from "../github";
import { inngest } from "../inngest";

export const repositoryRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      return ctx.db.repository.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: "asc" },
      });
    }),

  listAvailable: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      const installation = await ctx.db.githubInstallation.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if (!installation) return [];

      const octokit = await getOctokitForInstallation(installation.installationId);
      const { data } = await octokit.request("GET /installation/repositories", { per_page: 100 });

      const connected = await ctx.db.repository.findMany({
        where: { workspaceId: input.workspaceId },
        select: { githubRepoId: true },
      });
      const connectedIds = new Set(connected.map((r) => r.githubRepoId.toString()));

      return data.repositories.map((r) => ({
        githubRepoId: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner.login,
        private: r.private,
        url: r.html_url,
        defaultBranch: r.default_branch,
        alreadyConnected: connectedIds.has(r.id.toString()),
      }));
    }),

  connect: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        githubRepoId: z.number(),
        name: z.string(),
        fullName: z.string(),
        owner: z.string(),
        private: z.boolean(),
        url: z.string(),
        defaultBranch: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);

      const billing = await ctx.db.billing.findUnique({ where: { workspaceId: input.workspaceId } });
      const repoCount = await ctx.db.repository.count({ where: { workspaceId: input.workspaceId } });
      if (billing && repoCount >= billing.repoLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Repo limit (" + billing.repoLimit + ") reached. Upgrade your plan.",
        });
      }

      const repo = await ctx.db.repository.upsert({
        where: { githubRepoId: BigInt(input.githubRepoId) },
        create: { ...input, githubRepoId: BigInt(input.githubRepoId) },
        update: { name: input.name, url: input.url, defaultBranch: input.defaultBranch },
      });

      await inngest.send({
        name: "repository/analyze",
        data: { repositoryId: repo.id, workspaceId: input.workspaceId },
      });

      return repo;
    }),

  /** Connect a repo by typing owner/repo-name — fallback when listAvailable fails */
  connectByFullName: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      fullName: z.string().regex(/^[^/]+\/[^/]+$/, "Format must be owner/repo"),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);

      const installation = await ctx.db.githubInstallation.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if (!installation) throw new TRPCError({ code: "BAD_REQUEST", message: "GitHub App not connected to this workspace" });

      const billing = await ctx.db.billing.findUnique({ where: { workspaceId: input.workspaceId } });
      const repoCount = await ctx.db.repository.count({ where: { workspaceId: input.workspaceId } });
      if (billing && repoCount >= billing.repoLimit) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Repo limit (${billing.repoLimit}) reached. Upgrade your plan.` });
      }

      const [owner, name] = input.fullName.split("/") as [string, string];
      const octokit = await getOctokitForInstallation(installation.installationId);

      let repoData: { id: number; name: string; full_name: string; owner: { login: string }; private: boolean; html_url: string; default_branch: string };
      try {
        const { data } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo: name });
        repoData = data;
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: `Repository "${input.fullName}" not found or not accessible by the GitHub App installation` });
      }

      const repo = await ctx.db.repository.upsert({
        where: { githubRepoId: BigInt(repoData.id) },
        create: {
          workspaceId: input.workspaceId,
          githubRepoId: BigInt(repoData.id),
          name: repoData.name,
          fullName: repoData.full_name,
          owner: repoData.owner.login,
          private: repoData.private,
          url: repoData.html_url,
          defaultBranch: repoData.default_branch,
        },
        update: { name: repoData.name, url: repoData.html_url, defaultBranch: repoData.default_branch },
      });

      await inngest.send({ name: "repository/analyze", data: { repositoryId: repo.id, workspaceId: input.workspaceId } });
      return repo;
    }),

  disconnect: protectedProcedure
    .input(z.object({ repositoryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repo = await ctx.db.repository.findUnique({ where: { id: input.repositoryId } });
      if (!repo) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, repo.workspaceId);
      return ctx.db.repository.delete({ where: { id: input.repositoryId } });
    }),

  getPullRequests: protectedProcedure
    .input(z.object({ repositoryId: z.string(), state: z.enum(["OPEN", "CLOSED", "MERGED"]).optional() }))
    .query(async ({ ctx, input }) => {
      const repo = await ctx.db.repository.findUnique({ where: { id: input.repositoryId } });
      if (!repo) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, repo.workspaceId);

      return ctx.db.pullRequest.findMany({
        where: { repositoryId: input.repositoryId, ...(input.state ? { state: input.state } : {}) },
        include: {
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { issues: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    }),

  /** PRs already linked to a specific feature request */
  getLinkedPRs: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      return ctx.db.pullRequest.findMany({
        where: { featureRequestId: input.featureRequestId },
        include: {
          repository: { select: { name: true, fullName: true, owner: true } },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { issues: { select: { severity: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    }),

  /** Open PRs from GitHub (live) for a repo — used for manual linking */
  getOpenPRsFromGitHub: protectedProcedure
    .input(z.object({ repositoryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const repo = await ctx.db.repository.findUnique({ where: { id: input.repositoryId } });
      if (!repo) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, repo.workspaceId);

      const installation = await ctx.db.githubInstallation.findUnique({
        where: { workspaceId: repo.workspaceId },
      });
      if (!installation) return [];

      return getOpenPRsForRepo(installation.installationId, repo.owner, repo.name);
    }),

  /** Sync open PRs from GitHub into the DB — needed on localhost where webhooks can't reach */
  syncPullRequests: protectedProcedure
    .input(z.object({ repositoryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repo = await ctx.db.repository.findUnique({ where: { id: input.repositoryId } });
      if (!repo) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, repo.workspaceId);

      const installation = await ctx.db.githubInstallation.findUnique({
        where: { workspaceId: repo.workspaceId },
      });
      if (!installation) throw new TRPCError({ code: "BAD_REQUEST", message: "GitHub App not connected" });

      const prs = await getOpenPRsForRepo(installation.installationId, repo.owner, repo.name);

      const upserted = await Promise.all(
        prs.map((pr) =>
          ctx.db.pullRequest.upsert({
            where: { repositoryId_number: { repositoryId: repo.id, number: pr.number } },
            create: {
              repositoryId: repo.id,
              githubPrId: BigInt(pr.githubPrId),
              number: pr.number,
              title: pr.title,
              state: "OPEN",
              headBranch: pr.headBranch,
              baseBranch: pr.baseBranch,
              htmlUrl: pr.htmlUrl,
              authorLogin: pr.authorLogin,
            },
            update: {
              title: pr.title,
              state: "OPEN",
              headBranch: pr.headBranch,
              baseBranch: pr.baseBranch,
              htmlUrl: pr.htmlUrl,
            },
          })
        )
      );

      return { synced: upserted.length };
    }),

  /** Link (or unlink) a pull request to a feature request */
  linkPRToFeature: protectedProcedure
    .input(z.object({
      pullRequestId: z.string(),
      featureRequestId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pr = await ctx.db.pullRequest.findUnique({
        where: { id: input.pullRequestId },
        include: { repository: true },
      });
      if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, pr.repository.workspaceId);

      const updated = await ctx.db.pullRequest.update({
        where: { id: input.pullRequestId },
        data: { featureRequestId: input.featureRequestId },
      });

      // When linking, move feature to IN_REVIEW if it was IN_DEVELOPMENT
      if (input.featureRequestId) {
        const fr = await ctx.db.featureRequest.findUnique({
          where: { id: input.featureRequestId },
        });
        if (fr && fr.status === "IN_DEVELOPMENT") {
          await ctx.db.featureRequest.update({
            where: { id: input.featureRequestId },
            data: { status: "IN_REVIEW" },
          });
        }
      }

      return updated;
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}
