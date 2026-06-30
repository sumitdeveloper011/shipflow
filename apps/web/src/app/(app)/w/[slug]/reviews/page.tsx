"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  GitPullRequest, CheckCircle2, XCircle, AlertCircle, Loader2, ExternalLink, Bot
} from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

const VERDICT_CONFIG = {
  APPROVED: {
    icon: CheckCircle2,
    color: "text-green-600",
    badge: "bg-green-100 text-green-800",
    label: "Approved",
  },
  NEEDS_CHANGES: {
    icon: AlertCircle,
    color: "text-amber-600",
    badge: "bg-amber-100 text-amber-800",
    label: "Needs Changes",
  },
  BLOCKED: {
    icon: XCircle,
    color: "text-red-600",
    badge: "bg-red-100 text-red-800",
    label: "Blocked",
  },
};

export default function ReviewsPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug });
  const { data: reviews } = trpc.review.listByWorkspace.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">AI Reviews</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Code review history across all projects
        </p>
      </div>

      {!reviews ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading reviews...
        </div>
      ) : reviews.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-16 text-center">
          <GitPullRequest className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-1">No reviews yet</h3>
          <p className="text-muted-foreground text-sm">
            Connect a GitHub repository and open a pull request to trigger AI reviews.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const cfg = VERDICT_CONFIG[review.verdict as keyof typeof VERDICT_CONFIG] ?? {
              icon: Bot,
              color: "text-muted-foreground",
              badge: "bg-secondary text-secondary-foreground",
              label: review.verdict,
            };
            const VerdictIcon = cfg.icon;

            return (
              <div
                key={review.id}
                className="border border-border rounded-xl p-5 bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <VerdictIcon className={"w-4 h-4 mt-0.5 shrink-0 " + cfg.color} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        PR #{review.pullRequest.number}: {review.pullRequest.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {review.pullRequest.repository.name} · {formatRelativeDate(review.createdAt)}
                      </div>

                      {review.summary && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {review.summary}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        {review.blockingIssues > 0 && (
                          <span className="text-xs text-red-600 font-medium">
                            {review.blockingIssues} blocking
                          </span>
                        )}
                        {review.nonBlockingIssues > 0 && (
                          <span className="text-xs text-amber-600 font-medium">
                            {review.nonBlockingIssues} warnings
                          </span>
                        )}
                        {review.resolvedIssues > 0 && (
                          <span className="text-xs text-green-600 font-medium">
                            {review.resolvedIssues} resolved
                          </span>
                        )}
                        {review.blockingIssues === 0 && review.nonBlockingIssues === 0 && (
                          <span className="text-xs text-green-600 font-medium">
                            No open issues
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {review.requirementsCoverage}% requirements covered
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={"text-xs px-2.5 py-1 rounded-full font-medium " + cfg.badge}>
                      {cfg.label}
                    </span>
                    {review.pullRequest.htmlUrl && (
                      <a
                        href={review.pullRequest.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <Link
                      href={"/w/" + slug + "/reviews/" + review.id}
                      className="text-xs border border-input rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
