import { describe, expect, it } from "vitest";
import {
  isCursorTimestamp,
  orderListHref,
  orderPageErrorMessage,
  parseOrderCursor,
  splitOrderPage,
} from "@/lib/domain/order-cursor";

const ID = "3f2b8c1e-9a4d-4e7f-8b6a-0c1d2e3f4a5b";
const CREATED_AT = "2026-11-24T10:30:00.123456+00:00";

describe("isCursorTimestamp", () => {
  it("acepta el texto que devuelve PostgREST, con microsegundos", () => {
    expect(isCursorTimestamp(CREATED_AT)).toBe(true);
    expect(isCursorTimestamp("2026-11-24T10:30:00+00:00")).toBe(true);
    expect(isCursorTimestamp("2026-11-24T10:30:00.5Z")).toBe(true);
    expect(isCursorTimestamp("2026-11-24T10:30:00-05:30")).toBe(true);
  });

  it("acepta el 29 de febrero solo en años bisiestos", () => {
    expect(isCursorTimestamp("2028-02-29T00:00:00Z")).toBe(true);
    expect(isCursorTimestamp("2026-02-29T00:00:00Z")).toBe(false);
  });

  it("rechaza fechas que no existen o con más de 6 decimales", () => {
    for (const text of [
      "",
      "ayer",
      "2026-11-24",
      "2026-13-01T00:00:00Z",
      "2026-11-31T00:00:00Z",
      "2026-11-24T24:00:00Z",
      "2026-11-24T10:60:00Z",
      "2026-11-24T10:30:60Z",
      "2026-11-24T10:30:00.1234567Z",
      "2026-11-24T10:30:00+16:00",
      "0000-01-01T00:00:00Z",
      "2026-11-24T10:30:00 00:00",
      "2026-11-24T10:30:00Z; drop table pedidos",
    ]) {
      expect(isCursorTimestamp(text), text).toBe(false);
    }
  });
});

describe("parseOrderCursor", () => {
  it("sin parámetros es la primera página", () => {
    expect(parseOrderCursor(undefined, undefined)).toEqual({ kind: "none" });
    expect(parseOrderCursor("", " ")).toEqual({ kind: "none" });
  });

  it("lee un cursor válido sin tocar el texto de la fecha", () => {
    expect(parseOrderCursor(CREATED_AT, ID)).toEqual({ kind: "ok", cursor: { createdAt: CREATED_AT, id: ID } });
  });

  it("pasa el id a minúsculas y usa el primer valor de una lista", () => {
    expect(parseOrderCursor([CREATED_AT, "x"], [ID.toUpperCase()])).toEqual({
      kind: "ok",
      cursor: { createdAt: CREATED_AT, id: ID },
    });
  });

  it("un cursor a medias o manipulado no es válido", () => {
    expect(parseOrderCursor(CREATED_AT, undefined)).toEqual({ kind: "invalid" });
    expect(parseOrderCursor(undefined, ID)).toEqual({ kind: "invalid" });
    expect(parseOrderCursor("2026-02-30T00:00:00Z", ID)).toEqual({ kind: "invalid" });
    expect(parseOrderCursor(CREATED_AT, "no-es-un-uuid")).toEqual({ kind: "invalid" });
    // Un "+" sin codificar en la URL llega como espacio.
    expect(parseOrderCursor("2026-11-24T10:30:00.123456 00:00", ID)).toEqual({ kind: "invalid" });
  });
});

describe("splitOrderPage", () => {
  const rows = [
    { id: "c", created_at: "2026-11-24T10:00:00.000003+00:00" },
    { id: "b", created_at: "2026-11-24T10:00:00.000002+00:00" },
    { id: "a", created_at: "2026-11-24T10:00:00.000001+00:00" },
  ];

  it("si llega una fila de más, hay página siguiente desde la última mostrada", () => {
    expect(splitOrderPage(rows, 2)).toEqual({
      rows: rows.slice(0, 2),
      next: { createdAt: "2026-11-24T10:00:00.000002+00:00", id: "b" },
    });
  });

  it("conserva los microsegundos del cursor", () => {
    expect(splitOrderPage(rows, 1).next?.createdAt).toBe("2026-11-24T10:00:00.000003+00:00");
  });

  it("si no llega ninguna de más, es la última página", () => {
    expect(splitOrderPage(rows, 3)).toEqual({ rows, next: null });
    expect(splitOrderPage(rows, 5)).toEqual({ rows, next: null });
    expect(splitOrderPage([], 5)).toEqual({ rows: [], next: null });
  });

  it("rechaza un tamaño que no es un entero positivo", () => {
    expect(() => splitOrderPage(rows, 0)).toThrow(RangeError);
    expect(() => splitOrderPage(rows, 1.5)).toThrow(RangeError);
  });
});

describe("orderListHref", () => {
  it("sin filtro ni cursor es /pedidos", () => {
    expect(orderListHref(null)).toBe("/pedidos");
  });

  it("lleva el filtro de estado", () => {
    expect(orderListHref("pendiente")).toBe("/pedidos?estado=pendiente");
  });

  it("codifica el cursor para que el + de la zona horaria no se pierda", () => {
    const href = orderListHref("enviado", { createdAt: CREATED_AT, id: ID });
    expect(href).toBe(`/pedidos?estado=enviado&antes=2026-11-24T10%3A30%3A00.123456%2B00%3A00&antes_id=${ID}`);
    const params = new URL(href, "http://inventa.test").searchParams;
    expect(parseOrderCursor(params.get("antes") ?? undefined, params.get("antes_id") ?? undefined)).toEqual({
      kind: "ok",
      cursor: { createdAt: CREATED_AT, id: ID },
    });
  });
});

describe("orderPageErrorMessage", () => {
  it("traduce los errores del enlace y de la sesión", () => {
    expect(orderPageErrorMessage({ message: "CURSOR_INVALIDO" })).toBe(
      "El enlace de esta página de pedidos no es válido. Vuelve a la primera página.",
    );
    expect(orderPageErrorMessage({ message: "FILTRO_INVALIDO" })).toBe(
      "Ese filtro de estado no existe. Elige uno de la lista.",
    );
    expect(orderPageErrorMessage({ message: "NO_AUTENTICADO" })).toBe("Tu sesión ha caducado. Vuelve a entrar.");
  });

  it("una fecha que Postgres no acepta (22xxx) se explica como enlace no válido", () => {
    expect(orderPageErrorMessage({ code: "22008", message: 'date/time field value out of range: "x"' })).toBe(
      "El enlace de esta página de pedidos no es válido. Vuelve a la primera página.",
    );
    expect(orderPageErrorMessage({ code: "22007", message: "invalid input syntax" })).toBe(
      "El enlace de esta página de pedidos no es válido. Vuelve a la primera página.",
    );
  });

  it("cualquier otro error no se explica en la página (es un fallo de la app)", () => {
    expect(orderPageErrorMessage({ code: "42501", message: "permission denied" })).toBeNull();
    expect(orderPageErrorMessage({ code: "PGRST202", message: "Could not find the function" })).toBeNull();
    expect(orderPageErrorMessage({})).toBeNull();
  });
});
