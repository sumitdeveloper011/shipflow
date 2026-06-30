import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import Razorpay from "razorpay";

// Lazy-initialize Razorpay only when env vars are present
function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Razorpay not configured" });
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

const PLANS = {
  PRO: {
    amount: 199900,
    currency: "INR",
    aiCreditsLimit: 100,
    repoLimit: 10,
  },
  ENTERPRISE: {
    amount: 999900,
    currency: "INR",
    aiCreditsLimit: 1000,
    repoLimit: 999,
  },
} as const;

export const billingRouter = router({
  get: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx, input.workspaceId);
      return ctx.db.billing.findUnique({ where: { workspaceId: input.workspaceId } });
    }),

  createOrder: protectedProcedure
    .input(z.object({ workspaceId: z.string(), plan: z.enum(["PRO", "ENTERPRISE"]) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.workspaceId);
      const razorpay = getRazorpay();
      const planConfig = PLANS[input.plan];

      const order = await razorpay.orders.create({
        amount: planConfig.amount,
        currency: planConfig.currency,
        notes: { workspaceId: input.workspaceId, plan: input.plan },
      });

      return { orderId: order.id, amount: planConfig.amount, currency: planConfig.currency };
    }),

  verifyPayment: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        plan: z.enum(["PRO", "ENTERPRISE"]),
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.workspaceId);

      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Razorpay not configured" });

      // Verify HMAC-SHA256 signature
      const crypto = await import("crypto");
      const expectedSig = crypto
        .createHmac("sha256", keySecret)
        .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
        .digest("hex");

      if (expectedSig !== input.razorpaySignature) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid payment signature" });
      }

      const planConfig = PLANS[input.plan];
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await ctx.db.billing.update({
        where: { workspaceId: input.workspaceId },
        data: {
          plan: input.plan,
          // Store payment ID separately from customer ID
          razorpaySubId: input.razorpayPaymentId,
          status: "ACTIVE",
          aiCreditsLimit: planConfig.aiCreditsLimit,
          repoLimit: planConfig.repoLimit,
          currentPeriodEnd: periodEnd,
        },
      });

      await ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: { plan: input.plan },
      });

      return { ok: true };
    }),

  resetCredits: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.workspaceId);
      return ctx.db.billing.update({
        where: { workspaceId: input.workspaceId },
        data: { aiCreditsUsed: 0 },
      });
    }),
});

async function assertMember(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m) throw new TRPCError({ code: "FORBIDDEN" });
}

async function assertOwner(ctx: any, workspaceId: string) {
  const m = await ctx.db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ctx.session.user.id } },
  });
  if (!m || m.role !== "OWNER") throw new TRPCError({ code: "FORBIDDEN" });
}
