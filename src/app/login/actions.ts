"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authErrorMessage } from "@/lib/domain/auth-errors";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: { email?: string; password?: string };
      email?: string;
    };

const loginSchema = z.object({
  email: z
    .string("Escribe tu email.")
    .trim()
    .min(1, "Escribe tu email.")
    .pipe(z.email("Escribe un email válido.")),
  password: z.string("Escribe tu contraseña.").min(1, "Escribe tu contraseña."),
});

export async function login(_prev: LoginState | null, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });
  const email = typeof rawEmail === "string" ? rawEmail : "";

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
      email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: authErrorMessage(error), email };
  }

  redirect("/panel");
}
