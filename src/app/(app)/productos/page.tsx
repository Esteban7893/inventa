import type { Metadata } from "next";
import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Stamp } from "@/components/ui/stamp";
import { requireUser } from "@/lib/auth";
import { readPanelSummary } from "@/lib/domain/dashboard";
import {
  PAGE_OUT_OF_RANGE_CODE,
  isPageOutOfRange,
  listHref,
  pageCount,
  pageRange,
  parsePage,
  parseSearch,
  searchFilter,
} from "@/lib/domain/listing";
import { formatCents } from "@/lib/domain/money";
import { isLowStock } from "@/lib/domain/stock";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export const metadata: Metadata = {
  title: "Productos",
};

type ProductRow = Pick<Product, "id" | "nombre" | "sku" | "precio_cents" | "stock" | "stock_minimo"> & {
  low: boolean;
};

const COLUMNS: ReadonlyArray<LedgerColumn<ProductRow>> = [
  {
    key: "nombre",
    header: "Producto",
    cell: (product) => (
      <Link
        href={`/productos/${product.id}`}
        className="font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
      >
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
  { key: "precio", header: "Precio", numeric: true, cell: (product) => formatCents(product.precio_cents) },
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
    cell: (product) => (product.low ? <Stamp tone="alert">Stock bajo</Stamp> : null),
  },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();
  const params = await searchParams;
  const query = parseSearch(params.q);
  const page = parsePage(params.pagina);
  const { from, to } = pageRange(page);

  const supabase = await createClient();
  // El orden por nombre lo da la colación es_natural de la base de datos (como en español).
  let request = supabase
    .from("productos")
    .select("id, nombre, sku, precio_cents, stock, stock_minimo", { count: "exact" })
    .order("nombre")
    .order("id")
    .range(from, to);
  if (query) {
    request = request.or(searchFilter(["nombre", "sku"], query));
  }
  const [result, summaryResult] = await Promise.all([request, supabase.rpc("panel_resumen").single()]);

  if ((result.error && result.error.code !== PAGE_OUT_OF_RANGE_CODE) || summaryResult.error) {
    throw new Error("No se han podido cargar los productos.");
  }

  const products: ProductRow[] = (result.data ?? []).map((product) => ({
    ...product,
    low: isLowStock(product.stock, product.stock_minimo),
  }));
  const { inventory } = readPanelSummary(summaryResult.data);
  const total = result.count ?? 0;
  const pages = pageCount(total);
  // Más allá de la última página, también cuando el total es múltiplo exacto del tamaño.
  const outOfRange = isPageOutOfRange({ page, total: result.count, errorCode: result.error?.code });
  const hrefFor = (target: number) => listHref("/productos", { q: query, pagina: target });

  return (
    <>
      <PageHeader
        eyebrow="Sección 02 · Productos"
        title="Productos"
        actions={<ButtonLink href="/productos/nuevo">Nuevo producto</ButtonLink>}
      />

      {inventory.products > 0 && (
        <>
          <p className="letterhead mb-4 text-ink-soft">
            {plural(inventory.products, "producto", "productos")}
            {" · "}
            <span className={inventory.lowStock > 0 ? "text-stamp-red" : undefined}>
              {inventory.lowStock === 0 ? "ninguno bajo mínimo" : `${inventory.lowStock} bajo mínimo`}
            </span>
          </p>
          <SearchForm action="/productos" label="Buscar por nombre o SKU" query={query} />
          {query && !outOfRange && total > 0 && (
            <p role="status" className="letterhead mb-4 text-ink">
              {plural(total, "producto", "productos")} con «{query}»
            </p>
          )}
        </>
      )}

      {outOfRange ? (
        <EmptyState
          title="Esta página no existe."
          description="El listado tiene menos páginas. Puede que se hayan borrado productos."
          action={
            <ButtonLink href={hrefFor(1)} variant="secondary">
              Ir a la primera página
            </ButtonLink>
          }
        />
      ) : (
        <LedgerTable
          caption="Productos ordenados por nombre"
          columns={COLUMNS}
          rows={products}
          rowKey={(product) => product.id}
          minWidth={680}
          empty={
            query ? (
              <EmptyState
                title={`Ningún producto coincide con «${query}».`}
                description="Prueba con otra parte del nombre o del SKU."
                action={
                  <ButtonLink href="/productos" variant="secondary">
                    Ver todos los productos
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                title="Aún no hay productos."
                description="Da de alta el primero con «Nuevo producto» para empezar a llevar el stock."
              />
            )
          }
        />
      )}

      {!outOfRange && (
        <Pagination
          label="Páginas de productos"
          previousHref={page > 1 ? hrefFor(page - 1) : null}
          nextHref={page < pages ? hrefFor(page + 1) : null}
          status={`Página ${page} de ${pages}`}
        />
      )}
    </>
  );
}
