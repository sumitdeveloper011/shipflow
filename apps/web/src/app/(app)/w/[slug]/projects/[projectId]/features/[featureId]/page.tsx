"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  Bot, Loader2, FileText, ListTodo, CheckCircle2, XCircle, Send,
  Sparkles, Edit3, Save, X, AlertTriangle, BarChart3, Rocket, Trash2,
  Info, Ban, GitPullRequest, GitBranch, ExternalLink, Github, Link2, Unlink, RefreshCw
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { STATUS_COLORS, STATUS_LABELS, formatRelativeDate } from "@/lib/utils";
import { KanbanBoard } from "@/components/kanban-board";

const POLLING_STATUSES = new Set(["DISCOVERY", "PRD_GENERATING", "IN_REVIEW", "FIX_NEEDED", "HUMAN_REVIEW"]);


// ── Workflow Progress Component ────────────────────────────────────────────────
function WorkflowProgress({
  title,
  subtitle,
  workflowSignal,
  fallbackSteps,
  color = "blue",
}: {
  title: string;
  subtitle: string;
  workflowSignal?: { step: string; steps: string[] } | undefined;
  fallbackSteps: string[];
  color?: "blue" | "purple" | "green";
}) {
  const steps = workflowSignal?.steps ?? fallbackSteps;
  const currentStep = workflowSignal?.step ?? steps[0] ?? "";
  const currentIdx = steps.indexOf(currentStep);

  const colorMap = {
    blue: {
      bg: "",
      border: "",
      title: "text-blue-200",
      sub: "text-blue-400",
      active: "bg-blue-600",
      done: "bg-blue-400",
      pending: "bg-blue-200 dark:bg-blue-800",
      spinner: "text-blue-600",
    },
    purple: {
      bg: "",
      border: "",
      title: "text-purple-200",
      sub: "text-purple-400",
      active: "bg-purple-600",
      done: "bg-purple-400",
      pending: "bg-purple-200 dark:bg-purple-800",
      spinner: "text-purple-600",
    },
    green: {
      bg: "",
      border: "",
      title: "text-green-200",
      sub: "text-green-400",
      active: "bg-green-600",
      done: "bg-green-400",
      pending: "bg-green-200 dark:bg-green-800",
      spinner: "text-green-600",
    },
  };
  const c = colorMap[color];

  return (
    <div className={"rounded-xl border p-4 space-y-3 " + c.bg + " " + c.border}>
      <div className="flex items-center gap-2">
        <Loader2 className={"w-4 h-4 animate-spin shrink-0 " + c.spinner} />
        <div>
          <div className={"text-sm font-semibold " + c.title}>{title}</div>
          <div className={"text-xs " + c.sub}>{subtitle}</div>
        </div>
      </div>
      {/* Step pills */}
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (isDone ? c.done : isActive ? c.active : c.pending)} />
              <span className={"text-xs " + (isActive ? "font-semibold " + c.title : isDone ? c.sub : "text-muted-foreground")}>
                {s}
                {isActive && <span className="ml-1 animate-pulse">...</span>}
              </span>
              {isDone && <CheckCircle2 className={"w-3 h-3 shrink-0 " + c.sub} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FeaturePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const featureId = params.featureId as string;
  const projectId = params.projectId as string;
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [activeTab, setActiveTab] = useState<"discovery" | "prd" | "tasks" | "development" | "release">("discovery");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: fr, refetch } = trpc.featureRequest.getById.useQuery(
    { id: featureId },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data?.status) return false;
        if (!POLLING_STATUSES.has(data.status)) return false;
        // Poll faster when a workflow step is actively running
        const msgs = (data.aiMessages as Array<{ role: string }>) || [];
        const hasWorkflowStep = msgs.some((m) => m.role === "workflow");
        return hasWorkflowStep ? 1500 : 3000;
      },
    }
  );

  const sendMessage = trpc.featureRequest.sendMessage.useMutation({
    onSuccess: () => { setMessage(""); refetch(); },
  });
  const generatePRD = trpc.featureRequest.generatePRD.useMutation({
    onSuccess: () => { refetch(); setActiveTab("prd"); },
  });
  const generateTasks = trpc.task.generateTasks.useMutation({
    onSuccess: () => { refetch(); setActiveTab("tasks"); },
  });
  const requestApproval = trpc.release.requestApproval.useMutation({
    onSuccess: () => refetch(),
  });
  const approvePRD = trpc.prd.approve.useMutation({
    onSuccess: () => {
      refetch();
      setActiveTab("tasks");
      if (fr?.prd?.id) {
        generateTasks.mutate({ prdId: fr.prd.id });
      }
    },
  });
  const deleteFeature = trpc.featureRequest.delete.useMutation({
    onSuccess: () => router.push(`/w/${slug}/projects/${projectId}`),
  });
  const rejectFeature = trpc.featureRequest.reject.useMutation({
    onSuccess: () => { setConfirmReject(false); refetch(); },
  });
  const approvePlan = trpc.featureRequest.updateStatus.useMutation({
    onSuccess: () => refetch(),
  });

  type AIMessage = {
    role: "user" | "assistant" | "meta" | "workflow";
    content?: string;
    timestamp: string;
    readyForPRD?: boolean;
    recommendation?: "BUILD" | "EDUCATE" | "DUPLICATE";
    step?: string;
    steps?: string[];
  };

  const allAiMessages: AIMessage[] = (fr?.aiMessages as AIMessage[]) || [];
  const aiMessages = allAiMessages.filter((m) => m.role !== "meta" && m.role !== "workflow");
  const metaSignal = [...allAiMessages].reverse().find((m) => m.role === "meta") as
    | { role: "meta"; readyForPRD: boolean; recommendation: "BUILD" | "EDUCATE" | "DUPLICATE"; timestamp: string }
    | undefined;
  const workflowSignal = [...allAiMessages].reverse().find((m) => m.role === "workflow") as
    | { role: "workflow"; step: string; steps: string[]; timestamp: string }
    | undefined;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages.length]);

  if (!fr) return (
    <div className="p-8 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading...
    </div>
  );

  const tabs = [
    { id: "discovery", label: "Discovery", icon: Bot },
    { id: "prd", label: "PRD", icon: FileText, disabled: !fr.prd },
    { id: "tasks", label: "Tasks", icon: ListTodo, disabled: !fr.prd },
    { id: "development", label: "Development", icon: GitPullRequest },
    { id: "release", label: "Release", icon: Rocket },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Reject confirm dialog */}
      {confirmReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">Mark as not needed?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will reject <strong>{fr.title}</strong>. It will not be built.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => rejectFeature.mutate({
                  id: fr.id,
                  reason: metaSignal?.recommendation === "EDUCATE"
                    ? "This capability already exists in ShipFlow."
                    : metaSignal?.recommendation === "DUPLICATE"
                    ? "A similar request already exists."
                    : undefined,
                })}
                disabled={rejectFeature.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {rejectFeature.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rejecting...</>
                  : "Confirm Reject"}
              </button>
              <button
                onClick={() => setConfirmReject(false)}
                className="flex-1 py-2 rounded-lg text-sm border border-input hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">Delete feature request?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will permanently delete <strong>{fr.title}</strong> along with its PRD, tasks, and all reviews. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteFeature.mutate({ id: fr.id })}
                disabled={deleteFeature.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-destructive/90"
              >
                {deleteFeature.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
                  : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleteFeature.isPending}
                className="flex-1 py-2 rounded-lg text-sm border border-input hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href={`/w/${slug}/projects`} className="hover:text-foreground transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/w/${slug}/projects/${projectId}`} className="hover:text-foreground transition-colors">{fr.project.name}</Link>
          <span>/</span>
          <span className="text-foreground truncate max-w-xs">{fr.title}</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{fr.title}</h1>
          <div className="flex items-center gap-2">
            {POLLING_STATUSES.has(fr.status) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>AI working...</span>
              </div>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[fr.status] || ""}`}>
              {STATUS_LABELS[fr.status] || fr.status}
            </span>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete feature"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6 flex gap-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const disabled = "disabled" in tab && tab.disabled;
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && setActiveTab(tab.id as "discovery" | "prd" | "tasks" | "development" | "release")}
              disabled={disabled}
              className={`flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : disabled
                  ? "border-transparent text-muted-foreground/50 cursor-not-allowed"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Discovery Tab */}
        {activeTab === "discovery" && (
          <div className="flex flex-col h-full max-h-[calc(100vh-220px)]">
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {/* Rejected banner */}
              {fr.status === "REJECTED" && (
                <div className="flex items-start gap-3 rounded-xl p-4 text-sm" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
                  <Ban className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#fb7185" }} />
                  <div>
                    <div className="font-medium text-white">Feature request rejected</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>This request has been marked as not needed and will not be built.</div>
                  </div>
                </div>
              )}

              {/* EDUCATE banner */}
              {fr.status === "DISCOVERY" && metaSignal?.recommendation === "EDUCATE" && (
                <div className="flex items-start gap-3 rounded-xl p-4 text-sm" style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)" }}>
                  <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#60a5fa" }} />
                  <div className="flex-1">
                    <div className="font-medium text-white">This may already exist in ShipFlow</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>Review the explanation below. If you believe this is a genuine gap, continue the conversation.</div>
                  </div>
                  <button
                    onClick={() => setConfirmReject(true)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ border: "1px solid rgba(244,63,94,0.3)", color: "#fb7185" }}
                  >
                    Mark as not needed
                  </button>
                </div>
              )}

              {/* DUPLICATE banner */}
              {fr.status === "DISCOVERY" && metaSignal?.recommendation === "DUPLICATE" && (
                <div className="flex items-start gap-3 rounded-xl p-4 text-sm" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
                  <div className="flex-1">
                    <div className="font-medium text-white">Similar request already submitted</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>If this is meaningfully different, clarify below. Otherwise consider closing it.</div>
                  </div>
                  <button
                    onClick={() => setConfirmReject(true)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ border: "1px solid rgba(244,63,94,0.3)", color: "#fb7185" }}
                  >
                    Mark as not needed
                  </button>
                </div>
              )}

              {/* Ready for PRD banner */}
              {fr.status === "DISCOVERY" && metaSignal?.readyForPRD && metaSignal.recommendation === "BUILD" && (
                <div className="flex items-center gap-3 rounded-xl p-4 text-sm" style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#34d399" }} />
                  <div className="flex-1">
                    <div className="font-medium text-white">Ready to generate PRD</div>
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>All requirements gathered. Click to generate the PRD.</div>
                  </div>
                  <button
                    onClick={() => generatePRD.mutate({ featureRequestId: fr.id })}
                    disabled={generatePRD.isPending}
                    className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50" style={{ background: "#34d399", color: "#000" }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate PRD
                  </button>
                </div>
              )}

              {/* PRD generating — workflow step tracker */}
              {fr.status === "PRD_GENERATING" && (
                <WorkflowProgress
                  title="Generating PRD"
                  subtitle="AI is structuring your requirements document"
                  workflowSignal={workflowSignal}
                  fallbackSteps={["Loading feature context", "Generating PRD with AI", "Saving requirements"]}
                  color="blue"
                />
              )}

              {/* Original request */}
              <div className="bg-secondary rounded-xl p-4 text-sm">
                <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Original Request</div>
                <p className="text-foreground">{fr.description}</p>
              </div>

              {/* AI conversation */}
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-lg rounded-xl p-4 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium text-muted-foreground">ShipFlow AI</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <div className={`text-xs mt-2 ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {formatRelativeDate(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}

              {aiMessages.length === 0 && fr.status === "DISCOVERY" && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI agent is analyzing your request...
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message input + actions */}
            <div className="border-t border-border p-4 space-y-3">
              {fr.status === "REJECTED" && (
                <div className="text-center text-sm text-muted-foreground p-2">
                  This feature request was rejected and will not be built.
                </div>
              )}
              {(fr.status === "DISCOVERY" || fr.status === "PRD_GENERATING") && (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && message.trim()) {
                          sendMessage.mutate({ featureRequestId: fr.id, message });
                        }
                      }}
                      placeholder="Reply to the AI agent..."
                      disabled={fr.status === "PRD_GENERATING"}
                      className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                    <button
                      onClick={() => message.trim() && sendMessage.mutate({ featureRequestId: fr.id, message })}
                      disabled={!message.trim() || sendMessage.isPending || fr.status === "PRD_GENERATING"}
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
                    >
                      {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => generatePRD.mutate({ featureRequestId: fr.id })}
                      disabled={generatePRD.isPending || fr.status === "PRD_GENERATING"}
                      className="flex-1 flex items-center justify-center gap-2 border border-primary text-primary hover:bg-primary hover:text-primary-foreground py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {fr.status === "PRD_GENERATING" || generatePRD.isPending
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating PRD...</>
                        : <><Sparkles className="w-4 h-4" /> Generate PRD</>}
                    </button>
                    {(metaSignal?.recommendation === "EDUCATE" || metaSignal?.recommendation === "DUPLICATE") && (
                      <button
                        onClick={() => setConfirmReject(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    )}
                  </div>
                </>
              )}
              {fr.status === "PRD_READY" && (
                <div className="text-center text-sm text-muted-foreground p-2">
                  PRD is ready.{" "}
                  <button onClick={() => setActiveTab("prd")} className="text-primary hover:underline font-medium">
                    Review it
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRD Tab */}
        {activeTab === "prd" && fr.prd && (
          <PRDEditor
            prd={fr.prd}
            featureStatus={fr.status}
            onApprovePRD={() => approvePRD.mutate({ prdId: fr.prd!.id })}
            approvePRDPending={approvePRD.isPending}
          />
        )}

        {/* Tasks Tab */}
        {activeTab === "tasks" && fr.prd && (
          <div className="p-6">
            {/* PLANNING gate banner */}
            {fr.status === "PLANNING" && fr.prd.tasks && fr.prd.tasks.length > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-lg p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">Plan awaiting team review</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Review the tasks below. When the plan looks good, approve it to move to active development.
                  </p>
                </div>
                <button
                  onClick={() => approvePlan.mutate({ id: fr.id, status: "IN_DEVELOPMENT" })}
                  disabled={approvePlan.isPending}
                  className="shrink-0 flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50" style={{ background: "#7c3aed" }}
                >
                  {approvePlan.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving...</>
                    : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve Plan</>}
                </button>
              </div>
            )}

            {/* IN_DEVELOPMENT — ready for release approval */}
            {fr.status === "IN_DEVELOPMENT" && (
              <div className="mb-4 flex items-start gap-3 rounded-lg p-4" style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <Rocket className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#60a5fa" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">Plan approved — development in progress</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Open a pull request on GitHub, then request release approval when ready.
                  </p>
                </div>
                <button
                  onClick={() => requestApproval.mutate({ featureRequestId: fr.id })}
                  disabled={requestApproval.isPending}
                  className="shrink-0 flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ background: "#7c3aed" }}
                >
                  {requestApproval.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Requesting...</>
                    : <><CheckCircle2 className="w-3.5 h-3.5" /> Request Release Approval</>}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Engineering Tasks</h2>
              <button
                onClick={() => generateTasks.mutate({ prdId: fr.prd!.id })}
                disabled={generateTasks.isPending}
                className="flex items-center gap-2 border border-primary text-primary hover:bg-primary hover:text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {generateTasks.isPending ? "Generating..." : "Regenerate tasks"}
              </button>
            </div>
            {fr.prd.tasks && fr.prd.tasks.length > 0 ? (
              <KanbanBoard tasks={fr.prd.tasks} prdId={fr.prd.id} />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ListTodo className="w-10 h-10 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-1">No tasks yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Approve the PRD to auto-generate tasks, or generate them now.
                </p>
                <button
                  onClick={() => generateTasks.mutate({ prdId: fr.prd!.id })}
                  disabled={generateTasks.isPending}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {generateTasks.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating tasks...</>
                    : <><Sparkles className="w-4 h-4" /> Generate Engineering Tasks</>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Development Tab */}
        {activeTab === "development" && (
          <DevelopmentPanel
            featureId={fr.id}
            featureStatus={fr.status}
            projectId={projectId}
            workspaceSlug={slug}
            projectRepositoryId={fr.project.repositoryId ?? undefined}
            workflowSignal={workflowSignal}
            workspaceId={fr.project.workspace.id}
          />
        )}

        {/* Release Tab */}
        {activeTab === "release" && (
          <div className="p-6 max-w-2xl">
            <h2 className="text-lg font-semibold mb-6">Release & Approval</h2>
            <ReleasePanel featureId={fr.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function PRDEditor({ prd, featureStatus, onApprovePRD, approvePRDPending }: {
  prd: {
    id: string;
    problemStatement: string;
    goals: string[];
    nonGoals: string[];
    userStories: unknown[];
    acceptanceCriteria: unknown[];
    edgeCases: string[];
    successMetrics: string[];
    status: string;
  };
  featureStatus: string;
  onApprovePRD: () => void;
  approvePRDPending: boolean;
}) {
  const utils = trpc.useUtils();
  const updatePRD = trpc.prd.update.useMutation({
    onSuccess: () => utils.featureRequest.getById.invalidate(),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setEditValue(value);
  };

  const saveEdit = async (field: string) => {
    const update: Record<string, unknown> = { prdId: prd.id };
    if (field === "problemStatement") update.problemStatement = editValue;
    else if (field === "goals") update.goals = editValue.split("\n").filter(Boolean);
    else if (field === "nonGoals") update.nonGoals = editValue.split("\n").filter(Boolean);
    else if (field === "edgeCases") update.edgeCases = editValue.split("\n").filter(Boolean);
    else if (field === "successMetrics") update.successMetrics = editValue.split("\n").filter(Boolean);
    await updatePRD.mutateAsync(update as Parameters<typeof updatePRD.mutateAsync>[0]);
    setEditing(null);
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Product Requirements Document</h2>
        {prd.status === "READY" && (
          <button
            onClick={onApprovePRD}
            disabled={approvePRDPending}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {approvePRDPending ? "Approving..." : "Approve PRD & Plan Tasks"}
          </button>
        )}
      </div>
      <div className="space-y-6">
        <EditableSection title="Problem Statement" field="problemStatement" editing={editing} editValue={editValue}
          onStartEdit={() => startEdit("problemStatement", prd.problemStatement)}
          onSave={() => saveEdit("problemStatement")} onCancel={() => setEditing(null)}
          onEditValueChange={setEditValue} multiline>
          <p className="text-sm text-muted-foreground leading-relaxed">{prd.problemStatement}</p>
        </EditableSection>

        <EditableSection title="Goals" field="goals" editing={editing} editValue={editValue}
          onStartEdit={() => startEdit("goals", prd.goals.join("\n"))}
          onSave={() => saveEdit("goals")} onCancel={() => setEditing(null)}
          onEditValueChange={setEditValue} multiline hint="One goal per line">
          <ul className="space-y-1">
            {prd.goals.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" /> {g}
              </li>
            ))}
          </ul>
        </EditableSection>

        <EditableSection title="Non-Goals" field="nonGoals" editing={editing} editValue={editValue}
          onStartEdit={() => startEdit("nonGoals", prd.nonGoals.join("\n"))}
          onSave={() => saveEdit("nonGoals")} onCancel={() => setEditing(null)}
          onEditValueChange={setEditValue} multiline hint="One item per line">
          <ul className="space-y-1">
            {prd.nonGoals.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" /> {g}
              </li>
            ))}
          </ul>
        </EditableSection>

        <div>
          <h3 className="font-semibold text-sm mb-3">User Stories</h3>
          <div className="space-y-3">
            {(prd.userStories as Array<{ id: string; actor: string; action: string; benefit: string; acceptanceCriteria?: string[] }>).map((story, i) => (
              <div key={i} className="border border-border rounded-lg p-3 bg-secondary/30">
                <div className="text-xs font-mono text-primary mb-1">{story.id}</div>
                <p className="text-sm">
                  As a <strong>{story.actor}</strong>, I want to <strong>{story.action}</strong>{" "}
                  so that <strong>{story.benefit}</strong>.
                </p>
                {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {story.acceptanceCriteria.map((ac, j) => (
                      <li key={j} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground shrink-0" /> {ac}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <EditableSection title="Edge Cases" field="edgeCases" editing={editing} editValue={editValue}
          onStartEdit={() => startEdit("edgeCases", prd.edgeCases.join("\n"))}
          onSave={() => saveEdit("edgeCases")} onCancel={() => setEditing(null)}
          onEditValueChange={setEditValue} multiline hint="One edge case per line">
          <ul className="space-y-1">
            {prd.edgeCases.map((e, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" /> {e}
              </li>
            ))}
          </ul>
        </EditableSection>

        <EditableSection title="Success Metrics" field="successMetrics" editing={editing} editValue={editValue}
          onStartEdit={() => startEdit("successMetrics", prd.successMetrics.join("\n"))}
          onSave={() => saveEdit("successMetrics")} onCancel={() => setEditing(null)}
          onEditValueChange={setEditValue} multiline hint="One metric per line">
          <ul className="space-y-1">
            {prd.successMetrics.map((m, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary">-&gt;</span> {m}
              </li>
            ))}
          </ul>
        </EditableSection>
      </div>
    </div>
  );
}

function EditableSection({
  title, field, editing, editValue, onStartEdit, onSave, onCancel, onEditValueChange,
  children, multiline, hint,
}: {
  title: string; field: string; editing: string | null; editValue: string;
  onStartEdit: () => void; onSave: () => void; onCancel: () => void;
  onEditValueChange: (v: string) => void; children: React.ReactNode; multiline?: boolean; hint?: string;
}) {
  const isEditing = editing === field;
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        {!isEditing && (
          <button
            onClick={onStartEdit}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary"
          >
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="space-y-2">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <textarea
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            rows={multiline ? 6 : 2}
            autoFocus
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <div className="flex gap-2">
            <button onClick={onSave} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
              <Save className="w-3 h-3" /> Save
            </button>
            <button onClick={onCancel} className="flex items-center gap-1 text-xs border border-border px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : children}
    </div>
  );
}

function ReleasePanel({ featureId }: { featureId: string }) {
  const utils = trpc.useUtils();

  const { data: pkg, refetch } = trpc.release.getReviewPackage.useQuery(
    { featureRequestId: featureId },
    {
      refetchInterval: (q) => {
        const status = q.state.data?.release?.status;
        return status === "PENDING" ? 5000 : false;
      },
    }
  );

  const approve = trpc.release.approve.useMutation({
    onSuccess: () => { refetch(); utils.featureRequest.getById.invalidate(); },
  });
  const reject = trpc.release.reject.useMutation({
    onSuccess: () => { refetch(); utils.featureRequest.getById.invalidate(); },
  });
  const ship = trpc.release.ship.useMutation({
    onSuccess: () => { refetch(); utils.featureRequest.getById.invalidate(); },
  });
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const toggleCheck = (key: string) =>
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!pkg) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }

  const release = pkg.release;
  const prd = pkg.prd;
  const tasks = (prd?.tasks ?? []) as Array<{ id: string; title: string; status: string; priority: string }>;
  const prs = pkg.pullRequests ?? [];

  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const taskPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const latestPR = prs[0];
  const latestReview = latestPR?.reviews?.[0];
  const blockingCount = latestReview?.issues?.filter((i: any) => i.severity === "BLOCKING" && !i.resolved).length ?? 0;
  const totalReviews = prs.reduce((sum, pr) => sum + (pr.reviews?.length ?? 0), 0);

  const readiness = release?.readinessReport as {
    isReady?: boolean; score?: number; blockers?: string[]; warnings?: string[]; summary?: string; recommendation?: string;
  } | null;

  const STATUS_BADGE: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    SHIPPED: "bg-emerald-100 text-emerald-800",
  };

  const VERDICT_BADGE: Record<string, string> = {
    APPROVED: "bg-green-100 text-green-700",
    NEEDS_CHANGES: "bg-amber-100 text-amber-700",
    BLOCKED: "bg-red-100 text-red-700",
  };

  const CHECKLIST_ITEMS = [
    { key: "prd", label: "PRD reviewed and requirements are clear" },
    { key: "tasks", label: "All critical tasks completed" },
    { key: "pr", label: "Pull request reviewed on GitHub" },
    { key: "ai", label: "AI review findings verified" },
    { key: "issues", label: "No outstanding blocking issues" },
  ];
  const allChecked = CHECKLIST_ITEMS.every((item) => checklist[item.key]);

  if (!release) {
    return (
      <div className="border border-dashed border-border rounded-xl p-12 text-center">
        <Rocket className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No release pending.</p>
        <p className="text-muted-foreground text-xs mt-1">
          Approve the plan, link a PR, and click "Request Release Approval" in the Tasks tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Release status header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Release Review</h2>
        <span className={"text-xs px-2.5 py-1 rounded-full font-medium " + (STATUS_BADGE[release.status] ?? "bg-secondary text-secondary-foreground")}>
          {release.status}
        </span>
      </div>

      {/* ── SHIPPED celebration ── */}
      {release.status === "SHIPPED" && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-6 text-center">
          <Rocket className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="font-bold text-emerald-900 text-lg">Feature shipped!</p>
          {release.reviewedBy && (
            <p className="text-emerald-700 text-sm mt-1">Approved by {release.reviewedBy.name}</p>
          )}
          {release.notes && (
            <p className="text-emerald-800 text-sm mt-2 italic">"{release.notes}"</p>
          )}
        </div>
      )}

      {/* ── Reviewer notes (if already reviewed) ── */}
      {release.status !== "PENDING" && release.reviewedBy && (
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="text-xs text-muted-foreground mb-1">
            {release.status === "APPROVED" || release.status === "SHIPPED" ? "Approved" : "Rejected"} by{" "}
            <strong>{release.reviewedBy.name}</strong>
            {release.approvedAt && <> · {formatRelativeDate(release.approvedAt)}</>}
          </div>
          {release.notes && (
            <p className="text-sm text-foreground">{release.notes}</p>
          )}
        </div>
      )}

      {/* ── AI Readiness Report ── */}
      {release.status === "PENDING" && (
        <>
          {readiness ? (
            <div className="border rounded-xl p-5 space-y-3"
              style={readiness.isReady
                ? { background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)" }
                : { background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }
              }>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" style={{ color: readiness.isReady ? "#34d399" : "#fbbf24" }} />
                  <span className="font-semibold text-sm">AI Readiness Report</span>
                </div>
                <span className={"text-sm font-bold " + (
                  (readiness.score ?? 0) >= 80 ? "text-green-700" :
                  (readiness.score ?? 0) >= 50 ? "text-amber-700" : "text-red-700"
                )}>
                  {readiness.score ?? 0}/100
                </span>
              </div>
              {readiness.summary && (
                <p className="text-sm text-foreground">{readiness.summary}</p>
              )}
              {readiness.blockers && readiness.blockers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-1.5">Blockers</p>
                  <ul className="space-y-1">
                    {readiness.blockers.map((b, i) => (
                      <li key={i} className="text-xs text-red-800 flex gap-2">
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {readiness.warnings && readiness.warnings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">Warnings</p>
                  <ul className="space-y-1">
                    {readiness.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-800 flex gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className={"text-xs font-medium px-3 py-2 rounded-lg " + (
                readiness.recommendation === "SHIP" ? "bg-green-100 text-green-800" :
                readiness.recommendation === "HOLD" ? "bg-amber-100 text-amber-800" :
                "bg-secondary text-secondary-foreground"
              )}>
                AI Recommendation: {readiness.recommendation ?? "REVIEW"}
              </div>
            </div>
          ) : (
            <WorkflowProgress
              title="Running Release Readiness Check"
              subtitle="AI is analyzing task completion, review history, and blockers"
              workflowSignal={workflowSignal}
              fallbackSteps={["Gathering feature and PR context", "Analyzing task completion and blockers", "Running AI release readiness check", "Saving readiness report"]}
              color="green"
            />
          )}
        </>
      )}

      {/* ── Verification cards ── */}
      <div className="grid grid-cols-1 gap-3">
        {/* PRD summary */}
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Product Requirements</span>
              </div>
              {prd ? (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Problem:</span> {prd.problemStatement?.slice(0, 150)}{(prd.problemStatement?.length ?? 0) > 150 ? "..." : ""}</p>
                  <p><span className="font-medium text-foreground">Goals:</span> {(prd.goals as string[]).slice(0, 3).join("; ")}</p>
                  <p><span className="font-medium text-foreground">Acceptance Criteria:</span> {(prd.acceptanceCriteria as string[]).length} defined</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No PRD found</p>
              )}
            </div>
            {prd && (
              <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Ready</span>
            )}
          </div>
        </div>

        {/* Tasks */}
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <ListTodo className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Engineering Tasks</span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: taskPct + "%" }} />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{doneTasks}/{tasks.length} done</span>
              </div>
              {tasks.filter((t) => t.status !== "DONE" && t.priority === "CRITICAL").length > 0 && (
                <p className="text-xs text-red-600 font-medium">
                  {tasks.filter((t) => t.status !== "DONE" && t.priority === "CRITICAL").length} CRITICAL tasks incomplete
                </p>
              )}
            </div>
            <span className={"shrink-0 text-xs px-2 py-0.5 rounded-full font-medium " + (
              taskPct === 100 ? "bg-green-100 text-green-700" :
              taskPct >= 80 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            )}>
              {taskPct}%
            </span>
          </div>
        </div>

        {/* Pull Requests */}
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <GitPullRequest className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Pull Requests</span>
            <span className="text-xs text-muted-foreground">({prs.length} linked)</span>
          </div>
          {prs.length === 0 ? (
            <p className="text-xs text-amber-600">No pull requests linked to this feature.</p>
          ) : (
            <div className="space-y-2">
              {prs.map((pr: any) => {
                const rev = pr.reviews?.[0];
                return (
                  <div key={pr.id} className="flex items-center justify-between gap-2">
                    <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate flex items-center gap-1">
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      #{pr.number}: {pr.title}
                    </a>
                    {rev && (
                      <span className={"text-xs px-2 py-0.5 rounded-full font-medium shrink-0 " + (VERDICT_BADGE[rev.verdict] ?? "")}>
                        {rev.verdict.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* AI Review History */}
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">AI Review History</span>
            <span className="text-xs text-muted-foreground">({totalReviews} review{totalReviews !== 1 ? "s" : ""})</span>
          </div>
          {totalReviews === 0 ? (
            <p className="text-xs text-amber-600">No AI reviews completed yet.</p>
          ) : (
            <div className="space-y-2">
              {prs.flatMap((pr: any) => pr.reviews ?? []).slice(0, 4).map((rev: any, idx: number) => (
                <div key={rev.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className={"px-1.5 py-0.5 rounded font-medium " + (VERDICT_BADGE[rev.verdict] ?? "")}>
                      {rev.verdict.replace(/_/g, " ")}
                    </span>
                    <span className="ml-2 text-muted-foreground">{rev.requirementsCoverage}% coverage</span>
                    {rev.summary && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1">{rev.summary}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {blockingCount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 font-medium">
              <XCircle className="w-3.5 h-3.5" />
              {blockingCount} unresolved blocking issue{blockingCount > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ── Human checklist + approval actions ── */}
      {release.status === "PENDING" && (
        <div className="border border-border rounded-xl p-5 bg-card space-y-4">
          <h3 className="font-semibold text-sm">Reviewer Checklist</h3>
          <div className="space-y-2.5">
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => toggleCheck(item.key)}
                  className={"w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors " + (
                    checklist[item.key]
                      ? "bg-green-600 border-green-600"
                      : "border-input group-hover:border-primary"
                  )}
                >
                  {checklist[item.key] && (
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className={"text-sm " + (checklist[item.key] ? "line-through text-muted-foreground" : "")}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add review notes (optional — visible to the team)"
            rows={3}
            className="w-full text-sm border border-input rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          <div className="flex gap-2">
            <button
              onClick={() => approve.mutate({ featureRequestId: featureId, notes })}
              disabled={approve.isPending || !allChecked}
              title={!allChecked ? "Complete the checklist to approve" : undefined}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {approve.isPending ? "Approving..." : "Approve Release"}
            </button>
            <button
              onClick={() => reject.mutate({ featureRequestId: featureId, notes })}
              disabled={reject.isPending}
              className="flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              {reject.isPending ? "Rejecting..." : "Send Back for Fixes"}
            </button>
          </div>
          {!allChecked && (
            <p className="text-xs text-muted-foreground">Complete all checklist items before approving.</p>
          )}
        </div>
      )}

      {release.status === "APPROVED" && (
        <div className="space-y-3">
          <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#6ee7b7" }}>
            <CheckCircle2 className="w-4 h-4 inline mr-2" />
            Release approved by <strong>{release.reviewedBy?.name}</strong>. Ready to ship.
          </div>
          <button
            onClick={() => ship.mutate({ featureRequestId: featureId })}
            disabled={ship.isPending}
            className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50" style={{ background: "linear-gradient(135deg, #7c3aed, #34d399)" }}
          >
            <Rocket className="w-4 h-4" />
            {ship.isPending ? "Shipping..." : "Ship Feature to Production"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Development Panel ──────────────────────────────────────────────────────

function DevelopmentPanel({
  featureId,
  featureStatus,
  projectId,
  workspaceSlug,
  projectRepositoryId,
  workflowSignal,
  workspaceId,
}: {
  featureId: string;
  featureStatus: string;
  projectId: string;
  workspaceSlug: string;
  projectRepositoryId?: string;
  workflowSignal?: { step: string; steps: string[] } | undefined;
  workspaceId: string;
}) {
  const utils = trpc.useUtils();

  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug: workspaceSlug });
  const { data: workspaceRepos } = trpc.repository.list.useQuery({ workspaceId });

  const { data: linkedPRs, refetch: refetchLinked } = trpc.repository.getLinkedPRs.useQuery({
    featureRequestId: featureId,
  });
  const { data: repoPRs } = trpc.repository.getPullRequests.useQuery(
    { repositoryId: projectRepositoryId! },
    { enabled: !!projectRepositoryId }
  );
  const { data: reviewHistory } = trpc.review.listByFeature.useQuery(
    { featureRequestId: featureId },
    { refetchInterval: featureStatus === "IN_REVIEW" || featureStatus === "FIX_NEEDED" ? 5000 : false }
  );
  const { data: latestReview } = trpc.review.getLatestForFeature.useQuery(
    { featureRequestId: featureId },
    { enabled: featureStatus === "FIX_NEEDED" || featureStatus === "IN_REVIEW" }
  );

  const linkPR = trpc.repository.linkPRToFeature.useMutation({
    onSuccess: () => { refetchLinked(); utils.featureRequest.getById.invalidate(); },
  });
  const triggerReview = trpc.review.triggerReview.useMutation({
    onSuccess: () => { refetchLinked(); utils.featureRequest.getById.invalidate(); },
  });
  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => utils.featureRequest.getById.invalidate(),
  });
  const syncPRs = trpc.repository.syncPullRequests.useMutation({
    onSuccess: () => {
      utils.repository.getPullRequests.invalidate({ repositoryId: projectRepositoryId! });
      utils.repository.getLinkedPRs.invalidate({ featureRequestId: featureId });
      refetchLinked();
    },
  });
  const resetStuck = trpc.review.resetStuckReviews.useMutation({
    onSuccess: () => utils.review.listByFeature.invalidate({ featureRequestId: featureId }),
  });

  const [linkingPrId, setLinkingPrId] = useState<string | null>(null);

  const hasInstallation = !!workspace?.githubInstallation;
  const hasRepos = (workspaceRepos?.length ?? 0) > 0;
  const hasProjectRepo = !!projectRepositoryId;

  const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || "shipdevflow";
  const installUrl = workspaceId
    ? `https://github.com/apps/${appName}/installations/new?state=${workspaceId}`
    : `https://github.com/apps/${appName}/installations/new`;

  const PR_STATE_COLORS: Record<string, string> = {
    OPEN: "text-emerald-400",
    MERGED: "text-violet-400",
    CLOSED: "text-rose-400",
  };
  const VERDICT_COLORS: Record<string, string> = {
    APPROVED: "bg-emerald-500/15 text-emerald-300",
    NEEDS_CHANGES: "bg-amber-500/15 text-amber-300",
    BLOCKED: "bg-rose-500/15 text-rose-300",
  };
  const VERDICT_CYCLE_COLORS: Record<string, string> = {
    APPROVED: "border-emerald-500/20 bg-emerald-500/5",
    NEEDS_CHANGES: "border-amber-500/20 bg-amber-500/5",
    BLOCKED: "border-rose-500/20 bg-rose-500/5",
  };

  const unlinkablePRs = repoPRs?.filter(
    (pr) => pr.featureRequestId !== featureId && pr.state === "OPEN"
  ) ?? [];

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <h2 className="text-lg font-semibold text-white">Development</h2>

      {/* ── FIX_NEEDED banner ─────────────────────────────────────── */}
      {featureStatus === "FIX_NEEDED" && latestReview && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)" }}>
          <div className="flex items-start gap-3">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#fb7185" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Fixes required before this can ship</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                Fix the issues below and push new commits — a re-review triggers automatically.
              </p>
            </div>
          </div>
          {latestReview.issues.length > 0 && (
            <div className="space-y-2">
              {latestReview.issues
                .filter((i: { severity: string }) => i.severity === "BLOCKING")
                .map((issue: { id: string; title: string; description: string; suggestion: string; category: string }) => (
                  <div key={issue.id} className="rounded-lg p-3"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(244,63,94,0.2)" }}>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(244,63,94,0.15)", color: "#fb7185" }}>
                      BLOCKING · {issue.category.replace(/_/g, " ")}
                    </span>
                    <p className="text-sm font-medium text-white mt-1.5">{issue.title}</p>
                    <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>{issue.description}</p>
                    {issue.suggestion && (
                      <p className="text-xs mt-1.5 px-2 py-1.5 rounded"
                        style={{ background: "rgba(96,165,250,0.1)", color: "#93c5fd" }}>
                        Fix: {issue.suggestion}
                      </p>
                    )}
                  </div>
                ))}
              {latestReview.issues
                .filter((i: { severity: string }) => i.severity === "NON_BLOCKING")
                .map((issue: { id: string; title: string; category: string }) => (
                  <div key={issue.id} className="rounded-lg p-2.5"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                      WARNING · {issue.category.replace(/_/g, " ")}
                    </span>
                    <p className="text-sm mt-1 text-white/80">{issue.title}</p>
                  </div>
                ))}
            </div>
          )}
          <Link href={"/w/" + workspaceSlug + "/reviews/" + latestReview.id}
            className="text-xs underline hover:no-underline" style={{ color: "#fb7185" }}>
            View full review report →
          </Link>
        </div>
      )}

      {/* ── IN_REVIEW banner ──────────────────────────────────────── */}
      {featureStatus === "IN_REVIEW" && (
        <div className="rounded-lg p-4"
          style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: "#a78bfa" }} />
            <p className="font-medium text-sm text-white">AI review in progress</p>
          </div>
          <WorkflowProgress
            title="Running AI Code Review"
            subtitle="Validating your code against PRD requirements"
            workflowSignal={workflowSignal}
            fallbackSteps={["Fetching PR context and PRD", "Downloading code diff from GitHub", "Validating acceptance criteria (QA pass)", "Running comprehensive code review", "Saving review results", "Posting review to GitHub PR"]}
            color="purple"
          />
        </div>
      )}

      {/* ── IN_DEVELOPMENT hint (only when repo is linked) ─────────── */}
      {featureStatus === "IN_DEVELOPMENT" && hasProjectRepo && (
        <div className="flex items-start gap-3 rounded-lg p-4"
          style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)" }}>
          <GitBranch className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#60a5fa" }} />
          <div>
            <p className="font-medium text-sm text-white">Development in progress</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              Create a branch named{" "}
              <code className="px-1 rounded font-mono"
                style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd" }}>
                {"feat/" + featureId}
              </code>{" "}
              to auto-link your PR and trigger an AI review when you open it.
            </p>
          </div>
        </div>
      )}

      {/* ── GitHub Connection State (no project repo) ────────────────── */}
      {!hasProjectRepo && (
        <div className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}>

          {/* Step progress header */}
          <div className="px-5 py-4" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "rgba(255,255,255,0.3)" }}>Setup Progress</p>
            <div className="flex items-center gap-0">
              {[
                { label: "GitHub App", done: hasInstallation },
                { label: "Repository", done: hasRepos },
                { label: "Link to Project", done: false },
              ].map((step, i, arr) => (
                <div key={i} className="flex items-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={step.done
                        ? { background: "rgba(52,211,153,0.2)", color: "#34d399", border: "1px solid rgba(52,211,153,0.4)" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      {step.done ? "✓" : i + 1}
                    </div>
                    <span className="text-xs whitespace-nowrap"
                      style={{ color: step.done ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
                      {step.label}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="w-12 h-px mx-1 mb-4 shrink-0"
                      style={{ background: step.done ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)" }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action area */}
          <div className="px-5 py-5" style={{ background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {!hasInstallation ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                    <Github className="w-4 h-4" style={{ color: "#a78bfa" }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">Install the GitHub App</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Grant ShipFlow access to your GitHub account to enable PR tracking
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href={installUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)" }}>
                    <Github className="w-3.5 h-3.5" />
                    Install GitHub App
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <Link href={"/w/" + workspaceSlug + "/github"}
                    className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                    GitHub Settings
                  </Link>
                </div>
                <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Already installed?{" "}
                  <Link href={"/w/" + workspaceSlug + "/github"} className="underline" style={{ color: "#60a5fa" }}>
                    Enter installation ID manually →
                  </Link>
                </p>
              </>
            ) : !hasRepos ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)" }}>
                    <GitBranch className="w-4 h-4" style={{ color: "#60a5fa" }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">Connect a repository</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                      GitHub App is installed — now select which repositories to track
                    </p>
                  </div>
                </div>
                <Link href={"/w/" + workspaceSlug + "/github"}
                  className="inline-flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)" }}>
                  <GitBranch className="w-3.5 h-3.5" />
                  Connect Repository
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}>
                    <GitBranch className="w-4 h-4" style={{ color: "#a78bfa" }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">Select a repository for this project</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Choose which repository to track pull requests from
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {workspaceRepos?.map((repo) => (
                    <button key={repo.id}
                      onClick={() => updateProject.mutate({ projectId, repositoryId: repo.id })}
                      disabled={updateProject.isPending}
                      className="w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-all hover:scale-[1.01] disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex items-center gap-3">
                        <GitBranch className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                        <div>
                          <div className="font-medium text-sm text-white">{repo.fullName}</div>
                          <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {repo.defaultBranch} · {repo.private ? "Private" : "Public"}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium px-3 py-1 rounded-lg"
                        style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                        {updateProject.isPending ? "Linking..." : "Use this repo →"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Don&apos;t see your repo?{" "}
                  <Link href={"/w/" + workspaceSlug + "/github"} className="underline" style={{ color: "#60a5fa" }}>
                    Manage repositories →
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PR Tracking (repo IS linked) ─────────────────────────────── */}
      {hasProjectRepo && (
        <>
          {/* Linked PRs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">
                Linked Pull Requests
                {linkedPRs && linkedPRs.length > 0 && (
                  <span className="ml-2 text-xs font-normal" style={{ color: "rgba(255,255,255,0.35)" }}>
                    ({linkedPRs.length})
                  </span>
                )}
              </h3>
              {projectRepositoryId && (
                <button
                  onClick={() => syncPRs.mutate({ repositoryId: projectRepositoryId })}
                  disabled={syncPRs.isPending}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  style={{ border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa", background: "rgba(124,58,237,0.08)" }}
                  title="Pull open PRs from GitHub into ShipFlow (useful when webhooks aren't set up yet)"
                >
                  {syncPRs.isPending ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Syncing…</>
                  ) : (
                    <><RefreshCw className="w-3 h-3" /> Sync from GitHub</>
                  )}
                </button>
              )}
            </div>
            {syncPRs.isSuccess && (
              <p className="text-xs mb-3" style={{ color: "#34d399" }}>
                ✓ Synced {syncPRs.data?.synced ?? 0} open PR{syncPRs.data?.synced !== 1 ? "s" : ""} from GitHub
              </p>
            )}
            {syncPRs.isError && (
              <p className="text-xs mb-3" style={{ color: "#fb7185" }}>
                Sync failed: {syncPRs.error?.message}
              </p>
            )}
            {!linkedPRs || linkedPRs.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm space-y-3"
                style={{ border: "1px dashed rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}>
                <GitPullRequest className="w-6 h-6 mx-auto opacity-40" />
                <p>No pull requests linked yet.</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Open a PR on GitHub, then click <strong style={{ color: "rgba(255,255,255,0.4)" }}>Sync from GitHub</strong> above to import it — or link one from the list below.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {linkedPRs.map((pr) => {
                  const latestPRReview = pr.reviews?.[0];
                  const blockingCount = latestPRReview?.issues.filter(
                    (i: { severity: string }) => i.severity === "BLOCKING"
                  ).length ?? 0;
                  return (
                    <div key={pr.id} className="rounded-xl p-4"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <GitPullRequest className={"w-4 h-4 shrink-0 " + (PR_STATE_COLORS[pr.state] ?? "text-white/40")} />
                            <span className="font-medium text-sm text-white truncate">{pr.title}</span>
                            <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
                              #{pr.number}
                            </span>
                          </div>
                          <p className="text-xs ml-6" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {pr.headBranch} → {pr.baseBranch} · by {pr.authorLogin}
                          </p>
                          {latestPRReview && (
                            <div className="ml-6 mt-2 flex items-center gap-2">
                              <span className={"text-xs px-2 py-0.5 rounded-full font-medium " + (VERDICT_COLORS[latestPRReview.verdict] ?? "")}>
                                {latestPRReview.verdict.replace(/_/g, " ")}
                              </span>
                              {blockingCount > 0 && (
                                <span className="text-xs" style={{ color: "#fb7185" }}>
                                  {blockingCount} blocking issue{blockingCount > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          )}
                          {(latestPRReview?.status === "PENDING" || latestPRReview?.status === "RUNNING") && (
                            <div className="ml-6 mt-2 flex items-center gap-1.5 text-xs"
                              style={{ color: "rgba(255,255,255,0.35)" }}>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              AI review running...
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer"
                            style={{ color: "rgba(255,255,255,0.3)" }}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => triggerReview.mutate({ pullRequestId: pr.id, featureRequestId: featureId })}
                            disabled={triggerReview.isPending}
                            className="text-xs text-white px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors"
                            style={{ background: "#7c3aed" }}>
                            {latestPRReview ? "Re-review" : "AI Review"}
                          </button>
                          <button
                            onClick={() => linkPR.mutate({ pullRequestId: pr.id, featureRequestId: null })}
                            disabled={linkPR.isPending}
                            title="Unlink PR"
                            style={{ color: "rgba(255,255,255,0.25)" }}>
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Review History */}
          {reviewHistory && reviewHistory.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  Review Cycle History
                  <span className="ml-2 text-xs font-normal" style={{ color: "rgba(255,255,255,0.35)" }}>
                    ({reviewHistory.length})
                  </span>
                </h3>
                {reviewHistory.some(r => r.status === "RUNNING" || r.status === "PENDING") && (
                  <button
                    onClick={() => resetStuck.mutate({ workspaceId })}
                    disabled={resetStuck.isPending}
                    className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-50"
                    style={{ border: "1px solid rgba(244,63,94,0.3)", color: "#fb7185", background: "rgba(244,63,94,0.08)" }}
                  >
                    {resetStuck.isPending ? "Clearing…" : "Clear stuck"}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {reviewHistory.map((rev, idx) => (
                  <div key={rev.id}
                    className={"border rounded-lg px-4 py-3 " + (VERDICT_CYCLE_COLORS[rev.verdict] ?? "border-white/10 bg-white/[0.02]")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
                          #{reviewHistory.length - idx}
                        </span>
                        <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + (VERDICT_COLORS[rev.verdict] ?? "")}>
                          {rev.verdict.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                          PR #{rev.pullRequest.number} · {rev.requirementsCoverage}% coverage
                        </span>
                        {rev.blockingCount > 0 && (
                          <span className="text-xs shrink-0" style={{ color: "#fb7185" }}>
                            {rev.blockingCount} blocking
                          </span>
                        )}
                      </div>
                      <div className="shrink-0">
                        {rev.status === "PENDING" || rev.status === "RUNNING" ? (
                          <span className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                            <Loader2 className="w-3 h-3 animate-spin" /> Running
                          </span>
                        ) : rev.status === "FAILED" ? (
                          <span className="text-xs" style={{ color: "#fb7185" }}>Failed</span>
                        ) : (
                          <Link href={"/w/" + workspaceSlug + "/reviews/" + rev.id}
                            className="text-xs hover:underline" style={{ color: "#a78bfa" }}>
                            Details
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link PR manually */}
          {unlinkablePRs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Link an Open Pull Request</h3>
              <div className="space-y-2">
                {unlinkablePRs.map((pr) => (
                  <div key={pr.id} className="flex items-center justify-between rounded-xl p-3"
                    style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <GitPullRequest className="w-4 h-4 shrink-0" style={{ color: "#34d399" }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{pr.title}</p>
                        <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {pr.headBranch} · #{pr.number}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setLinkingPrId(pr.id);
                        linkPR.mutate(
                          { pullRequestId: pr.id, featureRequestId: featureId },
                          { onSettled: () => setLinkingPrId(null) }
                        );
                      }}
                      disabled={linkPR.isPending && linkingPrId === pr.id}
                      className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                      <Link2 className="w-3 h-3" />
                      {linkPR.isPending && linkingPrId === pr.id ? "Linking..." : "Link"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
