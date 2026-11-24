/**
 * Listados paginados (productos, clientes): lectura de `searchParams`, páginas y búsqueda.
 * Nada de esto toca Supabase: las páginas lo usan para construir la consulta y los enlaces.
 */

/** Valor de un parámetro de búsqueda tal como llega en `searchParams` de Next. */
export type SearchParamValue = string | string[] | undefined;

/** Filas por página en los listados de productos y clientes. */
export const LIST_PAGE_SIZE = 50;

/** Página más alta que se acepta en la URL (evita desplazamientos enormes en la consulta). */
export const MAX_PAGE = 1000;

/** Longitud máxima del texto de búsqueda. */
export const SEARCH_MAX_LENGTH = 100;

const WHOLE_NUMBER = /^\d+$/;

/** Primer valor de un parámetro (`?q=a&q=b` → "a"). */
export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Número de página de la URL. Cualquier valor que no sea un entero entre 1 y `MAX_PAGE`
 * (vacío, "abc", "0", "-2", "1.5", "99999") es la página 1: un enlace manipulado nunca falla.
 */
export function parsePage(value: SearchParamValue): number {
  const text = firstParam(value)?.trim() ?? "";
  if (!WHOLE_NUMBER.test(text)) {
    return 1;
  }
  const page = Number(text);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

/** Texto de búsqueda: sin espacios sobrantes y como mucho `SEARCH_MAX_LENGTH` caracteres. `null` si queda vacío. */
export function parseSearch(value: SearchParamValue): string | null {
  const text = (firstParam(value) ?? "").replace(/\s+/g, " ").trim();
  if (text === "") {
    return null;
  }
  return Array.from(text).slice(0, SEARCH_MAX_LENGTH).join("").trim();
}

/** Filas de una página para `.range(from, to)` de Supabase (ambos incluidos). */
export function pageRange(page: number, size: number = LIST_PAGE_SIZE): { from: number; to: number } {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1) {
    throw new RangeError("La página y el tamaño tienen que ser enteros mayores que cero.");
  }
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}

/** Número de páginas para `total` filas (al menos 1, aunque no haya filas). */
export function pageCount(total: number, size: number = LIST_PAGE_SIZE): number {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(size) || size < 1) {
    throw new RangeError("El total tiene que ser un entero igual o mayor que cero.");
  }
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Patrón de `ilike` que busca `text` en cualquier parte, con `%`, `_` y `\` del texto
 * escapados: buscar "50%" encuentra "50%", no todo lo que empieza por 50.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * Filtro `or` de PostgREST que busca `text` en varias columnas con `ilike`, p. ej.
 * `nombre.ilike."%caf%",sku.ilike."%caf%"`. El valor va entre comillas dobles (con `"` y `\`
 * escapados) para que comas, puntos, dos puntos o paréntesis del texto no rompan el filtro.
 * PostgREST trata un `*` en un patrón de `ilike` como `%`: un asterisco en la búsqueda
 * funciona como comodín (no hay forma de escaparlo), lo que no hace ningún daño.
 */
export function searchFilter(columns: ReadonlyArray<string>, text: string): string {
  if (columns.length === 0) {
    throw new RangeError("Hace falta al menos una columna.");
  }
  const quoted = `"${containsPattern(text).replace(/[\\"]/g, "\\$&")}"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}

/**
 * Enlace a un listado con sus parámetros. Se omiten los vacíos y la página 1, para que la
 * primera página tenga siempre la misma URL (`/productos`, no `/productos?pagina=1`).
 */
export function listHref(path: string, params: Readonly<Record<string, string | number | null | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    if (key === "pagina" && value === 1) {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
