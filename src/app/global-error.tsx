"use client";

import { fontVariables } from "@/app/fonts";
import { ErrorSheet } from "@/components/error-sheet";
import { Button } from "@/components/ui/button";
import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <title>Error · Inventa</title>
        <ErrorSheet
          reference="Incidencia"
          stamp="Error"
          title="Algo ha ido mal"
          message="No hemos podido cargar Inventa. Inténtalo de nuevo en unos segundos."
          action={<Button onClick={() => retry()}>Reintentar</Button>}
        />
      </body>
    </html>
  );
}
