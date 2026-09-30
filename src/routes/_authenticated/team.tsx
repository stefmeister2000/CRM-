import { createFileRoute, redirect } from "@tanstack/react-router";

/** Team management moved into Settings — keep the old link working. */
export const Route = createFileRoute("/_authenticated/team")({
  beforeLoad: () => {
    throw redirect({ to: "/settings" });
  },
});
