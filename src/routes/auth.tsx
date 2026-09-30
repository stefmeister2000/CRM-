import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase, isDatabaseConfigured } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle, useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Aanmelden | Sales CRM" },
      {
        name: "description",
        content: "Meld je aan bij het Sales CRM om leads en contacten te beheren.",
      },
      { property: "og:title", content: "Aanmelden | Sales CRM" },
      {
        property: "og:description",
        content: "Toegang tot het Sales CRM voor je team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search["next"] === "string" ? { next: search["next"] } : {},
  component: () =>
    isDatabaseConfigured ? (
      <AuthPage />
    ) : (
      <main className="flex min-h-screen items-center justify-center bg-secondary p-8">
        <div className="max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Je nieuwe CRM wordt klaargezet</h1>
          <p className="mt-4 text-muted-foreground">
            De oude database is losgekoppeld. Zodra je nieuwe database klaar is, kun je hier een
            nieuw account maken en met een lege CRM starten.
          </p>
        </div>
      </main>
    ),
});

function safeNext(next: string | undefined) {
  if (!next) return undefined;
  if (!next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const redirectTo = safeNext(next);
  const queryClient = useQueryClient();
  const { data: googleEnabled = false } = useQuery({
    queryKey: ["auth", "google-enabled"],
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${import.meta.env["VITE_SUPABASE_URL"]}/auth/v1/settings`, {
        signal,
        headers: { apikey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] },
      });
      if (!response.ok) throw new Error("Could not load sign-in providers");
      const settings = (await response.json()) as { external?: { google?: boolean } };
      return settings.external?.google === true;
    },
  });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (redirectTo) window.location.href = redirectTo;
        else navigate({ to: "/dashboard" });
      }
    });
  }, [navigate, redirectTo]);

  const afterAuth = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name:
            ((user.user_metadata?.["full_name"] as string | undefined) ?? "") || fullName || null,
        },
        { onConflict: "id" },
      );
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles || roles.length === 0) {
        const { data: existingRequest } = await supabase
          .from("account_requests")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!existingRequest) {
          await supabase.from("account_requests").insert({
            user_id: user.id,
            email: user.email ?? email,
            full_name:
              ((user.user_metadata?.["full_name"] as string | undefined) ?? "") || fullName || null,
          });
        }
        await queryClient.invalidateQueries();
        navigate({ to: "/pending" });
        return;
      }
    }
    await queryClient.invalidateQueries();
    if (redirectTo) {
      window.location.href = redirectTo;
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { full_name: fullName },
        },
      });
      if (error) {
        setLoading(false);
        toast.error(error.message);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInError) {
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        return;
      }
      toast.success("Your account request has been sent");
      await afterAuth();
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await afterAuth();
  };

  const google = async () => {
    const callbackUrl = new URL("/auth", window.location.origin);
    if (redirectTo) callbackUrl.searchParams.set("next", redirectTo);
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (result.error) {
      toast.error("Google sign-in failed. Try email instead.");
      return;
    }
    if (result.data.url) return;
    await afterAuth();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/70 px-4 py-10">
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_35px_60px_-25px_oklch(0.3_0.05_172/0.3)] md:flex-row">
        {/* Brand side */}
        <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-primary p-8 text-primary-foreground md:w-5/12 md:p-10">
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full opacity-10"
          >
            <defs>
              <pattern id="sales-crm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sales-crm-grid)" />
          </svg>

          <div className="relative">
            <div className="font-display text-3xl font-bold uppercase tracking-tight">
              Sales CRM
            </div>
            <div className="mt-2 h-px w-12 bg-primary-foreground/40" />
            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/80">
              Sales workspace
            </div>
          </div>

          <div className="relative">
            <h1 className="font-display text-3xl leading-tight md:text-4xl">
              Your next deal starts here
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-primary-foreground/80">
              Manage your contacts and incoming leads in one shared sales workspace.
            </p>
          </div>

          <div className="relative flex gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/60">
            <span>Contacts</span>
            <span>•</span>
            <span>Pipeline</span>
          </div>
        </div>

        {/* Form side */}
        <div className="relative flex flex-col p-8 md:w-7/12 lg:p-12">
          <div className="absolute right-5 top-5">
            <LanguageToggle />
          </div>

          <div className="flex flex-1 flex-col justify-center py-10">
            <h2 className="text-2xl">{mode === "signup" ? "Create an account" : "Sign in"}</h2>

            <form onSubmit={submit} className="mt-7 space-y-5">
              {mode === "signup" ? (
                <div className="space-y-2">
                  <Label
                    htmlFor="fullName"
                    className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    Full name
                  </Label>
                  <Input
                    id="fullName"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-12 rounded-xl border-input bg-secondary/70 px-4 focus-visible:border-primary focus-visible:ring-primary/20"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Work email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  placeholder="you@company.com"
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl border-input bg-secondary/70 px-4 focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    value={password}
                    placeholder="••••••••"
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-xl border-input bg-secondary/70 pl-4 pr-12 focus-visible:border-primary focus-visible:ring-primary/20"
                  />
                  <button
                    type="button"
                    aria-label={
                      language === "nl"
                        ? showPassword
                          ? "Wachtwoord verbergen"
                          : "Wachtwoord tonen"
                        : showPassword
                          ? "Hide password"
                          : "Show password"
                    }
                    aria-controls="password"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="size-5" aria-hidden="true" />
                    ) : (
                      <Eye className="size-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="h-12 w-full rounded-xl text-base font-bold shadow-lg shadow-primary/30"
                disabled={loading}
              >
                {mode === "signup" ? "Create my account" : "Sign in"}
              </Button>
            </form>

            {googleEnabled && (
              <>
                <div className="my-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl"
                  onClick={google}
                >
                  <GoogleMark />
                  Continue with Google
                </Button>
              </>
            )}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {mode === "signup" ? "Already have an account?" : "No access yet?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                className="font-bold text-primary hover:underline"
              >
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              New accounts need admin approval before they can enter.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
