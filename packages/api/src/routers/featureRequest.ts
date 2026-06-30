import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const SHIPFLOW_PRODUCT_CONTEXT = [
  "ShipFlow is an AI-powered product delivery platform. It ALREADY has the following built-in features:",
  "",
  "CORE WORKFLOW:",
  "- Feature Request Management: users submit requests (manual, email, ticket, chat)",
  "- AI Clarification Agent: gathers missing requirements via conversation",
  "- PRD Generator: produces structured Product Requirements Documents",
  "- Engineering Task Generator: AI breaks PRDs into Kanban tasks",
  "- GitHub Repository Integration: connect repos via GitHub App",
  "- AI Code Review: reviews PRs against PRD requirements and acceptance criteria",
  "- Human Approval Workflow: final sign-off before shipping",
  "- Release Management: tracks shipped features",
  "",
  "PLATFORM:",
  "- Multi-tenant workspaces with member management",
  "- Project organization (group feature requests by project)",
  "- Billing via Razorpay (Free/Pro plans)",
  "- Status pipeline: Discovery, PRD, Planning, In Development, In Review, Fix Needed, Human Review, Approved, Shipped",
  "",
  "If the feature request describes something already covered above, set likelyExists=true.",
  "If it is genuinely new or significantly extends an existing capability, set likelyExists=false.",
].join("\n");

type AIChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };
type AIMetaMessage = { role: "meta"; readyForPRD: boolean; recommendation: "BUILD" | "EDUCATE" | "DUPLICATE"; timestamp: string };
type AIMessage = AIChatMessage | AIMetaMessage;

export const featureRequestRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: { workspaceId: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, project.workspaceId);

      return ctx.db.featureRequest.findMany({
        where: { projectId: input.projectId },
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
          prd: { select: { id: true, status: true } },
          release: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
          project: { include: { workspace: true } },
          prd: { include: { tasks: { orderBy: { order: "asc" } } } },
          release: true,
        },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);
      return fr;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1),
        description: z.string().min(1),
        source: z.enum(["MANUAL", "EMAIL", "TICKET", "CHAT"]).default("MANUAL"),
        rawInput: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: { workspaceId: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, project.workspaceId);

      // Enforce plan limits — FREE plan: 10 feature requests / month
      const billing = await ctx.db.billing.findUnique({ where: { workspaceId: project.workspaceId } });
      if (billing && billing.plan === "FREE") {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyCount = await ctx.db.featureRequest.count({
          where: {
            project: { workspaceId: project.workspaceId },
            createdAt: { gte: startOfMonth },
          },
        });

        const FREE_MONTHLY_LIMIT = 10;
        if (monthlyCount >= FREE_MONTHLY_LIMIT) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Free plan limit reached (" + FREE_MONTHLY_LIMIT + " feature requests/month). " +
              "Upgrade to Pro for unlimited requests.",
          });
        }
      }

      const fr = await ctx.db.featureRequest.create({
        data: {
          ...input,
          createdById: ctx.session.user.id,
          status: "DISCOVERY",
          aiMessages: [],
        },
      });

      const existingFeatures = await ctx.db.featureRequest.findMany({
        where: { projectId: input.projectId, id: { not: fr.id } },
        select: { title: true, status: true },
        take: 20,
      });

      try {
        const existingList = existingFeatures.length > 0
          ? existingFeatures.map((f) => "- \"" + f.title + "\" (" + f.status + ")").join("\n")
          : "None yet";

        const systemPrompt = "You are a senior product manager assistant for ShipFlow.\n\n"
          + SHIPFLOW_PRODUCT_CONTEXT
          + "\n\nYour job is to:\n"
          + "1. Check if the request duplicates an existing ShipFlow capability\n"
          + "2. Check if it duplicates an already-submitted request in this project\n"
          + "3. Decide if clarifying questions are needed before writing a PRD\n"
          + "4. Determine whether to BUILD, EDUCATE (feature exists), or mark as DUPLICATE\n\n"
          + "Respond ONLY with valid JSON, no markdown, no explanation.";

        const userPrompt = "New Feature Request:\n"
          + "Title: " + fr.title + "\n"
          + "Description: " + fr.description + "\n"
          + "Raw Input: " + (fr.rawInput || "N/A") + "\n\n"
          + "Already submitted requests in this project:\n"
          + existingList + "\n\n"
          + "Respond with this exact JSON:\n"
          + "{\n"
          + "  \"recommendation\": \"BUILD\",\n"
          + "  \"likelyExists\": false,\n"
          + "  \"existingNote\": null,\n"
          + "  \"needsClarification\": true,\n"
          + "  \"clarifyingQuestions\": [\"question 1\"],\n"
          + "  \"initialResponse\": \"friendly opening message\"\n"
          + "}\n\n"
          + "Rules:\n"
          + "- recommendation=EDUCATE if the capability already exists in ShipFlow\n"
          + "- recommendation=DUPLICATE if a very similar request is already submitted\n"
          + "- recommendation=BUILD if this is genuinely new\n"
          + "- clarifyingQuestions: 2-4 targeted questions to fill gaps";

        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
        temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        let analysis: {
          recommendation: "BUILD" | "EDUCATE" | "DUPLICATE";
          likelyExists: boolean;
          existingNote: string | null;
          needsClarification: boolean;
          clarifyingQuestions: string[];
          initialResponse: string;
        };

        try {
          analysis = JSON.parse(text);
        } catch {
          analysis = {
            recommendation: "BUILD",
            likelyExists: false,
            existingNote: null,
            needsClarification: true,
            clarifyingQuestions: [
              "Who are the primary users of this feature?",
              "What problem does this solve that cannot be done today?",
              "Any technical constraints to be aware of?",
            ],
            initialResponse: "Thanks for submitting " + fr.title + ". I have a few questions to help write the best PRD.",
          };
        }

        const messages: AIMessage[] = [
          { role: "assistant", content: analysis.initialResponse, timestamp: new Date().toISOString() },
        ];

        if (analysis.recommendation === "EDUCATE" && analysis.existingNote) {
          messages.push({
            role: "assistant",
            content: "This may already be available in ShipFlow:\n\n" + analysis.existingNote
              + "\n\nIf you believe this is different from what we currently offer, please describe how.",
            timestamp: new Date().toISOString(),
          });
        } else if (analysis.recommendation === "DUPLICATE") {
          messages.push({
            role: "assistant",
            content: "Similar request already exists:\n\n"
              + (analysis.existingNote || "A very similar feature request has already been submitted in this project.")
              + "\n\nIf your request has a meaningfully different scope, please clarify how it differs.",
            timestamp: new Date().toISOString(),
          });
        } else if (analysis.needsClarification && analysis.clarifyingQuestions.length > 0) {
          messages.push({
            role: "assistant",
            content: "To write a thorough PRD, I have a few questions:\n\n"
              + analysis.clarifyingQuestions.map((q, i) => (i + 1) + ". " + q).join("\n"),
            timestamp: new Date().toISOString(),
          });
        }

        messages.push({
          role: "meta",
          readyForPRD: analysis.recommendation === "BUILD" && !analysis.needsClarification,
          recommendation: analysis.recommendation,
          timestamp: new Date().toISOString(),
        });

        await ctx.db.featureRequest.update({
          where: { id: fr.id },
          data: { aiMessages: messages },
        });
      } catch {
        await ctx.db.featureRequest.update({
          where: { id: fr.id },
          data: {
            aiMessages: [
              {
                role: "assistant",
                content: "Thanks for submitting " + fr.title + ". To help me write the best PRD:\n\n"
                  + "1. Who are the primary users of this feature?\n"
                  + "2. What problem does this solve that cannot be done today?\n"
                  + "3. Any technical or business constraints to keep in mind?",
                timestamp: new Date().toISOString(),
              },
              { role: "meta", readyForPRD: false, recommendation: "BUILD", timestamp: new Date().toISOString() },
            ] as AIMessage[],
          },
        });
      }

      return ctx.db.featureRequest.findUniqueOrThrow({ where: { id: fr.id } });
    }),

  sendMessage: protectedProcedure
    .input(z.object({ featureRequestId: z.string(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      const allHistory = (fr.aiMessages as AIMessage[]) || [];
      const chatHistory = allHistory.filter((m): m is AIChatMessage => m.role !== "meta");
      const lastMeta = [...allHistory].reverse().find((m): m is AIMetaMessage => m.role === "meta");

      const userMsg: AIChatMessage = { role: "user", content: input.message, timestamp: new Date().toISOString() };

      let aiContent = "Got it! I have noted your response. When you are ready, click Generate PRD to create the requirements document.";
      let readyForPRD = false;
      let recommendation: "BUILD" | "EDUCATE" | "DUPLICATE" = lastMeta?.recommendation ?? "BUILD";

      try {
        const systemPrompt = "You are Jordan, a senior PM at ShipFlow who writes like a real person — direct, specific, no chatbot-speak.\n\n"
          + SHIPFLOW_PRODUCT_CONTEXT
          + "\n\nFeature: " + fr.title + "\nDescription: " + fr.description + "\n\n"
          + "Your job: get enough context to write a solid PRD. Find the most important gap and ask about it.\n"
          + "Gaps to probe (in order of priority):\n"
          + "1. TARGET USERS — who exactly uses this? role, context, how many?\n"
          + "2. CORE PAIN — what breaks today? what's the current workaround?\n"
          + "3. SUCCESS METRICS — how do we know it worked? specific numbers\n"
          + "4. SCOPE LIMITS — what's not included? technical or business constraints?\n"
          + "5. EDGE CASES — failure states, race conditions, permissions?\n"
          + "6. URGENCY — any deadline? cost of delay?\n\n"
          + "Writing rules:\n"
          + "- One question max per response, never a list\n"
          + "- Use contractions (it's, don't, we'll), vary sentence length\n"
          + "- Reference what the user said in your reply to show you read it\n"
          + "- Sound like a Slack message from a PM, not an AI system\n"
          + "- readyForPRD=true only when: users named, pain concrete, 2+ measurable success criteria exist\n"
          + "- Never re-ask something already covered\n\n"
          + "Respond ONLY with valid JSON:\n"
          + "{\n"
          + "  \"message\": \"your focused response or single question\",\n"
          + "  \"readyForPRD\": false,\n"
          + "  \"recommendation\": \"BUILD\"\n"
          + "}\n\n"
          + "- message must be warm, professional, and specific to this feature - never generic";

        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
        temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            ...chatHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
            { role: "user", content: input.message },
          ],
        });

        try {
          const parsed = JSON.parse(text);
          aiContent = parsed.message || text;
          readyForPRD = parsed.readyForPRD === true;
          recommendation = parsed.recommendation ?? recommendation;
        } catch {
          aiContent = text;
        }
      } catch {
        // fallback already set
      }

      const aiMsg: AIChatMessage = { role: "assistant", content: aiContent, timestamp: new Date().toISOString() };
      const newMeta: AIMetaMessage = { role: "meta", readyForPRD, recommendation, timestamp: new Date().toISOString() };

      const withoutOldMeta = allHistory.filter((m) => m.role !== "meta");
      const newHistory: AIMessage[] = [...withoutOldMeta, userMsg, aiMsg, newMeta];

      await ctx.db.featureRequest.update({
        where: { id: fr.id },
        data: { aiMessages: newHistory },
      });

      return { ok: true, readyForPRD, recommendation };
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      const history = (fr.aiMessages as AIMessage[]) || [];
      const rejectionNote: AIChatMessage = {
        role: "assistant",
        content: input.reason
          ? "This feature request has been marked as not needed: " + input.reason
          : "This feature request has been rejected and will not be built.",
        timestamp: new Date().toISOString(),
      };

      return ctx.db.featureRequest.update({
        where: { id: input.id },
        data: { status: "REJECTED", aiMessages: [...history, rejectionNote] },
      });
    }),

  generatePRD: protectedProcedure
    .input(z.object({ featureRequestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);

      await ctx.db.featureRequest.update({ where: { id: fr.id }, data: { status: "PRD_GENERATING" } });

      const prdSchema = "{\n"
        + "  \"problemStatement\": \"string\",\n"
        + "  \"goals\": [\"string\"],\n"
        + "  \"nonGoals\": [\"string\"],\n"
        + "  \"userStories\": [{\"id\":\"US-1\",\"actor\":\"string\",\"action\":\"string\",\"benefit\":\"string\",\"acceptanceCriteria\":[\"string\"]}],\n"
        + "  \"acceptanceCriteria\": [{\"id\":\"AC-1\",\"description\":\"string\",\"testable\":true}],\n"
        + "  \"edgeCases\": [\"string\"],\n"
        + "  \"successMetrics\": [\"string\"]\n"
        + "}";

      try {
        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
        temperature: 0.7,
          messages: [
            {
              role: "system",
              content: "You are a principal product manager at a top-tier SaaS company generating a PRD.\n"
            + "Your PRD must be COMPREHENSIVE and SPECIFIC - never generic.\n\n"
            + "Quality standards per section:\n"
            + "PROBLEM STATEMENT: 2-3 sentences. WHO is affected, WHAT the specific pain is, WHY it matters (measurable business/user impact). Never vague phrases like improve experience.\n"
            + "GOALS: 3-5 measurable goals. Each must be specific. Bad: improve performance. Good: Reduce p99 latency from 2s to 200ms on the search endpoint by Q3.\n"
            + "NON-GOALS: 3-5 items explicitly out of scope. These prevent scope creep and set reviewer expectations clearly.\n"
            + "USER STORIES: Format: As a [specific role], I want to [action], so that [measurable benefit]. Each story needs 2-4 TESTABLE acceptance criteria.\n"
            + "ACCEPTANCE CRITERIA: Must be binary pass/fail and testable by QA. Use Given/When/Then or numbered format. Never write it should work as an AC.\n"
            + "EDGE CASES: Specific to this feature - not generic. Include: concurrent access, empty states, network failure, permission boundaries, data limits, rate limits.\n"
            + "SUCCESS METRICS: Include baseline (current state), target (specific number), measurement method, and timeframe.\n\n"
            + "Respond ONLY with valid JSON, no markdown, no code fences.",
            },
            {
              role: "user",
              content: "Feature: " + fr.title + "\nDescription: " + fr.description
                + "\nConversation: " + JSON.stringify(fr.aiMessages)
                + "\n\nGenerate a PRD with this structure:\n" + prdSchema,
            },
          ],
        });

        let prdData;
        try {
          prdData = JSON.parse(text);
        } catch {
          prdData = {
            problemStatement: fr.description,
            goals: ["Implement the requested feature"],
            nonGoals: ["Out of scope items to be determined"],
            userStories: [{ id: "US-1", actor: "User", action: fr.title, benefit: "achieve their goal", acceptanceCriteria: ["Feature works as described"] }],
            acceptanceCriteria: [{ id: "AC-1", description: "Feature is implemented", testable: true }],
            edgeCases: ["Handle empty states", "Handle error states"],
            successMetrics: ["Feature adoption rate"],
          };
        }

        const existing = await ctx.db.pRD.findUnique({ where: { featureRequestId: fr.id } });
        if (existing) {
          await ctx.db.pRD.update({ where: { featureRequestId: fr.id }, data: { ...prdData, status: "READY" } });
        } else {
          await ctx.db.pRD.create({ data: { featureRequestId: fr.id, ...prdData, status: "READY" } });
        }
        await ctx.db.featureRequest.update({ where: { id: fr.id }, data: { status: "PRD_READY" } });
      } catch {
        const fallback = {
          problemStatement: fr.description,
          goals: ["Implement the requested feature as described"],
          nonGoals: ["Out of scope items to be determined during planning"],
          userStories: [{ id: "US-1", actor: "User", action: fr.title, benefit: "achieve their goal", acceptanceCriteria: ["Feature works as described"] }],
          acceptanceCriteria: [{ id: "AC-1", description: "Feature is implemented and tested", testable: true }],
          edgeCases: ["Handle empty states", "Handle error states", "Handle concurrent access"],
          successMetrics: ["Feature is adopted by users", "No critical bugs reported"],
        };
        const existing = await ctx.db.pRD.findUnique({ where: { featureRequestId: fr.id } });
        if (existing) {
          await ctx.db.pRD.update({ where: { featureRequestId: fr.id }, data: { ...fallback, status: "READY" } });
        } else {
          await ctx.db.pRD.create({ data: { featureRequestId: fr.id, ...fallback, status: "READY" } });
        }
        await ctx.db.featureRequest.update({ where: { id: fr.id }, data: { status: "PRD_READY" } });
      }

      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);
      return ctx.db.featureRequest.delete({ where: { id: input.id } });
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum([
          "DISCOVERY", "PRD_GENERATING", "PRD_READY", "PLANNING", "IN_DEVELOPMENT",
          "IN_REVIEW", "FIX_NEEDED", "HUMAN_REVIEW", "APPROVED", "SHIPPED", "REJECTED",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fr = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: { project: { select: { workspaceId: true } } },
      });
      if (!fr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMember(ctx, fr.project.workspaceId);
      return ctx.db.featureRequest.update({ where: { id: input.id }, data: { status: input.status } });
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
  return m;
}
