-- Inventa — tests pgTAP de esquema (D7 y D8). Leen el catálogo y fallan si una migración
-- futura rompe las reglas: tabla sin RLS o sin owner_id, permisos para anon o PUBLIC,
-- políticas que no filtran por owner_id, escrituras directas en pedidos, funciones sin
-- search_path fijo o security definer fuera de las tres funciones de pedidos.
-- Las comprobaciones recorren todo el esquema public (no una lista fija), así que también
-- cubren las tablas y funciones que se añadan después.
--
-- Excepción: public.rls_auto_enable() es de Supabase (event trigger que activa RLS en tablas
-- nuevas), no de Inventa. Es security definer con search_path = pg_catalog; se le exige que
-- tenga search_path fijo y que nadie de la API pueda ejecutarla (migración 0002). Puede no
-- existir en otros proyectos, y los tests no lo requieren.
--
-- Compatible con `supabase test db --linked` (pg_prove) y con `supabase db query --linked -f`:
-- toda la salida TAP sale de un único select. Solo lee; termina en rollback.

begin;

create function pg_temp.run_tests()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_owner_expr constant text := '(owner_id = ( SELECT auth.uid() AS uid))';
  v_tabla text;
begin
  return next extensions.plan(23);

  -- Las cuatro tablas de Inventa existen (evita que los tests genéricos pasen en vacío).
  return next extensions.is(
    (select count(*)::integer from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and c.relname in ('productos', 'clientes', 'pedidos', 'pedido_lineas')),
    4,
    '01 - existen productos, clientes, pedidos y pedido_lineas en public'
  );

  -- D7: RLS y owner_id en todas las tablas.
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
    $sql$,
    '02 - todas las tablas de public tienen RLS activado'
  );
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')
        and not exists (
          select 1
          from pg_catalog.pg_attribute a
          join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid
            and a.attname = 'owner_id'
            and a.attnotnull
            and not a.attisdropped
            and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'auth.uid()'
        )
    $sql$,
    '03 - todas las tablas de public tienen owner_id not null default auth.uid()'
  );

  -- D7: anon y PUBLIC no tienen ningún permiso sobre tablas, vistas ni secuencias de public.
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          or pg_catalog.has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
        )
    $sql$,
    '04 - anon no tiene permisos sobre ninguna tabla ni vista de public'
  );
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          pg_catalog.has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          or pg_catalog.has_any_column_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
        )
    $sql$,
    '05 - PUBLIC no tiene permisos sobre ninguna tabla ni vista de public'
  );
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and case when c.relkind = 'S'
          then pg_catalog.has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE')
          else false
        end
    $sql$,
    '06 - anon no tiene permisos sobre ninguna secuencia de public'
  );

  -- D7: TRUNCATE se salta RLS, así que authenticated no lo tiene en ninguna tabla.
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and pg_catalog.has_table_privilege('authenticated', c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
    $sql$,
    '07 - authenticated no tiene TRUNCATE, REFERENCES ni TRIGGER en ninguna tabla de public'
  );

  -- D7: productos y clientes se escriben con RLS; pedidos y pedido_lineas solo se leen.
  foreach v_tabla in array array['productos', 'clientes'] loop
    return next extensions.table_privs_are(
      'public', v_tabla, 'authenticated',
      array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      format('%s - authenticated solo tiene SELECT, INSERT, UPDATE y DELETE en %s',
        case v_tabla when 'productos' then '08' else '09' end, v_tabla)
    );
  end loop;
  foreach v_tabla in array array['pedidos', 'pedido_lineas'] loop
    return next extensions.table_privs_are(
      'public', v_tabla, 'authenticated',
      array['SELECT'],
      format('%s - authenticated solo tiene SELECT en %s (se escribe solo con las funciones)',
        case v_tabla when 'pedidos' then '10' else '11' end, v_tabla)
    );
  end loop;

  -- D7: políticas.
  return next extensions.is_empty(
    format($sql$
      select tablename || '.' || policyname from pg_catalog.pg_policies
      where schemaname = 'public'
        and (
          roles <> array['authenticated']::name[]
          or coalesce(qual, %1$L) <> %1$L
          or coalesce(with_check, %1$L) <> %1$L
        )
    $sql$, v_owner_expr),
    '12 - todas las politicas de public son para authenticated y filtran por owner_id = (select auth.uid())'
  );
  return next extensions.set_eq(
    $sql$
      select tablename::text, cmd::text from pg_catalog.pg_policies
      where schemaname = 'public' and tablename in ('productos', 'clientes')
    $sql$,
    $sql$
      values
        ('productos', 'SELECT'), ('productos', 'INSERT'), ('productos', 'UPDATE'), ('productos', 'DELETE'),
        ('clientes', 'SELECT'), ('clientes', 'INSERT'), ('clientes', 'UPDATE'), ('clientes', 'DELETE')
    $sql$,
    '13 - productos y clientes tienen politicas de select, insert, update y delete'
  );
  return next extensions.set_eq(
    $sql$
      select tablename::text, cmd::text from pg_catalog.pg_policies
      where schemaname = 'public' and tablename in ('pedidos', 'pedido_lineas')
    $sql$,
    $sql$ values ('pedidos', 'SELECT'), ('pedido_lineas', 'SELECT') $sql$,
    '14 - pedidos y pedido_lineas solo tienen politica de select'
  );
  return next extensions.is_empty(
    $sql$
      select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind = 'v'
        and not coalesce(c.reloptions @> array['security_invoker=true'], false)
    $sql$,
    '15 - ninguna vista de public se salta RLS (todas con security_invoker)'
  );

  -- D8: funciones de public.
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    $sql$,
    '16 - anon no puede ejecutar ninguna funcion de public'
  );
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
    $sql$,
    '17 - PUBLIC no puede ejecutar ninguna funcion de public'
  );
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname <> 'rls_auto_enable'
        and not coalesce(p.proconfig @> array['search_path=""'], false)
    $sql$,
    '18 - todas las funciones de public (salvo rls_auto_enable) tienen search_path vacio'
  );
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname = 'rls_auto_enable'
        and not exists (
          select 1 from unnest(p.proconfig) as cfg (valor) where cfg.valor like 'search_path=%'
        )
    $sql$,
    '19 - rls_auto_enable (de Supabase), si existe, tiene search_path fijo'
  );
  return next extensions.set_eq(
    $sql$
      select p.proname::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and p.proname <> 'rls_auto_enable'
    $sql$,
    array['crear_pedido', 'cancelar_pedido', 'enviar_pedido'],
    '20 - las unicas funciones security definer de Inventa son crear_pedido, cancelar_pedido y enviar_pedido'
  );
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('crear_pedido', 'cancelar_pedido', 'enviar_pedido')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    $sql$,
    '21 - authenticated puede ejecutar crear_pedido, cancelar_pedido y enviar_pedido'
  );
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and p.proname <> 'rls_auto_enable'
        and (
          p.prosrc not like '%auth.uid()%'
          or p.prosrc not like '%NO_AUTENTICADO%'
          or p.prosrc not like '%owner_id%'
        )
    $sql$,
    '22 - cada funcion security definer exige auth.uid() (NO_AUTENTICADO) y filtra por owner_id'
  );
  return next extensions.is_empty(
    $sql$
      select p.oid::regprocedure::text from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname = 'rls_auto_enable'
        and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    $sql$,
    '23 - authenticated no puede ejecutar rls_auto_enable (migracion 0002)'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
