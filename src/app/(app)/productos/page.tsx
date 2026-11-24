import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { Stamp } from "@/components/ui/stamp";
import { requireUser } from "@/lib/auth";
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

const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

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

export default async function ProductosPage() {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, sku, precio_cents, stock, stock_minimo")
    .overrideTypes<Omit<ProductRow, "low">[], { merge: false }>();

  if (error) {
    throw new Error("No se han podido cargar los productos.");
  }

  const products: ProductRow[] = data
    .map((product) => ({ ...product, low: isLowStock(product.stock, product.stock_minimo) }))
    .sort((a, b) => byName.compare(a.nombre, b.nombre));
  const lowCount = products.filter((product) => product.low).length;

  return (
    <>
      <PageHeader
        eyebrow="Sección 02 · Productos"
        title="Productos"
        actions={<ButtonLink href="/productos/nuevo">Nuevo producto</ButtonLink>}
      />

      {products.length > 0 && (
        <p className="letterhead mb-4 text-ink-soft">
          {plural(products.length, "producto", "productos")}
          {" · "}
          <span className={lowCount > 0 ? "text-stamp-red" : undefined}>
            {lowCount === 0 ? "ninguno bajo mínimo" : `${lowCount} bajo mínimo`}
          </span>
        </p>
      )}

      <LedgerTable
        caption="Productos ordenados por nombre"
        columns={COLUMNS}
        rows={products}
        rowKey={(product) => product.id}
        minWidth={680}
        empty={
          <EmptyState
            title="Aún no hay productos."
            description="Da de alta el primero con «Nuevo producto» para empezar a llevar el stock."
          />
        }
      />
    </>
  );
}
