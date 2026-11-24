import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SearchForm } from "@/components/search-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/auth";
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
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export const metadata: Metadata = {
  title: "Clientes",
};

type CustomerRow = Pick<Customer, "id" | "nombre" | "email" | "telefono">;

function missing(label: string): ReactNode {
  return (
    <>
      <span aria-hidden="true" className="text-ink-soft">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

const COLUMNS: ReadonlyArray<LedgerColumn<CustomerRow>> = [
  {
    key: "nombre",
    header: "Cliente",
    cell: (customer) => (
      <Link
        href={`/clientes/${customer.id}`}
        className="font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
      >
        {customer.nombre}
      </Link>
    ),
  },
  {
    key: "email",
    header: "Email",
    className: "whitespace-nowrap",
    cell: (customer) => customer.email ?? missing("Sin email"),
  },
  {
    key: "telefono",
    header: "Teléfono",
    className: "figures whitespace-nowrap",
    cell: (customer) => customer.telefono ?? missing("Sin teléfono"),
  },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function ClientesPage({
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
    .from("clientes")
    .select("id, nombre, email, telefono", { count: "exact" })
    .order("nombre")
    .order("id")
    .range(from, to);
  if (query) {
    request = request.or(searchFilter(["nombre", "email"], query));
  }
  const [result, totalResult] = await Promise.all([
    request,
    supabase.from("clientes").select("id", { count: "exact", head: true }),
  ]);

  if ((result.error && result.error.code !== PAGE_OUT_OF_RANGE_CODE) || totalResult.error) {
    throw new Error("No se han podido cargar los clientes.");
  }

  const customers: CustomerRow[] = result.data ?? [];
  const allCustomers = totalResult.count ?? 0;
  const matching = result.count ?? 0;
  const pages = pageCount(matching);
  // Más allá de la última página, también cuando el total es múltiplo exacto del tamaño.
  const outOfRange = isPageOutOfRange({ page, total: result.count, errorCode: result.error?.code });
  const hrefFor = (target: number) => listHref("/clientes", { q: query, pagina: target });

  return (
    <>
      <PageHeader
        eyebrow="Sección 03 · Clientes"
        title="Clientes"
        actions={<ButtonLink href="/clientes/nuevo">Nuevo cliente</ButtonLink>}
      />

      {allCustomers > 0 && (
        <>
          <p className="letterhead mb-4 text-ink-soft">{plural(allCustomers, "cliente", "clientes")}</p>
          <SearchForm action="/clientes" label="Buscar por nombre o email" query={query} />
          {query && !outOfRange && matching > 0 && (
            <p role="status" className="letterhead mb-4 text-ink">
              {plural(matching, "cliente", "clientes")} con «{query}»
            </p>
          )}
        </>
      )}

      {outOfRange ? (
        <EmptyState
          title="Esta página no existe."
          description="El listado tiene menos páginas. Puede que se hayan borrado clientes."
          action={
            <ButtonLink href={hrefFor(1)} variant="secondary">
              Ir a la primera página
            </ButtonLink>
          }
        />
      ) : (
        <LedgerTable
          caption="Clientes ordenados por nombre"
          columns={COLUMNS}
          rows={customers}
          rowKey={(customer) => customer.id}
          minWidth={600}
          empty={
            query ? (
              <EmptyState
                title={`Ningún cliente coincide con «${query}».`}
                description="Prueba con otra parte del nombre o del email."
                action={
                  <ButtonLink href="/clientes" variant="secondary">
                    Ver todos los clientes
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                title="Aún no hay clientes."
                description="Da de alta el primero con «Nuevo cliente» para poder hacerle pedidos."
              />
            )
          }
        />
      )}

      {!outOfRange && (
        <Pagination
          label="Páginas de clientes"
          previousHref={page > 1 ? hrefFor(page - 1) : null}
          nextHref={page < pages ? hrefFor(page + 1) : null}
          status={`Página ${page} de ${pages}`}
        />
      )}
    </>
  );
}
