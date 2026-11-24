import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { deleteCustomer, updateCustomer } from "@/app/(app)/clientes/actions";
import { CustomerForm } from "@/app/(app)/clientes/customer-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

export const metadata: Metadata = {
  title: "Editar cliente",
};

type CustomerDetail = Pick<Customer, "id" | "nombre" | "email" | "telefono">;

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("clientes")
    .select("id, nombre, email, telefono")
    .eq("id", id)
    .maybeSingle<CustomerDetail>();

  if (error) {
    throw new Error("No se ha podido cargar el cliente.");
  }
  if (!customer) {
    notFound();
  }

  // El formulario se vuelve a montar (key) si cambian los datos guardados: Next conserva
  // oculta la página ya visitada, con lo que se tecleó, y al volver mostraría valores viejos.
  const defaults = {
    nombre: customer.nombre,
    email: customer.email ?? "",
    telefono: customer.telefono ?? "",
  };

  return (
    <>
      <PageHeader eyebrow="Sección 03 · Clientes · Ficha" title={customer.nombre} />
      <CustomerForm
        key={JSON.stringify(defaults)}
        action={updateCustomer.bind(null, customer.id)}
        defaults={defaults}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
      />
      <ConfirmDelete
        action={deleteCustomer.bind(null, customer.id)}
        label="Borrar cliente"
        question={`¿Seguro que quieres borrar a «${customer.nombre}»? No se puede deshacer.`}
        description="El cliente desaparecerá del libro. Si tiene pedidos no se podrá borrar."
      />
    </>
  );
}
