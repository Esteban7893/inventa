import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatTime } from "@/lib/domain/dates";
import { listHref, pageCount, pageRange } from "@/lib/domain/listing";
import { orderReference } from "@/lib/domain/order";
import {
  MOVEMENT_PAGE_SIZE,
  formatStockDelta,
  movementReasonLabel,
  parseMovementReason,
} from "@/lib/domain/stock-movements";
import { createClient } from "@/lib/supabase/server";
import type { StockMovement } from "@/lib/types";

type MovementRow = Pick<StockMovement, "id" | "created_at" | "delta" | "motivo" | "pedido_id">;

/** PostgREST responde así cuando la página pedida está más allá de la última. */
const PAGE_OUT_OF_RANGE = "PGRST103";

/** Ancla de la sección: los enlaces de página vuelven a ella y no al principio de la ficha. */
const SECTION_ID = "movimientos";

/** Enlace al albarán del pedido del movimiento (pedido o cancelación). */
function OrderLink({ orderId }: { orderId: string }) {
  const reference = orderReference(orderId);
  return (
    <Link
      href={`/pedidos/${orderId}`}
      aria-label={`Albarán ${reference}`}
      className="figures text-[13px] whitespace-nowrap text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
    >
      {reference}
    </Link>
  );
}

/**
 * Tres columnas para que quepa a 375 px sin scroll: la fecha parte la hora en otra línea en
 * móvil, y el albarán del pedido va bajo el motivo.
 */
const COLUMNS: ReadonlyArray<LedgerColumn<MovementRow>> = [
  {
    key: "fecha",
    header: "Fecha",
    className: "figures whitespace-nowrap text-ink-soft",
    cell: (movement) => (
      <time dateTime={movement.created_at}>
        {formatDate(movement.created_at)}
        <span className="block sm:ml-2 sm:inline">{formatTime(movement.created_at)}</span>
      </time>
    ),
  },
  {
    key: "motivo",
    header: "Motivo",
    cell: (movement) => (
      <span className="flex flex-col gap-0.5">
        <span className="text-ink">{movementReasonLabel(movement.motivo)}</span>
        {movement.pedido_id && <OrderLink orderId={movement.pedido_id} />}
      </span>
    ),
  },
  { key: "delta", header: "Unidades", numeric: true, cell: (movement) => formatStockDelta(movement.delta) },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type Props = {
  productId: string;
  /** Página de movimientos pedida en la URL (`?pagina=`), ya validada con `parsePage`. */
  page: number;
};

/**
 * Sección «Movimientos» de la ficha de producto: los cambios de stock, del más reciente al
 * más antiguo, de `MOVEMENT_PAGE_SIZE` en `MOVEMENT_PAGE_SIZE` (índice
 * `movimientos_stock_producto_fecha_idx`). RLS solo deja ver los movimientos propios.
 */
export async function StockMovements({ productId, page }: Props) {
  const { from, to } = pageRange(page, MOVEMENT_PAGE_SIZE);
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("movimientos_stock")
    .select("id, created_at, delta, motivo, pedido_id", { count: "exact" })
    .eq("producto_id", productId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const outOfRange = error?.code === PAGE_OUT_OF_RANGE;
  if (error && !outOfRange) {
    throw new Error("No se han podido cargar los movimientos del producto.");
  }

  const movements: MovementRow[] = (data ?? []).map((movement) => ({
    ...movement,
    motivo: parseMovementReason(movement.motivo),
  }));
  const total = count ?? 0;
  const pages = pageCount(total, MOVEMENT_PAGE_SIZE);
  const hrefFor = (target: number) => `${listHref(`/productos/${productId}`, { pagina: target })}#${SECTION_ID}`;

  return (
    <section id={SECTION_ID} aria-labelledby={`${SECTION_ID}-titulo`} className="mt-12 scroll-mt-6">
      <div className="rule-thick mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-1.5">
        <h2 id={`${SECTION_ID}-titulo`} className="letterhead text-ink">
          Movimientos
        </h2>
        {total > 0 && (
          <p className="letterhead figures text-ink-soft">{plural(total, "movimiento", "movimientos")}</p>
        )}
      </div>

      {outOfRange ? (
        <EmptyState
          title="Esta página de movimientos no existe."
          description="El producto tiene menos movimientos."
          action={
            <ButtonLink href={hrefFor(1)} variant="secondary">
              Ver los más recientes
            </ButtonLink>
          }
        />
      ) : (
        <LedgerTable
          caption="Movimientos de stock del producto, del más reciente al más antiguo"
          columns={COLUMNS}
          rows={movements}
          rowKey={(movement) => String(movement.id)}
          minWidth={340}
          empty={
            <EmptyState
              title="Aún no hay movimientos."
              description="Cada pedido, cancelación o cambio de stock de este producto quedará anotado aquí."
            />
          }
        />
      )}

      {!outOfRange && (
        <Pagination
          label="Páginas de movimientos"
          previousHref={page > 1 ? hrefFor(page - 1) : null}
          nextHref={page < pages ? hrefFor(page + 1) : null}
          previousLabel="← Más recientes"
          nextLabel="Más antiguos →"
          status={`Página ${page} de ${pages}`}
        />
      )}
    </section>
  );
}
