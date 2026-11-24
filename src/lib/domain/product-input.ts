import { z } from "@/lib/zod";
import { parseEuros } from "@/lib/domain/money";

/** Precio máximo de un producto: 1.000.000,00 € (cabe de sobra en la columna `integer`). */
export const MAX_PRICE_CENTS = 100_000_000;
/** Stock y stock mínimo máximos (caben de sobra en la columna `integer`). */
export const MAX_QUANTITY = 1_000_000_000;

const NAME_MAX = 120;
const SKU_MAX = 40;

const WHOLE_NUMBER = /^\d+$/;
const NEGATIVE_WHOLE_NUMBER = /^-\d+$/;

const price = z
  .string("Escribe el precio.")
  .trim()
  .min(1, "Escribe el precio.")
  .transform((text, ctx) => {
    if (text.startsWith("-")) {
      ctx.addIssue({ code: "custom", message: "El precio no puede ser negativo." });
      return z.NEVER;
    }
    const cents = parseEuros(text);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Escribe un precio válido, por ejemplo 12,50." });
      return z.NEVER;
    }
    if (cents > MAX_PRICE_CENTS) {
      ctx.addIssue({ code: "custom", message: "El precio no puede ser mayor de 1.000.000,00 €." });
      return z.NEVER;
    }
    return cents;
  });

/** Cantidad entera ≥ 0 escrita en un campo de texto ("12"). `label` empieza la frase de error. */
function quantity(label: string, missing: string) {
  return z
    .string(missing)
    .trim()
    .min(1, missing)
    .transform((text, ctx) => {
      if (NEGATIVE_WHOLE_NUMBER.test(text)) {
        ctx.addIssue({ code: "custom", message: `${label} no puede ser negativo.` });
        return z.NEVER;
      }
      if (!WHOLE_NUMBER.test(text)) {
        ctx.addIssue({ code: "custom", message: `${label} tiene que ser un número entero, sin decimales.` });
        return z.NEVER;
      }
      const value = Number(text);
      if (value > MAX_QUANTITY) {
        ctx.addIssue({ code: "custom", message: `${label} no puede ser mayor de 1.000.000.000.` });
        return z.NEVER;
      }
      return value;
    });
}

/**
 * Datos del formulario de producto (todo llega como texto) convertidos a las columnas de
 * `public.productos`: el precio "12,50" pasa a 1250 céntimos y un SKU vacío se guarda como null.
 */
export const productInputSchema = z
  .object({
    nombre: z
      .string("Escribe el nombre del producto.")
      .trim()
      .min(1, "Escribe el nombre del producto.")
      .max(NAME_MAX, `El nombre no puede tener más de ${NAME_MAX} caracteres.`),
    sku: z
      .string()
      .trim()
      .max(SKU_MAX, `El SKU no puede tener más de ${SKU_MAX} caracteres.`)
      .optional()
      .transform((text) => (text ? text : null)),
    precio: price,
    stock: quantity("El stock", "Escribe el stock."),
    stock_minimo: quantity("El stock mínimo", "Escribe el stock mínimo."),
  })
  .transform(({ precio, ...rest }) => ({ ...rest, precio_cents: precio }));

export type ProductInput = z.output<typeof productInputSchema>;
export type ProductInputField = keyof z.input<typeof productInputSchema>;
