import type { CreateOrderLine, OrderStatus } from "@/lib/types";

/** Cantidad máxima de una línea (el stock nunca pasa de 1.000.000.000, así que nunca alcanza). */
export const MAX_LINE_QUANTITY = 1_000_000_000;

const WHOLE_NUMBER = /^\d+$/;
const REFERENCE_LENGTH = 8;

/** Línea con su precio: el guardado en `pedido_lineas` o, en el formulario, el del catálogo. */
export type PricedLine = {
  cantidad: number;
  precio_unit_cents: number;
};

/** Línea tal como la va escribiendo la persona: el producto puede faltar ("") y la cantidad ser NaN. */
export type DraftLine = {
  producto_id: string;
  cantidad: number;
};

/** Errores de una línea, junto a cada campo. */
export type LineErrors = {
  producto_id?: string;
  cantidad?: string;
};

export type LinesValidation =
  | { ok: true; lines: CreateOrderLine[] }
  | {
      ok: false;
      /** Mensaje general, sobre el formulario. */
      error: string;
      /** Errores de cada línea, en el mismo orden que las líneas recibidas. */
      lineErrors: LineErrors[];
    };

const MESSAGES = {
  empty: "Añade al menos una línea al pedido.",
  check: "Revisa las líneas marcadas.",
  product: "Elige un producto.",
  quantity: "La cantidad tiene que ser un número entero mayor que cero.",
  quantityMax: "La cantidad no puede ser mayor de 1.000.000.000.",
} as const;

function repeatedMessage(firstLine: number): string {
  return `Este producto ya está en la línea ${firstLine}. Junta las cantidades en una sola línea.`;
}

/** Subtotal de una línea en céntimos: cantidad × precio unitario. */
export function lineSubtotal({ cantidad, precio_unit_cents }: PricedLine): number {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw new RangeError("La cantidad tiene que ser un número entero mayor que cero.");
  }
  if (!Number.isSafeInteger(precio_unit_cents) || precio_unit_cents < 0) {
    throw new RangeError("El precio tiene que ser un número entero de céntimos, igual o mayor que cero.");
  }
  const subtotal = cantidad * precio_unit_cents;
  if (!Number.isSafeInteger(subtotal)) {
    throw new RangeError("El subtotal de la línea es demasiado alto.");
  }
  return subtotal;
}

/**
 * Total de un pedido en céntimos: suma de los subtotales. Sin líneas vale 0.
 * En el formulario es orientativo: el total que se guarda lo calcula la base de datos.
 */
export function orderTotal(lines: ReadonlyArray<PricedLine>): number {
  let total = 0;
  for (const line of lines) {
    total += lineSubtotal(line);
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("El total del pedido es demasiado alto.");
    }
  }
  return total;
}

/** Lee una cantidad escrita como texto ("3"). Devuelve NaN si no es un entero sin signo. */
export function parseQuantity(text: string): number {
  const trimmed = text.trim();
  if (!WHOLE_NUMBER.test(trimmed)) {
    return Number.NaN;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : Number.NaN;
}

function quantityError(cantidad: number): string | undefined {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    return MESSAGES.quantity;
  }
  if (cantidad > MAX_LINE_QUANTITY) {
    return MESSAGES.quantityMax;
  }
  return undefined;
}

/**
 * Valida las líneas de un pedido antes de llamar a `crear_pedido`: al menos una línea,
 * un producto elegido en cada una, cantidades enteras mayores que cero y ningún producto
 * repetido (se marca la línea que repite, con el número de la primera).
 * El stock no se comprueba aquí: lo decide la base de datos al crear el pedido.
 */
export function validateLines(lines: ReadonlyArray<DraftLine>): LinesValidation {
  if (lines.length === 0) {
    return { ok: false, error: MESSAGES.empty, lineErrors: [] };
  }

  const firstLineByProduct = new Map<string, number>();
  const lineErrors = lines.map((line, index): LineErrors => {
    const errors: LineErrors = {};

    if (line.producto_id === "") {
      errors.producto_id = MESSAGES.product;
    } else {
      const first = firstLineByProduct.get(line.producto_id);
      if (first === undefined) {
        firstLineByProduct.set(line.producto_id, index + 1);
      } else {
        errors.producto_id = repeatedMessage(first);
      }
    }

    const cantidad = quantityError(line.cantidad);
    if (cantidad) {
      errors.cantidad = cantidad;
    }
    return errors;
  });

  if (lineErrors.some((errors) => errors.producto_id || errors.cantidad)) {
    return { ok: false, error: MESSAGES.check, lineErrors };
  }

  return {
    ok: true,
    lines: lines.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
  };
}

/** Referencia corta de un pedido para mostrarla: "Nº " y los 8 primeros caracteres del id. */
export function orderReference(id: string): string {
  if (id.length < REFERENCE_LENGTH) {
    throw new RangeError("El id del pedido es demasiado corto.");
  }
  return `Nº ${id.slice(0, REFERENCE_LENGTH).toUpperCase()}`;
}

/** Comprueba en tiempo de ejecución si un valor es uno de los estados válidos de un pedido. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return value === "pendiente" || value === "enviado" || value === "cancelado";
}

/**
 * Estrecha el `estado` devuelto por Postgres (columna `text` con `check`) al tipo `OrderStatus`.
 * Si llegase un valor inesperado, falla en el acto en lugar de propagarlo sin comprobar.
 */
export function parseOrderStatus(value: string): OrderStatus {
  if (isOrderStatus(value)) {
    return value;
  }
  throw new RangeError(`Estado de pedido no reconocido: ${value}`);
}
