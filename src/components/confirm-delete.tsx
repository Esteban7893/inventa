"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ActionResult } from "@/lib/forms";

type ConfirmDeleteProps = {
  /** Server Action de borrado, ya con el id enlazado (`.bind(null, id)`). */
  action: () => Promise<ActionResult>;
  /** Texto del botón, p. ej. "Borrar producto". */
  label: string;
  /** Pregunta de confirmación, p. ej. "¿Borrar «Taza»? No se puede deshacer." */
  question: string;
  /** Explicación breve de lo que pasa al borrar. */
  description: string;
};

/**
 * Borrado en dos pasos: el primer botón pide confirmación y solo el segundo borra.
 * "No, conservarlo" queda donde estaba el primer botón, para que un doble clic no borre.
 */
export function ConfirmDelete({ action, label, question, description }: ConfirmDeleteProps) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(async (): Promise<ActionResult | null> => {
    const result = await action();
    setConfirming(false);
    return result;
  }, null);
  const failed = state?.ok === false ? state : null;

  return (
    <section aria-labelledby={titleId} className="mt-14 max-w-2xl border-t border-dashed border-rule pt-6">
      <h2 id={titleId} className="letterhead text-ink-soft">
        Borrar
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{description}</p>

      {failed && !confirming && <Notice className="mt-4">{failed.error}</Notice>}

      {confirming ? (
        <form action={formAction} className="mt-4 flex flex-col gap-4 border-l-[3px] border-stamp-red pl-4">
          <p role="alert" className="text-[15px] font-medium text-ink">
            {question}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)} autoFocus>
              No, conservarlo
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Borrando…" : "Sí, borrar"}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
          {label}
        </Button>
      )}
    </section>
  );
}
