-- Inventa — habilita pgTAP en el esquema extensions (nunca en public) para ejecutar los
-- tests de base de datos de supabase/tests/.

create extension if not exists pgtap with schema extensions;
