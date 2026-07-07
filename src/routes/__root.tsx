import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="paper-fold px-8 py-10 max-w-sm w-full text-center">
        <span className="fold-crease" />
        <div className="display text-6xl text-ink">404</div>
        <div className="mt-2 text-sm tracking-[0.2em] uppercase text-brown">Page not found</div>
        <Link to="/" className="btn-ink mt-6 inline-flex">Back to the tab</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="paper-fold px-8 py-10 max-w-sm w-full text-center">
        <span className="fold-crease" />
        <div className="display text-2xl text-ink uppercase">Something spilled</div>
        <p className="mt-2 text-sm text-brown">This page didn't load. Try again in a moment.</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="btn-burnt mt-6"
        >Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { title: "The Tab — Split the check like a boutique restaurant" },
      { name: "description", content: "The Tab is a mobile-first bill-splitting app for dinner with friends. Assign items, split tax and tip proportionally, and settle up in Venmo." },
      { name: "author", content: "The Tab" },
      { name: "theme-color", content: "#132030" },
      { property: "og:title", content: "The Tab — Split the check like a boutique restaurant" },
      { property: "og:description", content: "Assign items, split tax and tip fairly, and settle up on Venmo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Caveat:wght@500;700&display=swap",
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
      <head><HeadContent /></head>
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
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#132030",
            color: "#F5ECDC",
            border: "1px solid #132030",
            borderRadius: "4px",
            fontFamily: "Inter, sans-serif",
            letterSpacing: "0.02em",
          },
        }}
      />
    </QueryClientProvider>
  );
}
