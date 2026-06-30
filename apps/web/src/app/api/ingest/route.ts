export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@shipflow/db";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

// ─── Auth helper ─────────────────────────────────────────────────────────────
function authenticate(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  return key === process.env.INGEST_API_KEY && !!process.env.INGEST_API_KEY;
}

// ─── AI title/description extractor ─────────────────────────────────────────
async function extractFeatureFields(rawInput: string): Promise<{ title: string; description: string }> {
  try {
    const { text } = await generateText({
      model: google("gemini-1.5-flash"),
      messages: [
        {
          role: "system",
          content: "You are a product manager. Extract a concise feature request title and description from the provided raw text. Respond ONLY with valid JSON: { \"title\": \"string\", \"description\": \"string\" }",
        },
        { role: "user", content: rawInput.slice(0, 2000) },
      ],
    });
    const parsed = JSON.parse(text);
    if (parsed.title && parsed.description) return parsed;
  } catch {
    // fall through to fallback
  }
  const firstLine = rawInput.split("\n")[0].trim().slice(0, 120);
  return {
    title: firstLine || "Inbound feature request",
    description: rawInput.slice(0, 1000),
  };
}

// ─── POST /api/ingest ─────────────────────────────────────────────────────────
// Unified ingest endpoint — supports email, ticket, and chat sources.
//
// Body (JSON):
//   source:      "EMAIL" | "TICKET" | "CHAT"   (required)
//   projectId:   string                          (required)
//   rawInput:    string                          (required — raw content)
//   title?:      string                          (optional override)
//   description? string                          (optional override)
//   submittedBy? string                          (optional — sender email/name)
//
export async function POST(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    source: "EMAIL" | "TICKET" | "CHAT";
    projectId: string;
    rawInput: string;
    title?: string;
    description?: string;
    submittedBy?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source, projectId, rawInput, title: titleOverride, description: descOverride, submittedBy } = body;

  if (!source || !projectId || !rawInput) {
    return NextResponse.json(
      { error: "Missing required fields: source, projectId, rawInput" },
      { status: 400 }
    );
  }

  if (!["EMAIL", "TICKET", "CHAT"].includes(source)) {
    return NextResponse.json({ error: "Invalid source. Must be EMAIL, TICKET, or CHAT." }, { status: 400 });
  }

  // Verify project exists
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Find a system user for this workspace (first owner/member)
  const member = await db.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId, role: "OWNER" },
    select: { userId: true },
  });
  if (!member) {
    return NextResponse.json({ error: "No workspace owner found" }, { status: 500 });
  }

  // Extract title/description — use override if provided, otherwise AI-extract
  let title = titleOverride?.trim();
  let description = descOverride?.trim();

  if (!title || !description) {
    const extracted = await extractFeatureFields(rawInput);
    title = title || extracted.title;
    description = description || extracted.description;
  }

  // Create the feature request
  const fr = await db.featureRequest.create({
    data: {
      projectId,
      title,
      description,
      source,
      rawInput: submittedBy ? `From: ${submittedBy}\n\n${rawInput}` : rawInput,
      createdById: member.userId,
      status: "DISCOVERY",
      aiMessages: [],
    },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    featureRequest: {
      id: fr.id,
      title: fr.title,
      status: fr.status,
      createdAt: fr.createdAt,
      url: `/projects/${projectId}/features/${fr.id}`,
    },
  });
}
