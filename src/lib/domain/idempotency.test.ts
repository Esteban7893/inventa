import { describe, expect, it } from "vitest";
import { idempotencyKeySchema, renewsIdempotencyKey } from "@/lib/domain/idempotency";

describe("idempotencyKeySchema", () => {
  it("acepta un uuid v4 como los de crypto.randomUUID()", () => {
    expect(idempotencyKeySchema.safeParse("9b2f4c1e-8a52-4d0e-9a4b-1f2c3d4e5f60").success).toBe(true);
    expect(idempotencyKeySchema.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  it("rechaza una clave vacía, ausente, que no es un uuid o que no es de texto", () => {
    for (const value of ["", " ", "no-es-un-uuid", "9b2f4c1e8a524d0e9a4b1f2c3d4e5f60", undefined, null, 42, {}]) {
      expect(idempotencyKeySchema.safeParse(value).success, String(value)).toBe(false);
    }
  });

  it("rechaza uuid de otras versiones y el uuid nulo", () => {
    expect(idempotencyKeySchema.safeParse("9b2f4c1e-8a52-1d0e-9a4b-1f2c3d4e5f60").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("00000000-0000-0000-0000-000000000000").success).toBe(false);
  });

  it("rechaza espacios alrededor (la clave no se recorta: tiene que llegar tal cual)", () => {
    expect(idempotencyKeySchema.safeParse(" 9b2f4c1e-8a52-4d0e-9a4b-1f2c3d4e5f60").success).toBe(false);
  });
});

describe("renewsIdempotencyKey", () => {
  it("usa una clave nueva después de crear el pedido", () => {
    expect(renewsIdempotencyKey("created")).toBe(true);
  });

  it("usa una clave nueva después de CLAVE_REUTILIZADA", () => {
    expect(renewsIdempotencyKey("key-reused")).toBe(true);
  });

  it("conserva la clave si no llegó respuesta, para que el reintento no duplique el pedido", () => {
    expect(renewsIdempotencyKey("no-response")).toBe(false);
  });

  it("conserva la clave tras un error de la acción (no se guardó nada)", () => {
    expect(renewsIdempotencyKey("rejected")).toBe(false);
  });
});
