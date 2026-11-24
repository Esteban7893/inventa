import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusStamp } from "@/components/order-status-stamp";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { orderReference } from "@/lib/domain/order";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Order, OrderLine, OrderStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Pedidos",
};

type OrderQueryRow = Pick<Order, "id" | "estado" | "total_cents" | "created_at"> & {
  clientes: Pick<Customer, "nombre"> | null;
  pedido_lineas: Pick<OrderLine, "cantidad">[];
};

type OrderRow = Pick<Order, "id" | "estado" | "total_cents" | "created_at"> & {
  cliente: string;
  lineas: number;
  unidades: number;
};

/** Filtros del listado, en el orden en que se muestran. `null` es "Todos". */
const FILTERS: ReadonlyArray<{ status: OrderStatus | null; label: string; empty: string }> = [
  { status: null, label: "Todos", empty: "" },
  { status: "pendiente", label: "Pendientes", empty: "No hay pedidos pendientes." },
  { status: "enviado", label: "Enviados", empty: "No hay pedidos enviados." },
  { status: "cancelado", label: "Cancelados", empty: "No hay pedidos cancelados." },
];

const COLUMNS: ReadonlyArray<LedgerColumn<OrderRow>> = [
  {
    key: "referencia",
    header: "Referencia",
    className: "figures whitespace-nowrap",
    cell: (order) => (
      <Link
        href={`/pedidos/${order.id}`}
        className="font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
      >
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
  { key: "cliente", header: "Cliente", cell: (order) => order.cliente },
  { key: "lineas", header: "Líneas", numeric: true, className: "text-ink-soft", cell: (order) => order.lineas },
  { key: "unidades", header: "Uds.", numeric: true, cell: (order) => order.unidades },
  { key: "total", header: "Total", numeric: true, cell: (order) => formatCents(order.total_cents) },
  {
    key: "estado",
    header: "Estado",
    className: "w-32",
    cell: (order) => <OrderStatusStamp status={order.estado} />,
  },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function readStatus(value: string | string[] | undefined): OrderStatus | null {
  const found = FILTERS.find((filter) => filter.status !== null && filter.status === value);
  return found?.status ?? null;
}

function filterHref(status: OrderStatus | null): string {
  return status ? `/pedidos?estado=${status}` : "/pedidos";
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();
  const status = readStatus((await searchParams).estado);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, estado, total_cents, created_at, clientes(nombre), pedido_lineas(cantidad)")
    .order("created_at", { ascending: false })
    .overrideTypes<OrderQueryRow[], { merge: false }>();

  if (error) {
    throw new Error("No se han podido cargar los pedidos.");
  }

  const orders: OrderRow[] = data.map(({ clientes, pedido_lineas, ...order }) => ({
    ...order,
    cliente: clientes?.nombre ?? "—",
    lineas: pedido_lineas.length,
    unidades: pedido_lineas.reduce((sum, line) => sum + line.cantidad, 0),
  }));
  const pendingCount = orders.filter((order) => order.estado === "pendiente").length;
  const shown = status ? orders.filter((order) => order.estado === status) : orders;
  const activeFilter = FILTERS.find((filter) => filter.status === status) ?? FILTERS[0];

  return (
    <>
      <PageHeader
        eyebrow="Sección 04 · Pedidos"
        title="Pedidos"
        actions={orders.length > 0 ? <ButtonLink href="/pedidos/nuevo">Nuevo pedido</ButtonLink> : null}
      />

      {orders.length === 0 ? (
        <EmptyState
          title="Aún no hay pedidos."
          description="Crea el primero: elige un cliente, añade productos y el stock se descuenta al guardarlo."
          action={<ButtonLink href="/pedidos/nuevo">Nuevo pedido</ButtonLink>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <p className="letterhead text-ink-soft">
              {plural(orders.length, "pedido", "pedidos")}
              {" · "}
              {plural(pendingCount, "pendiente", "pendientes")}
            </p>
            <nav aria-label="Filtrar por estado">
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {FILTERS.map((filter) => {
                  const active = filter.status === status;
                  return (
                    <li key={filter.label}>
                      <Link
                        href={filterHref(filter.status)}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "letterhead inline-block border-b-[1.5px] pb-0.5 transition-colors",
                          active
                            ? "border-ink text-ink"
                            : "border-transparent text-ink-soft hover:border-rule hover:text-ink",
                        )}
                      >
                        {filter.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          <LedgerTable
            caption={
              status
                ? `Pedidos ${activeFilter.label.toLowerCase()}, del más reciente al más antiguo`
                : "Pedidos, del más reciente al más antiguo"
            }
            columns={COLUMNS}
            rows={shown}
            rowKey={(order) => order.id}
            minWidth={760}
            empty={
              <EmptyState
                title={activeFilter.empty}
                action={
                  <ButtonLink href="/pedidos" variant="secondary">
                    Ver todos los pedidos
                  </ButtonLink>
                }
              />
            }
          />
        </>
      )}
    </>
  );
}
