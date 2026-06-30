"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { CreditCard, Zap, CheckCircle2, AlertCircle, Loader2, Database, Bot } from "lucide-react";

const PLANS = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    aiCredits: 10,
    repos: 1,
    features: [
      "3 projects",
      "10 AI review credits / month",
      "1 repository",
      "Basic workflow",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    price: 1999,
    aiCredits: 100,
    repos: 10,
    features: [
      "Unlimited projects",
      "100 AI review credits / month",
      "10 repositories",
      "Full ShipFlow workflow",
      "Priority support",
    ],
    highlighted: true,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: 9999,
    aiCredits: 1000,
    repos: 999,
    features: [
      "Unlimited projects",
      "1,000 AI review credits / month",
      "Unlimited repositories",
      "Full ShipFlow workflow",
      "Dedicated support",
      "SSO & audit logs",
    ],
  },
] satisfies Array<{
  id: string;
  name: string;
  price: number;
  aiCredits: number;
  repos: number;
  features: readonly string[];
  highlighted?: boolean;
}>;

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: workspace } = trpc.workspace.getBySlug.useQuery({ slug });
  const { data: billing, refetch } = trpc.billing.get.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );

  const createOrder = trpc.billing.createOrder.useMutation();
  const verifyPayment = trpc.billing.verifyPayment.useMutation({
    onSuccess: () => refetch(),
  });

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const handleUpgrade = async (plan: "PRO" | "ENTERPRISE") => {
    if (!workspace?.id) return;

    const loaded = await loadRazorpayScript();
    if (!loaded) return alert("Could not load Razorpay. Please check your connection.");

    const order = await createOrder.mutateAsync({ workspaceId: workspace.id, plan });

    const rzp = new window.Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "ShipFlow",
      description: plan + " Plan",
      theme: { color: "#6366f1" },
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        verifyPayment.mutate({
          workspaceId: workspace.id,
          plan,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
    });
    rzp.open();
  };

  if (!billing) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading billing...
      </div>
    );
  }

  const currentPlan = PLANS.find((p) => p.id === billing.plan) ?? PLANS[0];
  const aiPct = Math.min(Math.round((billing.aiCreditsUsed / billing.aiCreditsLimit) * 100), 100);
  const repoCount = workspace?._count?.repositories ?? 0;
  const repoPct = Math.min(Math.round((repoCount / billing.repoLimit) * 100), 100);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing & Plans</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your subscription and usage limits</p>
      </div>

      {/* Current usage */}
      <div className="border border-border rounded-xl p-6 bg-card mb-8 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Current Plan</h2>
          <span className={"text-xs px-2.5 py-1 rounded-full font-medium " + (
            billing.plan === "ENTERPRISE" ? "bg-purple-100 text-purple-800" :
            billing.plan === "PRO" ? "bg-amber-100 text-amber-800" :
            "bg-secondary text-secondary-foreground"
          )}>
            {billing.plan}
            {billing.plan !== "FREE" && <Zap className="w-3 h-3 inline ml-1" />}
          </span>
        </div>

        {billing.currentPeriodEnd && (
          <p className="text-sm text-muted-foreground">
            Renews {new Date(billing.currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}

        {/* AI Credits */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              <Bot className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">AI Review Credits</span>
            </div>
            <span className="text-sm font-medium">{billing.aiCreditsUsed} / {billing.aiCreditsLimit}</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={"h-full rounded-full transition-all " + (aiPct >= 90 ? "bg-red-500" : aiPct >= 70 ? "bg-amber-500" : "bg-primary")}
              style={{ width: aiPct + "%" }}
            />
          </div>
          {aiPct >= 90 && (
            <p className="text-xs text-red-600 flex items-center gap-1 mt-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Running low — upgrade to get more credits
            </p>
          )}
        </div>

        {/* Repositories */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Repositories</span>
            </div>
            <span className="text-sm font-medium">
              {repoCount} / {billing.repoLimit === 999 ? "∞" : billing.repoLimit}
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={"h-full rounded-full transition-all " + (repoPct >= 90 ? "bg-red-500" : repoPct >= 70 ? "bg-amber-500" : "bg-primary")}
              style={{ width: repoPct + "%" }}
            />
          </div>
          {repoPct >= 90 && billing.repoLimit !== 999 && (
            <p className="text-xs text-red-600 flex items-center gap-1 mt-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Repo limit almost reached — upgrade for more
            </p>
          )}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {PLANS.map((plan) => {
          const isCurrentPlan = billing.plan === plan.id;
          const isDowngrade = PLANS.findIndex((p) => p.id === billing.plan) > PLANS.findIndex((p) => p.id === plan.id);
          const canUpgrade = !isCurrentPlan && !isDowngrade && plan.id !== "FREE";

          return (
            <div
              key={plan.id}
              className={"border rounded-xl p-5 bg-card flex flex-col transition-colors " + (
                plan.highlighted && !isCurrentPlan ? "border-primary shadow-sm" :
                isCurrentPlan ? "border-green-400" :
                "border-border"
              )}
            >
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {isCurrentPlan && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                  )}
                </div>
                <div className="text-2xl font-bold">
                  {plan.price === 0 ? "Free" : "₹" + plan.price.toLocaleString("en-IN") + "/mo"}
                </div>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>

              {canUpgrade && (
                <button
                  onClick={() => handleUpgrade(plan.id as "PRO" | "ENTERPRISE")}
                  disabled={createOrder.isPending || verifyPayment.isPending}
                  className={"w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 " + (
                    plan.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-primary text-primary hover:bg-primary/5"
                  )}
                >
                  <CreditCard className="w-4 h-4" />
                  {createOrder.isPending || verifyPayment.isPending ? "Processing..." : "Upgrade to " + plan.name}
                </button>
              )}
              {isDowngrade && !isCurrentPlan && (
                <p className="text-xs text-center text-muted-foreground">Contact support to downgrade</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Secure Payments</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Payments processed securely via Razorpay. Card details are never stored on our servers.
          All prices include GST where applicable.
        </p>
      </div>
    </div>
  );
}
