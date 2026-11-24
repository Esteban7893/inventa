"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage } from "@/lib/domain/db-errors";
import { productInputSchema, type ProductInputField } from "@/lib/domain/product-input";
import { firstFieldErrors, readTextFields, type ActionResult, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ProductFormState = FormState<ProductInputField>;

const FIELDS = ["nombre", "sku", "precio", "stock", "stock_minimo"] as const satisfies readonly ProductInputField[];

const productIdSchema = z.uuid();

const SESSION_EXPIRED = "Tu sesión ha caducado. Vuelve a entrar.";
const NOT_FOUND = "El producto no existe o ya no está disponible.";
const CHECK_FIELDS = "Revisa los campos marcados.";
const UNIQUE_VIOLATION = "23505";

async function saveProduct(id: string | null, formData: FormData): Promise<ProductFormState> {
  const values = readTextFields(formData, FIELDS);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED, values };
  }

  const parsed = productInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: CHECK_FIELDS, fieldErrors: firstFieldErrors(parsed.error, FIELDS), values };
  }

  const { data, error } = id
    ? await supabase.from("productos").update(parsed.data).eq("id", id).select("id")
    : await supabase.from("productos").insert(parsed.data).select("id");

  if (error) {
    const message = dbErrorMessage(error);
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: CHECK_FIELDS, fieldErrors: { sku: message }, values };
    }
    return { ok: false, error: message, values };
  }
  if (data.length === 0) {
    return { ok: false, error: NOT_FOUND, values };
  }

  revalidatePath("/productos");
  // La ficha muestra el stock y sus movimientos (un cambio de stock deja un ajuste).
  revalidatePath("/productos/[id]", "page");
  revalidatePath("/panel");
  redirect("/productos");
}

/** Da de alta un producto. El dueño lo pone la base de datos (`owner_id default auth.uid()`). */
export async function createProduct(_prev: ProductFormState | null, formData: FormData): Promise<ProductFormState> {
  return saveProduct(null, formData);
}

/** Guarda los cambios de un producto. Se usa con `updateProduct.bind(null, id)`. */
export async function updateProduct(
  id: string,
  _prev: ProductFormState | null,
  formData: FormData,
): Promise<ProductFormState> {
  if (!productIdSchema.safeParse(id).success) {
    return { ok: false, error: NOT_FOUND };
  }
  return saveProduct(id, formData);
}

/**
 * Borra un producto. Se usa con `deleteProduct.bind(null, id)`. Si aparece en algún pedido,
 * la base de datos lo impide (`on delete restrict`) y se explica a la persona.
 */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED };
  }
  if (!productIdSchema.safeParse(id).success) {
    return { ok: false, error: NOT_FOUND };
  }

  const { data, error } = await supabase.from("productos").delete().eq("id", id).select("id");
  if (error) {
    return { ok: false, error: dbErrorMessage(error) };
  }
  if (data.length === 0) {
    return { ok: false, error: NOT_FOUND };
  }

  revalidatePath("/productos");
  revalidatePath("/panel");
  redirect("/productos");
}
