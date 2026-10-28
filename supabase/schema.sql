-- =============================================================================
--  Plataforma institucional de control de llegadas tarde
--  Esquema de base de datos para Supabase (PostgreSQL 15+)
--
--  Ejecútelo completo en: Supabase › SQL Editor › New query › Run.
--  Es idempotente: puede ejecutarse de nuevo para actualizar funciones y
--  políticas sin perder datos.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

-- Configuración general (una sola fila, id = 1)
create table if not exists public.configuracion (
  id                     smallint primary key default 1 check (id = 1),
  nombre_institucion     text not null default 'Institución Educativa',
  sigla                  text,
  nit                    text,
  ciudad                 text,
  direccion              text,
  telefono               text,
  correo_institucional   text,
  responsable_nombre     text,
  responsable_cargo      text default 'Coordinación de Convivencia',
  umbral_seguimiento     integer not null default 4 check (umbral_seguimiento between 1 and 100),
  zona_horaria           text not null default 'America/Bogota',
  hora_limite_ingreso    time default '06:30',
  logo_url               text,
  actualizado_en         timestamptz not null default now()
);
insert into public.configuracion (id) values (1) on conflict (id) do nothing;

-- Perfiles de usuario (rol y estado), enlazados a auth.users
create table if not exists public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null default '',
  correo      text not null default '',
  rol         text not null default 'docente' check (rol in ('admin', 'docente')),
  activo      boolean not null default false,
  creado_en   timestamptz not null default now()
);

-- Períodos académicos (no se pueden solapar)
create table if not exists public.periodos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  anio          integer not null check (anio between 2000 and 2100),
  fecha_inicio  date not null,
  fecha_fin     date not null,
  creado_en     timestamptz not null default now(),
  constraint periodos_rango_valido check (fecha_fin >= fecha_inicio),
  constraint periodos_nombre_unico unique (anio, nombre)
);
do $$ begin
  alter table public.periodos add constraint periodos_sin_solape
    exclude using gist (daterange(fecha_inicio, fecha_fin, '[]') with &&);
exception when duplicate_object or duplicate_table then null; end $$;

-- Grados (Sexto, Séptimo, ...). "orden" es el número del grado (6, 7, ...)
create table if not exists public.grados (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  orden      integer not null default 0,
  creado_en  timestamptz not null default now()
);
create unique index if not exists grados_nombre_unico on public.grados (lower(nombre));

-- Cursos (601, 602, A, B...) pertenecen a un grado
create table if not exists public.cursos (
  id         uuid primary key default gen_random_uuid(),
  grado_id   uuid not null references public.grados (id) on delete restrict,
  nombre     text not null,
  director   text,
  creado_en  timestamptz not null default now()
);
create unique index if not exists cursos_nombre_unico on public.cursos (grado_id, lower(nombre));

-- Estudiantes
create table if not exists public.estudiantes (
  id                    uuid primary key default gen_random_uuid(),
  tipo_documento        text not null default 'TI' check (tipo_documento in ('RC','TI','CC','CE','PPT','PEP','NUIP','PAS','OTRO')),
  documento             text not null,
  apellidos             text not null default '',
  nombres               text not null,
  edad                  smallint check (edad is null or edad between 3 and 30),
  grado_id              uuid not null references public.grados (id) on delete restrict,
  curso_id              uuid not null references public.cursos (id) on delete restrict,
  acudiente_nombre      text not null default '',
  acudiente_parentesco  text,
  acudiente_correo      text check (acudiente_correo is null or acudiente_correo = '' or acudiente_correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  acudiente_telefono    text,
  direccion             text,
  estado                text not null default 'activo' check (estado in ('activo', 'retirado')),
  total_llegadas        integer not null default 0,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  constraint estudiantes_documento_formato check (documento ~ '^[A-Za-z0-9-]{3,20}$')
);
create unique index if not exists estudiantes_documento_unico on public.estudiantes (upper(documento));
-- Evita el mismo nombre completo repetido dentro de un mismo curso
create unique index if not exists estudiantes_nombre_curso_unico
  on public.estudiantes (curso_id, lower(trim(apellidos)), lower(trim(nombres)));
create index if not exists estudiantes_curso_idx on public.estudiantes (grado_id, curso_id);

-- Llegadas tarde (una por estudiante por día)
create table if not exists public.llegadas_tarde (
  id                     uuid primary key default gen_random_uuid(),
  estudiante_id          uuid not null references public.estudiantes (id) on delete cascade,
  fecha                  date not null,
  hora                   time(0) not null,
  periodo_id             uuid not null references public.periodos (id) on delete restrict,
  grado_id               uuid references public.grados (id) on delete set null,
  curso_id               uuid references public.cursos (id) on delete set null,
  grado_nombre           text not null default '',
  curso_nombre           text not null default '',
  observacion            text,
  registrado_por         uuid references auth.users (id) on delete set null,
  registrado_por_nombre  text,
  creado_en              timestamptz not null default now(),
  constraint llegadas_una_por_dia unique (estudiante_id, fecha)
);
create index if not exists llegadas_periodo_idx on public.llegadas_tarde (periodo_id, fecha);
create index if not exists llegadas_curso_idx on public.llegadas_tarde (grado_id, curso_id);

-- Historial de notificaciones a acudientes
create table if not exists public.notificaciones (
  id                  uuid primary key default gen_random_uuid(),
  estudiante_id       uuid not null references public.estudiantes (id) on delete cascade,
  periodo_id          uuid references public.periodos (id) on delete set null,
  destinatario        text not null,
  asunto              text not null,
  cantidad_reportes   integer not null default 0,
  fechas              date[] not null default '{}',
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente','enviado','entregado','abierto','rebotado','fallido')),
  proveedor           text,
  mensaje_id          text,
  error               text,
  enviado_por         uuid references auth.users (id) on delete set null,
  enviado_por_nombre  text,
  enviado_en          timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists notificaciones_estudiante_idx on public.notificaciones (estudiante_id, enviado_en desc);
create index if not exists notificaciones_mensaje_idx on public.notificaciones (mensaje_id);

-- Auditoría de acciones sensibles
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  fecha       timestamptz not null default now(),
  usuario_id  uuid,
  usuario     text,
  tabla       text not null,
  accion      text not null,
  registro_id text,
  detalle     jsonb
);
create index if not exists auditoria_fecha_idx on public.auditoria (fecha desc);

-- -----------------------------------------------------------------------------
-- 2. Funciones auxiliares de seguridad
-- -----------------------------------------------------------------------------

create or replace function public.rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'admin', false)
$$;

create or replace function public.es_usuario_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select public.rol_actual() is not null
$$;

create or replace function public.nombre_usuario_actual() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nombre, ''), correo) from public.perfiles where id = auth.uid()
$$;

-- Registro de auditoría invocable desde funciones con permisos del usuario
create or replace function public.registrar_auditoria(p_tabla text, p_accion text, p_registro text, p_detalle jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.auditoria (usuario_id, usuario, tabla, accion, registro_id, detalle)
  select auth.uid(), coalesce(public.nombre_usuario_actual(), 'Sistema'), p_tabla, p_accion, p_registro, p_detalle
   where public.es_usuario_activo()
$$;
revoke all on function public.registrar_auditoria(text, text, text, jsonb) from public, anon;

-- Fecha y hora oficiales de la institución
create or replace function public.ahora_local() returns timestamp
language sql stable security definer set search_path = public as $$
  select now() at time zone coalesce((select zona_horaria from public.configuracion where id = 1), 'America/Bogota')
$$;

-- -----------------------------------------------------------------------------
-- 3. Disparadores
-- -----------------------------------------------------------------------------

-- 3.1 Perfil automático al crear un usuario en Supabase Auth.
--     · Si aún no existe ningún administrador, el primer usuario queda como admin activo.
--     · Usuarios creados por un administrador (app_metadata.invitado = true) quedan activos.
--     · Cualquier otro registro queda INACTIVO (sin acceso) hasta que un admin lo active.
create or replace function public.tg_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_hay_admin boolean;
  v_rol text := coalesce(new.raw_app_meta_data ->> 'rol', 'docente');
  v_invitado boolean := coalesce((new.raw_app_meta_data ->> 'invitado')::boolean, false);
begin
  select exists (select 1 from public.perfiles where rol = 'admin' and activo) into v_hay_admin;
  if v_rol not in ('admin', 'docente') then v_rol := 'docente'; end if;
  insert into public.perfiles (id, nombre, correo, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    case when not v_hay_admin then 'admin' else v_rol end,
    (not v_hay_admin) or v_invitado
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

-- 3.2 Mantener actualizado_en
create or replace function public.tg_actualizado_en() returns trigger
language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

drop trigger if exists estudiantes_actualizado on public.estudiantes;
create trigger estudiantes_actualizado before update on public.estudiantes
  for each row execute function public.tg_actualizado_en();
drop trigger if exists configuracion_actualizado on public.configuracion;
create trigger configuracion_actualizado before update on public.configuracion
  for each row execute function public.tg_actualizado_en();

-- 3.3 Normalizar estudiante: el grado siempre corresponde al curso; textos limpios
create or replace function public.tg_normalizar_estudiante() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select grado_id into new.grado_id from public.cursos where id = new.curso_id;
  if new.grado_id is null then
    raise exception 'El curso seleccionado no existe' using errcode = '23503';
  end if;
  new.documento        := upper(regexp_replace(trim(new.documento), '[\s.]', '', 'g'));
  new.apellidos        := regexp_replace(trim(coalesce(new.apellidos, '')), '\s+', ' ', 'g');
  new.nombres          := regexp_replace(trim(new.nombres), '\s+', ' ', 'g');
  new.acudiente_nombre := regexp_replace(trim(coalesce(new.acudiente_nombre, '')), '\s+', ' ', 'g');
  new.acudiente_correo := nullif(lower(trim(coalesce(new.acudiente_correo, ''))), '');
  new.acudiente_telefono := nullif(trim(coalesce(new.acudiente_telefono, '')), '');
  new.direccion        := nullif(trim(coalesce(new.direccion, '')), '');
  if tg_op = 'UPDATE' then
    -- el contador solo lo cambia el disparador de llegadas (llamada anidada)
    if pg_trigger_depth() <= 1 then new.total_llegadas := old.total_llegadas; end if;
  else
    new.total_llegadas := 0;
  end if;
  if new.nombres = '' then
    raise exception 'El nombre del estudiante es obligatorio' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists estudiantes_normalizar on public.estudiantes;
create trigger estudiantes_normalizar before insert or update on public.estudiantes
  for each row execute function public.tg_normalizar_estudiante();

-- 3.4 Completar automáticamente cada llegada tarde:
--     fecha y hora oficiales del servidor, período, grado, curso y usuario.
create or replace function public.tg_completar_llegada() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_local timestamp := public.ahora_local();
  v_est record;
begin
  -- Solo un administrador puede registrar fechas/horas distintas a las actuales
  if new.fecha is null or not public.es_admin() then
    new.fecha := v_local::date;
  end if;
  if new.hora is null or not public.es_admin() then
    new.hora := v_local::time(0);
  end if;

  select e.estado, e.grado_id, e.curso_id, g.nombre as grado, c.nombre as curso
    into v_est
    from public.estudiantes e
    join public.grados g on g.id = e.grado_id
    join public.cursos c on c.id = e.curso_id
   where e.id = new.estudiante_id;
  if not found then
    raise exception 'Estudiante no encontrado' using errcode = 'P0002';
  end if;
  if v_est.estado <> 'activo' then
    raise exception 'El estudiante está retirado' using errcode = 'P0001';
  end if;

  select id into new.periodo_id from public.periodos
   where new.fecha between fecha_inicio and fecha_fin
   limit 1;
  if new.periodo_id is null then
    raise exception 'No hay un período académico configurado para la fecha %', new.fecha
      using errcode = 'P0001';
  end if;

  new.grado_id     := v_est.grado_id;
  new.curso_id     := v_est.curso_id;
  new.grado_nombre := v_est.grado;
  new.curso_nombre := v_est.curso;
  new.registrado_por := coalesce(auth.uid(), new.registrado_por);
  new.registrado_por_nombre := coalesce(public.nombre_usuario_actual(), new.registrado_por_nombre, 'Sistema');
  new.observacion := nullif(trim(coalesce(new.observacion, '')), '');
  return new;
end $$;

drop trigger if exists llegadas_completar on public.llegadas_tarde;
create trigger llegadas_completar before insert on public.llegadas_tarde
  for each row execute function public.tg_completar_llegada();

-- 3.5 Contador acumulado de llegadas tarde por estudiante
create or replace function public.tg_contador_llegadas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.estudiantes set total_llegadas = total_llegadas + 1 where id = new.estudiante_id;
  elsif tg_op = 'DELETE' then
    update public.estudiantes set total_llegadas = greatest(total_llegadas - 1, 0) where id = old.estudiante_id;
  end if;
  return null;
end $$;

drop trigger if exists llegadas_contador on public.llegadas_tarde;
create trigger llegadas_contador after insert or delete on public.llegadas_tarde
  for each row execute function public.tg_contador_llegadas();

-- 3.6 Auditoría
create or replace function public.tg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_detalle jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id::text; v_detalle := to_jsonb(old);
  else
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'total_llegadas' - 'actualizado_en')
                          = (to_jsonb(old) - 'total_llegadas' - 'actualizado_en') then
      return null;  -- cambios del contador automático: no se auditan
    end if;
    v_id := new.id::text;
    v_detalle := case when tg_op = 'UPDATE'
      then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
      else to_jsonb(new) end;
  end if;
  insert into public.auditoria (usuario_id, usuario, tabla, accion, registro_id, detalle)
  values (auth.uid(), coalesce(public.nombre_usuario_actual(), 'Sistema'), tg_table_name, tg_op, v_id, v_detalle);
  return null;
end $$;

drop trigger if exists auditoria_estudiantes on public.estudiantes;
create trigger auditoria_estudiantes after update or delete on public.estudiantes
  for each row execute function public.tg_auditoria();
drop trigger if exists auditoria_llegadas on public.llegadas_tarde;
create trigger auditoria_llegadas after delete on public.llegadas_tarde
  for each row execute function public.tg_auditoria();
drop trigger if exists auditoria_perfiles on public.perfiles;
create trigger auditoria_perfiles after update or delete on public.perfiles
  for each row execute function public.tg_auditoria();

-- -----------------------------------------------------------------------------
-- 4. Vistas
-- -----------------------------------------------------------------------------

-- Datos básicos de estudiantes (sin información del acudiente) para docentes.
-- La vista se ejecuta con permisos del propietario y filtra por usuario activo.
create or replace view public.v_estudiantes_basico
with (security_invoker = false) as
select e.id, e.tipo_documento, e.documento, e.apellidos, e.nombres, e.edad,
       e.grado_id, e.curso_id, g.nombre as grado_nombre, g.orden as grado_orden,
       c.nombre as curso_nombre, e.estado, e.total_llegadas,
       (e.acudiente_correo is not null) as tiene_correo_acudiente
  from public.estudiantes e
  join public.grados g on g.id = e.grado_id
  join public.cursos c on c.id = e.curso_id
 where public.es_usuario_activo();

-- -----------------------------------------------------------------------------
-- 5. Funciones de negocio (RPC)
-- -----------------------------------------------------------------------------

-- 5.1 Reportar llegadas tarde (uno o varios estudiantes) en la jornada actual.
--     Devuelve el resultado por estudiante: registrado | duplicado | error.
drop function if exists public.reportar_llegadas(uuid[], text);
create or replace function public.reportar_llegadas(
  p_estudiantes uuid[],
  p_observacion text default null,
  p_fecha date default null,      -- solo administradores (correcciones); se ignora para docentes
  p_hora time default null)
returns table (estudiante_id uuid, estado text, mensaje text, llegada_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_nuevo uuid;
begin
  if not public.es_usuario_activo() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_estudiantes, '{}') loop
    begin
      insert into public.llegadas_tarde (estudiante_id, observacion, fecha, hora)
      values (v_id, p_observacion, p_fecha, p_hora)
      on conflict on constraint llegadas_una_por_dia do nothing
      returning id into v_nuevo;
      if v_nuevo is null then
        return query select v_id, 'duplicado'::text, 'Ya tenía reporte de llegada tarde en esa jornada'::text, null::uuid;
      else
        return query select v_id, 'registrado'::text, 'Reporte registrado'::text, v_nuevo;
      end if;
      v_nuevo := null;
    exception when others then
      return query select v_id, 'error'::text, sqlerrm::text, null::uuid;
    end;
  end loop;
end $$;

-- 5.2 Importación masiva de estudiantes (crea o actualiza por documento).
--     p_filas: arreglo JSON de objetos con las llaves:
--       tipo_documento, documento, apellidos, nombres, edad, grado, curso,
--       acudiente_nombre, acudiente_parentesco, acudiente_correo, acudiente_telefono, direccion
--     Devuelve {insertados, actualizados, errores:[{fila, documento, mensaje}]}
create or replace function public.importar_estudiantes(p_filas jsonb, p_crear_faltantes boolean default false)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_fila jsonb;
  v_n integer := 0;
  v_ins integer := 0;
  v_upd integer := 0;
  v_err jsonb := '[]'::jsonb;
  v_grado_txt text; v_curso_txt text; v_doc text;
  v_grado uuid; v_curso uuid;
  v_existia boolean;
  v_edad smallint;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede importar estudiantes' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Formato inválido: se esperaba un arreglo de filas';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    begin
      v_doc := upper(regexp_replace(trim(coalesce(v_fila ->> 'documento', '')), '[\s.]', '', 'g'));
      v_grado_txt := trim(coalesce(v_fila ->> 'grado', ''));
      v_curso_txt := trim(coalesce(v_fila ->> 'curso', ''));
      if v_doc = '' then raise exception 'Documento vacío'; end if;
      if coalesce(trim(v_fila ->> 'nombres'), '') = '' then raise exception 'Nombre vacío'; end if;
      if v_curso_txt = '' then raise exception 'Curso vacío'; end if;

      -- Grado: por nombre o por número (orden)
      v_grado := null;
      if v_grado_txt <> '' then
        select id into v_grado from public.grados
         where lower(nombre) = lower(v_grado_txt)
            or (v_grado_txt ~ '^\d+$' and orden = v_grado_txt::int)
         order by (lower(nombre) = lower(v_grado_txt)) desc
         limit 1;
        if v_grado is null and p_crear_faltantes then
          insert into public.grados (nombre, orden)
          values (v_grado_txt, coalesce(nullif(regexp_replace(v_grado_txt, '\D', '', 'g'), '')::int, 0))
          returning id into v_grado;
        end if;
      end if;

      -- Curso: dentro del grado; si no se indicó grado, se busca un curso único con ese nombre
      v_curso := null;
      if v_grado is not null then
        select id into v_curso from public.cursos where grado_id = v_grado and lower(nombre) = lower(v_curso_txt);
        if v_curso is null and p_crear_faltantes then
          insert into public.cursos (grado_id, nombre) values (v_grado, v_curso_txt) returning id into v_curso;
        end if;
      elsif v_grado_txt = '' then
        if (select count(*) from public.cursos where lower(nombre) = lower(v_curso_txt)) = 1 then
          select id into v_curso from public.cursos where lower(nombre) = lower(v_curso_txt);
        end if;
      end if;
      if v_curso is null then
        raise exception 'Grado "%" / curso "%" no existe', v_grado_txt, v_curso_txt;
      end if;

      v_edad := nullif(trim(coalesce(v_fila ->> 'edad', '')), '')::numeric::smallint;

      select true into v_existia from public.estudiantes where upper(documento) = v_doc;
      v_existia := coalesce(v_existia, false);

      insert into public.estudiantes as e (
        tipo_documento, documento, apellidos, nombres, edad, grado_id, curso_id,
        acudiente_nombre, acudiente_parentesco, acudiente_correo, acudiente_telefono, direccion)
      values (
        coalesce(nullif(upper(trim(v_fila ->> 'tipo_documento')), ''), 'TI'),
        v_doc,
        coalesce(v_fila ->> 'apellidos', ''),
        v_fila ->> 'nombres',
        v_edad,
        v_grado, v_curso,
        coalesce(v_fila ->> 'acudiente_nombre', ''),
        nullif(trim(coalesce(v_fila ->> 'acudiente_parentesco', '')), ''),
        v_fila ->> 'acudiente_correo',
        v_fila ->> 'acudiente_telefono',
        v_fila ->> 'direccion')
      on conflict (upper(documento)) do update set
        tipo_documento       = excluded.tipo_documento,
        apellidos            = excluded.apellidos,
        nombres              = excluded.nombres,
        edad                 = coalesce(excluded.edad, e.edad),
        curso_id             = excluded.curso_id,
        acudiente_nombre     = coalesce(nullif(excluded.acudiente_nombre, ''), e.acudiente_nombre),
        acudiente_parentesco = coalesce(excluded.acudiente_parentesco, e.acudiente_parentesco),
        acudiente_correo     = coalesce(nullif(excluded.acudiente_correo, ''), e.acudiente_correo),
        acudiente_telefono   = coalesce(nullif(excluded.acudiente_telefono, ''), e.acudiente_telefono),
        direccion            = coalesce(nullif(excluded.direccion, ''), e.direccion),
        estado               = 'activo';

      if v_existia then v_upd := v_upd + 1; else v_ins := v_ins + 1; end if;
      v_existia := null;
    exception when others then
      v_err := v_err || jsonb_build_object(
        'fila', coalesce((v_fila ->> '_fila')::int, v_n),
        'documento', v_fila ->> 'documento',
        'mensaje', case
          when sqlerrm like '%estudiantes_nombre_curso_unico%' then 'Ya existe otro estudiante con el mismo nombre en ese curso'
          when sqlerrm like '%acudiente_correo_check%' then 'Correo del acudiente inválido'
          when sqlerrm like '%documento_formato%' then 'Documento inválido (3 a 20 letras o números)'
          when sqlerrm like '%edad_check%' then 'Edad fuera de rango (3 a 30)'
          when sqlerrm like '%tipo_documento_check%' then 'Tipo de documento inválido'
          else sqlerrm end);
      v_existia := null;
    end;
  end loop;

  perform public.registrar_auditoria('estudiantes', 'IMPORTACION', null,
          jsonb_build_object('filas', v_n, 'insertados', v_ins, 'actualizados', v_upd, 'errores', jsonb_array_length(v_err)));

  return jsonb_build_object('insertados', v_ins, 'actualizados', v_upd, 'errores', v_err);
end $$;

-- -----------------------------------------------------------------------------
-- 6. Seguridad a nivel de filas (RLS)
-- -----------------------------------------------------------------------------

alter table public.configuracion  enable row level security;
alter table public.perfiles       enable row level security;
alter table public.periodos       enable row level security;
alter table public.grados         enable row level security;
alter table public.cursos         enable row level security;
alter table public.estudiantes    enable row level security;
alter table public.llegadas_tarde enable row level security;
alter table public.notificaciones enable row level security;
alter table public.auditoria      enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
            and tablename in ('configuracion','perfiles','periodos','grados','cursos',
                              'estudiantes','llegadas_tarde','notificaciones','auditoria')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Configuración y catálogos: lectura para usuarios activos, escritura solo admin
create policy configuracion_lectura on public.configuracion for select to authenticated using (public.es_usuario_activo());
create policy configuracion_admin   on public.configuracion for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy periodos_lectura on public.periodos for select to authenticated using (public.es_usuario_activo());
create policy periodos_admin   on public.periodos for all    to authenticated using (public.es_admin()) with check (public.es_admin());
create policy grados_lectura   on public.grados   for select to authenticated using (public.es_usuario_activo());
create policy grados_admin     on public.grados   for all    to authenticated using (public.es_admin()) with check (public.es_admin());
create policy cursos_lectura   on public.cursos   for select to authenticated using (public.es_usuario_activo());
create policy cursos_admin     on public.cursos   for all    to authenticated using (public.es_admin()) with check (public.es_admin());

-- Perfiles: cada usuario ve el suyo; el admin ve y administra todos
create policy perfiles_propio on public.perfiles for select to authenticated using (id = auth.uid() or public.es_admin());
create policy perfiles_admin  on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Estudiantes (datos personales completos): solo administradores.
-- Los docentes consultan la vista v_estudiantes_basico (sin datos del acudiente).
create policy estudiantes_admin on public.estudiantes for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Llegadas tarde: todos los usuarios activos ven y reportan; solo admin anula/edita
create policy llegadas_lectura on public.llegadas_tarde for select to authenticated using (public.es_usuario_activo());
create policy llegadas_reporte on public.llegadas_tarde for insert to authenticated with check (public.es_usuario_activo());
create policy llegadas_admin_upd on public.llegadas_tarde for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy llegadas_admin_del on public.llegadas_tarde for delete to authenticated using (public.es_admin());

-- Notificaciones: lectura para usuarios activos. Se escriben desde la función
-- de servidor "notificar-acudiente" (service role), que omite RLS.
create policy notificaciones_lectura on public.notificaciones for select to authenticated using (public.es_usuario_activo());

-- Auditoría: solo administradores
create policy auditoria_admin on public.auditoria for select to authenticated using (public.es_admin());

-- Permisos explícitos (el rol anónimo no accede a nada)
revoke all on all tables in schema public from anon;
-- Privilegios explícitos para usuarios autenticados (las políticas RLS deciden qué filas)
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.configuracion, public.perfiles, public.periodos, public.grados, public.cursos,
  public.estudiantes, public.llegadas_tarde, public.notificaciones, public.auditoria
  to authenticated;
grant all on all tables in schema public to service_role;
grant select on public.v_estudiantes_basico to authenticated;
revoke all on function public.reportar_llegadas(uuid[], text, date, time) from public, anon;
revoke all on function public.importar_estudiantes(jsonb, boolean) from public, anon;
grant execute on function public.reportar_llegadas(uuid[], text, date, time) to authenticated;
grant execute on function public.importar_estudiantes(jsonb, boolean) to authenticated;
grant execute on function public.registrar_auditoria(text, text, text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Sincronización en tiempo real (reportes y notificaciones)
-- -----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.llegadas_tarde;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notificaciones;
    exception when duplicate_object then null; end;
  end if;
end $$;
