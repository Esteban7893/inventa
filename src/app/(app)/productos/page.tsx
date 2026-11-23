import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Productos",
};

export default async function ProductosPage() {
  await requireUser();

  return <ComingSoon folio="02" title="Productos" description="Aquí podrás dar de alta tus productos y controlar su stock." />;
}
