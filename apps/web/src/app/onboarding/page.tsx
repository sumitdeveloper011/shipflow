"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Ship, Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [checking, setChecking] = useState(true);

  const { data: workspaces } = trpc.workspace.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (workspaces === undefined) return;
    if (workspaces.length > 0) {
      router.replace(`/w/${workspaces[0].slug}`);
    } else {
      setChecking(false);
    }
  }, [workspaces, router]);

  const createWorkspace = trpc.workspace.create.useMutation({
    onSuccess: (ws) => router.push(`/w/${ws.slug}`),
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading your workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <Ship className="w-6 h-6 text-primary" />
          <span className="font-bold text-xl">ShipFlow</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">Create your workspace</h1>
        <p className="text-muted-foreground text-sm mb-8">
          A workspace is where your team manages feature requests and ships products.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Workspace name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
              }}
              placeholder="Acme Inc"
              className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Workspace URL</label>
            <div className="flex items-center border border-input rounded-lg overflow-hidden">
              <span className="px-3 py-2.5 text-muted-foreground text-sm bg-secondary border-r border-input whitespace-nowrap">shipflow.app/w/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""))}
                placeholder="acme-inc"
                className="flex-1 px-3 py-2.5 text-sm bg-background focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={() => createWorkspace.mutate({ name, slug })}
            disabled={!name.trim() || !slug.trim() || createWorkspace.isPending}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {createWorkspace.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Creating...
              </span>
            ) : "Create workspace"}
          </button>
          {createWorkspace.isError && (
            <p className="text-sm text-destructive">{createWorkspace.error.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
