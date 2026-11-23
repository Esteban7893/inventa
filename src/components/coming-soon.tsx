import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stamp } from "@/components/ui/stamp";

type ComingSoonProps = {
  /** Folio de la sección en el índice del libro, p. ej. "02". */
  folio: string;
  title: string;
  description: string;
};

export function ComingSoon({ folio, title, description }: ComingSoonProps) {
  return (
    <>
      <PageHeader eyebrow={`Sección ${folio} · ${title}`} title={title} />
      <EmptyState
        stamp={<Stamp tone="ink">Próximamente</Stamp>}
        title="Esta sección aún no tiene asientos."
        description={description}
      />
    </>
  );
}
