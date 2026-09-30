import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LanguageToggle, useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/pending")({
  head: () => ({
    meta: [
      { title: "Account pending approval | Sales CRM" },
      { name: "description", content: "Your account request is pending administrator approval." },
      { property: "og:title", content: "Account pending approval | Sales CRM" },
      {
        property: "og:description",
        content: "Your account request is pending administrator approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [status, setStatus] = useState<"pending" | "declined" | "checking">("checking");

  useEffect(() => {
    const check = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id);
      if (roles && roles.length > 0) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      const { data: request } = await supabase
        .from("account_requests")
        .select("status")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      setStatus(request?.status === "declined" ? "declined" : "pending");
    };
    void check();
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-8 text-center">
        <div className="mb-4 flex justify-end">
          <LanguageToggle />
        </div>
        <Clock3 className="mx-auto size-10 text-primary" />
        <h1 className="mt-5 text-3xl">
          {status === "declined"
            ? language === "nl"
              ? "Aanvraag geweigerd"
              : "Request declined"
            : language === "nl"
              ? "Wachten op goedkeuring"
              : "Waiting for approval"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {status === "declined"
            ? language === "nl"
              ? "Je accountaanvraag werd niet goedgekeurd. Neem contact op met de beheerder."
              : "Your account request was not approved. Contact the administrator."
            : language === "nl"
              ? "Je aanvraag is verstuurd. Je krijgt toegang zodra de beheerder je account accepteert."
              : "Your request has been sent. You will get access when the administrator approves your account."}
        </p>
        <Button variant="outline" className="mt-6" onClick={signOut}>
          <LogOut className="size-4" /> {language === "nl" ? "Afmelden" : "Sign out"}
        </Button>
      </div>
    </div>
  );
}
