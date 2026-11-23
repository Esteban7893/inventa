import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-zinc-600">La página que buscas no existe o se ha movido.</p>
        <Link
          href="/panel"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Ir al panel
        </Link>
      </div>
    </main>
  );
}
