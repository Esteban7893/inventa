import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusStamp } from "@/components/order-status-stamp";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/domain/dates";
import { dbErrorMessage } from "@/lib/domain/db-errors";
import { formatCents } from "@/lib/domain/money";
import { orderReference, parseOrderStatus } from "@/lib/domain/order";
import {
  CURSOR_PARAMS,
  ORDER_PAGE_SIZE,
  orderListHref,
  orderPageErrorMessage,
  parseOrderCursor,
  splitOrderPage,
} from "@/lib/domain/order-cursor";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Pedidos",
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

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();
  const params = await searchParams;
  const status = readStatus(params.estado);
  const parsedCursor = parseOrderCursor(params[CURSOR_PARAMS.createdAt], params[CURSOR_PARAMS.id]);
  const cursor = parsedCursor.kind === "ok" ? parsedCursor.cursor : null;

  const supabase = await createClient();
  const [pageResult, totalResult, pendingResult] = await Promise.all([
    // Un cursor manipulado en la URL ni siquiera llega a la base de datos.
    parsedCursor.kind === "invalid"
      ? null
      : supabase.rpc("pedidos_pagina", {
          p_estado: status ?? undefined,
          p_antes_created_at: cursor?.createdAt,
          p_antes_id: cursor?.id,
          // Uno de más para saber si hay página siguiente.
          p_limite: ORDER_PAGE_SIZE + 1,
        }),
    supabase.from("pedidos").select("id", { count: "exact", head: true }),
    supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
  ]);

  if (totalResult.error || pendingResult.error) {
    throw new Error("No se han podido cargar los pedidos.");
  }
  let linkError = parsedCursor.kind === "invalid" ? dbErrorMessage({ message: "CURSOR_INVALIDO" }) : null;
  if (pageResult?.error) {
    linkError = orderPageErrorMessage(pageResult.error);
    if (linkError === null) {
      throw new Error("No se han podido cargar los pedidos.");
    }
  }

  const page = splitOrderPage(
    (pageResult?.data ?? []).map(({ cliente_nombre, estado, ...order }) => ({
      ...order,
      estado: parseOrderStatus(estado),
      cliente: cliente_nombre,
    })),
  );
  const totalCount = totalResult.count ?? 0;
  const pendingCount = pendingResult.count ?? 0;
  const activeFilter = FILTERS.find((filter) => filter.status === status) ?? FILTERS[0];

  return (
    <>
      <PageHeader
        eyebrow="Sección 04 · Pedidos"
        title="Pedidos"
        actions={totalCount > 0 ? <ButtonLink href="/pedidos/nuevo">Nuevo pedido</ButtonLink> : null}
      />

      {totalCount === 0 ? (
        <EmptyState
          title="Aún no hay pedidos."
          description="Crea el primero: elige un cliente, añade productos y el stock se descuenta al guardarlo."
          action={<ButtonLink href="/pedidos/nuevo">Nuevo pedido</ButtonLink>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <p className="letterhead text-ink-soft">
              {plural(totalCount, "pedido", "pedidos")}
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
                        href={orderListHref(filter.status)}
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

          {linkError ? (
            <div className="flex flex-col items-start gap-4">
              <Notice>{linkError}</Notice>
              <ButtonLink href={orderListHref(status)} variant="secondary">
                Ir a la primera página
              </ButtonLink>
            </div>
          ) : (
            <>
              <LedgerTable
                caption={
                  status
                    ? `Pedidos ${activeFilter.label.toLowerCase()}, del más reciente al más antiguo`
                    : "Pedidos, del más reciente al más antiguo"
                }
                columns={COLUMNS}
                rows={page.rows}
                rowKey={(order) => order.id}
                minWidth={760}
                empty={
                  cursor ? (
                    <EmptyState
                      title="No hay pedidos más antiguos."
                      action={
                        <ButtonLink href={orderListHref(status)} variant="secondary">
                          Volver a los más recientes
                        </ButtonLink>
                      }
                    />
                  ) : (
                    <EmptyState
                      title={activeFilter.empty}
                      action={
                        <ButtonLink href="/pedidos" variant="secondary">
                          Ver todos los pedidos
                        </ButtonLink>
                      }
                    />
                  )
                }
              />
              <Pagination
                label="Páginas de pedidos"
                previousHref={cursor ? orderListHref(status) : null}
                previousLabel="← Los más recientes"
                nextHref={page.next ? orderListHref(status, page.next) : null}
                nextLabel="Más antiguos →"
              />
            </>
          )}
        </>
      )}
    </>
  );
}
