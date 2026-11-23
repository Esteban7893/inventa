"use client";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Algo ha ido mal</h1>
        <p className="mt-2 text-sm text-zinc-600">
          No hemos podido cargar esta página. Inténtalo de nuevo en unos segundos.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 h-10 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
