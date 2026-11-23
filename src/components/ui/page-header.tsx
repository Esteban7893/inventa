import type { ReactNode } from "react";

type PageHeaderProps = {
  /** Membrete pequeño sobre el título, p. ej. "Libro de almacén · Productos". */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Botones o enlaces a la derecha del título (abajo en móvil). */
  actions?: ReactNode;
};

/** Cabecera de página: membrete, título en Newsreader, regla gruesa de tinta y acciones. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="rule-thick mb-8 pb-4">
      {eyebrow && <p className="letterhead mb-2 text-ink-soft">{eyebrow}</p>}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] leading-[1.1] font-medium tracking-[-0.01em] text-balance text-ink sm:text-[38px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
