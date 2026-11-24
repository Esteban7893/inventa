"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage } from "@/lib/domain/db-errors";
import { orderInputErrors, orderInputSchema, type OrderInputErrors } from "@/lib/domain/order-input";
import type { ActionResult } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import type { CreateOrderArgs, OrderIdArgs } from "@/lib/types";

/** Resultado de `createOrder` cuando no se crea el pedido (si se crea, redirige al albarán). */
export type CreateOrderResult = { ok: false } & OrderInputErrors;

const orderIdSchema = z.uuid();

const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a entrar.";
const NOT_FOUND = "El pedido no existe o ya no está disponible.";
const GENERIC = "No se ha podido completar la operación. Inténtalo de nuevo.";

/** Lo que cambia al crear o cancelar un pedido: pedidos, su albarán y el stock de los productos. */
function revalidateOrders(orderId: string) {
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
 */
export async function createOrder(input: unknown): Promise<CreateOrderResult> {
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

  const args: CreateOrderArgs = parsed.data;
  const { data, error } = await supabase.rpc("crear_pedido", args);
  if (error) {
    return { ok: false, error: dbErrorMessage(error), lineErrors: [] };
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

  const args: OrderIdArgs = { p_pedido_id: parsed.data };
  const { error } = await supabase.rpc(fn, args);
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
