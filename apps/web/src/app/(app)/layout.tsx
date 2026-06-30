import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@shipflow/api";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(240 25% 5%)" }}>
      <AppSidebar user={session.user} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
