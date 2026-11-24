-- Inventa — la función rls_auto_enable() la crea Supabase para su event trigger (activa RLS
-- en las tablas nuevas). No es para llamarla desde la API: el advisor de seguridad avisa de que
-- anon y authenticated pueden ejecutarla. Se les quita el permiso; el event trigger sigue igual.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
