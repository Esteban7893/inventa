import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  contentSecurityPolicyHeaderName,
} from "@/lib/security-headers";

function directiveMap(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

const production = { isDev: false, cspMode: "report-only" } as const;
const development = { isDev: true, cspMode: "report-only" } as const;
const enforcedProduction = { isDev: false, cspMode: "enforce" } as const;

describe("buildContentSecurityPolicy", () => {
  it("en producción no permite eval ni estilos en línea", () => {
    const directives = directiveMap(buildContentSecurityPolicy(production));

    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives.get("style-src")).toEqual(["'self'"]);
  });

  it("solo en desarrollo añade 'unsafe-eval' a los scripts y 'unsafe-inline' a los estilos", () => {
    const directives = directiveMap(buildContentSecurityPolicy(development));

    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    expect(directives.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("limita el resto de orígenes al propio dominio y bloquea objetos, marcos y <base> ajenos", () => {
    for (const options of [production, development, enforcedProduction]) {
      const directives = directiveMap(buildContentSecurityPolicy(options));

      expect(directives.get("default-src")).toEqual(["'self'"]);
      expect(directives.get("connect-src")).toEqual(["'self'"]);
      expect(directives.get("img-src")).toEqual(["'self'"]);
      expect(directives.get("font-src")).toEqual(["'self'"]);
      expect(directives.get("object-src")).toEqual(["'none'"]);
      expect(directives.get("base-uri")).toEqual(["'self'"]);
      expect(directives.get("form-action")).toEqual(["'self'"]);
      expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
      expect(directives.get("frame-src")).toEqual(["'none'"]);
    }
  });

  it("ningún origen externo ni comodín", () => {
    for (const options of [production, development, enforcedProduction]) {
      const policy = buildContentSecurityPolicy(options);

      expect(policy).not.toMatch(/https?:|\*|data:|blob:/);
    }
  });

  it("upgrade-insecure-requests solo cuando la política es obligatoria y en producción", () => {
    expect(directiveMap(buildContentSecurityPolicy(production)).has("upgrade-insecure-requests")).toBe(false);
    expect(directiveMap(buildContentSecurityPolicy(development)).has("upgrade-insecure-requests")).toBe(false);
    expect(
      directiveMap(buildContentSecurityPolicy({ isDev: true, cspMode: "enforce" })).has("upgrade-insecure-requests"),
    ).toBe(false);
    expect(directiveMap(buildContentSecurityPolicy(enforcedProduction)).get("upgrade-insecure-requests")).toEqual(
      [],
    );
  });

  it("es una sola línea con las directivas separadas por '; ' y sin repetir", () => {
    const policy = buildContentSecurityPolicy(production);
    const names = policy.split("; ").map((directive) => directive.split(" ")[0]);

    expect(policy).not.toMatch(/[\r\n]/);
    expect(policy).not.toMatch(/;\s*$/);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("contentSecurityPolicyHeaderName", () => {
  it("usa la cabecera Report-Only en modo report-only", () => {
    expect(contentSecurityPolicyHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(contentSecurityPolicyHeaderName("enforce")).toBe("Content-Security-Policy");
  });
});

describe("buildSecurityHeaders", () => {
  it("incluye todas las cabeceras de seguridad, una vez cada una", () => {
    const headers = buildSecurityHeaders(production);
    const keys = headers.map((header) => header.key);

    expect(keys).toEqual([
      "Content-Security-Policy-Report-Only",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Frame-Options",
    ]);
  });

  it("en modo obligatorio envía Content-Security-Policy y no la Report-Only", () => {
    const keys = buildSecurityHeaders(enforcedProduction).map((header) => header.key);

    expect(keys).toContain("Content-Security-Policy");
    expect(keys).not.toContain("Content-Security-Policy-Report-Only");
  });

  it("los valores de las cabeceras fijas", () => {
    const values = Object.fromEntries(buildSecurityHeaders(production).map(({ key, value }) => [key, value]));

    expect(values["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(values["X-Content-Type-Options"]).toBe("nosniff");
    expect(values["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(values["X-Frame-Options"]).toBe("DENY");
    expect(values["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  });

  it("la CSP de las cabeceras es la de buildContentSecurityPolicy", () => {
    const [csp] = buildSecurityHeaders(development);

    expect(csp.value).toBe(buildContentSecurityPolicy(development));
  });
});
