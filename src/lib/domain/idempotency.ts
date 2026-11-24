import { z } from "@/lib/zod";

/**
 * Clave de idempotencia de un envío del formulario de pedido (D30). El navegador la crea con
 * `crypto.randomUUID()` (un uuid v4) y la base de datos la guarda en `pedidos.idempotency_key`:
 * repetir el envío con la misma clave y el mismo contenido devuelve el mismo pedido.
 */
export const idempotencyKeySchema = z.uuid({ version: "v4" });

/**
 * Cómo acabó un envío del formulario:
 * - `created`: el pedido se guardó (la acción redirige a su albarán).
 * - `rejected`: la acción respondió con un error (stock, validación…): no se guardó nada.
 * - `key-reused`: la clave ya se había usado con otro contenido (`CLAVE_REUTILIZADA`).
 * - `no-response`: no llegó respuesta (red caída, servidor sin responder): no se sabe si se guardó.
 */
export type SubmitOutcome = "created" | "rejected" | "key-reused" | "no-response";

/**
 * ¿El siguiente envío necesita una clave nueva?
 * - Tras crear el pedido, sí: el siguiente es otro pedido y, con la misma clave, la base de
 *   datos devolvería el anterior o daría `CLAVE_REUTILIZADA`.
 * - Tras `CLAVE_REUTILIZADA`, sí: la persona ya sabe que se guardó un pedido con esa clave y,
 *   si vuelve a enviar, quiere otro; con la misma clave no podría crearlo nunca.
 * - Sin respuesta, no: si el pedido llegó a guardarse, reintentar con la misma clave devuelve
 *   ese pedido en vez de crear otro. Si además cambió el contenido, la base de datos lo rechaza
 *   con `CLAVE_REUTILIZADA` en lugar de crear un segundo pedido sin avisar.
 * - Tras un error de la acción, no: no se guardó nada y la clave sigue libre en la base de datos.
 */
export function renewsIdempotencyKey(outcome: SubmitOutcome): boolean {
  return outcome === "created" || outcome === "key-reused";
}
