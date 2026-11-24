import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";

type PaginationProps = {
  /** Nombre accesible de la navegación, p. ej. "Páginas de productos". */
  label: string;
  /** Enlace a la página anterior, o `null` si es la primera. */
  previousHref: string | null;
  /** Enlace a la página siguiente, o `null` si es la última. */
  nextHref: string | null;
  previousLabel?: string;
  nextLabel?: string;
  /** Texto del centro, p. ej. "Página 2 de 5". */
  status?: ReactNode;
};

function Step({ href, children }: { href: string | null; children: ReactNode }) {
  const classes = buttonClasses({ variant: "secondary", size: "sm" });
  if (href === null) {
    return (
      <span aria-disabled="true" className={classes}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Pie de un listado paginado: anterior y siguiente como botones de borde y la página en membrete. */
export function Pagination({
  label,
  previousHref,
  nextHref,
  previousLabel = "← Anterior",
  nextLabel = "Siguiente →",
  status,
}: PaginationProps) {
  if (previousHref === null && nextHref === null) {
    return null;
  }
  return (
    <nav aria-label={label} className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <Step href={previousHref}>{previousLabel}</Step>
      {status && <p className="letterhead figures order-first w-full text-ink-soft sm:order-none sm:w-auto">{status}</p>}
      <Step href={nextHref}>{nextLabel}</Step>
    </nav>
  );
}
