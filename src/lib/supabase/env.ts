export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

/**
 * Lee la configuración de Supabase en tiempo de petición, nunca al importar el módulo,
 * para que `next build` no falle si las variables todavía no existen.
 */
export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y rellénalas.",
    );
  }

  return { url, publishableKey };
}
