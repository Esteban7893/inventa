"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

const LINKS = [
  { href: "/panel", label: "Panel", folio: "01" },
  { href: "/productos", label: "Productos", folio: "02" },
  { href: "/clientes", label: "Clientes", folio: "03" },
  { href: "/pedidos", label: "Pedidos", folio: "04" },
] as const;

/**
 * Pestañas del índice. `pathname` marca la sección activa; sin él (mientras se resuelve la URL
 * de una ficha con id) se pintan todas sin marcar, en el mismo sitio.
 */
export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Principal" className="overflow-x-auto">
      <ul className="flex">
        {LINKS.map(({ href, label, folio }) => {
          const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-baseline gap-1.5 border-b-[3px] px-2.5 pt-2.5 pb-2 text-[15px] whitespace-nowrap transition-colors focus-visible:outline-offset-[-2px] sm:px-4",
                  active
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-ink-soft hover:border-rule hover:text-ink",
                )}
              >
                <span className="figures hidden text-[11px] text-ink-soft sm:inline">{folio}</span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Índice del libro: pestañas con la sección activa subrayada con tinta gruesa.
 * Lee la URL, así que en las fichas con id (`/productos/[id]`) va dentro de un `<Suspense>`
 * con `<NavLinks pathname={null} />` de reserva.
 */
export function MainNav() {
  return <NavLinks pathname={usePathname()} />;
}
