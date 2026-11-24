"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, isReusedKeyError } from "@/lib/domain/db-errors";
import { idempotencyKeySchema } from "@/lib/domain/idempotency";
import { orderInputErrors, orderInputSchema, type OrderInputErrors } from "@/lib/domain/order-input";
import type { ActionResult } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * Resultado de `createOrder` cuando no se crea el pedido (si se crea, redirige al albarán).
 * `keyReused`: la clave ya se usó con otro contenido; el formulario usará una nueva.
 */
export type CreateOrderResult = { ok: false; keyReused?: true } & OrderInputErrors;

const orderIdSchema = z.uuid();

const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a entrar.";
const NOT_FOUND = "El pedido no existe o ya no está disponible.";
const GENERIC = "No se ha podido completar la operación. Inténtalo de nuevo.";
const RELOAD = "No se ha podido enviar el pedido. Recarga la página e inténtalo de nuevo.";

/** Lo que cambia al crear o cancelar un pedido: pedidos, su albarán, el stock de los productos y el panel. */
function revalidateOrders(orderId: string) {
  revalidatePath("/panel");
  revalidatePath("/pedidos");
  revalidatePath("/pedidos/nuevo");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/productos");
  revalidatePath("/productos/[id]", "page");
}

/**
 * Crea un pedido con `crear_pedido`. Solo envía el cliente y, por línea, el producto y la
 * cantidad: los precios y el total los pone la base de datos, que también comprueba el stock
 * y lo descuenta en la misma operación. Si todo va bien, redirige al albarán del pedido.
 *
 * `idempotencyKey` es la clave del envío (un uuid v4 que crea el formulario). Es obligatoria:
 * si el mismo envío llega dos veces (doble clic, reintento tras perder la respuesta), la base
 * de datos devuelve el mismo pedido en vez de crear otro y descontar el stock otra vez (D30).
 */
export async function createOrder(input: unknown, idempotencyKey: unknown): Promise<CreateOrderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED, lineErrors: [] };
  }

  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, ...orderInputErrors(parsed.error) };
  }

  // Sin una clave válida no se llama a la base de datos: un pedido sin clave no sería idempotente.
  const key = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!key.success) {
    return { ok: false, error: RELOAD, lineErrors: [] };
  }

  const { data, error } = await supabase.rpc("crear_pedido", { ...parsed.data, p_idempotency_key: key.data });
  if (error) {
    const message = dbErrorMessage(error);
    return isReusedKeyError(error)
      ? { ok: false, keyReused: true, error: message, lineErrors: [] }
      : { ok: false, error: message, lineErrors: [] };
  }

  const orderId = orderIdSchema.safeParse(data);
  if (!orderId.success) {
    return { ok: false, error: GENERIC, lineErrors: [] };
  }

  revalidateOrders(orderId.data);
  redirect(`/pedidos/${orderId.data}`);
}

async function changeStatus(fn: "enviar_pedido" | "cancelar_pedido", id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const parsed = orderIdSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, error: NOT_FOUND };
  }

  const { error } = await supabase.rpc(fn, { p_pedido_id: parsed.data });
  // También si se rechaza: p. ej. otra pestaña ya lo envió o canceló, y el albarán
  // tiene que enseñar su estado real junto al aviso.
  revalidateOrders(parsed.data);
  if (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
  return { ok: true };
}

/** Marca un pedido pendiente como enviado. Se usa con `shipOrder.bind(null, id)`. */
export async function shipOrder(id: string): Promise<ActionResult> {
  return changeStatus("enviar_pedido", id);
}

/**
 * Cancela un pedido pendiente: la base de datos devuelve su stock una sola vez.
 * Se usa con `cancelOrder.bind(null, id)`.
 */
export async function cancelOrder(id: string): Promise<ActionResult> {
  return changeStatus("cancelar_pedido", id);
}
