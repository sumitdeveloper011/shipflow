"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, GitPullRequest, Settings,
  CreditCard, LogOut, ChevronDown, Plus, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

// ── Logo ──────────────────────────────────────────────────────────────────
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sidebarLogoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="0.5" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" stroke="url(#sidebarLogoGrad)" strokeWidth="2" fill="none" />
      <path d="M13 20L20 13L27 20L20 27Z" fill="url(#sidebarLogoGrad)" opacity="0.25" />
      <path d="M17 20L22 15V18H27V22H22V25L17 20Z" fill="url(#sidebarLogoGrad)" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/projects", icon: FolderOpen, label: "Projects" },
  { href: "/github", icon: GitPullRequest, label: "Repositories" },
  { href: "/reviews", icon: Zap, label: "AI Reviews" },
  { href: "/billing", icon: CreditCard, label: "Billing" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

type User = { id: string; name: string; email: string; image?: string | null };

export function AppSidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const { data: workspaces } = trpc.workspace.list.useQuery();
  const [wsOpen, setWsOpen] = useState(false);

  const currentSlug = pathname.split("/")[2] || workspaces?.[0]?.slug || "";
  const currentWs = workspaces?.find((w) => w.slug === currentSlug);

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="w-[220px] flex flex-col shrink-0 relative"
      style={{
        background: "hsl(240 22% 6%)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Brand */}
      <div className="h-14 flex items-center px-4 gap-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Logo size={26} />
        <span className="font-bold text-sm tracking-tight text-white">ShipFlow</span>
        <div
          className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}
        >
          BETA
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button
          onClick={() => setWsOpen(!wsOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: wsOpen ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.8)",
          }}
        >
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)", color: "white" }}
          >
            {currentWs?.name[0]?.toUpperCase() || "W"}
          </div>
          <span className="truncate flex-1 text-left text-xs">{currentWs?.name || "Select workspace"}</span>
          <ChevronDown
            className="w-3.5 h-3.5 shrink-0 transition-transform"
            style={{
              color: "rgba(255,255,255,0.35)",
              transform: wsOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>

        {wsOpen && (
          <div className="mt-1.5 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "hsl(240 22% 8%)" }}>
            {workspaces?.map((ws) => (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}`}
                onClick={() => setWsOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                style={{ color: ws.slug === currentSlug ? "#a78bfa" : "rgba(255,255,255,0.5)" }}
              >
                <div
                  className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ background: "rgba(124,58,237,0.3)" }}
                >
                  {ws.name[0]?.toUpperCase()}
                </div>
                <span className="truncate">{ws.name}</span>
              </Link>
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <Link
                href="/onboarding"
                onClick={() => setWsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                <Plus className="w-3.5 h-3.5" />
                New workspace
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-0.5">
        {currentSlug ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider px-3 py-2" style={{ color: "rgba(255,255,255,0.2)" }}>
              Workspace
            </p>
            {NAV_ITEMS.map((item) => {
              const href = item.href === "/dashboard"
                ? `/w/${currentSlug}`
                : `/w/${currentSlug}${item.href}`;
              const isActive = item.href === "/dashboard"
                ? pathname === href
                : pathname === href || pathname.startsWith(href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: isActive ? "rgba(124,58,237,0.18)" : "transparent",
                    color: isActive ? "#c4b5fd" : "rgba(255,255,255,0.45)",
                    borderLeft: isActive ? "2px solid #7c3aed" : "2px solid transparent",
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {item.label}
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "#7c3aed" }} />
                  )}
                </Link>
              );
            })}
          </>
        ) : (
          <div className="px-3 py-2 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Create or select a workspace
          </div>
        )}
      </nav>

      {/* User */}
      <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
          {user.image ? (
            <img src={user.image} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)", color: "white" }}
            >
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-white/80">{user.name}</p>
            <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{user.email}</p>
          </div>
          <button
            onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
            className="transition-colors p-1 rounded"
            title="Sign out"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
