import { dbErrorMessage, type DbErrorInfo } from "@/lib/domain/db-errors";
import { firstParam, type SearchParamValue } from "@/lib/domain/listing";
import type { OrderStatus } from "@/lib/types";

/**
 * Listado de pedidos paginado por cursor, con la función SQL `pedidos_pagina`: cada página
 * empieza justo después del último pedido de la anterior, según `(created_at, id)`.
 *
 * El `created_at` del cursor es el texto que devuelve PostgREST, con sus microsegundos
 * (p. ej. "2026-11-24T10:30:00.123456+00:00"). Nunca pasa por un `Date` de JavaScript, que
 * lo recortaría a milisegundos y haría saltar o repetir pedidos en el borde de la página.
 */

/** Pedidos por página del listado. */
export const ORDER_PAGE_SIZE = 25;

/** Nombres de los parámetros de la URL del cursor. */
export const CURSOR_PARAMS = { createdAt: "antes", id: "antes_id" } as const;

export type OrderCursor = {
  /** `created_at` del último pedido de la página anterior, tal como lo devolvió PostgREST. */
  createdAt: string;
  id: string;
};

export type ParsedOrderCursor =
  | { kind: "none" }
  | { kind: "ok"; cursor: OrderCursor }
  | { kind: "invalid" };

const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2})(?::?(\d{2}))?)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Indica si `text` es una fecha con hora y zona que Postgres acepta como `timestamptz` sin
 * error: formato ISO 8601 con hasta 6 decimales y fecha que existe (nada de 30 de febrero).
 */
export function isCursorTimestamp(text: string): boolean {
  const match = TIMESTAMP.exec(text);
  if (!match) {
    return false;
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHours = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinutes = match[9] === undefined ? 0 : Number(match[9]);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHours <= 15 &&
    offsetMinutes <= 59
  );
}

/**
 * Lee el cursor de la URL. Sin ninguno de los dos parámetros es la primera página. Si falta
 * uno, o alguno no tiene el formato esperado, es un enlace manipulado o cortado: `invalid`.
 */
export function parseOrderCursor(
  createdAt: SearchParamValue,
  id: SearchParamValue,
): ParsedOrderCursor {
  const createdAtText = firstParam(createdAt)?.trim() ?? "";
  const idText = firstParam(id)?.trim() ?? "";
  if (createdAtText === "" && idText === "") {
    return { kind: "none" };
  }
  if (!isCursorTimestamp(createdAtText) || !UUID.test(idText)) {
    return { kind: "invalid" };
  }
  return { kind: "ok", cursor: { createdAt: createdAtText, id: idText.toLowerCase() } };
}

/**
 * Separa una página pedida con `size + 1` filas: las `size` que se muestran y, si había una
 * más, el cursor de la siguiente página (el último pedido mostrado).
 */
export function splitOrderPage<Row extends { created_at: string; id: string }>(
  rows: ReadonlyArray<Row>,
  size: number = ORDER_PAGE_SIZE,
): { rows: Row[]; next: OrderCursor | null } {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new RangeError("El tamaño de página tiene que ser un entero mayor que cero.");
  }
  const shown = rows.slice(0, size);
  const last = shown[shown.length - 1];
  const next = rows.length > size && last ? { createdAt: last.created_at, id: last.id } : null;
  return { rows: shown, next };
}

/** Enlace al listado de pedidos con su filtro de estado y, si lo hay, el cursor de la página. */
export function orderListHref(status: OrderStatus | null, cursor: OrderCursor | null = null): string {
  const search = new URLSearchParams();
  if (status) {
    search.set("estado", status);
  }
  if (cursor) {
    search.set(CURSOR_PARAMS.createdAt, cursor.createdAt);
    search.set(CURSOR_PARAMS.id, cursor.id);
  }
  const query = search.toString();
  return query ? `/pedidos?${query}` : "/pedidos";
}

/** SQLSTATE de "data exception" (22xxx): p. ej. una fecha del cursor fuera de rango. */
const DATA_EXCEPTION = /^22[0-9A-Z]{3}$/;

/** Errores de `pedidos_pagina` que se explican en la página en vez de mostrar la página de error. */
const EXPLAINED_CODES = new Set(["NO_AUTENTICADO", "CURSOR_INVALIDO", "FILTRO_INVALIDO"]);

/**
 * Mensaje para la persona si `pedidos_pagina` rechaza la petición por el enlace (cursor o
 * filtro manipulados) o por la sesión. `null` si es otro error: ese sí es un fallo de la app.
 */
export function orderPageErrorMessage(error: DbErrorInfo): string | null {
  const text = (error.message ?? "").trim();
  if (EXPLAINED_CODES.has(text)) {
    return dbErrorMessage(error);
  }
  if (error.code && DATA_EXCEPTION.test(error.code)) {
    return dbErrorMessage({ message: "CURSOR_INVALIDO" });
  }
  return null;
}
