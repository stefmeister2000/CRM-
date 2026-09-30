import { usePipelineLeads } from "@/hooks/use-pipeline-leads";
import { useLanguage } from "@/hooks/use-language";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import {
  approveAccountRequest,
  createTeamMember,
  declineAccountRequest,
} from "@/lib/team.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ConnectAI } from "@/components/ConnectAI";
import { InboundWebsite } from "@/components/InboundWebsite";
import {
  OPEN_STAGES,
  PIPELINE_STEPS,
  ROLES,
  STAGE_META,
  labelFor,
  type Role,
  type Stage,
} from "@/lib/sales";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings & team | Sales CRM" },
      {
        name: "description",
        content:
          "Settings for the Sales CRM: see which rep already owns which accounts, their live pipeline and logged touches, and manage roles as a team leader.",
      },
      { property: "og:title", content: "Settings & team | Sales CRM" },
      {
        property: "og:description",
        content: "Ownership overview per sales rep so leaders avoid double outreach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const nl = language === "nl";
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.roles.includes("admin") ?? false;

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["account-requests", "pending"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_requests")
        .select("id, user_id, full_name, email, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, team");
      if (error) throw error;
      return data;
    },
  });

  const { data: roleRows = [] } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
  });

  const { data: leads = [] } = usePipelineLeads();

  const { data: activities = [] } = useQuery({
    queryKey: ["activities-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("user_id");
      if (error) throw error;
      return data;
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addTeamMember = useServerFn(createTeamMember);
  const approveRequest = useServerFn(approveAccountRequest);
  const declineRequest = useServerFn(declineAccountRequest);

  const decideRequest = useMutation({
    mutationFn: async ({
      requestId,
      userId,
      decision,
    }: {
      requestId: string;
      userId: string;
      decision: "approve" | "decline";
    }) => {
      if (decision === "approve") return approveRequest({ data: { requestId, userId } });
      return declineRequest({ data: { requestId, userId } });
    },
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "approve" ? "Account approved" : "Account declined");
      queryClient.invalidateQueries({ queryKey: ["account-requests"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const [newMember, setNewMember] = useState<{
    fullName: string;
    email: string;
    password: string;
    team: string;
    role: Role;
  }>({ fullName: "", email: "", password: "", team: "", role: "rep" });

  const addMember = useMutation({
    mutationFn: async () => {
      await addTeamMember({
        data: {
          fullName: newMember.fullName.trim(),
          email: newMember.email.trim(),
          password: newMember.password,
          role: newMember.role,
          ...(newMember.team.trim() ? { team: newMember.team.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Team member added");
      setNewMember({ fullName: "", email: "", password: "", team: "", role: "rep" });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const [moveFrom, setMoveFrom] = useState("unassigned");
  const [moveTo, setMoveTo] = useState("");

  const movable = leads.filter((lead) =>
    moveFrom === "unassigned" ? !lead.owner_id : lead.owner_id === moveFrom,
  );

  const reassign = useMutation({
    mutationFn: async () => {
      if (!moveTo) throw new Error("Pick who should get these accounts.");
      if (movable.length === 0) throw new Error("No accounts to move.");
      const { error } = await supabase
        .from("leads")
        .update({ owner_id: moveTo })
        .in(
          "id",
          movable.map((lead) => lead.id),
        );
      if (error) throw error;
      return movable.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} accounts moved`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const members = useMemo(
    () =>
      profiles
        .filter((profile) => roleRows.some((row) => row.user_id === profile.id))
        .map((profile) => {
          const owned = leads.filter((lead) => lead.owner_id === profile.id);
          const open = owned.filter((lead) => OPEN_STAGES.includes(lead.stage as Stage));
          return {
            ...profile,
            role:
              (roleRows.find((r) => r.user_id === profile.id)?.role as Role | undefined) ?? "rep",
            owned: owned.length,
            open: open.length,
            won: owned.filter((lead) => lead.stage === "won").length,
            lost: owned.filter((lead) => lead.stage === "lost").length,

            touches: activities.filter((a) => a.user_id === profile.id).length,
            perStage: PIPELINE_STEPS.map((step) => ({
              step,
              count: owned.filter((lead) => lead.stage === step).length,
            })),
          };
        }),
    [profiles, leads, roleRows, activities],
  );

  const unassigned = leads.filter((lead) => !lead.owner_id);

  const groups = ROLES.map((role) => ({
    role,
    people: members.filter((member) => member.role === role.value),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl">{isAdmin ? "Team & ownership" : "ChatGPT koppelen"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Split per role, so everybody sees who owns which accounts and where they stand in the pipeline."
            : "Connect your own ChatGPT account to add and update leads with your existing access."}
        </p>
      </div>

      <section
        aria-label={nl ? "Taalvoorkeur" : "Language preference"}
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
      >
        <div>
          <h2 className="text-base font-semibold">{nl ? "Taal" : "Language"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {nl
              ? "Kies de taal van je CRM. Je voorkeur wordt op dit apparaat bewaard."
              : "Choose your CRM language. Your preference is saved on this device."}
          </p>
        </div>
        <select
          aria-label={nl ? "Taal kiezen" : "Choose language"}
          value={language}
          onChange={(event) => setLanguage(event.target.value as "nl" | "en")}
          className="h-10 min-w-40 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </section>

      <Tabs
        key={isAdmin ? "admin" : "member"}
        defaultValue={isAdmin ? "team" : "ai"}
        className="space-y-6"
      >
        <TabsList>
          {isAdmin && <TabsTrigger value="team">Team & ownership</TabsTrigger>}
          <TabsTrigger value="ai">ChatGPT koppelen</TabsTrigger>
          {isAdmin && <TabsTrigger value="website">Website requests</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="team" className="space-y-8">
            {isAdmin && pendingRequests.length > 0 && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle>New account requests ({pendingRequests.length})</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{request.full_name || "Name not provided"}</p>
                        <p className="text-sm text-muted-foreground">{request.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          decideRequest.mutate({
                            requestId: request.id,
                            userId: request.user_id,
                            decision: "decline",
                          })
                        }
                        disabled={decideRequest.isPending}
                      >
                        Decline
                      </Button>
                      <Button
                        onClick={() =>
                          decideRequest.mutate({
                            requestId: request.id,
                            userId: request.user_id,
                            decision: "approve",
                          })
                        }
                        disabled={decideRequest.isPending}
                      >
                        Approve
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {groups.map(({ role, people }) => (
              <section key={role.value} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-2xl">{role.label}</h2>
                  <Badge variant="outline">{people.length}</Badge>
                  <p className="text-xs text-muted-foreground">{ROLE_DUTIES[role.value]}</p>
                </div>

                {people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody in this role yet.</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {people.map((member) => (
                      <Card key={member.id}>
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">
                              {member.full_name ?? "Team member"}
                              {member.id === me?.id && (
                                <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                              )}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                          {isAdmin ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                setRole.mutate({ userId: member.id, role: value as Role })
                              }
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{labelFor(ROLES, member.role)}</Badge>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <Metric label="Accounts" value={String(member.owned)} />
                            <Metric label="Live" value={String(member.open)} />
                            <Metric label="Won" value={String(member.won)} />
                            <Metric label="Touches" value={String(member.touches)} />
                          </div>
                          <div>
                            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                              Their pipeline
                            </p>
                            <div className="flex gap-1.5">
                              {member.perStage.map(({ step, count }) => (
                                <div
                                  key={step}
                                  className="flex-1 rounded-md border border-border bg-secondary/40 px-1 py-1.5 text-center"
                                >
                                  <p className="text-base tabular-nums">{count}</p>
                                  <p className="text-[10px] leading-tight text-muted-foreground">
                                    {STAGE_META[step].short}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            ))}

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Invite a team member</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    As admin you can create an account for anyone here and set their role right
                    away. Share the temporary password with them — colleagues can also sign
                    themselves up on the login page, and they start as Sales rep until you change
                    their role above.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label htmlFor="new-name">Full name</Label>
                      <Input
                        id="new-name"
                        value={newMember.fullName}
                        onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-email">Work email</Label>
                      <Input
                        id="new-email"
                        type="email"
                        value={newMember.email}
                        onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-password">Temporary password</Label>
                      <Input
                        id="new-password"
                        value={newMember.password}
                        onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-team">Team (optional)</Label>
                      <Input
                        id="new-team"
                        value={newMember.team}
                        onChange={(e) => setNewMember({ ...newMember, team: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Role</Label>
                      <Select
                        value={newMember.role}
                        onValueChange={(value) =>
                          setNewMember({ ...newMember, role: value as Role })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={() => addMember.mutate()} disabled={addMember.isPending}>
                    {addMember.isPending ? "Creating…" : "Create account"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {me?.isManager && (
              <Card>
                <CardHeader>
                  <CardTitle>Move accounts to another owner</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">From</p>
                    <Select value={moveFrom} onValueChange={setMoveFrom}>
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned accounts</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name ?? p.email ?? "Team member"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">To</p>
                    <Select value={moveTo} onValueChange={setMoveTo}>
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Pick a rep" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles
                          .filter((p) => p.id !== moveFrom)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name ?? p.email ?? "Team member"}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => reassign.mutate()} disabled={reassign.isPending}>
                    Move {movable.length} accounts
                  </Button>
                  <p className="w-full text-xs text-muted-foreground">
                    Use this when somebody leaves or a region changes hands — the whole outreach
                    history stays on the account.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Unassigned accounts ({unassigned.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {unassigned.length === 0 && (
                  <p className="text-sm text-muted-foreground">Everything has an owner. Nice.</p>
                )}
                {unassigned.map((lead) => (
                  <Badge key={lead.id} variant="secondary">
                    {lead.company}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="ai">
          <ConnectAI heading="h2" />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="website">
            <InboundWebsite />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const ROLE_DUTIES: Record<Role, string> = {
  admin: "Full access: manages roles, imports and every account.",
  team_leader: "Sees and edits the whole team's accounts, assigns owners.",
  rep: "Works accounts: moves stages, edits details, value, logs outreach.",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/50 p-2">
      <p className="text-lg tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
