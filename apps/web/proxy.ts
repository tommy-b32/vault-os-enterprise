import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeDestination } from "@/lib/auth/redirects";
import { hasVaultAccess } from "@/lib/auth/rules";

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (destination !== "/") url.searchParams.set("next", safeDestination(destination));
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Authentication unavailable" }, { status: 503 })
      : loginRedirect(request);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  let isAuthorized = false;

  if (user) {
    const { data: operator } = await supabase
      .from("vault_operators")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    isAuthorized = hasVaultAccess(operator);
  }

  if (request.nextUrl.pathname === "/auth/recovery") {
    return response;
  }

  if (request.nextUrl.pathname === "/login") {
    if (isAuthorized) {
      return NextResponse.redirect(
        new URL(safeDestination(request.nextUrl.searchParams.get("next")), request.url),
      );
    }
    return response;
  }

  if (!isAuthorized) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return loginRedirect(request);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
