import type { Metadata } from "next";
import { OrderForm } from "@/app/(app)/pedidos/order-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Nuevo pedido",
};

const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export default async function NuevoPedidoPage() {
  await requireUser();

  const supabase = await createClient();
  const [customersResult, productsResult] = await Promise.all([
    supabase.from("clientes").select("id, nombre"),
    supabase.from("productos").select("id, nombre, sku, precio_cents, stock"),
  ]);

  if (customersResult.error || productsResult.error) {
    throw new Error("No se han podido cargar los clientes y los productos.");
  }

  const customers = [...customersResult.data].sort((a, b) => byName.compare(a.nombre, b.nombre));
  const products = [...productsResult.data].sort((a, b) => byName.compare(a.nombre, b.nombre));

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
        // Se vuelve a montar (key) si cambian los datos: el stock y los precios que se ven
        // son los últimos guardados, también al volver a una página que Next tenía oculta.
        <OrderForm key={JSON.stringify([customers, products])} customers={customers} products={products} />
      )}
    </>
  );
}
