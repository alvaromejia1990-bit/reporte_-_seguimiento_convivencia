-- =============================================================================
--  Datos iniciales (opcional). Ejecútelo DESPUÉS de schema.sql.
--  Ajuste nombres, fechas, grados y cursos a su institución. También puede
--  configurarlos luego desde la aplicación: Configuración › Períodos / Grados y cursos.
-- =============================================================================

update public.configuracion set
  nombre_institucion  = 'Institución Educativa',
  ciudad              = 'Girardot, Cundinamarca',
  responsable_cargo   = 'Coordinación de Convivencia',
  umbral_seguimiento  = 4
where id = 1;

-- Períodos académicos 2026 (calendario A)
insert into public.periodos (nombre, anio, fecha_inicio, fecha_fin) values
  ('Período 1', 2026, '2026-01-26', '2026-04-05'),
  ('Período 2', 2026, '2026-04-06', '2026-06-21'),
  ('Período 3', 2026, '2026-06-22', '2026-09-13'),
  ('Período 4', 2026, '2026-09-14', '2026-12-04')
on conflict (anio, nombre) do nothing;

-- Grados (orden = número del grado)
insert into public.grados (nombre, orden) values
  ('Sexto', 6), ('Séptimo', 7), ('Octavo', 8), ('Noveno', 9), ('Décimo', 10), ('Once', 11)
on conflict do nothing;

-- Dos cursos por grado: 601, 602, 701, 702, ...
insert into public.cursos (grado_id, nombre)
select g.id, (g.orden * 100 + n)::text
  from public.grados g cross join generate_series(1, 2) as n
 where g.orden between 6 and 11
on conflict do nothing;
