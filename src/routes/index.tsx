import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Aanmelden | Sales CRM" },
      {
        name: "description",
        content: "Meld je aan bij het Sales CRM.",
      },
      { property: "og:title", content: "Aanmelden | Sales CRM" },
      {
        property: "og:description",
        content: "Toegang tot het Sales CRM voor je team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
