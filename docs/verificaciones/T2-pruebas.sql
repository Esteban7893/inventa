do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  p1 uuid; p2 uuid; pb uuid; c1 uuid; cb uuid; o1 uuid; o2 uuid;
  msg text; st text; n int; v int;
  log text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verif-a@inventa.test', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verif-b@inventa.test', now(), now());

  execute 'set local role authenticated';

  -- sin sesión
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin perform public.enviar_pedido(gen_random_uuid()); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '01 sin sesion -> ' || msg || E'\n';

  -- usuario B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.productos (nombre, precio_cents, stock) values ('Ajeno', 100, 50) returning id into pb;
  insert into public.clientes (nombre) values ('Cliente B') returning id into cb;

  -- usuario A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.productos (nombre, precio_cents, stock, stock_minimo) values ('Cafe', 250, 5, 2) returning id into p1;
  insert into public.productos (nombre, precio_cents, stock) values ('Taza', 900, 1) returning id into p2;
  insert into public.clientes (nombre) values ('Cliente A') returning id into c1;

  select count(*) into n from public.productos;
  log := log || '02 A ve productos: ' || n || ' (esperado 2)' || E'\n';

  o1 := public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 2), jsonb_build_object('producto_id', p2, 'cantidad', 1)));
  select total_cents into v from public.pedidos where id = o1;
  log := log || '03 pedido ok total=' || v || ' (esperado 1400)' || E'\n';
  select stock into v from public.productos where id = p1; log := log || '04 stock cafe=' || v || ' (esperado 3)' || E'\n';
  select stock into v from public.productos where id = p2; log := log || '05 stock taza=' || v || ' (esperado 0)' || E'\n';

  update public.productos set precio_cents = 999 where id = p1;
  select precio_unit_cents into v from public.pedido_lineas where pedido_id = o1 and producto_id = p1;
  log := log || '06 precio copiado=' || v || ' (esperado 250)' || E'\n';

  begin perform public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', p2, 'cantidad', 1))); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '07 sin stock -> ' || msg || E'\n';
  begin perform public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1), jsonb_build_object('producto_id', p2, 'cantidad', 1))); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  select stock into v from public.productos where id = p1;
  log := log || '08 atomico (cafe ok, taza sin stock) -> ' || msg || ' / stock cafe=' || v || ' (esperado 3)' || E'\n';
  begin perform public.crear_pedido(c1, '[]'::jsonb); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '09 vacio -> ' || msg || E'\n';
  begin perform public.crear_pedido(c1, '{"x":1}'::jsonb); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '10 no array -> ' || msg || E'\n';
  begin perform public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1.5))); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '11 cantidad 1.5 -> ' || msg || E'\n';
  begin perform public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1), jsonb_build_object('producto_id', p1, 'cantidad', 1))); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '12 repetido -> ' || msg || E'\n';
  begin perform public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', pb, 'cantidad', 100000))); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '13 producto ajeno -> ' || msg || E'\n';
  begin perform public.crear_pedido(cb, jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1))); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '14 cliente ajeno -> ' || msg || E'\n';

  begin insert into public.pedidos (cliente_id, estado, total_cents) values (c1, 'pendiente', 0); msg := 'sin error'; exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  log := log || '15 insert directo pedidos -> ' || msg || E'\n';
  begin update public.pedidos set total_cents = 1 where id = o1; msg := 'sin error'; exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  log := log || '16 update directo pedidos -> ' || msg || E'\n';
  begin delete from public.pedido_lineas where pedido_id = o1; msg := 'sin error'; exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  log := log || '17 delete directo lineas -> ' || msg || E'\n';

  -- B intenta tocar el pedido de A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.pedidos; log := log || '18 B ve pedidos: ' || n || ' (esperado 0)' || E'\n';
  begin perform public.cancelar_pedido(o1); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '19 B cancela pedido de A -> ' || msg || E'\n';
  begin perform public.enviar_pedido(o1); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '20 B envia pedido de A -> ' || msg || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.cancelar_pedido(o1);
  select estado into st from public.pedidos where id = o1;
  select stock into v from public.productos where id = p1; log := log || '21 cancelado estado=' || st || ' stock cafe=' || v || ' (esperado 5)' || E'\n';
  begin perform public.cancelar_pedido(o1); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  select stock into v from public.productos where id = p1;
  log := log || '22 cancelar 2a vez -> ' || msg || ' / stock cafe=' || v || ' (esperado 5)' || E'\n';
  begin perform public.enviar_pedido(o1); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '23 enviar cancelado -> ' || msg || E'\n';

  o2 := public.crear_pedido(c1, jsonb_build_array(jsonb_build_object('producto_id', p1, 'cantidad', 1)));
  perform public.enviar_pedido(o2);
  select estado into st from public.pedidos where id = o2; log := log || '24 enviado estado=' || st || E'\n';
  begin perform public.cancelar_pedido(o2); msg := 'sin error'; exception when others then msg := sqlerrm; end;
  log := log || '25 cancelar enviado -> ' || msg || E'\n';

  begin delete from public.clientes where id = c1; msg := 'sin error'; exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  log := log || '26 borrar cliente con pedidos -> ' || left(msg, 60) || E'\n';
  begin delete from public.productos where id = p1; msg := 'sin error'; exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  log := log || '27 borrar producto con pedidos -> ' || left(msg, 60) || E'\n';

  raise exception E'VERIFICACION (todo se deshace)\n%', log;
end $$;
