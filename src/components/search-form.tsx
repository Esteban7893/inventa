import Form from "next/form";
import Link from "next/link";
import { ResetWhenHidden } from "@/components/reset-when-hidden";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SEARCH_MAX_LENGTH } from "@/lib/domain/listing";

type SearchFormProps = {
  /** Ruta del listado (la búsqueda vuelve a su primera página). */
  action: string;
  /** Etiqueta del campo, p. ej. "Buscar por nombre o SKU". */
  label: string;
  /** Búsqueda actual, o `null`. */
  query: string | null;
};

/**
 * Búsqueda de un listado con `next/form`: envía `?q=` a la propia página (navegación en el
 * cliente y, sin JavaScript, un formulario GET normal). Se vuelve a montar al cambiar la
 * búsqueda y al ocultarse la página (`ResetWhenHidden`), para que el campo muestre siempre la
 * búsqueda de la URL y no un texto que se escribió sin buscar.
 */
export function SearchForm({ action, label, query }: SearchFormProps) {
  return (
    <ResetWhenHidden>
      <Form
        key={query ?? ""}
        action={action}
        role="search"
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <Field
          label={label}
          name="q"
          type="search"
          defaultValue={query ?? ""}
          maxLength={SEARCH_MAX_LENGTH}
          autoComplete="off"
          className="min-w-0 flex-1 basis-56 sm:max-w-md"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        {query && (
          <Link
            href={action}
            className="letterhead pb-3 text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Quitar búsqueda
          </Link>
        )}
      </Form>
    </ResetWhenHidden>
  );
}
