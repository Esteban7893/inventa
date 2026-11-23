import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Panel",
};

export default async function PanelPage() {
  await requireUser();

  return (
    <ComingSoon
      title="Panel"
      description="Aquí verás el resumen de tu inventario y de tus pedidos del mes."
    />
  );
}
