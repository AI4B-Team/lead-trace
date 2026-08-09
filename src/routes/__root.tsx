import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { TranslationProvider } from "@/components/translation-provider";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  // A 404 otherwise keeps the root's marketing title, which reads as a working
  // page in tabs, history and share previews.
  useEffect(() => {
    document.title = "Page Not Found — LeadTrace";
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow";
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page Not Found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This Page Didn't Load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LeadTrace — Stop Buying Lists. Start Closing Deals." },
      { name: "description", content: "Find them, trace them, scrub them, text them — automatically. Describe who you want to reach; LeadTrace builds the campaign." },
      { name: "author", content: "LeadTrace" },
      { property: "og:title", content: "LeadTrace — Stop Buying Lists. Start Closing Deals." },
      { property: "og:description", content: "Find them, trace them, scrub them, text them — automatically. Describe who you want to reach; LeadTrace builds the campaign." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "LeadTrace — Stop Buying Lists. Start Closing Deals." },
      { name: "twitter:description", content: "Find them, trace them, scrub them, text them — automatically. Describe who you want to reach; LeadTrace builds the campaign." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6859cf00-10c0-408f-9b67-d69e0f43dae1/id-preview-23e65403--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app-1785903692377.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6859cf00-10c0-408f-9b67-d69e0f43dae1/id-preview-23e65403--c17f89b5-abf1-402a-95e3-1ace02324806.lovable.app-1785903692377.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Remember that this device has had a real session so the prompt-box
      // flow can send them to Log In instead of Start Free next time.
      if (session) {
        try { localStorage.setItem("leadtrace_returning", "1"); } catch { /* ignore */ }
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  useEffect(() => {
    // After a redeploy, previously-loaded pages reference old hashed chunks
    // that no longer exist. Reload once to pick up the current build.
    const RELOAD_KEY = "leadtrace_chunk_reload_at";
    const isChunkError = (msg: string) =>
      /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
        msg,
      );
    const maybeReload = (msg: string) => {
      if (!isChunkError(msg)) return;
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
        if (Date.now() - last < 10_000) return; // avoid reload loops
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => maybeReload(e.message ?? "");
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      maybeReload(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>
        <SiteDensity />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster />
      </TranslationProvider>
    </QueryClientProvider>
  );
}

/* Public/marketing routes render at ~80% density by scaling the root font size
   (see §21 in styles.css). Scoped off /app and /platform, which keep full-size
   data tables and form controls. */
function SiteDensity() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const internal = pathname.startsWith("/app") || pathname.startsWith("/platform");
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("site-density", !internal);
    return () => root.classList.remove("site-density");
  }, [internal]);
  return null;
}
