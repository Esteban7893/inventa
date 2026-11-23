import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Clientes",
};

export default async function ClientesPage() {
  await requireUser();

  return <ComingSoon title="Clientes" description="Aquí podrás gestionar los datos de tus clientes." />;
}
