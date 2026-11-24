import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { OrderStatusStamp } from "@/components/order-status-stamp";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { Stamp } from "@/components/ui/stamp";
import { requireUser } from "@/lib/auth";
import { buildDashboard, monthName } from "@/lib/domain/dashboard";
import { formatDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { orderReference } from "@/lib/domain/order";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Order, Product } from "@/lib/types";

export const metadata: Metadata = {
  title: "Panel",
};

type ProductRow = Pick<Product, "id" | "nombre" | "sku" | "stock" | "stock_minimo">;

type OrderQueryRow = Pick<Order, "id" | "estado" | "total_cents" | "created_at"> & {
  clientes: Pick<Customer, "nombre"> | null;
};

const LINK = "text-ink underline decoration-rule underline-offset-4 hover:decoration-ink";

const LOW_STOCK_COLUMNS: ReadonlyArray<LedgerColumn<ProductRow>> = [
  {
    key: "nombre",
    header: "Producto",
    cell: (product) => (
      <Link href={`/productos/${product.id}`} className={cx("font-medium", LINK)}>
        {product.nombre}
      </Link>
    ),
  },
  {
    key: "sku",
    header: "SKU",
    className: "figures whitespace-nowrap text-ink-soft",
    cell: (product) =>
      product.sku ?? (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only">Sin SKU</span>
        </>
      ),
  },
  { key: "stock", header: "Stock", numeric: true, cell: (product) => product.stock },
  {
    key: "minimo",
    header: "Mínimo",
    numeric: true,
    className: "text-ink-soft",
    cell: (product) => product.stock_minimo,
  },
  {
    key: "aviso",
    header: "Aviso",
    className: "w-32",
    cell: () => <Stamp tone="alert">Stock bajo</Stamp>,
  },
];

const LATEST_COLUMNS: ReadonlyArray<LedgerColumn<OrderQueryRow>> = [
  {
    key: "referencia",
    header: "Referencia",
    className: "figures whitespace-nowrap",
    cell: (order) => (
      <Link href={`/pedidos/${order.id}`} className={cx("font-medium", LINK)}>
        {orderReference(order.id)}
      </Link>
    ),
  },
  {
    key: "fecha",
    header: "Fecha",
    className: "figures whitespace-nowrap text-ink-soft",
    cell: (order) => <time dateTime={order.created_at}>{formatDate(order.created_at)}</time>,
  },
  { key: "cliente", header: "Cliente", cell: (order) => order.clientes?.nombre ?? "—" },
  { key: "total", header: "Total", numeric: true, cell: (order) => formatCents(order.total_cents) },
  {
    key: "estado",
    header: "Estado",
    className: "w-32",
    cell: (order) => <OrderStatusStamp status={order.estado} />,
  },
];

/** Cifra del resumen: etiqueta en membrete, número grande en Plex Mono y una nota pequeña. */
function Figure({
  label,
  value,
  note,
  lead = false,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  lead?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-2 py-5", className)}>
      <dt className="letterhead text-ink-soft">{label}</dt>
      <dd
        className={cx(
          "figures leading-none text-ink",
          lead ? "text-[40px] sm:text-[56px]" : "text-[32px] sm:text-[40px]",
        )}
      >
        {value}
      </dd>
      {note && <dd className="text-[13px] leading-snug text-ink-soft">{note}</dd>}
    </div>
  );
}

function SectionTitle({ id, title, link }: { id: string; title: string; link: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 id={id} className="font-serif text-[24px] leading-tight font-medium text-ink">
        {title}
      </h2>
      {link}
    </div>
  );
}

export default async function PanelPage() {
  await requireUser();

  const supabase = await createClient();
  const [productsResult, ordersResult] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, sku, stock, stock_minimo")
      .overrideTypes<ProductRow[], { merge: false }>(),
    supabase
      .from("pedidos")
      .select("id, estado, total_cents, created_at, clientes(nombre)")
      .order("created_at", { ascending: false })
      .overrideTypes<OrderQueryRow[], { merge: false }>(),
  ]);

  if (productsResult.error || ordersResult.error) {
    throw new Error("No se ha podido cargar el panel.");
  }

  const now = new Date();
  const { inventory, month, previousMonth, pending, latest } = buildDashboard(
    productsResult.data,
    ordersResult.data,
    now,
  );
  const current = monthName(month.key);
  const previous = monthName(previousMonth.key);
  const lowCount = inventory.lowStock.length;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            Sección 01 · Panel · <span className="figures">{formatDate(now.toISOString())}</span>
          </>
        }
        title="Panel"
        actions={<ButtonLink href="/pedidos/nuevo">Nuevo pedido</ButtonLink>}
      />

      <section aria-labelledby="resumen" className="rule-thick">
        <h2 id="resumen" className="sr-only">
          Resumen
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          <Figure
            lead
            label={`Ingresos de ${current}`}
            value={formatCents(month.revenueCents)}
            note={
              <>
                Pedidos enviados y pendientes; los cancelados no cuentan. En {previous}:{" "}
                <span className="figures">{formatCents(previousMonth.revenueCents)}</span>.
              </>
            }
            className="rule-dashed col-span-2 pt-0 sm:col-span-4"
          />
          <Figure
            label={`Pedidos de ${current}`}
            value={month.orders}
            note={
              <>
                {month.cancelled > 0 && (
                  <>
                    Sin contar <span className="figures">{month.cancelled}</span>{" "}
                    {month.cancelled === 1 ? "cancelado" : "cancelados"}.{" "}
                  </>
                )}
                En {previous}: <span className="figures">{previousMonth.orders}</span>.
              </>
            }
            className="pr-4"
          />
          <Figure
            label="Pendientes de enviar"
            value={pending}
            note={
              pending > 0 ? (
                <Link href="/pedidos?estado=pendiente" className={LINK}>
                  Ver pedidos pendientes
                </Link>
              ) : (
                "No hay pedidos por enviar."
              )
            }
            className="border-l border-rule pl-4 sm:pr-4"
          />
          <Figure
            label="Productos"
            value={inventory.products}
            note={
              lowCount > 0 ? (
                <span className="text-stamp-red">
                  <span className="figures">{lowCount}</span> bajo mínimo
                </span>
              ) : (
                "Ninguno bajo mínimo."
              )
            }
            className="border-t border-rule pr-4 [border-top-style:dashed] sm:border-t-0 sm:border-l sm:pl-4"
          />
          <Figure
            label="Unidades en stock"
            value={inventory.units}
            note="Sumando todos los productos."
            className="border-t border-l border-rule pl-4 [border-top-style:dashed] sm:border-t-0"
          />
        </dl>
      </section>

      <section aria-labelledby="stock-bajo" className="mt-12">
        <SectionTitle
          id="stock-bajo"
          title="Stock bajo mínimo"
          link={
            <Link href="/productos" className={cx("letterhead", LINK)}>
              Ver productos
            </Link>
          }
        />
        <LedgerTable
          caption="Productos bajo mínimo, primero los que más se alejan del mínimo"
          columns={LOW_STOCK_COLUMNS}
          rows={inventory.lowStock}
          rowKey={(product) => product.id}
          minWidth={560}
          empty={
            inventory.products === 0 ? (
              <EmptyState
                title="Aún no hay productos."
                description="Cuando des de alta productos, aquí verás los que necesitan reponerse."
                action={
                  <ButtonLink href="/productos/nuevo" variant="secondary">
                    Nuevo producto
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                title="Ningún producto está bajo mínimo."
                description="Todos tienen más unidades que su stock mínimo."
              />
            )
          }
        />
      </section>

      <section aria-labelledby="ultimos-pedidos" className="mt-12">
        <SectionTitle
          id="ultimos-pedidos"
          title="Últimos pedidos"
          link={
            <Link href="/pedidos" className={cx("letterhead", LINK)}>
              Ver todos los pedidos
            </Link>
          }
        />
        <LedgerTable
          caption="Últimos pedidos, del más reciente al más antiguo"
          columns={LATEST_COLUMNS}
          rows={latest}
          rowKey={(order) => order.id}
          minWidth={600}
          empty={
            <EmptyState
              title="Aún no hay pedidos."
              description="Los pedidos que hagas aparecerán aquí, con su estado y su total."
            />
          }
        />
      </section>
    </>
  );
}
