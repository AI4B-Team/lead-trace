import { z } from "zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/start")({
  validateSearch: z.object({
    prompt: z.string().optional(),
    template: z.string().optional(),
    upload: z.boolean().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Starting Your List | LeadTrace" },
      {
        name: "description",
        content: "Setting up your LeadTrace workspace and taking you to the list builder.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: StartRedirect,
});

function StartRedirect() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    (async () => {
      // Where the visitor should land once they have a session.
      const params = new URLSearchParams();
      if (search.template) params.set("template", search.template);
      if (search.prompt) params.set("prompt", search.prompt);
      const query = params.toString();
      const destination = search.upload
        ? "/app/assistant?source=upload"
        : `/app/assistant${query ? `?${query}` : ""}`;

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace(destination);
        return;
      }
      const returning = (() => {
        try {
          if (localStorage.getItem("leadtrace_returning")) return true;
          return Object.keys(localStorage).some((k) => k.startsWith("sb-"));
        } catch {
          return false;
        }
      })();
      navigate({
        to: "/auth",
        search: { mode: returning ? "signin" : "signup", redirect: destination },
        replace: true,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, search.prompt, search.template, search.upload]);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground">
      Starting…
    </div>
  );
}
