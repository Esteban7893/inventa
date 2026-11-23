export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
        <p className="font-medium text-zinc-800">Próximamente</p>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
    </section>
  );
}
