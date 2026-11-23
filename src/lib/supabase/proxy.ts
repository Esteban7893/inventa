import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Refresca la sesión de Supabase en cada petición y redirige:
 * sin sesión a /login, y con sesión de /login a /panel.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.assign(pendingHeaders, headers);
        Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);

  if (!user && !publicPath) {
    return redirectKeepingCookies(request, "/login", response, pendingHeaders);
  }
  if (user && publicPath) {
    return redirectKeepingCookies(request, "/panel", response, pendingHeaders);
  }

  return response;
}

function redirectKeepingCookies(
  request: NextRequest,
  pathname: string,
  from: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";

  const redirect = NextResponse.redirect(target);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(headers).forEach(([key, value]) => redirect.headers.set(key, value));
  return redirect;
}
