"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, RequiredLegend } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);
  const failed = state?.ok === false ? state : null;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {failed && <Notice>{failed.error}</Notice>}

      <Field
        key={failed?.email ?? ""}
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={failed?.email ?? ""}
        error={failed?.fieldErrors?.email}
      />

      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={failed?.fieldErrors?.password}
      />

      <Button type="submit" block disabled={pending} className="mt-1">
        {pending ? "Entrando…" : "Entrar"}
      </Button>

      <RequiredLegend />
    </form>
  );
}
