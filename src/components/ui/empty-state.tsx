import type { ReactNode } from "react";

type EmptyStateProps = {
  /** Frase principal, p. ej. "Aún no hay productos". */
  title: string;
  description?: ReactNode;
  /** Acción para empezar, p. ej. un `ButtonLink` a "Nuevo producto". */
  action?: ReactNode;
  /** Sello opcional (p. ej. `<Stamp>Próximamente</Stamp>`). */
  stamp?: ReactNode;
};

/** Hoja del libro sin asientos: renglones discontinuos en blanco y una frase sobria. */
export function EmptyState({ title, description, action, stamp }: EmptyStateProps) {
  return (
    <section aria-label={title} className="relative">
      <div aria-hidden="true" className="flex flex-col">
        <span className="rule-dashed h-9" />
        <span className="rule-dashed h-9" />
      </div>
      {/* `wrap-anywhere` en los textos: con `items-start` cada uno mide lo que su palabra más
          larga, y el título puede repetir una búsqueda sin espacios. */}
      <div className="flex flex-col items-start gap-3 py-8">
        {stamp && <div className="mb-1">{stamp}</div>}
        <p className="font-serif text-[22px] leading-snug text-ink italic wrap-anywhere">{title}</p>
        {description && (
          <p className="max-w-prose text-[15px] leading-relaxed text-ink-soft wrap-anywhere">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      <div aria-hidden="true" className="flex flex-col border-t border-dashed border-rule">
        <span className="rule-dashed h-9" />
      </div>
    </section>
  );
}
