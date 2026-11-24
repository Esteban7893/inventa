import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { deleteProduct, updateProduct } from "@/app/(app)/productos/actions";
import { ProductForm } from "@/app/(app)/productos/product-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageHeader } from "@/components/ui/page-header";
import { Stamp } from "@/components/ui/stamp";
import { requireUser } from "@/lib/auth";
import { formatEurosInput } from "@/lib/domain/money";
import { isLowStock } from "@/lib/domain/stock";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

type ProductDetail = Pick<Product, "id" | "nombre" | "sku" | "precio_cents" | "stock" | "stock_minimo">;

type Props = { params: Promise<{ id: string }> };

/**
 * Carga el producto o lanza `notFound()`. Con `cache`, el título de la pestaña y la página
 * comparten una sola consulta; si no existe, la pestaña también lleva el título del 404.
 */
const loadProduct = cache(async (id: string): Promise<ProductDetail> => {
  await requireUser();
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("productos")
    .select("id, nombre, sku, precio_cents, stock, stock_minimo")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("No se ha podido cargar el producto.");
  }
  if (!product) {
    notFound();
  }
  return product;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await loadProduct((await params).id);
  return { title: product.nombre };
}

export default async function EditarProductoPage({ params }: Props) {
  const product = await loadProduct((await params).id);

  // El formulario se vuelve a montar (key) si cambian los datos guardados: Next conserva
  // oculta la página ya visitada, con lo que se tecleó, y al volver mostraría valores viejos.
  const defaults = {
    nombre: product.nombre,
    sku: product.sku ?? "",
    precio: formatEurosInput(product.precio_cents),
    stock: String(product.stock),
    stock_minimo: String(product.stock_minimo),
  };

  return (
    <>
      <PageHeader
        eyebrow="Sección 02 · Productos · Ficha"
        title={product.nombre}
        actions={isLowStock(product.stock, product.stock_minimo) ? <Stamp tone="alert">Stock bajo</Stamp> : null}
      />
      <ProductForm
        key={JSON.stringify(defaults)}
        action={updateProduct.bind(null, product.id)}
        defaults={defaults}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
      />
      <ConfirmDelete
        action={deleteProduct.bind(null, product.id)}
        label="Borrar producto"
        question={`¿Seguro que quieres borrar «${product.nombre}»? No se puede deshacer.`}
        description="El producto desaparecerá del libro. Si aparece en algún pedido no se podrá borrar."
      />
    </>
  );
}
