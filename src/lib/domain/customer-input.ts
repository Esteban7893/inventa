import { z } from "zod";

const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_MAX = 30;
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 15;

/** Prefijo `+` opcional al principio y después cifras, espacios, guiones, puntos o paréntesis. */
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;

const EMAIL_MESSAGE = "Escribe un email válido, por ejemplo nombre@empresa.es.";
const PHONE_MESSAGE = `Escribe un teléfono válido: de ${PHONE_MIN_DIGITS} a ${PHONE_MAX_DIGITS} cifras, con espacios o guiones si quieres.`;

const emailFormat = z.email(EMAIL_MESSAGE);

function isPhone(text: string): boolean {
  const digits = text.replace(/\D/g, "").length;
  return PHONE_CHARACTERS.test(text) && digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
}

/** Texto opcional: sin espacios alrededor y `null` si queda vacío o no llega. */
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .optional()
    .transform((text) => (text ? text : null));
}

/**
 * Datos del formulario de cliente convertidos a las columnas de `public.clientes`.
 * El nombre es obligatorio; el email y el teléfono son opcionales pero, si se escriben,
 * tienen que ser válidos.
 */
export const customerInputSchema = z.object({
  nombre: z
    .string("Escribe el nombre del cliente.")
    .trim()
    .min(1, "Escribe el nombre del cliente.")
    .max(NAME_MAX, `El nombre no puede tener más de ${NAME_MAX} caracteres.`),
  email: optionalText(EMAIL_MAX, EMAIL_MESSAGE).refine(
    (text) => text === null || emailFormat.safeParse(text).success,
    EMAIL_MESSAGE,
  ),
  telefono: optionalText(PHONE_MAX, PHONE_MESSAGE).refine(
    (text) => text === null || isPhone(text),
    PHONE_MESSAGE,
  ),
});

export type CustomerInput = z.output<typeof customerInputSchema>;
export type CustomerInputField = keyof z.input<typeof customerInputSchema>;
