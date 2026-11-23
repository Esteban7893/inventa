"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);
  const failed = state?.ok === false ? state : null;
  const emailError = failed?.fieldErrors?.email;
  const passwordError = failed?.fieldErrors?.password;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {failed && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {failed.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-800">
          Email <span aria-hidden="true" className="text-red-600">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={failed?.email ?? ""}
          key={failed?.email ?? ""}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 aria-invalid:border-red-500"
        />
        {emailError && (
          <p id="email-error" className="text-sm text-red-700">
            {emailError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-zinc-800">
          Contraseña <span aria-hidden="true" className="text-red-600">*</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
          className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 aria-invalid:border-red-500"
        />
        {passwordError && (
          <p id="password-error" className="text-sm text-red-700">
            {passwordError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-xs text-zinc-500">
        <span aria-hidden="true" className="text-red-600">*</span> Campo obligatorio
      </p>
    </form>
  );
}
