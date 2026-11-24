"use client";

import { useId, useState, useTransition } from "react";
import { ResetWhenHidden } from "@/components/reset-when-hidden";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ActionResult } from "@/lib/forms";

type OrderActionsProps = {
  /** Si el pedido está pendiente. Si no, solo se ve el aviso de una acción rechazada (si lo hay). */
  pending: boolean;
  /** Server Action `shipOrder`, ya con el id enlazado. */
  ship: () => Promise<ActionResult>;
  /** Server Action `cancelOrder`, ya con el id enlazado. */
  cancel: () => Promise<ActionResult>;
  /** Referencia del pedido ("Nº 3F2A9C1B") para la pregunta de confirmación. */
  reference: string;
};

/**
 * Acciones de un pedido pendiente: enviarlo o cancelarlo (en dos pasos).
 * Se monta siempre: si la base de datos rechaza la acción porque el pedido ya no estaba
 * pendiente (p. ej. desde otra pestaña), el albarán pasa a su estado real y el aviso se mantiene.
 * Al salir de la página (Next la conserva oculta) se vuelve a montar limpio: al volver no
 * reaparece la confirmación abierta ni el aviso de una acción rechazada.
 */
export function OrderActions(props: OrderActionsProps) {
  return (
    <ResetWhenHidden>
      <OrderActionsBody {...props} />
    </ResetWhenHidden>
  );
}

function OrderActionsBody({ pending: isPending, ship, cancel, reference }: OrderActionsProps) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"ship" | "cancel" | null>(null);

  function run(kind: "ship" | "cancel") {
    setError(null);
    setRunning(kind);
    startTransition(async () => {
      const result = await (kind === "ship" ? ship() : cancel());
      setConfirming(false);
      setRunning(null);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  if (!isPending && !error) {
    return null;
  }

  if (!isPending) {
    return (
      <section aria-labelledby={titleId} className="mt-12 border-t border-dashed border-rule pt-6 print:hidden">
        <h2 id={titleId} className="letterhead text-ink-soft">
          Acciones del pedido
        </h2>
        <Notice className="mt-4">{error}</Notice>
      </section>
    );
  }

  return (
    <section aria-labelledby={titleId} className="mt-12 border-t border-dashed border-rule pt-6 print:hidden">
      <h2 id={titleId} className="letterhead text-ink-soft">
        Acciones del pedido
      </h2>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
        El pedido está pendiente. Márcalo como enviado cuando salga del almacén, o cancélalo si no se va a
        servir: al cancelarlo, sus unidades vuelven al stock.
      </p>

      {error && !confirming && <Notice className="mt-4">{error}</Notice>}

      {confirming ? (
        <div className="mt-4 flex max-w-2xl flex-col gap-4 border-l-[3px] border-stamp-red pl-4">
          <p role="alert" className="text-[15px] font-medium text-ink">
            ¿Seguro que quieres cancelar el pedido <span className="figures">{reference}</span>? Sus unidades
            vuelven al stock y ya no se podrá enviar. No se puede deshacer.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)} autoFocus>
              No, mantenerlo
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run("cancel")}>
              {running === "cancel" ? "Cancelando…" : "Sí, cancelar pedido"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={pending} onClick={() => run("ship")}>
            {running === "ship" ? "Marcando…" : "Marcar como enviado"}
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => setConfirming(true)}>
            Cancelar pedido
          </Button>
        </div>
      )}
    </section>
  );
}
