-- Inventa — tests pgTAP del rol anon (D7 y D8): sin sesión no se ejecuta ninguna función de
-- pedidos ni se lee o escribe ninguna tabla de public. Se exige el código 42501 (permiso
-- denegado), no "0 filas": si alguien concede select, update o delete a anon, el test falla
-- aunque RLS siguiera filtrando. Un insert sin política también da 42501 (por RLS), así que un
-- grant de insert a anon no pone rojos los casos 08–11; eso lo detecta el caso 04 de
-- 04_esquema_seguridad.sql, que revisa los permisos de anon en el catálogo.
-- Compatible con `supabase test db --linked` (pg_prove) y con `supabase db query --linked -f`:
-- toda la salida TAP sale de un único select. Termina en rollback: no deja datos.

begin;

-- Ejecuta p_sql con el rol y los claims indicados y devuelve su SQLSTATE ('00000' si no falla).
-- Si falla, la subtransacción se deshace y el rol vuelve al de la sesión.
create function pg_temp.sqlstate_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
begin
  execute format('set local role %I', p_claims ->> 'role');
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql;
  reset role;
  return '00000';
exception when others then
  return sqlstate;
end;
$$;

create function pg_temp.run_tests()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_anon constant jsonb := '{"role":"anon"}';
begin
  return next extensions.plan(19);

  -- Funciones de pedidos: execute revocado a anon (D8).
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, $sql$select public.crear_pedido(gen_random_uuid(), '[]'::jsonb)$sql$),
    '42501',
    '01 - anon no puede ejecutar crear_pedido (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, $sql$select public.cancelar_pedido(gen_random_uuid())$sql$),
    '42501',
    '02 - anon no puede ejecutar cancelar_pedido (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, $sql$select public.enviar_pedido(gen_random_uuid())$sql$),
    '42501',
    '03 - anon no puede ejecutar enviar_pedido (42501)'
  );

  -- Lectura directa de las tablas (D7).
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select count(*) from public.productos'),
    '42501',
    '04 - anon no puede leer public.productos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select count(*) from public.clientes'),
    '42501',
    '05 - anon no puede leer public.clientes (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select count(*) from public.pedidos'),
    '42501',
    '06 - anon no puede leer public.pedidos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select count(*) from public.pedido_lineas'),
    '42501',
    '07 - anon no puede leer public.pedido_lineas (42501)'
  );

  -- Inserciones directas.
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, $sql$insert into public.productos (nombre, precio_cents) values ('anon', 1)$sql$),
    '42501',
    '08 - anon no puede insertar en public.productos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, $sql$insert into public.clientes (nombre) values ('anon')$sql$),
    '42501',
    '09 - anon no puede insertar en public.clientes (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(
      v_anon,
      'insert into public.pedidos (cliente_id, total_cents) values (gen_random_uuid(), 0)'
    ),
    '42501',
    '10 - anon no puede insertar en public.pedidos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(
      v_anon,
      'insert into public.pedido_lineas (pedido_id, producto_id, cantidad, precio_unit_cents) '
        || 'values (gen_random_uuid(), gen_random_uuid(), 1, 1)'
    ),
    '42501',
    '11 - anon no puede insertar en public.pedido_lineas (42501)'
  );

  -- Actualizaciones directas.
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'update public.productos set stock = stock'),
    '42501',
    '12 - anon no puede actualizar public.productos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'update public.clientes set nombre = nombre'),
    '42501',
    '13 - anon no puede actualizar public.clientes (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'update public.pedidos set total_cents = total_cents'),
    '42501',
    '14 - anon no puede actualizar public.pedidos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'update public.pedido_lineas set cantidad = cantidad'),
    '42501',
    '15 - anon no puede actualizar public.pedido_lineas (42501)'
  );

  -- Borrados directos.
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'delete from public.productos'),
    '42501',
    '16 - anon no puede borrar en public.productos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'delete from public.clientes'),
    '42501',
    '17 - anon no puede borrar en public.clientes (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'delete from public.pedidos'),
    '42501',
    '18 - anon no puede borrar en public.pedidos (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'delete from public.pedido_lineas'),
    '42501',
    '19 - anon no puede borrar en public.pedido_lineas (42501)'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
