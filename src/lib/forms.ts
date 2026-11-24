import type { z } from "zod";

/** Resultado de una Server Action de formulario, para `useActionState`. */
export type FormState<Field extends string> =
  | { ok: true }
  | {
      ok: false;
      /** Mensaje general en español, sobre el formulario. */
      error: string;
      /** Mensaje junto a cada campo. */
      fieldErrors?: Partial<Record<Field, string>>;
      /** Lo que escribió la persona, para no perderlo al mostrar los errores. */
      values?: Partial<Record<Field, string>>;
    };

/** Resultado de una Server Action sin campos (p. ej. borrar). */
export type ActionResult = { ok: true } | { ok: false; error: string };

/** Lee del `FormData` solo los campos de texto indicados (ignora archivos y campos que no llegan). */
export function readTextFields<Field extends string>(
  formData: FormData,
  fields: readonly Field[],
): Partial<Record<Field, string>> {
  const values: Partial<Record<Field, string>> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") {
      values[field] = value;
    }
  }
  return values;
}

/** Primer mensaje de error de `zod` de cada campo. */
export function firstFieldErrors<Field extends string>(
  error: z.ZodError,
  fields: readonly Field[],
): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const issue of error.issues) {
    const field = fields.find((name) => name === issue.path[0]);
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
