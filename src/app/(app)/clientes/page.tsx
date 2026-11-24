import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type LedgerColumn } from "@/components/ui/ledger-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export const metadata: Metadata = {
  title: "Clientes",
};

type CustomerRow = Pick<Customer, "id" | "nombre" | "email" | "telefono">;

const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

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

export default async function ClientesPage() {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, email, telefono")
    .overrideTypes<CustomerRow[], { merge: false }>();

  if (error) {
    throw new Error("No se han podido cargar los clientes.");
  }

  const customers = [...data].sort((a, b) => byName.compare(a.nombre, b.nombre));

  return (
    <>
      <PageHeader
        eyebrow="Sección 03 · Clientes"
        title="Clientes"
        actions={<ButtonLink href="/clientes/nuevo">Nuevo cliente</ButtonLink>}
      />

      {customers.length > 0 && (
        <p className="letterhead mb-4 text-ink-soft">
          {customers.length} {customers.length === 1 ? "cliente" : "clientes"}
        </p>
      )}

      <LedgerTable
        caption="Clientes ordenados por nombre"
        columns={COLUMNS}
        rows={customers}
        rowKey={(customer) => customer.id}
        minWidth={600}
        empty={
          <EmptyState
            title="Aún no hay clientes."
            description="Da de alta el primero con «Nuevo cliente» para poder hacerle pedidos."
          />
        }
      />
    </>
  );
}
