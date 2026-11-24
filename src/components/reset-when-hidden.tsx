"use client";

import { Fragment, useLayoutEffect, useState, type ReactNode } from "react";

/**
 * Vuelve a montar su contenido cada vez que la página se oculta.
 *
 * Con Cache Components, Next 16 no desmonta la página al navegar: la oculta con `<Activity>`
 * y conserva su estado (lo tecleado, el resultado de `useActionState`, un aviso abierto).
 * En un formulario eso hace que, al volver con un enlace, reaparezcan errores y valores que
 * nunca se guardaron. Al ocultarse se ejecuta la limpieza de `useLayoutEffect` (patrón de
 * `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`); aquí cambia la
 * `key` y el contenido se monta de nuevo, limpio, antes de volver a verse.
 *
 * Dentro de una misma visita no reinicia nada: los errores de un envío fallido se siguen viendo.
 */
export function ResetWhenHidden({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0);

  useLayoutEffect(() => {
    return () => {
      setGeneration((current) => current + 1);
    };
  }, []);

  return <Fragment key={generation}>{children}</Fragment>;
}
