import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-zinc-900 text-xl font-bold text-white"
          >
            I
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Inventa</h1>
          <p className="mt-2 text-sm text-zinc-600">Inventario y pedidos para tu negocio</p>
        </div>

        <section
          aria-labelledby="login-title"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="login-title" className="mb-6 text-lg font-semibold text-zinc-900">
            Iniciar sesión
          </h2>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
