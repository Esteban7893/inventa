import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

const CONTENTS = ["Productos", "Clientes", "Pedidos"] as const;

/** Portada del libro de registro: membrete, título grande, reglas dobles y el acceso. */
export default function LoginPage() {
  return (
    <main className="flex flex-1 justify-center px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-[26rem]">
        <div className="flex items-baseline justify-between gap-4">
          <p className="letterhead text-ink">Libro de almacén</p>
          <p className="letterhead text-ink-soft">Tomo I</p>
        </div>
        <div aria-hidden="true" className="mt-2 border-t-[1.5px] border-ink" />
        <div aria-hidden="true" className="mt-[3px] border-t border-ink" />

        <header className="pt-10 pb-9 sm:pt-14 sm:pb-12">
          <h1 className="font-serif text-[64px] leading-[0.95] font-medium tracking-[-0.02em] text-ink sm:text-[80px]">
            Inventa
          </h1>
          <p className="mt-4 font-serif text-[19px] leading-snug text-ink-soft italic">
            Inventario y pedidos para tu negocio
          </p>
        </header>

        <section aria-labelledby="login-title" className="border-t border-dashed border-rule pt-6">
          <h2 id="login-title" className="letterhead mb-6 text-ink-soft">
            Iniciar sesión
          </h2>
          <LoginForm />
        </section>

        <div aria-hidden="true" className="mt-10 border-t border-ink" />
        <div aria-hidden="true" className="mt-[3px] border-t-[1.5px] border-ink" />
        <p className="letterhead mt-2 text-ink-soft">
          <span className="sr-only">Contiene: </span>
          {CONTENTS.join(" · ")}
        </p>
      </div>
    </main>
  );
}
