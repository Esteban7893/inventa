import type { Metadata } from "next";
import { createCustomer } from "@/app/(app)/clientes/actions";
import { CustomerForm } from "@/app/(app)/clientes/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Nuevo cliente",
};

const EMPTY = { nombre: "", email: "", telefono: "" };

export default async function NuevoClientePage() {
  await requireUser();

  return (
    <>
      <PageHeader eyebrow="Sección 03 · Clientes · Alta" title="Nuevo cliente" />
      <CustomerForm action={createCustomer} defaults={EMPTY} submitLabel="Guardar cliente" pendingLabel="Guardando…" />
    </>
  );
}
