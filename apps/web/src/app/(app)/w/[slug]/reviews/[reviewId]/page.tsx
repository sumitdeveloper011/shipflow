"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Bot, CheckCircle2, XCircle, AlertCircle, Shield, Zap, Code2, Target, GitPullRequest } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, any> = {
  REQUIREMENTS: Target,
  SECURITY: Shield,
  PERFORMANCE: Zap,
  CODE_QUALITY: Code2,
  EDGE_CASE: AlertCircle,
  ACCEPTANCE_CRITERIA: CheckCircle2,
};

const CATEGORY_COLORS: Record<string, string> = {
  REQUIREMENTS: "text-purple-600 bg-purple-50",
  SECURITY: "text-red-600 bg-red-50",
  PERFORMANCE: "text-orange-600 bg-orange-50",
  CODE_QUALITY: "text-blue-600 bg-blue-50",
  EDGE_CASE: "text-amber-600 bg-amber-50",
  ACCEPTANCE_CRITERIA: "text-green-600 bg-green-50",
};

export default function ReviewDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const reviewId = params.reviewId as string;

  const { data: review, refetch } = trpc.review.getById.useQuery({ reviewId });
  const resolveIssue = trpc.review.resolveIssue.useMutation({ onSuccess: () => refetch() });

  if (!review) return <div className="p-8 text-muted-foreground">Loading review...</div>;

  const blocking = review.issues.filter(i => i.severity === "BLOCKING" && !i.resolved);
  const nonBlocking = review.issues.filter(i => i.severity === "NON_BLOCKING" && !i.resolved);
  const resolved = review.issues.filter(i => i.resolved);

  const verdictConfig = {
    APPROVED: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 border-green-200", label: "Approved" },
    NEEDS_CHANGES: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Needs Changes" },
    BLOCKED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Blocked" },
  }[review.verdict] || { icon: Bot, color: "text-muted-foreground", bg: "bg-secondary", label: review.verdict };

  const VerdictIcon = verdictConfig.icon;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href={`/w/${slug}/reviews`} className="hover:text-foreground">Reviews</Link>
        <span>/</span>
        <span className="text-foreground">Review #{reviewId.slice(-8)}</span>
      </div>

      {/* Header */}
      <div className={`border rounded-xl p-5 mb-6 ${verdictConfig.bg}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className={`flex items-center gap-2 mb-2 ${verdictConfig.color}`}>
              <VerdictIcon className="w-5 h-5" />
              <span className="font-bold text-lg">{verdictConfig.label}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{review.summary}</p>
          </div>
          <div className="text-right shrink-0 ml-6">
            <div className="text-3xl font-bold">{review.requirementsCoverage}%</div>
            <div className="text-xs text-muted-foreground">requirements covered</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          <a href={review.pullRequest.htmlUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground w-fit">
            <GitPullRequest className="w-3.5 h-3.5" />
            PR #{review.pullRequest.number}: {review.pullRequest.title}
          </a>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Reviewed {formatRelativeDate(review.createdAt)}
        </div>
      </div>

      {/* Coverage bar */}
      <div className="border border-border rounded-xl p-4 bg-card mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Requirements Coverage</span>
          <span className="text-sm font-bold">{review.requirementsCoverage}%</span>
        </div>
        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${review.requirementsCoverage >= 80 ? "bg-green-500" : review.requirementsCoverage >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${review.requirementsCoverage}%` }}
          />
        </div>
      </div>

      {/* Blocking issues */}
      {blocking.length > 0 && (
        <IssueSection
          title={`🚫 Blocking Issues (${blocking.length})`}
          issues={blocking}
          onResolve={(id) => resolveIssue.mutate({ issueId: id })}
        />
      )}

      {/* Non-blocking issues */}
      {nonBlocking.length > 0 && (
        <IssueSection
          title={`⚠️ Non-Blocking Issues (${nonBlocking.length})`}
          issues={nonBlocking}
          onResolve={(id) => resolveIssue.mutate({ issueId: id })}
        />
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-sm text-muted-foreground mb-3">✅ Resolved Issues ({resolved.length})</h3>
          <div className="space-y-2 opacity-60">
            {resolved.map(issue => (
              <div key={issue.id} className="border border-border rounded-lg p-3 bg-card line-through text-muted-foreground text-sm">
                {issue.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {review.issues.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-500" />
          <p>No issues found. Code looks good!</p>
        </div>
      )}
    </div>
  );
}

function IssueSection({ title, issues, onResolve }: {
  title: string;
  issues: any[];
  onResolve: (id: string) => void;
}) {
  return (
    <div className="mb-6">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-3">
        {issues.map((issue) => {
          const CategoryIcon = CATEGORY_ICONS[issue.category] || AlertCircle;
          const categoryStyle = CATEGORY_COLORS[issue.category] || "text-muted-foreground bg-secondary";
          return (
            <div key={issue.id} className="border border-border rounded-xl p-4 bg-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${categoryStyle}`}>
                      <CategoryIcon className="w-3 h-3" />
                      {issue.category.replace(/_/g, " ")}
                    </span>
                    {issue.filePath && (
                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        {issue.filePath}{issue.lineNumber ? `:${issue.lineNumber}` : ""}
                      </span>
                    )}
                  </div>
                  <h4 className="font-medium text-sm mb-1">{issue.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{issue.description}</p>
                  {issue.suggestion && (
                    <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="text-xs font-medium text-primary mb-1">💡 Suggestion</div>
                      <p className="text-sm text-muted-foreground">{issue.suggestion}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onResolve(issue.id)}
                  className="shrink-0 text-xs border border-input rounded-lg px-2.5 py-1.5 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-colors"
                >
                  Resolve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
