"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Plus, Bot, ArrowRight, Filter, Loader2, Trash2, GitBranch, Github, ChevronDown } from "lucide-react";
import { formatRelativeDate, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";

const STATUS_FILTERS = ["ALL", "DISCOVERY", "PRD_READY", "PLANNING", "IN_DEVELOPMENT", "IN_REVIEW", "FIX_NEEDED", "HUMAN_REVIEW", "SHIPPED"];

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const projectId = params.projectId as string;
  const [filter, setFilter] = useState("ALL");
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDeleteFR, setConfirmDeleteFR] = useState<string | null>(null);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  const { data: project, refetch: refetchProject } = trpc.project.getById.useQuery({ projectId });
  const { data: features, refetch } = trpc.featureRequest.list.useQuery({ projectId });
  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug });
  const { data: repos } = trpc.repository.list.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );

  const createFR = trpc.featureRequest.create.useMutation({
    onSuccess: (fr) => {
      setShowNew(false); setTitle(""); setDescription("");
      router.push(`/w/${slug}/projects/${projectId}/features/${fr.id}`);
    },
  });
  const deleteFR = trpc.featureRequest.delete.useMutation({
    onSuccess: () => { setConfirmDeleteFR(null); refetch(); },
  });
  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => { refetchProject(); setShowRepoDropdown(false); },
  });

  const filtered = features?.filter((f) => filter === "ALL" || f.status === filter) || [];
  const connectedRepo = repos?.find((r) => r.id === project?.repositoryId);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm mb-6" style={{ color: "rgba(255,255,255,0.35)" }}>
        <Link href={`/w/${slug}/projects`} className="hover:text-white transition-colors">Projects</Link>
        <span>/</span>
        <span className="font-medium text-white">{project?.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project?.name}</h1>
          {project?.description && (
            <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Repository selector */}
          {repos && repos.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors text-white/70 hover:text-white"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
              >
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                {connectedRepo ? connectedRepo.name : "Connect repo"}
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              {showRepoDropdown && (
                <div className="absolute right-0 top-full mt-1 rounded-xl shadow-2xl z-10 w-64 py-1 overflow-hidden"
                  style={{ background: "hsl(240 22% 8%)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <button
                    onClick={() => updateProject.mutate({ projectId, repositoryId: null })}
                    className="w-full text-left px-4 py-2 text-sm transition-colors"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                    onMouseEnter={e => (e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                    onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                  >
                    No repository
                  </button>
                  {repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => updateProject.mutate({ projectId, repositoryId: repo.id })}
                      className="w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 text-white/80 hover:text-white"
                      style={{ background: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background="rgba(255,255,255,0.04)")}
                      onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                    >
                      <GitBranch className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{repo.fullName}</span>
                      {repo.id === project?.repositoryId && (
                        <span className="ml-auto text-xs shrink-0" style={{ color: "#a78bfa" }}>connected</span>
                      )}
                    </button>
                  ))}
                  <div className="mt-1 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <Link
                      href={`/w/${slug}/github`}
                      className="block px-4 py-2 text-sm transition-colors flex items-center gap-2"
                    style={{ color: "#a78bfa" }}
                    onMouseEnter={e => (e.currentTarget.style.background="rgba(124,58,237,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                    >
                      <Github className="w-3.5 h-3.5" /> Manage GitHub
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
          {repos && repos.length === 0 && (
            <Link
              href={`/w/${slug}/github`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all hover:opacity-90"
              style={{ border: "1px solid rgba(124,58,237,0.4)", color: "#a78bfa", background: "rgba(124,58,237,0.1)" }}
            >
              <Github className="w-3.5 h-3.5" />
              Connect GitHub
            </Link>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New feature request
          </button>
        </div>
      </div>

      {/* Connected repo badge */}
      {connectedRepo && (
        <div className="flex items-center gap-2 text-xs mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>
          <GitBranch className="w-3.5 h-3.5" />
          <span>Repository: <strong className="text-foreground">{connectedRepo.fullName}</strong></span>
          <a href={connectedRepo.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#a78bfa" }}>
            View on GitHub
          </a>
        </div>
      )}

      {showNew && (
        <div className="border border-primary/30 bg-primary/5 rounded-xl p-6 mb-6">
          <h3 className="font-semibold mb-1">New Feature Request</h3>
          <p className="text-sm text-muted-foreground mb-4">Our AI agent will analyze your request and generate initial questions.</p>
          {createFR.isPending && (
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 mb-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              AI is analyzing your request — this takes a few seconds...
            </div>
          )}
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Feature title (e.g. Add dark mode support)"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the feature — what problem does it solve? Who is it for?"
              rows={4}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => createFR.mutate({ projectId, title, description })}
                disabled={!title.trim() || !description.trim() || createFR.isPending}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
              >
                {createFR.isPending ? "Creating..." : "Submit request"}
              </button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-sm border border-input hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteFR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">Delete feature request?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will permanently delete the feature request along with its PRD, tasks, and reviews. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteFR.mutate({ id: confirmDeleteFR })}
                disabled={deleteFR.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-destructive/90"
              >
                {deleteFR.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...</> : "Delete"}
              </button>
              <button onClick={() => setConfirmDeleteFR(null)} disabled={deleteFR.isPending} className="flex-1 py-2 rounded-lg text-sm border border-input hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {s === "ALL" ? "All" : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No feature requests {filter !== "ALL" ? "with this status" : "yet"}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((fr) => (
            <div key={fr.id} className="relative group flex items-center justify-between p-4 border border-border rounded-xl bg-card hover:bg-accent transition-colors">
              <Link href={`/w/${slug}/projects/${projectId}/features/${fr.id}`} className="absolute inset-0 rounded-xl" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{fr.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {fr.createdBy.name} - {formatRelativeDate(fr.updatedAt)}
                  {fr.prd && <span className="ml-2 text-primary">PRD ready</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[fr.status] || "bg-secondary text-secondary-foreground"}`}>
                  {STATUS_LABELS[fr.status] || fr.status}
                </span>
                <button
                  onClick={(e) => { e.preventDefault(); setConfirmDeleteFR(fr.id); }}
                  className="relative z-10 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  title="Delete feature"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
