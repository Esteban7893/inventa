import type { Metadata } from "next";
import { ErrorSheet } from "@/components/error-sheet";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <ErrorSheet
      reference="Incidencia 404"
      stamp="Sin registro"
      title="Página no encontrada"
      message="La página que buscas no existe o se ha movido."
      action={<ButtonLink href="/panel">Ir al panel</ButtonLink>}
    />
  );
}
