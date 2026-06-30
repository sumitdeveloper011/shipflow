import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeDate(date: Date | string) {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export const STATUS_COLORS: Record<string, string> = {
  DISCOVERY: "bg-blue-100 text-blue-800",
  PRD_GENERATING: "bg-yellow-100 text-yellow-800",
  PRD_READY: "bg-indigo-100 text-indigo-800",
  PLANNING: "bg-purple-100 text-purple-800",
  IN_DEVELOPMENT: "bg-orange-100 text-orange-800",
  IN_REVIEW: "bg-cyan-100 text-cyan-800",
  FIX_NEEDED: "bg-red-100 text-red-800",
  HUMAN_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  SHIPPED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-gray-100 text-gray-800",
};

export const STATUS_LABELS: Record<string, string> = {
  DISCOVERY: "Discovery",
  PRD_GENERATING: "Generating PRD",
  PRD_READY: "PRD Ready",
  PLANNING: "Planning",
  IN_DEVELOPMENT: "In Development",
  IN_REVIEW: "In Review",
  FIX_NEEDED: "Fix Needed",
  HUMAN_REVIEW: "Awaiting Approval",
  APPROVED: "Approved",
  SHIPPED: "Shipped",
  REJECTED: "Rejected",
};
