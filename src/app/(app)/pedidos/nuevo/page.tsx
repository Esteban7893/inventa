import type { Metadata } from "next";
import { OrderForm } from "@/app/(app)/pedidos/order-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { ORDER_FORM_OPTIONS } from "@/lib/domain/order-input";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Nuevo pedido",
};

export default async function NuevoPedidoPage() {
  await requireUser();

  const supabase = await createClient();
  // Los desplegables traen como mucho ORDER_FORM_OPTIONS filas (una más para saber si hay
  // más), ya ordenadas por nombre por la base de datos (colación es_natural).
  const [customersResult, productsResult] = await Promise.all([
    supabase.from("clientes").select("id, nombre").order("nombre").order("id").limit(ORDER_FORM_OPTIONS + 1),
    supabase
      .from("productos")
      .select("id, nombre, sku, precio_cents, stock")
      .order("nombre")
      .order("id")
      .limit(ORDER_FORM_OPTIONS + 1),
  ]);

  if (customersResult.error || productsResult.error) {
    throw new Error("No se han podido cargar los clientes y los productos.");
  }

  const customers = customersResult.data.slice(0, ORDER_FORM_OPTIONS);
  const products = productsResult.data.slice(0, ORDER_FORM_OPTIONS);
  const truncated = [
    customersResult.data.length > ORDER_FORM_OPTIONS ? "clientes" : null,
    productsResult.data.length > ORDER_FORM_OPTIONS ? "productos" : null,
  ].filter((name) => name !== null);

  return (
    <>
      <PageHeader eyebrow="Sección 04 · Pedidos · Alta" title="Nuevo pedido" />

      {customers.length === 0 ? (
        <EmptyState
          title="Aún no hay clientes."
          description="Para hacer un pedido necesitas al menos un cliente."
          action={<ButtonLink href="/clientes/nuevo">Nuevo cliente</ButtonLink>}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Aún no hay productos."
          description="Para hacer un pedido necesitas al menos un producto en el almacén."
          action={<ButtonLink href="/productos/nuevo">Nuevo producto</ButtonLink>}
        />
      ) : (
        <>
          {truncated.length > 0 && (
            <Notice tone="ink" className="mb-6 max-w-3xl">
              Tienes más de {ORDER_FORM_OPTIONS} {truncated.join(" y ")}: los desplegables muestran los primeros{" "}
              {ORDER_FORM_OPTIONS} por orden alfabético.
            </Notice>
          )}
          {/* Se vuelve a montar (key) si cambian los datos: el stock y los precios que se ven
              son los últimos guardados, también al volver a una página que Next tenía oculta. */}
          <OrderForm key={JSON.stringify([customers, products])} customers={customers} products={products} />
        </>
      )}
    </>
  );
}
