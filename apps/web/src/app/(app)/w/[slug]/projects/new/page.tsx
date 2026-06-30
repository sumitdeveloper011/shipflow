"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

export default function NewProjectPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug });
  const { data: repos } = trpc.repository.list.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );
  const [repoId, setRepoId] = useState("");

  const create = trpc.project.create.useMutation({
    onSuccess: (project) => router.push(`/w/${slug}/projects/${project.id}`),
    onError: (err) => setError(err.message),
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href={`/w/${slug}/projects`}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to projects
      </Link>

      <h1 className="text-2xl font-bold mb-6">Create project</h1>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Project name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mobile App, API v2, Dashboard Redesign"
            className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this project cover? (optional)"
            rows={3}
            className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {repos && repos.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Link a repository (optional)</label>
            <select
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">No repository</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() =>
              workspace?.id &&
              create.mutate({
                workspaceId: workspace.id,
                name,
                description: description || undefined,
                repositoryId: repoId || undefined,
              })
            }
            disabled={!name.trim() || create.isPending}
            className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {create.isPending ? "Creating..." : "Create project"}
          </button>
          <Link
            href={`/w/${slug}/projects`}
            className="px-6 py-2.5 rounded-lg font-medium text-sm border border-input hover:bg-accent transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
