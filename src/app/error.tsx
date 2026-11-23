"use client";

import { ErrorSheet } from "@/components/error-sheet";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorSheet
      reference="Incidencia"
      stamp="Error"
      title="Algo ha ido mal"
      message="No hemos podido cargar esta página. Inténtalo de nuevo en unos segundos."
      action={<Button onClick={() => retry()}>Reintentar</Button>}
    />
  );
}
