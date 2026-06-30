import { inngest } from "../inngest";
import { db } from "@shipflow/db";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export const onFeatureRequestCreated = inngest.createFunction(
  { id: "feature-request-created", name: "AI: Clarify Feature Request" },
  { event: "feature-request/created" },
  async ({ event, step }) => {
    const { featureRequestId } = event.data;

    const fr = await step.run("fetch-feature-request", async () => {
      return db.featureRequest.findUnique({
        where: { id: featureRequestId },
        include: { project: { include: { workspace: true } } },
      });
    });

    if (!fr) throw new Error("Feature request not found");

    const analysis = await step.run("analyze-request", async () => {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are a product manager assistant for ShipFlow. " +
              "Analyze feature requests and determine: " +
              "1. If a similar feature likely exists " +
              "2. What clarifying questions to ask " +
              "3. Whether this is worth building. " +
              "Respond ONLY with valid JSON, no markdown, no explanation.",
          },
          {
            role: "user",
            content:
              "Feature Request Title: " + fr.title +
              "\nDescription: " + fr.description +
              "\nRaw Input: " + (fr.rawInput || "N/A") +
              "\n\nRespond with this exact JSON:" +
              "\n{" +
              "\n  \"recommendation\": \"BUILD|EDUCATE|DUPLICATE\"," +
              "\n  \"likelyExists\": false," +
              "\n  \"existingNote\": null," +
              "\n  \"needsClarification\": true," +
              "\n  \"clarifyingQuestions\": [\"string\"]," +
              "\n  \"initialResponse\": \"string - friendly message\"," +
              "\n  \"readyForPRD\": false" +
              "\n}",
          },
        ],
      });

      try {
        return JSON.parse(text) as {
          recommendation: "BUILD" | "EDUCATE" | "DUPLICATE";
          likelyExists: boolean;
          existingNote: string | null;
          needsClarification: boolean;
          clarifyingQuestions: string[];
          initialResponse: string;
          readyForPRD: boolean;
        };
      } catch {
        return {
          recommendation: "BUILD" as const,
          likelyExists: false,
          existingNote: null,
          needsClarification: true,
          clarifyingQuestions: [
            "Who are the primary users of this feature?",
            "What problem does this solve that current solutions don't?",
            "What does success look like for this feature?",
          ],
          initialResponse: "Thanks for submitting this feature request! I'd love to learn more to ensure we build exactly what you need.",
          readyForPRD: false,
        };
      }
    });

    const aiMessage = {
      role: "assistant",
      content: analysis.likelyExists && analysis.existingNote
        ? analysis.existingNote
        : analysis.initialResponse +
          (analysis.clarifyingQuestions.length > 0
            ? "\n\n" + analysis.clarifyingQuestions.map((q, i) => (i + 1) + ". " + q).join("\n")
            : ""),
      timestamp: new Date().toISOString(),
      recommendation: analysis.recommendation,
      readyForPRD: analysis.readyForPRD,
    };

    await step.run("save-initial-message", async () => {
      const history = (fr.aiMessages as unknown[]) || [];
      return db.featureRequest.update({
        where: { id: featureRequestId },
        data: { aiMessages: [...history, aiMessage] },
      });
    });

    return { ok: true, recommendation: analysis.recommendation };
  }
);

export const onFeatureRequestMessage = inngest.createFunction(
  { id: "feature-request-message", name: "AI: Process Feature Request Message" },
  { event: "feature-request/message" },
  async ({ event, step }) => {
    const { featureRequestId, message } = event.data;

    const fr = await step.run("fetch-fr", async () => {
      return db.featureRequest.findUnique({ where: { id: featureRequestId } });
    });
    if (!fr) throw new Error("Feature request not found");

    const history = (fr.aiMessages as Array<{ role: string; content: string }>) || [];

    const aiResponse = await step.run("ai-response", async () => {
      const conversationMessages = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      conversationMessages.push({ role: "user", content: message });

      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are a product manager assistant for ShipFlow gathering requirements for a feature request. " +
              "Feature: " + fr.title + " | Description: " + fr.description + ". " +
              "Your goal: gather enough context to generate a comprehensive PRD. " +
              "Ask follow-up questions when needed. When you have enough information, " +
              "indicate readiness by including \"readyForPRD\": true in your JSON response. " +
              "If the feature likely already exists, set recommendation to EDUCATE. " +
              "Respond ONLY with valid JSON: " +
              "{\"content\": \"string\", \"readyForPRD\": boolean, \"recommendation\": \"BUILD|EDUCATE|DUPLICATE\"}",
          },
          ...conversationMessages,
        ],
      });

      try {
        return JSON.parse(text) as { content: string; readyForPRD: boolean; recommendation: string };
      } catch {
        return { content: text, readyForPRD: false, recommendation: "BUILD" };
      }
    });

    const userMsg = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg = {
      role: "assistant",
      content: aiResponse.content,
      timestamp: new Date().toISOString(),
      readyForPRD: aiResponse.readyForPRD,
      recommendation: aiResponse.recommendation,
    };

    await step.run("save-messages", async () => {
      return db.featureRequest.update({
        where: { id: featureRequestId },
        data: { aiMessages: [...history, userMsg, assistantMsg] },
      });
    });

    return { ok: true, readyForPRD: aiResponse.readyForPRD };
  }
);
