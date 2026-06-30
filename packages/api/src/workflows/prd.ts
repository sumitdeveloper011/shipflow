import { inngest } from "../inngest";
import { db } from "@shipflow/db";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// ── Helper: write current workflow step into featureRequest.aiMessages ─────────
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

const PRD_STEPS = [
  "Loading feature context",
  "Generating PRD with AI",
  "Saving requirements",
];

export const generatePRD = inngest.createFunction(
  { id: "prd-generate", name: "AI: Generate PRD" },
  { event: "prd/generate" },
  async ({ event, step }) => {
    const { featureRequestId } = event.data;

    const fr = await step.run("fetch-fr", async () => {
      await setWorkflowStep(featureRequestId, PRD_STEPS[0]!, PRD_STEPS);
      return db.featureRequest.findUnique({
        where: { id: featureRequestId },
        include: { project: true },
      });
    });
    if (!fr) throw new Error("Feature request not found");

    const prdData = await step.run("generate-prd-content", async () => {
      await setWorkflowStep(featureRequestId, PRD_STEPS[1]!, PRD_STEPS);
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are a principal product manager at a top-tier SaaS company generating a PRD.\n" +
              "Your PRD must be COMPREHENSIVE and SPECIFIC - never generic.\n\n" +
              "Quality standards per section:\n" +
              "PROBLEM STATEMENT: 2-3 sentences. WHO is affected, WHAT the specific pain is, WHY it matters (measurable business/user impact). Never vague phrases like improve experience.\n" +
              "GOALS: 3-5 measurable goals. Each must be specific. Bad: improve performance. Good: Reduce p99 latency from 2s to 200ms on the search endpoint by Q3.\n" +
              "NON-GOALS: 3-5 items explicitly out of scope. These prevent scope creep and set reviewer expectations clearly.\n" +
              "USER STORIES: Format: As a [specific role], I want to [action], so that [measurable benefit]. Each story needs 2-4 TESTABLE acceptance criteria.\n" +
              "ACCEPTANCE CRITERIA: Must be binary pass/fail and testable by QA. Use Given/When/Then or numbered format. Never write it should work as an AC.\n" +
              "EDGE CASES: Specific to this feature - not generic. Include: concurrent access, empty states, network failure, permission boundaries, data limits, rate limits.\n" +
              "SUCCESS METRICS: Include baseline (current state), target (specific number), measurement method, and timeframe.\n\n" +
              "Respond ONLY with valid JSON, no markdown, no code fences.",
          },
          {
            role: "user",
            content:
              "Feature Request:\nTitle: " + fr.title +
              "\nDescription: " + fr.description +
              "\nConversation History: " + JSON.stringify(fr.aiMessages, null, 2) +
              "\n\nGenerate a PRD with this exact JSON structure:" +
              "\n{" +
              "\n  \"problemStatement\": \"string\"," +
              "\n  \"goals\": [\"string\"]," +
              "\n  \"nonGoals\": [\"string\"]," +
              "\n  \"userStories\": [{" +
              "\n    \"id\": \"US-1\"," +
              "\n    \"actor\": \"string\"," +
              "\n    \"action\": \"string\"," +
              "\n    \"benefit\": \"string\"," +
              "\n    \"acceptanceCriteria\": [\"string\"]" +
              "\n  }]," +
              "\n  \"acceptanceCriteria\": [{" +
              "\n    \"id\": \"AC-1\"," +
              "\n    \"description\": \"string\"," +
              "\n    \"testable\": true" +
              "\n  }]," +
              "\n  \"edgeCases\": [\"string\"]," +
              "\n  \"successMetrics\": [\"string\"]" +
              "\n}",
          },
        ],
      });

      try {
        return JSON.parse(text);
      } catch {
        return {
          problemStatement: fr.description,
          goals: ["Implement the requested feature"],
          nonGoals: ["Out of scope items to be determined"],
          userStories: [{ id: "US-1", actor: "User", action: fr.title, benefit: "achieve their goal", acceptanceCriteria: ["Feature works as described"] }],
          acceptanceCriteria: [{ id: "AC-1", description: "Feature is implemented", testable: true }],
          edgeCases: ["Handle empty states", "Handle error states"],
          successMetrics: ["Feature adoption rate"],
        };
      }
    });

    await step.run("save-prd", async () => {
      await setWorkflowStep(featureRequestId, PRD_STEPS[2]!, PRD_STEPS);
      const existing = await db.pRD.findUnique({ where: { featureRequestId: fr.id } });
      if (existing) {
        await db.pRD.update({ where: { featureRequestId: fr.id }, data: { ...prdData, status: "READY" } });
      } else {
        await db.pRD.create({ data: { featureRequestId: fr.id, ...prdData, status: "READY" } });
      }
      // Clear workflow step on completion
      const freshFr = await db.featureRequest.findUnique({ where: { id: fr.id }, select: { aiMessages: true } });
      const cleanMsgs = ((freshFr?.aiMessages as Record<string, unknown>[]) || []).filter((m) => m["role"] !== "workflow");
      await db.featureRequest.update({
        where: { id: fr.id },
        data: { status: "PRD_READY", aiMessages: cleanMsgs },
      });
    });

    return { ok: true, featureRequestId };
  }
);
