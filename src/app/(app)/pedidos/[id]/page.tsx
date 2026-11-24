import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { z } from "zod";
import { cancelOrder, shipOrder } from "@/app/(app)/pedidos/actions";
import { OrderActions } from "@/app/(app)/pedidos/order-actions";
import { OrderStatusStamp, orderStatusLabel } from "@/components/order-status-stamp";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { lineSubtotal, orderReference } from "@/lib/domain/order";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Order, OrderLine, Product } from "@/lib/types";

type LineRow = Pick<OrderLine, "id" | "cantidad" | "precio_unit_cents"> & {
  productos: Pick<Product, "nombre" | "sku"> | null;
};

type OrderDetail = Pick<Order, "id" | "estado" | "total_cents" | "created_at" | "enviado_at" | "cancelado_at"> & {
  clientes: Pick<Customer, "nombre" | "email" | "telefono"> | null;
  pedido_lineas: LineRow[];
};

const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

const COLUMNS: ReadonlyArray<LedgerColumn<LineRow>> = [
  {
    key: "producto",
    header: "Producto",
    cell: (line) => (
      <span className="flex flex-col gap-0.5">
        <span className="text-ink">{line.productos?.nombre ?? "Producto no disponible"}</span>
        {line.productos?.sku && <span className="figures text-[13px] whitespace-nowrap text-ink-soft">{line.productos.sku}</span>}
      </span>
    ),
  },
  { key: "cantidad", header: "Cantidad", numeric: true, cell: (line) => line.cantidad },
  {
    key: "precio",
    header: "Precio",
    numeric: true,
    className: "text-ink-soft",
    cell: (line) => formatCents(line.precio_unit_cents),
  },
  { key: "subtotal", header: "Subtotal", numeric: true, cell: (line) => formatCents(lineSubtotal(line)) },
];

function Missing({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-ink-soft">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function Entry({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-rule py-2 last:border-b-0">
      <dt className="letterhead text-ink-soft">{term}</dt>
      <dd className="text-right text-[15px] text-ink">{children}</dd>
    </div>
  );
}

type Props = { params: Promise<{ id: string }> };

/**
 * Carga el pedido o lanza `notFound()`. Con `cache`, el título de la pestaña y la página
 * comparten una sola consulta; si no existe, la pestaña también lleva el título del 404.
 */
const loadOrder = cache(async (id: string): Promise<OrderDetail> => {
  await requireUser();
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("pedidos")
    .select(
      "id, estado, total_cents, created_at, enviado_at, cancelado_at, clientes(nombre, email, telefono), pedido_lineas(id, cantidad, precio_unit_cents, productos(nombre, sku))",
    )
    .eq("id", id)
    .maybeSingle<OrderDetail>();

  if (error) {
    throw new Error("No se ha podido cargar el pedido.");
  }
  if (!order) {
    notFound();
  }
  return order;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const order = await loadOrder((await params).id);
  return { title: `Albarán ${orderReference(order.id)}` };
}

export default async function PedidoPage({ params }: Props) {
  const order = await loadOrder((await params).id);

  const reference = orderReference(order.id);
  const customer = order.clientes;
  const lines = [...order.pedido_lineas].sort((a, b) =>
    byName.compare(a.productos?.nombre ?? "", b.productos?.nombre ?? ""),
  );
  const units = lines.reduce((sum, line) => sum + line.cantidad, 0);

  return (
    <article aria-label={`Albarán ${reference}`}>
      <PageHeader
        eyebrow="Sección 04 · Pedidos · Albarán"
        title={
          <>
            Albarán <span className="figures text-[0.8em] font-normal tracking-normal">{reference}</span>
          </>
        }
        actions={<OrderStatusStamp status={order.estado} />}
      />

      <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
        <section aria-label="Destinatario">
          <h2 className="letterhead rule-thick pb-1.5 text-ink">
            Destinatario
          </h2>
          {customer ? (
            <div className="flex flex-col gap-1 pt-3 text-[15px]">
              <p className="font-serif text-[22px] leading-snug text-ink">{customer.nombre}</p>
              <p className="text-ink-soft">{customer.email ?? <Missing label="Sin email" />}</p>
              <p className="figures text-ink-soft">{customer.telefono ?? <Missing label="Sin teléfono" />}</p>
            </div>
          ) : (
            <p className="pt-3 text-[15px] text-ink-soft">Cliente no disponible.</p>
          )}
        </section>

        <section aria-label="Datos del pedido">
          <h2 className="letterhead rule-thick pb-1.5 text-ink">
            Datos del pedido
          </h2>
          <dl className="pt-1">
            <Entry term="Referencia">
              <span className="figures">{reference}</span>
            </Entry>
            <Entry term="Fecha">
              <time dateTime={order.created_at} className="figures">
                {formatDateTime(order.created_at)}
              </time>
            </Entry>
            <Entry term="Estado">{orderStatusLabel(order.estado)}</Entry>
            {order.enviado_at && (
              <Entry term="Enviado">
                <time dateTime={order.enviado_at} className="figures">
                  {formatDateTime(order.enviado_at)}
                </time>
              </Entry>
            )}
            {order.cancelado_at && (
              <Entry term="Cancelado">
                <time dateTime={order.cancelado_at} className="figures">
                  {formatDateTime(order.cancelado_at)}
                </time>
              </Entry>
            )}
          </dl>
        </section>
      </div>

      <section aria-label="Líneas del pedido" className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="letterhead text-ink">
            Líneas
          </h2>
          <p className="letterhead text-ink-soft">
            {lines.length} {lines.length === 1 ? "línea" : "líneas"} · {units} {units === 1 ? "unidad" : "unidades"}
          </p>
        </div>
        <LedgerTable
          caption={`Líneas del pedido ${reference}`}
          columns={COLUMNS}
          rows={lines}
          rowKey={(line) => line.id}
          minWidth={340}
          doubleRuleFooter
          footer={{
            producto: <span className="letterhead text-ink">Total</span>,
            subtotal: <span className="text-[18px]">{formatCents(order.total_cents)}</span>,
          }}
          empty={<EmptyState title="Este pedido no tiene líneas." />}
        />
        {order.estado === "cancelado" && (
          <p className="mt-4 text-sm text-ink-soft">
            Pedido cancelado: sus unidades volvieron al stock al cancelarlo.
          </p>
        )}
      </section>

      <OrderActions
        pending={order.estado === "pendiente"}
        ship={shipOrder.bind(null, order.id)}
        cancel={cancelOrder.bind(null, order.id)}
        reference={reference}
      />

      <div className="mt-12 print:hidden">
        <ButtonLink href="/pedidos" variant="secondary" size="sm">
          Volver a pedidos
        </ButtonLink>
      </div>
    </article>
  );
}
