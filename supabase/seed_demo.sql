-- Datos de demostración para el usuario de prueba (lo crea el orquestador aparte).
-- Se ejecutan como ese usuario (rol authenticated + auth.uid()), así que pasan por RLS
-- y los pedidos se crean con crear_pedido: el stock queda coherente.
do $$
declare
  v_uid uuid := (select id from auth.users where email = 'prueba@inventa.test');
  cl uuid[];
  pr uuid[];
  o uuid;
begin
  if v_uid is null then
    raise exception 'Falta el usuario prueba@inventa.test';
  end if;

  delete from public.pedido_lineas where owner_id = v_uid;
  delete from public.pedidos where owner_id = v_uid;
  delete from public.productos where owner_id = v_uid;
  delete from public.clientes where owner_id = v_uid;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  insert into public.productos (nombre, sku, precio_cents, stock, stock_minimo) values
    ('Café de Colombia en grano 1 kg', 'CAF-COL-1K', 2450, 40, 10),
    ('Café de Etiopía en grano 250 g', 'CAF-ETI-250', 1190, 26, 8),
    ('Descafeinado Suizo 500 g',        'CAF-DES-500', 1480, 9, 6),
    ('Filtros de papel V60 (100 ud)',  'FIL-V60-100', 690, 60, 15),
    ('Taza esmaltada blanca',           'TAZ-ESM-BL', 950, 12, 6),
    ('Cafetera italiana 6 tazas',       'ITA-6T', 3290, 7, 3),
    ('Molinillo manual de cerámica',    'MOL-CER', 4590, 5, 2),
    ('Jarra de leche 600 ml',           'JAR-600', 1850, 11, 4),
    ('Té verde Sencha 100 g',           'TE-SEN-100', 890, 18, 6),
    ('Báscula de precisión',            'BAS-PRE', 2990, 4, 2);

  insert into public.clientes (nombre, email, telefono) values
    ('Cafetería La Esquina',  'pedidos@laesquina.test',  '+34 600 111 222'),
    ('Hostal Miramar',        'compras@miramar.test',    '+34 600 333 444'),
    ('Panadería Sol de Gràcia', 'hola@soldegracia.test', '+34 600 555 666'),
    ('Oficina Coworking Nau', 'office@nau.test',         '+34 600 777 888'),
    ('Marta Puig',            'marta.puig@correo.test',  '+34 611 222 333'),
    ('Jordi Ferrer',          null,                      '+34 622 444 555');

  select array_agg(id order by nombre) into cl from public.clientes;
  select array_agg(id order by sku) into pr from public.productos;
  -- pr por SKU: 1 BAS-PRE, 2 CAF-COL-1K, 3 CAF-DES-500, 4 CAF-ETI-250, 5 FIL-V60-100,
  --             6 ITA-6T, 7 JAR-600, 8 MOL-CER, 9 TAZ-ESM-BL, 10 TE-SEN-100

  -- Pedidos (se crean con la función: validan y descuentan stock)
  o := public.crear_pedido(cl[1], jsonb_build_array(jsonb_build_object('producto_id', pr[2], 'cantidad', 6), jsonb_build_object('producto_id', pr[5], 'cantidad', 4)));
  perform public.enviar_pedido(o);
  o := public.crear_pedido(cl[2], jsonb_build_array(jsonb_build_object('producto_id', pr[9], 'cantidad', 4), jsonb_build_object('producto_id', pr[10], 'cantidad', 3)));
  perform public.enviar_pedido(o);
  o := public.crear_pedido(cl[3], jsonb_build_array(jsonb_build_object('producto_id', pr[3], 'cantidad', 5)));
  perform public.enviar_pedido(o);
  o := public.crear_pedido(cl[4], jsonb_build_array(jsonb_build_object('producto_id', pr[6], 'cantidad', 2), jsonb_build_object('producto_id', pr[4], 'cantidad', 3)));
  o := public.crear_pedido(cl[5], jsonb_build_array(jsonb_build_object('producto_id', pr[8], 'cantidad', 1), jsonb_build_object('producto_id', pr[4], 'cantidad', 2)));
  o := public.crear_pedido(cl[6], jsonb_build_array(jsonb_build_object('producto_id', pr[1], 'cantidad', 1)));
  perform public.cancelar_pedido(o);
  o := public.crear_pedido(cl[1], jsonb_build_array(jsonb_build_object('producto_id', pr[2], 'cantidad', 4), jsonb_build_object('producto_id', pr[7], 'cantidad', 2)));
  o := public.crear_pedido(cl[2], jsonb_build_array(jsonb_build_object('producto_id', pr[9], 'cantidad', 5)));
  perform public.enviar_pedido(o);

  execute 'reset role';

  -- Repartir fechas (todos se crearon en la misma transacción): unos del mes pasado y
  -- otros de este mes, para que el listado y el panel tengan sentido.
  with r as (
    select id, (row_number() over (order by id))::int as rn
    from public.pedidos where owner_id = v_uid
  ), d as (
    select id, (array[38, 34, 31, 12, 7, 3, 1, 0])[rn] as dias, rn from r
  )
  update public.pedidos p
     set created_at = date_trunc('hour', now()) - make_interval(days => d.dias, hours => (d.rn * 3) % 9),
         enviado_at = case when p.enviado_at is not null
                           then least(now(), date_trunc('hour', now()) - make_interval(days => d.dias, hours => (d.rn * 3) % 9) + interval '1 day') end,
         cancelado_at = case when p.cancelado_at is not null
                           then least(now(), date_trunc('hour', now()) - make_interval(days => d.dias, hours => (d.rn * 3) % 9) + interval '2 hours') end
    from d where p.id = d.id;
  update public.pedido_lineas l set created_at = p.created_at
    from public.pedidos p where l.pedido_id = p.id and p.owner_id = v_uid;
end $$;
