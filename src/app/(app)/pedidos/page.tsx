import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pedidos",
};

export default async function PedidosPage() {
  await requireUser();

  return <ComingSoon folio="04" title="Pedidos" description="Aquí podrás crear pedidos y seguir su estado." />;
}
