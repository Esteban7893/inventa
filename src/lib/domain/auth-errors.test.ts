import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/domain/auth-errors";

describe("authErrorMessage", () => {
  it("traduce credenciales inválidas", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe(
      "El email o la contraseña no son correctos.",
    );
  });

  it("traduce email sin confirmar", () => {
    expect(authErrorMessage({ code: "email_not_confirmed", status: 400 })).toBe(
      "Tienes que confirmar tu email antes de entrar.",
    );
  });

  it("traduce usuario bloqueado", () => {
    expect(authErrorMessage({ code: "user_banned", status: 400 })).toBe(
      "Tu cuenta está bloqueada. Contacta con el administrador.",
    );
  });

  it("traduce el límite de intentos por código y por estado 429", () => {
    const expected = "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    expect(authErrorMessage({ code: "over_request_rate_limit", status: 429 })).toBe(expected);
    expect(authErrorMessage({ status: 429 })).toBe(expected);
  });

  it("traduce los fallos de conexión (estado 0 o sin estado ni código)", () => {
    const expected = "No se ha podido conectar con el servidor. Revisa tu conexión.";
    expect(authErrorMessage({ status: 0 })).toBe(expected);
    expect(authErrorMessage({ code: "request_timeout", status: 504 })).toBe(expected);
    expect(authErrorMessage({})).toBe(expected);
  });

  it("usa un mensaje genérico para cualquier otro error", () => {
    const expected = "No se ha podido iniciar sesión. Inténtalo de nuevo.";
    expect(authErrorMessage({ code: "unexpected_failure", status: 500 })).toBe(expected);
    expect(authErrorMessage({ code: "codigo_desconocido", status: 400 })).toBe(expected);
    expect(authErrorMessage({ status: 500 })).toBe(expected);
    expect(authErrorMessage({ code: "toString", status: 400 })).toBe(expected);
  });
});
