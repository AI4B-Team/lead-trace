import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { stateCodeFromSlug } from "@/lib/surplus/slug";

/** `/surplus-funds/florida/hillsborough` → canonical county surplus guide. */
export const Route = createFileRoute("/surplus-funds/$state/$county")({
  beforeLoad: ({ params }) => {
    const code = stateCodeFromSlug(params.state);
    if (!code) throw notFound();
    throw redirect({
      to: "/distress-feed/states/$state/surplus-funds/$county",
      params: { state: code.toLowerCase(), county: params.county },
    });
  },
});