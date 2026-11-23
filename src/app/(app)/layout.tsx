import Link from "next/link";
import { Suspense } from "react";
import { MainNav } from "@/components/main-nav";
import { UserMenu } from "@/components/user-menu";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/panel" className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white"
              >
                I
              </span>
              Inventa
            </Link>
            <Suspense fallback={<div className="h-8 w-28" aria-hidden="true" />}>
              <UserMenu />
            </Suspense>
          </div>
          <MainNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
