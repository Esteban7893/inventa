import Link from "next/link";
import { Suspense } from "react";
import { MainNav, NavLinks } from "@/components/main-nav";
import { UserMenu } from "@/components/user-menu";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6 sm:pt-7">
        <div className="flex items-end justify-between gap-4 pb-3">
          <Link href="/panel" className="group flex flex-col">
            <span className="letterhead text-ink-soft">Libro de almacén</span>
            <span className="font-serif text-[28px] leading-none font-medium text-ink group-hover:text-ink/80">
              Inventa
            </span>
          </Link>
          <Suspense fallback={<div className="h-9 w-32" aria-hidden="true" />}>
            <UserMenu />
          </Suspense>
        </div>
        <div className="rule-thick">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <MainNav />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
        {children}
      </main>
    </div>
  );
}
