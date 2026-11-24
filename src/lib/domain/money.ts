const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

const THOUSANDS_WITH_COMMA_DECIMALS = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;
const COMMA_DECIMALS = /^(\d+)(?:,(\d{1,2}))?$/;
const DOT_DECIMALS = /^(\d+)\.(\d{1,2})$/;

/** Formatea un importe en céntimos como euros, p. ej. 1250 → "12,50 €". */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("El importe debe ser un número entero de céntimos.");
  }
  return euroFormatter.format(cents / 100);
}

/**
 * Escribe un importe en céntimos tal como se teclea en un campo de precio, p. ej. 1250 → "12,50"
 * (coma decimal, sin miles ni símbolo). `parseEuros` lo vuelve a leer sin perder nada.
 */
export function formatEurosInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("El importe debe ser un número entero de céntimos, igual o mayor que cero.");
  }
  const euros = Math.trunc(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${euros},${rest}`;
}

/**
 * Convierte un importe escrito por la persona ("12,50", "1.234,56", "12.50 €")
 * en céntimos. Devuelve null si está vacío, es negativo o no es un importe válido.
 */
export function parseEuros(input: string): number | null {
  const text = input.trim().replace(/^€\s*/, "").replace(/\s*€$/, "");
  if (text === "") {
    return null;
  }

  const match =
    THOUSANDS_WITH_COMMA_DECIMALS.exec(text) ??
    COMMA_DECIMALS.exec(text) ??
    DOT_DECIMALS.exec(text);
  if (!match) {
    return null;
  }

  const euros = Number(match[1].replaceAll(".", ""));
  const decimals = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = euros * 100 + decimals;

  return Number.isSafeInteger(cents) ? cents : null;
}
