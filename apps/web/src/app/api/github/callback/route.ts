import { NextRequest, NextResponse } from "next/server";
import { auth, githubApp } from "@shipflow/api";
import { db } from "@shipflow/db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const installationId = searchParams.get("installation_id");
  const workspaceId = searchParams.get("state");

  if (!installationId) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    // Save installation_id in a cookie so we can pick it up after sign-in
    const signInUrl = new URL("/sign-in", req.url);
    const res = NextResponse.redirect(signInUrl);
    res.cookies.set("pending_installation_id", installationId, { maxAge: 300 });
    if (workspaceId) res.cookies.set("pending_workspace_id", workspaceId, { maxAge: 300 });
    return res;
  }

  try {
    // Find target workspace
    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId) {
      const membership = await db.workspaceMember.findFirst({
        where: { userId: session.user.id, role: "OWNER" },
        select: { workspaceId: true },
      });
      targetWorkspaceId = membership?.workspaceId ?? null;
    }

    if (!targetWorkspaceId) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: targetWorkspaceId, userId: session.user.id } },
    });

    if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
      return NextResponse.redirect(new URL("/onboarding?error=forbidden", req.url));
    }

    // Try to get account info — but don't fail if GitHub App is not configured
    let accountLogin = "github-user";
    let accountType = "User";

    if (githubApp) {
      try {
        const octokit = await githubApp.getInstallationOctokit(Number(installationId));
        const { data: installation } = await octokit.request(
          "GET /app/installations/{installation_id}",
          { installation_id: Number(installationId) }
        );
        accountLogin = installation.account?.login ?? accountLogin;
        accountType = installation.account?.type ?? accountType;
      } catch (e) {
        console.warn("Could not fetch installation details:", e);
      }
    }

    // Save to DB regardless of whether App API worked
    await db.githubInstallation.upsert({
      where: { workspaceId: targetWorkspaceId },
      create: {
        workspaceId: targetWorkspaceId,
        installationId: Number(installationId),
        accountLogin,
        accountType,
      },
      update: {
        installationId: Number(installationId),
        accountLogin,
        accountType,
      },
    });

    const workspace = await db.workspace.findUnique({
      where: { id: targetWorkspaceId },
      select: { slug: true },
    });

    return NextResponse.redirect(
      new URL(`/w/${workspace?.slug}/github?connected=true`, req.url)
    );
  } catch (err) {
    console.error("GitHub installation callback error:", err);
    return NextResponse.redirect(new URL("/onboarding?error=github_install_failed", req.url));
  }
}
