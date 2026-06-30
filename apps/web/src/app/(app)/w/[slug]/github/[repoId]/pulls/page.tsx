"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { GitPullRequest, Bot, ExternalLink, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

const VERDICT_COLORS: Record<string, string> = {
  APPROVED: "text-green-600",
  NEEDS_CHANGES: "text-amber-600",
  BLOCKED: "text-red-600",
};

const VERDICT_ICONS: Record<string, typeof CheckCircle2> = {
  APPROVED: CheckCircle2,
  NEEDS_CHANGES: AlertCircle,
  BLOCKED: XCircle,
};

export default function PullRequestsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const repoId = params.repoId as string;

  const { data: prs, refetch } = trpc.repository.getPullRequests.useQuery({ repositoryId: repoId });
  const triggerReview = trpc.review.triggerReview.useMutation({ onSuccess: () => setTimeout(refetch, 2000) });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href={`/w/${slug}/github`} className="hover:text-foreground">GitHub</Link>
        <span>/</span>
        <span className="text-foreground">Pull Requests</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pull Requests</h1>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {!prs?.length ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center">
          <GitPullRequest className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No pull requests yet. They appear automatically via webhooks.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prs.map((pr) => {
            const latestReview = pr.reviews?.[0];
            const VerdictIcon = latestReview ? VERDICT_ICONS[latestReview.verdict] : null;

            return (
              <div key={pr.id} className="border border-border rounded-xl p-5 bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <GitPullRequest className={`w-4 h-4 shrink-0 ${pr.state === "OPEN" ? "text-green-500" : pr.state === "MERGED" ? "text-purple-500" : "text-red-500"}`} />
                      <span className="font-medium text-sm">{pr.title}</span>
                      <span className="text-xs text-muted-foreground">#{pr.number}</span>
                    </div>
                    <div className="text-xs text-muted-foreground ml-6">
                      {pr.headBranch} → {pr.baseBranch} · by {pr.authorLogin} · {formatRelativeDate(pr.updatedAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {latestReview && VerdictIcon && (
                      <div className={`flex items-center gap-1 text-xs font-medium ${VERDICT_COLORS[latestReview.verdict]}`}>
                        <VerdictIcon className="w-3.5 h-3.5" />
                        {latestReview.verdict.replace(/_/g, " ")}
                        <span className="text-muted-foreground font-normal">({latestReview.requirementsCoverage}%)</span>
                      </div>
                    )}
                    <a
                      href={pr.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Review summary */}
                {latestReview?.summary && (
                  <div className="mt-3 p-3 bg-secondary/50 rounded-lg text-xs text-muted-foreground ml-6">
                    {latestReview.summary}
                  </div>
                )}

                {/* Issues breakdown */}
                {latestReview?.issues?.length > 0 && (
                  <div className="mt-3 ml-6 flex items-center gap-3 text-xs">
                    <span className="text-red-600">{latestReview.issues.filter((i: any) => i.severity === "BLOCKING").length} blocking</span>
                    <span className="text-amber-600">{latestReview.issues.filter((i: any) => i.severity === "NON_BLOCKING").length} non-blocking</span>
                  </div>
                )}

                <div className="mt-4 ml-6 flex items-center gap-2">
                  <button
                    onClick={() => triggerReview.mutate({ pullRequestId: pr.id })}
                    disabled={triggerReview.isPending}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Bot className="w-3 h-3" />
                    {latestReview ? "Re-review" : "Run AI Review"}
                  </button>
                  {latestReview && (
                    <Link
                      href={`/w/${slug}/reviews/${latestReview.id}`}
                      className="text-xs border border-input rounded-lg px-3 py-1.5 hover:bg-accent transition-colors"
                    >
                      View review
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
