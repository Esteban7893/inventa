"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { customerInputSchema, type CustomerInputField } from "@/lib/domain/customer-input";
import { dbErrorMessage } from "@/lib/domain/db-errors";
import { firstFieldErrors, readTextFields, type ActionResult, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type CustomerFormState = FormState<CustomerInputField>;

const FIELDS = ["nombre", "email", "telefono"] as const satisfies readonly CustomerInputField[];

const customerIdSchema = z.uuid();

const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a entrar.";
const NOT_FOUND = "El cliente no existe o ya no está disponible.";
const CHECK_FIELDS = "Revisa los campos marcados.";

async function saveCustomer(id: string | null, formData: FormData): Promise<CustomerFormState> {
  const values = readTextFields(formData, FIELDS);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED, values };
  }

  const parsed = customerInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: CHECK_FIELDS, fieldErrors: firstFieldErrors(parsed.error, FIELDS), values };
  }

  const { data, error } = id
    ? await supabase.from("clientes").update(parsed.data).eq("id", id).select("id")
    : await supabase.from("clientes").insert(parsed.data).select("id");

  if (error) {
    return { ok: false, error: dbErrorMessage(error), values };
  }
  if (data.length === 0) {
    return { ok: false, error: NOT_FOUND, values };
  }

  revalidatePath("/clientes");
  revalidatePath("/panel");
  redirect("/clientes");
}

/** Da de alta un cliente. El dueño lo pone la base de datos (`owner_id default auth.uid()`). */
export async function createCustomer(_prev: CustomerFormState | null, formData: FormData): Promise<CustomerFormState> {
  return saveCustomer(null, formData);
}

/** Guarda los cambios de un cliente. Se usa con `updateCustomer.bind(null, id)`. */
export async function updateCustomer(
  id: string,
  _prev: CustomerFormState | null,
  formData: FormData,
): Promise<CustomerFormState> {
  if (!customerIdSchema.safeParse(id).success) {
    return { ok: false, error: NOT_FOUND };
  }
  return saveCustomer(id, formData);
}

/**
 * Borra un cliente. Se usa con `deleteCustomer.bind(null, id)`. Si tiene pedidos, la base de
 * datos lo impide (`on delete restrict`) y se explica a la persona.
 */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED };
  }
  if (!customerIdSchema.safeParse(id).success) {
    return { ok: false, error: NOT_FOUND };
  }

  const { data, error } = await supabase.from("clientes").delete().eq("id", id).select("id");
  if (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (data.length === 0) {
    return { ok: false, error: NOT_FOUND };
  }

  revalidatePath("/clientes");
  revalidatePath("/panel");
  redirect("/clientes");
}
