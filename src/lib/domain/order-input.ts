import { z } from "@/lib/zod";
import { parseQuantity, validateLines, type LineErrors } from "@/lib/domain/order";
import type { CreateOrderArgs } from "@/lib/types";

/** Máximo de líneas de un pedido (un albarán razonable; evita peticiones desmesuradas). */
export const MAX_ORDER_LINES = 100;

/**
 * Opciones que traen los desplegables de cliente y de producto del formulario de pedido.
 * Con más, el desplegable muestra los primeros por orden alfabético y la página lo avisa.
 */
export const ORDER_FORM_OPTIONS = 500;

const TEXT_MAX = 64;

const MESSAGES = {
  shape: "Revisa los datos del pedido.",
  fields: "Revisa los campos marcados.",
  lines: "Revisa las líneas marcadas.",
  customer: "Elige un cliente.",
  tooManyLines: `Un pedido no puede tener más de ${MAX_ORDER_LINES} líneas.`,
} as const;

const uuid = z.uuid();

function isUuid(text: string): boolean {
  return uuid.safeParse(text).success;
}

/**
 * Lo que envía el formulario de nuevo pedido: el cliente y, por línea, el producto y la
 * cantidad tal como se teclearon. Nunca precios ni totales: si llegan, se descartan.
 * Se convierte en los argumentos de `crear_pedido` validando con `validateLines`.
 */
export const orderInputSchema = z
  .object({
    cliente_id: z.string().max(TEXT_MAX),
    lineas: z.array(
      z.object({
        producto_id: z.string().max(TEXT_MAX),
        cantidad: z.string().max(TEXT_MAX),
      }),
    ),
  })
  .transform((input, ctx): CreateOrderArgs => {
    const clienteId = input.cliente_id.trim();
    if (!isUuid(clienteId)) {
      ctx.addIssue({ code: "custom", path: ["cliente_id"], message: MESSAGES.customer });
    }

    if (input.lineas.length > MAX_ORDER_LINES) {
      ctx.addIssue({ code: "custom", path: ["lineas"], message: MESSAGES.tooManyLines });
      return z.NEVER;
    }

    const result = validateLines(
      input.lineas.map((line) => {
        const productId = line.producto_id.trim();
        return { producto_id: isUuid(productId) ? productId : "", cantidad: parseQuantity(line.cantidad) };
      }),
    );

    if (!result.ok) {
      if (result.lineErrors.length === 0) {
        ctx.addIssue({ code: "custom", path: ["lineas"], message: result.error });
      }
      result.lineErrors.forEach((errors, index) => {
        for (const field of ["producto_id", "cantidad"] as const) {
          const message = errors[field];
          if (message) {
            ctx.addIssue({ code: "custom", path: ["lineas", index, field], message });
          }
        }
      });
      return z.NEVER;
    }

    return { p_cliente_id: clienteId, p_lineas: result.lines };
  });

export type OrderInput = z.input<typeof orderInputSchema>;

/** Errores del formulario de pedido: un mensaje general, el del cliente y los de cada línea. */
export type OrderInputErrors = {
  error: string;
  clienteError?: string;
  /** Por posición de línea; una posición sin errores es `{}` (o no existe). */
  lineErrors: LineErrors[];
};

/** Reparte los errores de `orderInputSchema` entre el formulario, el cliente y cada línea. */
export function orderInputErrors(error: z.ZodError): OrderInputErrors {
  if (error.issues.some((issue) => issue.code !== "custom")) {
    return { error: MESSAGES.shape, lineErrors: [] };
  }

  let clienteError: string | undefined;
  let linesError: string | undefined;
  const lineErrors: LineErrors[] = [];

  for (const issue of error.issues) {
    const [first, index, field] = issue.path;
    if (first === "cliente_id") {
      clienteError ??= issue.message;
    } else if (first === "lineas" && index === undefined) {
      linesError ??= issue.message;
    } else if (first === "lineas" && typeof index === "number" && (field === "producto_id" || field === "cantidad")) {
      for (let position = lineErrors.length; position <= index; position += 1) {
        lineErrors.push({});
      }
      lineErrors[index][field] ??= issue.message;
    }
  }

  const general = linesError ?? (clienteError ? MESSAGES.fields : MESSAGES.lines);
  return clienteError ? { error: general, clienteError, lineErrors } : { error: general, lineErrors };
}
