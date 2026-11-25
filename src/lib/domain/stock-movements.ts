/**
 * Movimientos de stock (tabla `movimientos_stock`): cada cambio del stock de un producto
 * queda registrado con su motivo y su delta. Aquí solo está lo que la ficha de producto
 * necesita para mostrarlos; nada toca Supabase.
 */

/** Motivos que guarda la base de datos (`check (motivo in (...))`). */
export const MOVEMENT_REASONS = ["pedido", "cancelacion", "ajuste"] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Movimientos por página en la ficha de producto. */
export const MOVEMENT_PAGE_SIZE = 20;

const LABELS: Readonly<Record<MovementReason, string>> = {
  pedido: "Pedido",
  cancelacion: "Cancelación",
  ajuste: "Ajuste",
};

/** Signo menos tipográfico (U+2212): mismo ancho que el más en Plex Mono. */
const MINUS = "\u2212";

/** Comprueba en tiempo de ejecución si un valor es uno de los motivos válidos. */
export function isMovementReason(value: unknown): value is MovementReason {
  return typeof value === "string" && (MOVEMENT_REASONS as ReadonlyArray<string>).includes(value);
}

/** Motivo leído de la base de datos. Lanza `RangeError` si no es uno de los conocidos. */
export function parseMovementReason(value: string): MovementReason {
  if (!isMovementReason(value)) {
    throw new RangeError("El motivo del movimiento no es válido.");
  }
  return value;
}

/** Motivo para la persona: «Pedido», «Cancelación» o «Ajuste». */
export function movementReasonLabel(reason: MovementReason): string {
  return LABELS[reason];
}

/**
 * Delta con su signo, p. ej. 5 → "+5" y -3 → "−3". La base de datos nunca guarda un delta 0
 * (`check (delta <> 0)`), así que cero o un número que no sea entero lanza `RangeError`.
 */
export function formatStockDelta(delta: number): string {
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new RangeError("El delta tiene que ser un entero distinto de cero.");
  }
  return delta > 0 ? `+${delta}` : `${MINUS}${-delta}`;
}
