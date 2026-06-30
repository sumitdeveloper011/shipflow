import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@shipflow/api";
import { db } from "@shipflow/db";
import Link from "next/link";
import { formatRelativeDate, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { FolderOpen, GitPullRequest, Bot, ArrowRight, Plus, Zap, TrendingUp, Circle } from "lucide-react";

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }}
      />
      <p className="text-xs font-medium mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      {sub && <p className="text-xs" style={{ color }}>{sub}</p>}
    </div>
  );
}

export default async function WorkspaceDashboard({ params }: { params: { slug: string } }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const workspace = await db.workspace.findUnique({
    where: { slug: params.slug },
    include: {
      members: true,
      _count: { select: { projects: true, repositories: true } },
      billing: true,
    },
  });

  if (!workspace) notFound();
  const isMember = workspace.members.some((m) => m.userId === session.user.id);
  if (!isMember) notFound();

  const recentFeatures = await db.featureRequest.findMany({
    where: { project: { workspaceId: workspace.id } },
    include: { project: true, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  const [totalFeatures, shippedFeatures, totalReviews, openPRs] = await Promise.all([
    db.featureRequest.count({ where: { project: { workspaceId: workspace.id } } }),
    db.featureRequest.count({ where: { project: { workspaceId: workspace.id }, status: "SHIPPED" } }),
    db.aIReview.count({ where: { pullRequest: { repository: { workspaceId: workspace.id } } } }),
    db.pullRequest.count({ where: { repository: { workspaceId: workspace.id }, state: "OPEN" } }),
  ]);

  const creditPct = workspace.billing
    ? Math.min((workspace.billing.aiCreditsUsed / workspace.billing.aiCreditsLimit) * 100, 100)
    : 0;

  return (
    <div className="min-h-full" style={{ background: "hsl(240 25% 5%)" }}>
      {/* Header */}
      <div
        className="px-8 py-6"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{workspace.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {workspace._count.projects} projects · {workspace._count.repositories} repositories ·{" "}
              <span
                className="font-medium capitalize"
                style={{ color: workspace.billing?.plan === "FREE" ? "rgba(255,255,255,0.5)" : "#7c3aed" }}
              >
                {workspace.billing?.plan.toLowerCase() || "free"} plan
              </span>
            </p>
          </div>
          <Link
            href={`/w/${params.slug}/projects/new`}
            className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all hover:scale-105"
            style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)" }}
          >
            <Plus className="w-4 h-4" />
            New project
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Feature Requests" value={totalFeatures} sub="Total submitted" color="#7c3aed" />
          <StatCard label="Shipped" value={shippedFeatures} sub={totalFeatures > 0 ? `${Math.round((shippedFeatures / totalFeatures) * 100)}% success rate` : "—"} color="#34d399" />
          <StatCard label="AI Reviews" value={totalReviews} sub="Code reviews run" color="#60a5fa" />
          <StatCard label="Open PRs" value={openPRs} sub="Awaiting review" color="#f59e0b" />
        </div>

        {/* Credits bar */}
        {workspace.billing && (
          <div
            className="rounded-xl p-5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: "#7c3aed" }} />
                <span className="text-sm font-medium text-white">AI Review Credits</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{workspace.billing.aiCreditsUsed}</span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>/ {workspace.billing.aiCreditsLimit}</span>
                {workspace.billing.plan === "FREE" && (
                  <Link
                    href={`/w/${params.slug}/billing`}
                    className="ml-2 text-xs font-medium flex items-center gap-1 px-2 py-1 rounded"
                    style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.25)" }}
                  >
                    Upgrade <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${creditPct}%`,
                  background: creditPct > 80
                    ? "linear-gradient(90deg, #f59e0b, #f43f5e)"
                    : "linear-gradient(90deg, #7c3aed, #60a5fa)",
                }}
              />
            </div>
          </div>
        )}

        {/* Quick nav */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Projects", desc: "Manage feature requests", href: `/w/${params.slug}/projects`, icon: FolderOpen, color: "#7c3aed" },
            { label: "Repositories", desc: "GitHub integration & PRs", href: `/w/${params.slug}/github`, icon: GitPullRequest, color: "#60a5fa" },
            { label: "AI Reviews", desc: "Review history & insights", href: `/w/${params.slug}/reviews`, icon: Bot, color: "#34d399" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-xl p-5 flex items-center gap-4 transition-all hover:scale-[1.02] group"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: item.color + "20", border: "1px solid " + item.color + "30" }}
                >
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-white">{item.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{item.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" style={{ color: item.color }} />
              </Link>
            );
          })}
        </div>

        {/* Recent features */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: "#7c3aed" }} />
              <h2 className="font-semibold text-sm text-white">Recent Feature Requests</h2>
            </div>
            <Link
              href={`/w/${params.slug}/projects`}
              className="text-xs flex items-center gap-1 transition-colors"
              style={{ color: "#a78bfa" }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentFeatures.length === 0 ? (
            <div
              className="rounded-xl p-12 text-center"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed rgba(255,255,255,0.08)",
              }}
            >
              <Bot className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.2)" }} />
              <p className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>No feature requests yet</p>
              <Link
                href={`/w/${params.slug}/projects`}
                className="text-xs font-medium"
                style={{ color: "#a78bfa" }}
              >
                Create your first project →
              </Link>
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {recentFeatures.map((fr, i) => (
                <Link
                  key={fr.id}
                  href={`/w/${params.slug}/projects/${fr.projectId}/features/${fr.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-all"
                  style={{
                    borderBottom: i < recentFeatures.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <Circle className="w-1.5 h-1.5 shrink-0" style={{ color: "rgba(124,58,237,0.6)", fill: "rgba(124,58,237,0.6)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-white/85 truncate">{fr.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {fr.project.name} · {fr.createdBy.name} · {formatRelativeDate(fr.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[fr.status] || "bg-secondary text-secondary-foreground"}`}
                  >
                    {STATUS_LABELS[fr.status] || fr.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
