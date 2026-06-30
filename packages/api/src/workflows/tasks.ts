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

const TASK_STEPS = [
  "Loading PRD and repository context",
  "Detecting tech stack",
  "Generating engineering tasks with AI",
  "Saving tasks to board",
];

export const generateTasks = inngest.createFunction(
  { id: "tasks-generate", name: "AI: Generate Engineering Tasks" },
  { event: "tasks/generate" },
  async ({ event, step }) => {
    const { prdId, featureRequestId } = event.data;

    const context = await step.run("fetch-context", async () => {
      await setWorkflowStep(featureRequestId, TASK_STEPS[0]!, TASK_STEPS);
      const prd = await db.pRD.findUnique({
        where: { id: prdId },
        include: {
          featureRequest: {
            include: {
              project: {
                include: {
                  repositories: { select: { metadata: true }, take: 1 },
                },
              },
            },
          },
        },
      });
      return prd;
    });

    if (!context) throw new Error("PRD not found");

    const repoMeta = context.featureRequest.project.repositories?.[0]?.metadata as Record<string, unknown> | null;

    const tasks = await step.run("generate-tasks-ai", async () => {
      await setWorkflowStep(featureRequestId, TASK_STEPS[1]!, TASK_STEPS);
      const techStack: string[] = Array.isArray(repoMeta?.techStack) ? (repoMeta.techStack as string[]) : [];
      const frameworks: string[] = Array.isArray(repoMeta?.frameworks) ? (repoMeta.frameworks as string[]) : [];
      const techContext = techStack.length > 0
        ? "Tech Stack: " + techStack.join(", ") + (frameworks.length > 0 ? "\nFrameworks: " + frameworks.join(", ") : "")
        : "Tech stack not yet analyzed — use generic task categories.";

      await setWorkflowStep(featureRequestId, TASK_STEPS[2]!, TASK_STEPS);
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are a senior software architect breaking down a PRD into engineering tasks. " +
              "Tasks must be SPECIFIC and ACTIONABLE — a developer should know exactly what to build. " +
              "Use the tech stack to make tasks technology-aware. " +
              "Respond ONLY with valid JSON - no markdown, no code fences, no explanation.",
          },
          {
            role: "user",
            content:
              techContext +
              "\n\nPRD:" +
              "\nProblem: " + (context.problemStatement ?? "") +
              "\nGoals: " + (context.goals as string[]).join(", ") +
              "\nUser Stories: " + JSON.stringify(context.userStories) +
              "\nAcceptance Criteria: " + JSON.stringify(context.acceptanceCriteria) +
              "\nEdge Cases: " + (context.edgeCases as string[]).join(", ") +
              "\n\nGenerate 8-15 engineering tasks as JSON:" +
              "\n{" +
              "\n  \"tasks\": [" +
              "\n    {" +
              "\n      \"title\": \"string - imperative action title\"," +
              "\n      \"description\": \"string - detailed description with what to build, which files, why it matters\"," +
              "\n      \"priority\": \"LOW|MEDIUM|HIGH|CRITICAL\"," +
              "\n      \"complexity\": \"XS|S|M|L|XL\"," +
              "\n      \"labels\": [\"string - e.g. frontend, backend, database, testing\"]," +
              "\n      \"dependsOn\": [\"string - title of prerequisite task\"]" +
              "\n    }" +
              "\n  ]" +
              "\n}",
          },
        ],
      });

      try {
        const parsed = JSON.parse(text);
        return parsed.tasks as Array<{ title: string; description: string; priority: string; complexity?: string; labels: string[]; dependsOn?: string[] }>;
      } catch {
        return [
          { title: "Design and migrate database schema", description: "Add required models, relations, and indexes.", priority: "CRITICAL", labels: ["database"], complexity: "M" },
          { title: "Implement API endpoints", description: "Create backend routes with input validation and error handling.", priority: "HIGH", labels: ["backend"], complexity: "L" },
          { title: "Build frontend UI components", description: "Create UI components with loading, error, and empty states.", priority: "HIGH", labels: ["frontend"], complexity: "L" },
          { title: "Write unit and integration tests", description: "Cover all acceptance criteria with tests.", priority: "MEDIUM", labels: ["testing"], complexity: "M" },
        ];
      }
    });

    await step.run("save-tasks", async () => {
      await setWorkflowStep(featureRequestId, TASK_STEPS[3]!, TASK_STEPS);
      await db.engineeringTask.deleteMany({ where: { prdId } });
      await db.engineeringTask.createMany({
        data: tasks.map((task, idx) => ({
          prdId,
          title: task.title,
          description: task.description + (task.dependsOn?.length ? "\n\nDepends on: " + task.dependsOn.join(", ") : ""),
          status: "TODO" as const,
          priority: (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(task.priority) ? task.priority : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          labels: [...(task.labels ?? []), ...(task.complexity ? ["complexity:" + task.complexity] : [])],
          order: idx,
        })),
      });

      // Clear workflow step on completion
      const freshFr = await db.featureRequest.findUnique({ where: { id: featureRequestId }, select: { aiMessages: true } });
      const cleanMsgs = ((freshFr?.aiMessages as Record<string, unknown>[]) || []).filter((m) => m["role"] !== "workflow");
      await db.featureRequest.update({
        where: { id: featureRequestId },
        data: { aiMessages: cleanMsgs },
      });
    });

    return { ok: true, prdId, featureRequestId };
  }
);
