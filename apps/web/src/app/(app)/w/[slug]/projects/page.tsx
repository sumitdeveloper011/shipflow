"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Plus, FolderOpen, GitBranch, Bot, Trash2, Loader2 } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

export default function ProjectsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug });
  const { data: projects, refetch } = trpc.project.list.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );
  const createProject = trpc.project.create.useMutation({
    onSuccess: () => { setShowNew(false); setName(""); setDescription(""); refetch(); },
  });
  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => { setConfirmDelete(null); refetch(); },
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize feature requests by project</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New project
        </button>
      </div>

      {showNew && (
        <div className="border border-primary/30 bg-primary/5 rounded-xl p-6 mb-6">
          <h3 className="font-semibold mb-4">Create project</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => workspace?.id && createProject.mutate({ workspaceId: workspace.id, name, description })}
                disabled={!name.trim() || createProject.isPending}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
              >
                {createProject.isPending ? "Creating..." : "Create"}
              </button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-sm border border-input hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">Delete project?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will permanently delete the project and all its feature requests, PRDs, and tasks. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteProject.mutate({ projectId: confirmDelete })}
                disabled={deleteProject.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-destructive/90"
              >
                {deleteProject.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...</> : "Delete project"}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteProject.isPending}
                className="flex-1 py-2 rounded-lg text-sm border border-input hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!projects?.length ? (
        <div className="border border-dashed border-border rounded-xl p-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-1">No projects yet</h3>
          <p className="text-muted-foreground text-sm">Create your first project to start managing feature requests</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div key={project.id} className="relative group border border-border rounded-xl p-5 bg-card hover:bg-accent transition-colors">
              <Link href={`/w/${slug}/projects/${project.id}`} className="absolute inset-0 rounded-xl" />
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{formatRelativeDate(project.updatedAt)}</span>
                  <button
                    onClick={(e) => { e.preventDefault(); setConfirmDelete(project.id); }}
                    className="relative z-10 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold mb-1">{project.name}</h3>
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  {project._count.featureRequests} features
                </span>
                {project.repository && (
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {project.repository.name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
