import { createFileRoute } from "@tanstack/react-router";
import { ConnectAI } from "@/components/ConnectAI";

export const Route = createFileRoute("/_authenticated/connect")({
  head: () => ({
    meta: [
      { title: "ChatGPT koppelen | Sales CRM" },
      {
        name: "description",
        content:
          "Connect your own ChatGPT to the Sales CRM and let it drop prospects, drafted emails and outreach straight into your pipeline.",
      },
      { property: "og:title", content: "ChatGPT koppelen | Sales CRM" },
      {
        property: "og:description",
        content: "Personal API connection for every sales rep, scoped to your own account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ConnectAI />,
});
