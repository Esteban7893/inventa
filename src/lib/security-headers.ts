/**
 * Cabeceras de seguridad de todas las respuestas (se aplican desde `next.config.ts`).
 *
 * CSP sin nonce: con Cache Components las páginas tienen un *static shell* prerenderizado
 * en el build, y sus scripts en línea no pueden llevar un nonce por petición (la guía de CSP
 * de Next dice que PPR es incompatible con nonces). Por eso `script-src` necesita
 * `'unsafe-inline'` para los scripts en línea de Next y React; todo lo demás se limita al
 * propio dominio.
 */

export type CspMode = "report-only" | "enforce";

export type SecurityHeadersOptions = {
  /** `next dev`: React usa `eval` para las trazas y la superposición inyecta estilos en línea. */
  isDev: boolean;
  /** `report-only` avisa en la consola sin bloquear; `enforce` bloquea. */
  cspMode: CspMode;
};

export type HeaderEntry = {
  key: string;
  value: string;
};

type Directives = ReadonlyArray<readonly [name: string, sources: ReadonlyArray<string>]>;

function directives({ isDev, cspMode }: SecurityHeadersOptions): Directives {
  const list: Array<readonly [string, ReadonlyArray<string>]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", ...(isDev ? ["'unsafe-inline'"] : [])]],
    ["img-src", ["'self'"]],
    ["font-src", ["'self'"]],
    // El navegador solo habla con la app (RSC, Server Actions, HMR en desarrollo):
    // Supabase se llama únicamente desde el servidor.
    ["connect-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["frame-src", ["'none'"]],
  ];

  // En report-only el navegador ignora esta directiva (y lo avisa en la consola), y en
  // desarrollo se sirve por http.
  if (cspMode === "enforce" && !isDev) {
    list.push(["upgrade-insecure-requests", []]);
  }

  return list;
}

/** Valor de la cabecera CSP: directivas separadas por `; `, sin saltos de línea. */
export function buildContentSecurityPolicy(options: SecurityHeadersOptions): string {
  return directives(options)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

/** Nombre de la cabecera CSP según el modo. */
export function contentSecurityPolicyHeaderName(mode: CspMode): string {
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** Todas las cabeceras de seguridad para `headers()` de `next.config.ts`. */
export function buildSecurityHeaders(options: SecurityHeadersOptions): HeaderEntry[] {
  return [
    {
      key: contentSecurityPolicyHeaderName(options.cspMode),
      value: buildContentSecurityPolicy(options),
    },
    // Sin `preload`: el dominio es un subdominio de vercel.app y no se puede inscribir en la lista.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
