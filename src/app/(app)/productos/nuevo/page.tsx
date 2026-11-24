import type { Metadata } from "next";
import { createProduct } from "@/app/(app)/productos/actions";
import { ProductForm } from "@/app/(app)/productos/product-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Nuevo producto",
};

const EMPTY = { nombre: "", sku: "", precio: "", stock: "0", stock_minimo: "0" };

export default async function NuevoProductoPage() {
  await requireUser();

  return (
    <>
      <PageHeader eyebrow="Sección 02 · Productos · Alta" title="Nuevo producto" />
      <ProductForm action={createProduct} defaults={EMPTY} submitLabel="Guardar producto" pendingLabel="Guardando…" />
    </>
  );
}
