"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight, GitPullRequest, Layers, Shield, Zap,
  CheckCircle2, Code2, Bot, Rocket, Star, ChevronRight,
  Github, Play, Sparkles, Lock, RefreshCw, Users,
} from "lucide-react";

// ── Logo SVG (NexaFlow brand) ──────────────────────────────────────────────
function NexaLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="0.5" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      {/* Hexagon outer */}
      <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" stroke="url(#logoGrad)" strokeWidth="2" fill="none" />
      {/* Inner arrow / flow symbol */}
      <path d="M13 20L20 13L27 20L20 27Z" fill="url(#logoGrad)" opacity="0.3" />
      <path d="M17 20L22 15V18H27V22H22V25L17 20Z" fill="url(#logoGrad)" />
    </svg>
  );
}

// ── Typewriter hook ────────────────────────────────────────────────────────
function useTypewriter(words: string[], speed = 80, pause = 2000) {
  const [displayed, setDisplayed] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx] ?? "";
    const delay = deleting ? speed / 2 : charIdx === word.length ? pause : speed;
    const timer = setTimeout(() => {
      if (!deleting && charIdx < word.length) {
        setDisplayed(word.slice(0, charIdx + 1));
        setCharIdx((c) => c + 1);
      } else if (!deleting && charIdx === word.length) {
        setDeleting(true);
      } else if (deleting && charIdx > 0) {
        setDisplayed(word.slice(0, charIdx - 1));
        setCharIdx((c) => c - 1);
      } else {
        setDeleting(false);
        setWordIdx((i) => (i + 1) % words.length);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [charIdx, deleting, wordIdx, words, speed, pause]);

  return displayed;
}

// ── Pipeline animation ─────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { label: "Feature Request", color: "#7c3aed", icon: "💡" },
  { label: "AI Clarification", color: "#6366f1", icon: "🤖" },
  { label: "PRD Generated", color: "#60a5fa", icon: "📋" },
  { label: "Tasks Created", color: "#34d399", icon: "✅" },
  { label: "Code Reviewed", color: "#f59e0b", icon: "🔍" },
  { label: "Shipped 🚀", color: "#f43f5e", icon: "🚢" },
];

function PipelineAnimation() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((i) => (i + 1) % PIPELINE_STEPS.length), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full overflow-hidden py-6">
      {/* Connecting line */}
      <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -translate-y-1/2" />
      {/* Beam */}
      <div
        className="absolute top-1/2 h-px -translate-y-1/2 w-16 bg-gradient-to-r from-transparent via-violet-400 to-transparent"
        style={{
          left: `${(active / (PIPELINE_STEPS.length - 1)) * 100}%`,
          transform: "translateX(-50%) translateY(-50%)",
          transition: "left 1.2s cubic-bezier(0.4,0,0.2,1)",
          filter: "blur(1px)",
        }}
      />
      <div className="flex justify-between items-center px-2 relative">
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.label} className="flex flex-col items-center gap-1.5 flex-1">
            <div
              className="relative w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-500"
              style={{
                background: i <= active
                  ? `radial-gradient(circle, ${step.color}33, ${step.color}11)`
                  : "rgba(255,255,255,0.03)",
                border: `1.5px solid ${i <= active ? step.color : "rgba(255,255,255,0.1)"}`,
                boxShadow: i === active ? `0 0 20px ${step.color}66` : "none",
                transform: i === active ? "scale(1.15)" : "scale(1)",
              }}
            >
              <span className="text-base leading-none">{step.icon}</span>
            </div>
            <span
              className="text-xs font-medium transition-all duration-300 text-center leading-tight"
              style={{
                color: i === active ? step.color : "rgba(255,255,255,0.3)",
                maxWidth: "64px",
              }}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Floating orbs background ───────────────────────────────────────────────
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.07] animate-float"
        style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full opacity-[0.06] animate-float-delay"
        style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute top-2/3 left-1/2 w-64 h-64 rounded-full opacity-[0.05] animate-float-slow"
        style={{ background: "radial-gradient(circle, #34d399 0%, transparent 70%)", filter: "blur(40px)" }} />
      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

// ── Features ───────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Bot,
    color: "#7c3aed",
    title: "AI Requirement Clarification",
    description: "Submit any feature idea — even a rough one. The AI agent probes for missing context: who are the users, what pain does it solve, what counts as success.",
  },
  {
    icon: Layers,
    color: "#6366f1",
    title: "Auto-Generated PRDs",
    description: "From your conversation, ShipFlow produces a structured PRD with problem statement, user stories, acceptance criteria, edge cases, and measurable success metrics.",
  },
  {
    icon: CheckCircle2,
    color: "#60a5fa",
    title: "Smart Task Breakdown",
    description: "PRDs are decomposed into tech-stack-aware engineering tasks with priority, complexity estimates, and dependencies — auto-populated to a Kanban board.",
  },
  {
    icon: Github,
    color: "#34d399",
    title: "Live GitHub Integration",
    description: "Connect repositories via GitHub App. Webhooks track every PR in real time — no polling, no hardcoded data. Diffs are fetched and analyzed automatically.",
  },
  {
    icon: Shield,
    color: "#f59e0b",
    title: "AI Code Review vs PRD",
    description: "Every PR is reviewed against PRD requirements, acceptance criteria, security concerns, performance, edge cases, and code quality. Issues are BLOCKING or NON-BLOCKING.",
  },
  {
    icon: RefreshCw,
    color: "#f43f5e",
    title: "Fix Loop & Re-Review",
    description: "Failing reviews send the feature back to FIX_NEEDED. When developers push updates, the AI automatically re-reviews. The loop runs until it's production-ready.",
  },
  {
    icon: Users,
    color: "#7c3aed",
    title: "Human Approval Gate",
    description: "Humans stay in control. Reviewers see PRD, tasks, PR diff, AI review history, and outstanding issues before approving. Only approved features can ship.",
  },
  {
    icon: Rocket,
    color: "#60a5fa",
    title: "Async Workflow Engine",
    description: "Powered by Inngest — all long-running AI jobs run async with step-level progress visible inside the app. No timeouts, no black boxes.",
  },
];

const WORKFLOW = [
  { n: "01", label: "Feature Request", desc: "Customer or PM submits a request via any channel", icon: "💡" },
  { n: "02", label: "AI Clarification", desc: "Agent asks targeted questions to fill requirement gaps", icon: "🤖" },
  { n: "03", label: "PRD Generated", desc: "Structured product document created in seconds", icon: "📋" },
  { n: "04", label: "Plan Approved", desc: "Team reviews and approves the engineering plan", icon: "✅" },
  { n: "05", label: "Dev & PR", desc: "Developers implement and open a pull request", icon: "💻" },
  { n: "06", label: "AI Review", desc: "Code reviewed against every acceptance criterion", icon: "🔍" },
  { n: "07", label: "Fix Loop", desc: "Issues returned, code updated, re-reviewed automatically", icon: "🔄" },
  { n: "08", label: "Human Approval", desc: "Final sign-off with full context visible", icon: "👤" },
  { n: "09", label: "Shipped", desc: "Feature marked delivered and tracked as success", icon: "🚀" },
];

const STATS = [
  { value: "9-step", label: "Automated pipeline" },
  { value: "7×", label: "AI surfaces" },
  { value: "100%", label: "PRD-grounded reviews" },
  { value: "0", label: "Hardcoded PR data" },
];

// ── Main component ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const typed = useTypewriter([
    "Feature Requests",
    "PRDs",
    "Engineering Tasks",
    "Code Reviews",
    "Shipped Features",
  ]);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "hsl(240 25% 5%)" }}
    >
      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "hsl(240 25% 5% / 0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <NexaLogo className="w-8 h-8" />
            <span className="font-bold text-lg tracking-tight">ShipFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#workflow" className="hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)" }}
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-16 pb-24 overflow-hidden">
        <FloatingOrbs />

        <div className="relative z-10 max-w-5xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-10 animate-slide-up"
            style={{
              background: "rgba(124, 58, 237, 0.12)",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              color: "#a78bfa",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI-powered · Feature Request → Shipped
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <span className="block text-white">AI handles your</span>
            <span
              className="block mt-2"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #60a5fa 50%, #34d399 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                minHeight: "1.2em",
              }}
            >
              {typed}
              <span className="animate-blink" style={{ WebkitTextFillColor: "#7c3aed" }}>|</span>
            </span>
          </h1>

          <p
            className="text-xl md:text-2xl max-w-2xl mx-auto mb-12 leading-relaxed animate-slide-up"
            style={{ color: "rgba(255,255,255,0.55)", animationDelay: "0.2s" }}
          >
            ShipFlow automates the entire feature delivery pipeline — from customer request to shipped code — with AI agents that understand your requirements.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <Link
              href="/sign-up"
              className="group flex items-center gap-2.5 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all hover:scale-105 hover:shadow-2xl"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #60a5fa)",
                boxShadow: "0 0 40px rgba(124, 58, 237, 0.4)",
              }}
            >
              Start building for free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#workflow"
              className="flex items-center gap-2.5 font-medium px-8 py-4 rounded-xl text-lg transition-all"
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Play className="w-4 h-4" />
              See how it works
            </a>
          </div>

          {/* Pipeline animation */}
          <div
            className="w-full max-w-3xl mx-auto rounded-2xl p-6 animate-slide-up"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              animationDelay: "0.4s",
            }}
          >
            <p className="text-xs text-white/30 mb-4 uppercase tracking-widest text-center">Live pipeline</p>
            <PipelineAnimation />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/30 animate-bounce">
          <span className="text-xs">Scroll</span>
          <ChevronRight className="w-4 h-4 rotate-90" />
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 border-y" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(124,58,237,0.04)" }}>
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div
                className="text-4xl font-bold mb-1"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #60a5fa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {s.value}
              </div>
              <div className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Workflow ── */}
      <section id="workflow" className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs uppercase tracking-widest font-medium mb-4 block" style={{ color: "#7c3aed" }}>
              The Core Loop
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Feature Request{" "}
              <span style={{ color: "rgba(255,255,255,0.25)" }}>→</span>{" "}
              <span style={{
                background: "linear-gradient(135deg, #7c3aed, #60a5fa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Shipped
              </span>
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              Every feature goes through the same battle-tested 9-step pipeline
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {WORKFLOW.map((step, i) => (
              <div
                key={step.n}
                className="rounded-xl p-5 transition-all hover:scale-[1.02] group cursor-default"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex items-start gap-4">
                  <span
                    className="font-mono text-xs font-bold shrink-0 mt-0.5"
                    style={{ color: "rgba(124,58,237,0.7)" }}
                  >
                    {step.n}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{step.icon}</span>
                      <span className="font-semibold text-white">{step.label}</span>
                    </div>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-28 px-6" style={{ background: "rgba(255,255,255,0.015)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs uppercase tracking-widest font-medium mb-4 block" style={{ color: "#60a5fa" }}>
              Platform Features
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Everything your team needs</h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              From AI-driven discovery to human approval — the full product delivery stack in one platform
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl p-6 transition-all hover:scale-[1.02] group"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: f.color + "20", border: "1px solid " + f.color + "40" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>
                  <h3 className="font-semibold text-white mb-2 text-sm">{f.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Tech Stack callout ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm mb-6 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Built with</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Next.js 14", "tRPC v11", "Prisma", "PostgreSQL", "BetterAuth", "Inngest", "AI SDK", "Octokit", "Razorpay", "Shadcn UI"].map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-lg text-sm font-mono"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-28 px-6" style={{ background: "rgba(255,255,255,0.015)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs uppercase tracking-widest font-medium mb-4 block" style={{ color: "#34d399" }}>
              Pricing
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.5)" }}>Start free. Upgrade when your team grows.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Free",
                price: "₹0",
                period: "/month",
                desc: "For solo builders and side projects",
                features: ["1 repository", "10 AI review credits / mo", "1 workspace", "Community support", "Core pipeline"],
                cta: "Get started free",
                highlight: false,
              },
              {
                name: "Pro",
                price: "₹1,999",
                period: "/month",
                desc: "For growing product teams",
                features: ["10 repositories", "100 AI review credits / mo", "Unlimited workspaces", "Priority support", "Advanced analytics", "Custom webhooks"],
                cta: "Start Pro trial",
                highlight: true,
              },
              {
                name: "Enterprise",
                price: "₹9,999",
                period: "/month",
                desc: "For large engineering organizations",
                features: ["Unlimited repositories", "1000 AI review credits / mo", "SSO & SAML", "Dedicated support", "Custom integrations", "SLA guarantee"],
                cta: "Contact sales",
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-7 transition-all relative"
                style={{
                  background: plan.highlight
                    ? "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(96,165,250,0.08))"
                    : "rgba(255,255,255,0.03)",
                  border: plan.highlight
                    ? "1px solid rgba(124,58,237,0.5)"
                    : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: plan.highlight ? "0 0 60px rgba(124,58,237,0.15)" : "none",
                }}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #60a5fa)", color: "white" }}
                  >
                    Most popular
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-bold text-lg mb-0.5">{plan.name}</h3>
                  <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>{plan.desc}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: plan.highlight ? "#7c3aed" : "#34d399" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up"
                  className="block text-center py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02]"
                  style={{
                    background: plan.highlight ? "linear-gradient(135deg, #7c3aed, #60a5fa)" : "rgba(255,255,255,0.07)",
                    color: "white",
                    border: plan.highlight ? "none" : "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-28 px-6">
        <div
          className="max-w-4xl mx-auto rounded-3xl p-16 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(96,165,250,0.15) 50%, rgba(52,211,153,0.1) 100%)",
            border: "1px solid rgba(124,58,237,0.3)",
          }}
        >
          <FloatingOrbs />
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to ship faster?</h2>
            <p className="text-lg mb-10 max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
              Join teams using ShipFlow to turn feature ideas into shipped code — with AI at every step of the way.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2.5 text-white font-semibold px-10 py-4 rounded-xl text-lg transition-all hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #60a5fa)",
                boxShadow: "0 0 60px rgba(124, 58, 237, 0.5)",
              }}
            >
              Start for free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-10" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
          <div className="flex items-center gap-2.5">
            <NexaLogo className="w-6 h-6 opacity-60" />
            <span className="font-semibold text-white/50">ShipFlow</span>
            <span>© 2025</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
