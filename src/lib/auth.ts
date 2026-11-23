import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Devuelve el usuario con sesión o redirige a /login. Úsalo en cada página privada.
 * `cache` evita repetir la consulta a Supabase Auth dentro de la misma petición.
 */
export const requireUser = cache(async (): Promise<User> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});
