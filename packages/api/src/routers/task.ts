import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export const taskRouter = router({
  listByPRD: protectedProcedure
    .input(z.object({ prdId: z.string() }))
    .query(async ({ ctx, input }) => {
      const prd = await ctx.db.pRD.findUnique({
        where: { id: input.prdId },
        include: { featureRequest: { include: { project: { select: { workspaceId: true } } } } },
      });
      if (!prd) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, prd.featureRequest.project.workspaceId);
      return ctx.db.engineeringTask.findMany({ where: { prdId: input.prdId }, orderBy: { order: "asc" } });
    }),

  generateTasks: protectedProcedure
    .input(z.object({ prdId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prd = await ctx.db.pRD.findUnique({
        where: { id: input.prdId },
        include: {
          featureRequest: {
            include: {
              project: {
                select: {
                  workspaceId: true,
                  repository: { select: { metadata: true } },
                },
              },
            },
          },
        },
      });
      if (!prd) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, prd.featureRequest.project.workspaceId);

      // Pull tech stack from repository analysis if available
      const repoMeta = prd.featureRequest.project.repository?.metadata as Record<string, unknown> | null;
      const techStack: string[] = Array.isArray(repoMeta?.techStack) ? (repoMeta.techStack as string[]) : [];
      const frameworks: string[] = Array.isArray(repoMeta?.frameworks) ? (repoMeta.frameworks as string[]) : [];
      const techContext = techStack.length > 0
        ? "Tech Stack: " + techStack.join(", ") + (frameworks.length > 0 ? "\nFrameworks: " + frameworks.join(", ") : "")
        : "Tech stack not yet analyzed — use generic task categories.";

      let tasks: Array<{ title: string; description: string; priority: string; labels: string[]; complexity?: string; dependsOn?: string[] }> = [];
      try {
        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
        temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "You are a senior software architect breaking down a PRD into engineering tasks. " +
                "Tasks must be SPECIFIC and ACTIONABLE — a developer should know exactly what to build. " +
                "Use the tech stack to make tasks technology-aware (e.g. not just endpoint but specific tRPC procedure or REST route). " +
                "Identify dependencies between tasks. " +
                "Respond ONLY with valid JSON - no markdown, no code fences, no explanation.",
            },
            {
              role: "user",
              content:
                techContext +
                "\n\nPRD:" +
                "\nProblem: " + (prd.problemStatement ?? "") +
                "\nGoals: " + (prd.goals as string[]).join(", ") +
                "\nUser Stories: " + JSON.stringify(prd.userStories) +
                "\nAcceptance Criteria: " + JSON.stringify(prd.acceptanceCriteria) +
                "\nEdge Cases: " + (prd.edgeCases as string[]).join(", ") +
                "\n\nGenerate 8-15 engineering tasks as JSON. Be specific to the tech stack." +
                "\n{" +
                "\n  \"tasks\": [" +
                "\n    {" +
                "\n      \"title\": \"string - imperative action title (specific, not generic)\"," +
                "\n      \"description\": \"string - detailed description: what to build, which files/modules, why it matters for the feature\"," +
                "\n      \"priority\": \"LOW|MEDIUM|HIGH|CRITICAL\"," +
                "\n      \"complexity\": \"XS|S|M|L|XL\"," +
                "\n      \"labels\": [\"string - e.g. frontend, backend, database, testing, infra, docs\"]," +
                "\n      \"dependsOn\": [\"string - title of task that must be done first, if any\"]" +
                "\n    }" +
                "\n  ]" +
                "\n}" +
                "\n\nCoverage required: database schema changes, API layer, frontend components, error handling, tests (unit + integration), edge cases from PRD.",
            },
          ],
        });
        const parsed = JSON.parse(text);
        tasks = parsed.tasks;
      } catch {
        tasks = [
          { title: "Design and migrate database schema", description: "Add required models, relations, and indexes. Run migration in development to verify.", priority: "CRITICAL", labels: ["database"], complexity: "M" },
          { title: "Implement API endpoints", description: "Create backend routes with input validation, auth checks, and error handling per PRD acceptance criteria.", priority: "HIGH", labels: ["backend"], complexity: "L" },
          { title: "Build frontend UI components", description: "Create UI components matching the user stories. Handle loading, error, and empty states.", priority: "HIGH", labels: ["frontend"], complexity: "L" },
          { title: "Add input validation and error boundaries", description: "Validate all user inputs server-side. Return meaningful error messages matching edge cases in PRD.", priority: "HIGH", labels: ["backend", "frontend"], complexity: "S" },
          { title: "Write unit tests for business logic", description: "Cover all acceptance criteria with unit tests. Target >80% coverage for new code.", priority: "MEDIUM", labels: ["testing"], complexity: "M" },
          { title: "Write integration tests for critical flows", description: "End-to-end tests for the primary user journey and key edge cases.", priority: "MEDIUM", labels: ["testing"], complexity: "M" },
        ];
      }

      await ctx.db.engineeringTask.deleteMany({ where: { prdId: input.prdId } });

      await ctx.db.engineeringTask.createMany({
        data: tasks.map((task, idx) => ({
          prdId: input.prdId,
          title: task.title,
          description: task.description + (task.dependsOn && task.dependsOn.length > 0 ? "\n\nDepends on: " + task.dependsOn.join(", ") : ""),
          status: "TODO" as const,
          priority: (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(task.priority) ? task.priority : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          labels: [...(task.labels ?? []), ...(task.complexity ? ["complexity:" + task.complexity] : [])],
          order: idx,
        })),
      });

      return ctx.db.engineeringTask.findMany({ where: { prdId: input.prdId }, orderBy: { order: "asc" } });
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.engineeringTask.findUnique({
        where: { id: input.taskId },
        include: {
          prd: {
            include: { featureRequest: { include: { project: { select: { workspaceId: true } } } } },
          },
        },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, task.prd.featureRequest.project.workspaceId);
      return ctx.db.engineeringTask.update({ where: { id: input.taskId }, data: { status: input.status } });
    }),

  update: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
        labels: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { taskId, ...data } = input;
      const task = await ctx.db.engineeringTask.findUnique({
        where: { id: taskId },
        include: {
          prd: {
            include: { featureRequest: { include: { project: { select: { workspaceId: true } } } } },
          },
        },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, task.prd.featureRequest.project.workspaceId);
      return ctx.db.engineeringTask.update({ where: { id: taskId }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.engineeringTask.findUnique({
        where: { id: input.taskId },
        include: {
          prd: {
            include: { featureRequest: { include: { project: { select: { workspaceId: true } } } } },
          },
        },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, task.prd.featureRequest.project.workspaceId);
      return ctx.db.engineeringTask.delete({ where: { id: input.taskId } });
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}
