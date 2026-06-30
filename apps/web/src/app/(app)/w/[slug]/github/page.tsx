"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  GitBranch, Github, Link as LinkIcon, Unlink, RefreshCw,
  ExternalLink, GitPullRequest, CheckCircle2, KeyRound,
  AlertTriangle, Loader2, Plus,
} from "lucide-react";
import Link from "next/link";

export default function GithubPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const justConnected = searchParams.get("connected") === "true";

  const [installationIdInput, setInstallationIdInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualRepoInput, setManualRepoInput] = useState("");
  const [manualRepoError, setManualRepoError] = useState("");

  const { data: workspace, refetch: refetchWorkspace } = trpc.workspace.getBySlug.useQuery({ slug });
  const { data: repos, refetch } = trpc.repository.list.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );
  const {
    data: available,
    refetch: refetchAvailable,
    isLoading: availableLoading,
    isError: availableError,
    error: availableErrorObj,
  } = trpc.repository.listAvailable.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id && !!workspace?.githubInstallation, retry: 1 }
  );

  const saveInstallation = trpc.workspace.saveGithubInstallation.useMutation({
    onSuccess: () => {
      setInstallationIdInput("");
      setManualError("");
      refetchWorkspace();
    },
    onError: (err) => setManualError(err.message),
  });

  const connect = trpc.repository.connect.useMutation({
    onSuccess: () => { refetch(); refetchAvailable(); },
  });
  const connectByName = trpc.repository.connectByFullName.useMutation({
    onSuccess: () => {
      setManualRepoInput("");
      setManualRepoError("");
      refetch();
      refetchAvailable();
    },
    onError: (err) => setManualRepoError(err.message),
  });
  const disconnect = trpc.repository.disconnect.useMutation({
    onSuccess: () => refetch(),
  });

  const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || "shipdevflow";
  const installUrl = workspace?.id
    ? `https://github.com/apps/${appName}/installations/new?state=${workspace.id}`
    : `https://github.com/apps/${appName}/installations/new`;

  function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    setManualError("");
    const id = parseInt(installationIdInput.trim(), 10);
    if (!id || isNaN(id)) { setManualError("Enter a valid numeric installation ID"); return; }
    if (!workspace?.id) { setManualError("Workspace not loaded"); return; }
    saveInstallation.mutate({ workspaceId: workspace.id, installationId: id });
  }

  function handleManualRepo(e: React.FormEvent) {
    e.preventDefault();
    setManualRepoError("");
    const val = manualRepoInput.trim();
    if (!val.includes("/")) { setManualRepoError("Format: owner/repo-name (e.g. myorg/my-project)"); return; }
    if (!workspace?.id) return;
    connectByName.mutate({ workspaceId: workspace.id, fullName: val });
  }

  const isConnected = !!workspace?.githubInstallation;
  const unconnectedAvailable = available?.filter((r) => !r.alreadyConnected) ?? [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">GitHub Integration</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Connect repositories to track pull requests and run AI reviews
          </p>
        </div>
        {isConnected && (
          <a href={installUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
            <Github className="w-4 h-4" />
            Manage on GitHub
          </a>
        )}
      </div>

      {/* Connected banner */}
      {justConnected && (
        <div className="flex items-center gap-3 rounded-xl p-4 mb-6"
          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
          <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#34d399" }} />
          <p className="text-sm font-medium" style={{ color: "#34d399" }}>
            GitHub App connected! Now connect your repositories below.
          </p>
        </div>
      )}

      {/* ── NOT CONNECTED ─────────────────────────────────────────────────── */}
      {!isConnected ? (
        <div className="space-y-4">
          {/* Option 1 */}
          <div className="rounded-xl p-6"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)" }}>
                <Github className="w-4 h-4" style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <p className="font-semibold text-sm text-white">Option 1 — Install via GitHub</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Click below to install the app on your GitHub account
                </p>
              </div>
            </div>
            <a href={installUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)" }}>
              <Github className="w-4 h-4" />
              Open GitHub App
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Option 2 */}
          <div className="rounded-xl p-6"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)" }}>
                <KeyRound className="w-4 h-4" style={{ color: "#60a5fa" }} />
              </div>
              <div>
                <p className="font-semibold text-sm text-white">Option 2 — Enter Installation ID manually</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Already installed?{" "}
                  <a href="https://github.com/settings/installations" target="_blank" rel="noopener noreferrer"
                    className="underline" style={{ color: "#60a5fa" }}>
                    github.com/settings/installations
                  </a>
                  {" "}→ Configure → copy the number from the URL
                </p>
              </div>
            </div>
            <form onSubmit={handleManualConnect} className="flex items-center gap-3">
              <input
                type="number"
                value={installationIdInput}
                onChange={(e) => setInstallationIdInput(e.target.value)}
                placeholder="e.g. 12345678"
                className="flex-1 text-sm px-3 py-2.5 rounded-lg outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "white",
                }}
              />
              <button type="submit" disabled={saveInstallation.isPending || !installationIdInput}
                className="text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                style={{ background: "#7c3aed" }}>
                {saveInstallation.isPending ? "Connecting..." : "Connect"}
              </button>
            </form>
            {manualError && <p className="text-xs mt-2" style={{ color: "#f43f5e" }}>{manualError}</p>}
          </div>
        </div>

      ) : (
        /* ── CONNECTED ─────────────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Connected badge */}
          <div className="flex items-center gap-3 rounded-xl p-4"
            style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.18)" }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#34d399" }} />
            <span className="text-sm text-white/80">
              Connected as{" "}
              <strong className="text-white">{workspace.githubInstallation.accountLogin}</strong>{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>
                ({workspace.githubInstallation.accountType})
              </span>
            </span>
            <a href={installUrl} target="_blank" rel="noopener noreferrer"
              className="ml-auto text-xs flex items-center gap-1" style={{ color: "#a78bfa" }}>
              Manage <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Connected repos */}
          <div>
            <h2 className="font-semibold text-sm text-white mb-3">Connected Repositories</h2>
            {!repos || repos.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm"
                style={{ border: "1px dashed rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}>
                No repositories connected yet. Add one below.
              </div>
            ) : (
              <div className="space-y-2">
                {repos.map((repo) => (
                  <div key={repo.id} className="flex items-center justify-between rounded-xl p-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-3">
                      <GitBranch className="w-4 h-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                      <div>
                        <div className="font-medium text-sm text-white">{repo.fullName}</div>
                        <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {repo.defaultBranch} · {repo.private ? "Private" : "Public"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={repo.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: "rgba(255,255,255,0.3)" }}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <Link href={`/w/${slug}/github/${repo.id}/pulls`}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                        style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                        <GitPullRequest className="w-3 h-3" />
                        Pull Requests
                      </Link>
                      <button onClick={() => disconnect.mutate({ repositoryId: repo.id })}
                        disabled={disconnect.isPending} title="Disconnect"
                        style={{ color: "rgba(255,255,255,0.25)" }}>
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available repos from GitHub API */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-white">
                Available Repositories
                {!availableLoading && !availableError && available && (
                  <span className="ml-2 text-xs font-normal" style={{ color: "rgba(255,255,255,0.35)" }}>
                    ({unconnectedAvailable.length} to connect)
                  </span>
                )}
              </h2>
              <button onClick={() => refetchAvailable()}
                style={{ color: "rgba(255,255,255,0.3)" }} title="Refresh">
                <RefreshCw className={"w-3.5 h-3.5 " + (availableLoading ? "animate-spin" : "")} />
              </button>
            </div>

            {/* Loading */}
            {availableLoading && (
              <div className="rounded-xl p-8 flex items-center justify-center gap-3"
                style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#a78bfa" }} />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Fetching repositories from GitHub...
                </span>
              </div>
            )}

            {/* Error */}
            {availableError && (
              <div className="rounded-xl p-5 space-y-3"
                style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.2)" }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#fb7185" }} />
                  <div>
                    <p className="text-sm font-medium text-white">Could not fetch repositories from GitHub</p>
                    <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {availableErrorObj?.message ?? "GitHub API error"}
                    </p>
                    <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Common causes: missing or incorrect{" "}
                      <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>
                        GITHUB_APP_PRIVATE_KEY
                      </code>{" "}
                      — make sure the key is single-line with{" "}
                      <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>
                        \n
                      </code>{" "}
                      for newlines, or use the manual form below.
                    </p>
                  </div>
                </div>
                <button onClick={() => refetchAvailable()}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ border: "1px solid rgba(244,63,94,0.3)", color: "#fb7185" }}>
                  Try again
                </button>
              </div>
            )}

            {/* Empty — API worked but no repos accessible */}
            {!availableLoading && !availableError && available && unconnectedAvailable.length === 0 && repos && repos.length === 0 && (
              <div className="rounded-xl p-6 text-center"
                style={{ border: "1px dashed rgba(255,255,255,0.08)" }}>
                <p className="text-sm text-white/60 mb-1">No repositories accessible</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Make sure the GitHub App has access to your repositories.{" "}
                  <a href={installUrl} target="_blank" rel="noopener noreferrer"
                    className="underline" style={{ color: "#60a5fa" }}>
                    Configure access on GitHub →
                  </a>
                </p>
              </div>
            )}

            {/* Repo list */}
            {!availableLoading && !availableError && unconnectedAvailable.length > 0 && (
              <div className="space-y-2">
                {unconnectedAvailable.map((repo) => (
                  <div key={repo.githubRepoId}
                    className="flex items-center justify-between rounded-xl p-4"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-3">
                      <GitBranch className="w-4 h-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                      <div>
                        <div className="font-medium text-sm text-white">{repo.fullName}</div>
                        <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {repo.defaultBranch} · {repo.private ? "Private" : "Public"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => workspace?.id && connect.mutate({ workspaceId: workspace.id, ...repo })}
                      disabled={connect.isPending}
                      className="flex items-center gap-1.5 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)" }}>
                      <LinkIcon className="w-3 h-3" />
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual repo entry — always visible when connected */}
          <div className="rounded-xl p-5"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4" style={{ color: "#a78bfa" }} />
              <p className="text-sm font-semibold text-white">Add repository manually</p>
            </div>
            <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              If your repository doesn't appear above, enter it directly as{" "}
              <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>owner/repo-name</code>
            </p>
            <form onSubmit={handleManualRepo} className="flex items-center gap-3">
              <input
                type="text"
                value={manualRepoInput}
                onChange={(e) => setManualRepoInput(e.target.value)}
                placeholder="e.g. myorg/my-project"
                className="flex-1 text-sm px-3 py-2.5 rounded-lg outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "white",
                }}
              />
              <button type="submit"
                disabled={connectByName.isPending || !manualRepoInput.trim()}
                className="text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                style={{ background: "#7c3aed" }}>
                {connectByName.isPending ? "Adding..." : "Add Repo"}
              </button>
            </form>
            {manualRepoError && (
              <p className="text-xs mt-2" style={{ color: "#f43f5e" }}>{manualRepoError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
