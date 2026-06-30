import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db, auth } from "@shipflow/api";
import Link from "next/link";
import { Plus, Ship } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const workspaces = await db.workspace.findMany({
    where: { members: { some: { userId: session.user.id } } },
    include: {
      _count: { select: { projects: true } },
      billing: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (workspaces.length === 0) {
    redirect("/onboarding");
  }

  // Redirect to first workspace
  redirect(`/w/${workspaces[0].slug}`);
}
