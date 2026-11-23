import type { ReactNode } from "react";
import { Stamp } from "@/components/ui/stamp";

type ErrorSheetProps = {
  /** Membrete de la hoja, p. ej. "Incidencia · 404". */
  reference: string;
  /** Texto del sello rojo. */
  stamp: string;
  title: string;
  message: string;
  action: ReactNode;
};

/** Hoja de incidencia para las páginas de error: membrete, sello rojo, título y una acción. */
export function ErrorSheet({ reference, stamp, title, message, action }: ErrorSheetProps) {
  return (
    <main className="flex flex-1 justify-center px-4 py-12 sm:items-center sm:py-16">
      <div className="w-full max-w-[28rem]">
        <div className="rule-thick flex items-baseline justify-between gap-4 pb-2">
          <p className="letterhead text-ink">Inventa · Libro de almacén</p>
          <p className="letterhead text-ink-soft">{reference}</p>
        </div>
        <div className="pt-8">
          <Stamp tone="alert" tilt={3}>
            {stamp}
          </Stamp>
          <h1 className="mt-6 font-serif text-[32px] leading-[1.1] font-medium text-ink sm:text-[38px]">{title}</h1>
          <p className="rule-dashed mt-3 pb-6 text-[15px] leading-relaxed text-ink-soft">{message}</p>
          <div className="pt-6">{action}</div>
        </div>
      </div>
    </main>
  );
}
