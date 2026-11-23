"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/panel", label: "Panel" },
  { href: "/productos", label: "Productos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/pedidos", label: "Pedidos" },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 px-1">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
