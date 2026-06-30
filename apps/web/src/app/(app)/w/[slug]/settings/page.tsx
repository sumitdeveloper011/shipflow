"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Settings, Users, Plus, Trash2, LogOut, ChevronDown } from "lucide-react";

const ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [wsName, setWsName] = useState("");

  const utils = trpc.useUtils();
  const { data: workspace } = trpc.workspace.getBySlug.useQuery(
    { slug },
    { onSuccess: (data) => { if (wsName === "") setWsName(data.name); } }
  );
  const { data: members, refetch: refetchMembers } = trpc.workspace.getMembers.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id }
  );

  const myMembership = members?.find((m) => m.userId === workspace?.members?.find(() => true)?.userId);
  const currentUserId = workspace?.members?.[0]?.userId;

  const inviteMember = trpc.workspace.inviteMember.useMutation({
    onSuccess: () => { setInviteEmail(""); refetchMembers(); },
  });
  const removeMember = trpc.workspace.removeMember.useMutation({
    onSuccess: () => refetchMembers(),
  });
  const updateMemberRole = trpc.workspace.updateMemberRole.useMutation({
    onSuccess: () => refetchMembers(),
  });
  const leaveWorkspace = trpc.workspace.leaveWorkspace.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });
  const updateName = trpc.workspace.updateName.useMutation({
    onSuccess: () => utils.workspace.getBySlug.invalidate(),
  });

  const myRole = workspace?.members?.find(
    (m) => m.userId === workspace?.members?.find(() => true)?.userId
  )?.role;

  const isOwnerOrAdmin = myRole === "OWNER" || myRole === "ADMIN";

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your workspace settings and members</p>
      </div>

      {/* Workspace info */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Workspace
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Workspace name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                disabled={!isOwnerOrAdmin}
                className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-secondary disabled:text-muted-foreground"
              />
              {isOwnerOrAdmin && (
                <button
                  onClick={() => workspace?.id && updateName.mutate({ workspaceId: workspace.id, name: wsName })}
                  disabled={updateName.isPending || !wsName.trim()}
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Slug</label>
            <input
              type="text"
              value={slug}
              disabled
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-secondary text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Members ({members?.length || 0})
        </h2>

        {/* Invite */}
        {isOwnerOrAdmin && (
          <div className="flex gap-2 mb-5">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={() =>
                workspace?.id &&
                inviteMember.mutate({ workspaceId: workspace.id, email: inviteEmail, role: inviteRole })
              }
              disabled={!inviteEmail.trim() || inviteMember.isPending}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Invite
            </button>
          </div>
        )}

        {/* Member list */}
        <div className="space-y-2">
          {members?.map((member) => {
            const isMe = member.userId === currentUserId;
            const isOwner = member.role === "OWNER";
            const canManage = isOwnerOrAdmin && !isOwner && !isMe;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between py-3 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  {member.user.image ? (
                    <img
                      src={member.user.image}
                      alt={member.user.name}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                      {member.user.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      {member.user.name}
                      {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{member.user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canManage ? (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        workspace?.id &&
                        updateMemberRole.mutate({
                          workspaceId: workspace.id,
                          userId: member.userId,
                          role: e.target.value as "ADMIN" | "MEMBER" | "VIEWER",
                        })
                      }
                      className="text-xs border border-input rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={
                      "text-xs px-2 py-0.5 rounded-full font-medium " +
                      (isOwner
                        ? "bg-amber-100 text-amber-800"
                        : "bg-secondary text-secondary-foreground")
                    }>
                      {member.role}
                    </span>
                  )}

                  {canManage && (
                    <button
                      onClick={() =>
                        workspace?.id &&
                        removeMember.mutate({ workspaceId: workspace.id, userId: member.userId })
                      }
                      disabled={removeMember.isPending}
                      title="Remove member"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Danger zone */}
      <div className="border border-red-200 rounded-xl p-6 bg-card">
        <h2 className="font-semibold text-red-700 mb-4">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Leave workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {myRole === "OWNER"
                ? "Transfer ownership before leaving"
                : "You will lose access to all projects and feature requests"}
            </p>
          </div>
          <button
            onClick={() => workspace?.id && leaveWorkspace.mutate({ workspaceId: workspace.id })}
            disabled={myRole === "OWNER" || leaveWorkspace.isPending}
            className="flex items-center gap-1.5 border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
