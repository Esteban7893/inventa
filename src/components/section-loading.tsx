/**
 * Estado de carga de una sección privada (úsalo como `loading.tsx` de cada página).
 * Va en la propia página, no en el layout compartido, para que también se vea al navegar
 * entre secciones: así la navegación no espera a la sesión del servidor.
 */
export function SectionLoading() {
  return (
    <div role="status" aria-live="polite" className="rule-thick mb-8 pb-4">
      <p className="letterhead text-ink-soft">Cargando…</p>
      <div aria-hidden="true" className="mt-2 h-[31px] sm:h-[42px]" />
    </div>
  );
}
