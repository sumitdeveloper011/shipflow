export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@shipflow/db";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Verify webhook signature
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event: string;
    payload: {
      payment?: {
        entity: {
          id: string;
          order_id: string;
          amount: number;
          currency: string;
          status: string;
          notes?: Record<string, string>;
        };
      };
      subscription?: {
        entity: {
          id: string;
          plan_id: string;
          status: string;
          notes?: Record<string, string>;
        };
      };
    };
  };

  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "payment.captured": {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        const workspaceId = payment.notes?.workspaceId;
        const plan = payment.notes?.plan as "FREE" | "PRO" | "ENTERPRISE" | undefined;

        if (workspaceId && plan) {
          const planLimits = {
            PRO: { repoLimit: 10, aiCreditsLimit: 500 },
            ENTERPRISE: { repoLimit: 999, aiCreditsLimit: 9999 },
          } as Record<string, { repoLimit: number; aiCreditsLimit: number }>;

          await db.billing.update({
            where: { workspaceId },
            data: {
              plan,
              status: "ACTIVE",
              ...(planLimits[plan] || {}),
            },
          });
        }
        break;
      }

      case "payment.failed": {
        const payment = event.payload.payment?.entity;
        if (!payment) break;

        const workspaceId = payment.notes?.workspaceId;
        if (workspaceId) {
          await db.billing.update({
            where: { workspaceId },
            data: { status: "PAST_DUE" },
          });
        }
        break;
      }

      case "subscription.charged": {
        const subscription = event.payload.subscription?.entity;
        if (!subscription) break;

        const workspaceId = subscription.notes?.workspaceId;
        if (workspaceId) {
          // Reset monthly AI credits on subscription renewal
          await db.billing.update({
            where: { workspaceId },
            data: {
              aiCreditsUsed: 0,
              status: "ACTIVE",
            },
          });
        }
        break;
      }

      case "subscription.cancelled":
      case "subscription.completed": {
        const subscription = event.payload.subscription?.entity;
        if (!subscription) break;

        const workspaceId = subscription.notes?.workspaceId;
        if (workspaceId) {
          await db.billing.update({
            where: { workspaceId },
            data: {
              plan: "FREE",
              status: "CANCELLED",
              repoLimit: 3,
              aiCreditsLimit: 10,
            },
          });
        }
        break;
      }

      default:
        // Unhandled event — log and return OK
        console.log(`Unhandled Razorpay webhook event: ${event.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Razorpay webhook processing error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
