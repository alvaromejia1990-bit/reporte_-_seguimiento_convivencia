import { api, qs } from '../api.js';
import {
  $, $$, esc, icono, toast, conCarga, cargando, vacio, debounce, confirmar,
  opcionesGrado, opcionesCurso, enlazarGradoCurso, fechaLarga, claseContador,
} from '../ui.js';

const CLAVE_FILTRO = 'lt.reportes.filtro';

export async function render(cont, ctx) {
  let guardado = {};
  try { guardado = JSON.parse(sessionStorage.getItem(CLAVE_FILTRO) || '{}'); } catch { /* sin almacenamiento */ }
  const estado = { grado_id: guardado.grado_id || '', curso_id: guardado.curso_id || '', q: '' };
  const seleccion = new Set();
  let estudiantes = [];
  const umbral = ctx.config.umbral;
  const periodo = ctx.config.periodo_actual;

  cont.innerHTML = `
    <div class="encabezado-vista">
      <div><h1>Reporte de llegadas tarde</h1><p>Seleccione el grado y el curso, marque los estudiantes y registre su llegada tarde.</p></div>
    </div>
    <div class="jornada">
      <div class="jornada__reloj" id="reloj">--:--</div>
      <div><div style="font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.08em">Jornada</div><div class="jornada__fecha" id="fecha-hoy"></div></div>
      <div class="jornada__periodo">${periodo ? `Período académico: <strong>${esc(periodo.nombre)}</strong>` : '<strong>Sin período académico vigente</strong>'}</div>
    </div>
    ${periodo ? '' : `<div class="aviso aviso--alerta">${icono('alerta')}<div>La fecha de hoy no está dentro de ningún período académico. ${ctx.esAdmin ? '<a href="#/configuracion/periodos">Configure los períodos</a> para poder registrar reportes.' : 'Solicite al administrador configurar los períodos académicos.'}</div></div>`}
    <div class="lateral">
      <div>
        <div class="tarjeta" style="margin-bottom:14px">
          <div class="filtros">
            <div class="campo"><label for="r-grado">Grado</label><select id="r-grado" class="control">${opcionesGrado(ctx.config, estado.grado_id, 'Seleccione el grado')}</select></div>
            <div class="campo"><label for="r-curso">Curso</label><select id="r-curso" class="control">${opcionesCurso(ctx.config, estado.grado_id || '-1', estado.curso_id, 'Todos los cursos del grado')}</select></div>
            <div class="campo campo--ancho"><label for="r-q">Buscar estudiante</label><div class="buscador">${icono('buscar')}<input id="r-q" class="control" type="search" placeholder="Escriba un nombre (busca en toda la institución)"></div></div>
          </div>
        </div>
        <div class="barra-seleccion" id="barra" hidden>
          <strong id="sel-texto"></strong>
          <input id="observacion" class="control" maxlength="300" placeholder="Observación opcional (p. ej., transporte, cita médica)">
          <button class="btn btn-secundario btn-sm" id="btn-limpiar">Quitar selección</button>
          <button class="btn btn-oro" id="btn-reportar-sel">${icono('reloj')}Reportar llegada tarde</button>
        </div>
        <div class="tarjeta" id="lista">${vacio('Seleccione un grado o busque un estudiante para ver el listado.')}</div>
      </div>
      <aside class="tarjeta">
        <div class="tarjeta__cab"><h3>Reportes de hoy</h3><span class="insignia" id="total-hoy">0</span></div>
        <ul class="lista-hoy" id="lista-hoy"><li>${cargando()}</li></ul>
      </aside>
    </div>`;

  // Reloj de la jornada (hora de Colombia)
  const fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ctx.config.zona || 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const tic = () => { $('#reloj', cont).textContent = fmtHora.format(new Date()); };
  tic();
  const fl = fechaLarga(ctx.config.hoy);
  $('#fecha-hoy', cont).textContent = fl.charAt(0).toUpperCase() + fl.slice(1);
  const reloj = setInterval(tic, 1000);

  const pintarLista = () => {
    const zona = $('#lista', cont);
    if (!estudiantes.length) {
      zona.innerHTML = vacio(estado.q ? 'No se encontraron estudiantes con ese nombre.' : 'No hay estudiantes activos en este grupo.');
      actualizarBarra();
      return;
    }
    const disponibles = estudiantes.filter((e) => !e.hora_hoy);
    const todos = disponibles.length && disponibles.every((e) => seleccion.has(e.id));
    zona.innerHTML = `
      <div class="tarjeta__cab">
        <label class="casilla"><input type="checkbox" id="sel-todos" ${todos ? 'checked' : ''} ${disponibles.length ? '' : 'disabled'}> Seleccionar todos (${disponibles.length})</label>
        <span style="color:var(--texto-3);font-size:13px">${estudiantes.length} estudiante(s) · contador del período actual</span>
      </div>
      <div class="tabla-env"><table class="tabla tabla--responsiva">
        <thead><tr><th style="width:40px"></th><th>Estudiante</th><th>Grado · Curso</th><th class="num">Período</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${estudiantes.map((e) => `
          <tr class="con-check ${seleccion.has(e.id) ? 'seleccionada' : ''}">
            <td class="check-celda"><input type="checkbox" class="casilla-est" data-id="${e.id}" ${seleccion.has(e.id) ? 'checked' : ''} ${e.hora_hoy ? 'disabled' : ''} aria-label="Seleccionar ${esc(e.nombre)}" style="width:18px;height:18px;accent-color:var(--azul-700)"></td>
            <td class="nombre-celda"><strong>${esc(e.nombre)}</strong>${e.tardanzas_periodo > umbral ? '<small style="color:var(--peligro)">En seguimiento</small>' : ''}</td>
            <td data-label="Grado · Curso">${esc(e.grado)} · ${esc(e.curso)}</td>
            <td data-label="Llegadas tarde en el período" class="num"><span class="${claseContador(e.tardanzas_periodo, umbral)}">${e.tardanzas_periodo}</span></td>
            <td data-label="Total histórico" class="num">${e.tardanzas_total}</td>
            <td class="acciones-celda">${e.hora_hoy
              ? `<button class="btn btn-sm btn-reportado" disabled>${icono('check')}Reportado ${esc(e.hora_hoy)}</button>`
              : `<button class="btn btn-sm btn-reportar" data-reportar="${e.id}" ${periodo ? '' : 'disabled'}>${icono('reloj')}Reportar llegada tarde</button>`}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    actualizarBarra();
  };

  const actualizarBarra = () => {
    const n = seleccion.size;
    $('#barra', cont).hidden = n === 0;
    $('#sel-texto', cont).textContent = `${n} estudiante(s) seleccionado(s)`;
    $('#btn-reportar-sel', cont).disabled = !periodo;
  };

  const cargarLista = async ({ silencioso = false } = {}) => {
    if (!estado.grado_id && !estado.q) { estudiantes = []; $('#lista', cont).innerHTML = vacio('Seleccione un grado o busque un estudiante para ver el listado.'); return; }
    if (!silencioso) $('#lista', cont).innerHTML = cargando();
    try {
      const r = await api.get(`/api/tardanzas/estudiantes${qs(estado.q ? { q: estado.q } : { grado_id: estado.grado_id, curso_id: estado.curso_id })}`);
      estudiantes = r.estudiantes;
      // Quitar de la selección a quienes ya fueron reportados (por otro docente, p. ej.)
      estudiantes.filter((e) => e.hora_hoy).forEach((e) => seleccion.delete(e.id));
      pintarLista();
    } catch (e) {
      if (!silencioso) $('#lista', cont).innerHTML = `<div class="aviso aviso--peligro" style="margin:16px">${esc(e.message)}</div>`;
    }
  };

  const cargarHoy = async () => {
    try {
      const r = await api.get('/api/tardanzas/hoy');
      $('#total-hoy', cont).textContent = r.reportes.length;
      $('#lista-hoy', cont).innerHTML = r.reportes.length ? r.reportes.map((t) => `
        <li><span class="hora">${esc(t.hora)}</span>
          <div class="det"><strong>${esc(t.nombre)}</strong><small>${esc(t.grado)} · ${esc(t.curso)}${t.registrado_por ? ` · ${esc(t.registrado_por)}` : ''}</small></div>
          ${ctx.esAdmin ? `<button class="btn btn-fantasma btn-icono" data-anular="${t.id}" title="Anular reporte" aria-label="Anular reporte de ${esc(t.nombre)}">${icono('papelera')}</button>` : ''}
        </li>`).join('') : `<li style="justify-content:center;color:var(--texto-3)">Sin reportes registrados hoy.</li>`;
    } catch { /* se reintenta en el siguiente ciclo */ }
  };

  const reportar = async (ids, boton) => {
    if (!ids.length) return;
    const obs = $('#observacion', cont).value.trim();
    await conCarga(boton, async () => {
      try {
        const r = await api.post('/api/tardanzas', { estudiante_ids: ids, observacion: obs });
        if (r.registrados.length) {
          const enSeg = r.registrados.filter((x) => x.acumulado_periodo > umbral);
          toast(`${r.registrados.length} llegada(s) tarde registrada(s) a las ${r.hora}.`, 'exito');
          if (enSeg.length) toast(`${enSeg.map((x) => x.nombre).join(', ')} supera(n) el límite de ${umbral} llegadas tarde y pasa(n) a seguimiento.`, 'info', 7000);
        }
        if (r.duplicados.length) toast(`${r.duplicados.length} estudiante(s) ya tenía(n) reporte hoy; no se duplicó.`, 'info');
        if (r.errores.length) toast(`${r.errores.length} no se pudieron registrar.`, 'error');
        ids.forEach((id) => seleccion.delete(id));
        $('#observacion', cont).value = '';
        await Promise.all([cargarLista({ silencioso: true }), cargarHoy()]);
      } catch (e) {
        toast(e.message, 'error', 7000);
      }
    });
  };

  // Eventos
  enlazarGradoCurso($('#r-grado', cont), $('#r-curso', cont), ctx.config, 'Todos los cursos del grado');
  const guardarFiltro = () => { try { sessionStorage.setItem(CLAVE_FILTRO, JSON.stringify({ grado_id: estado.grado_id, curso_id: estado.curso_id })); } catch { /* */ } };
  $('#r-grado', cont).addEventListener('change', (e) => { estado.grado_id = e.target.value; estado.curso_id = ''; estado.q = ''; $('#r-q', cont).value = ''; seleccion.clear(); guardarFiltro(); cargarLista(); });
  $('#r-curso', cont).addEventListener('change', (e) => { estado.curso_id = e.target.value; estado.q = ''; $('#r-q', cont).value = ''; seleccion.clear(); guardarFiltro(); cargarLista(); });
  $('#r-q', cont).addEventListener('input', debounce((e) => { estado.q = e.target.value.trim().length >= 2 ? e.target.value.trim() : ''; cargarLista(); }, 300));

  cont.addEventListener('change', (e) => {
    if (e.target.classList.contains('casilla-est')) {
      const id = Number(e.target.dataset.id);
      if (e.target.checked) seleccion.add(id); else seleccion.delete(id);
      e.target.closest('tr').classList.toggle('seleccionada', e.target.checked);
      const disp = estudiantes.filter((x) => !x.hora_hoy);
      const todos = $('#sel-todos', cont);
      if (todos) todos.checked = disp.length > 0 && disp.every((x) => seleccion.has(x.id));
      actualizarBarra();
    } else if (e.target.id === 'sel-todos') {
      estudiantes.filter((x) => !x.hora_hoy).forEach((x) => (e.target.checked ? seleccion.add(x.id) : seleccion.delete(x.id)));
      pintarLista();
    }
  });
  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.reportar) reportar([Number(b.dataset.reportar)], b);
    else if (b.id === 'btn-reportar-sel') reportar([...seleccion], b);
    else if (b.id === 'btn-limpiar') { seleccion.clear(); pintarLista(); }
    else if (b.dataset.anular) {
      if (!(await confirmar({ titulo: 'Anular reporte', mensaje: '¿Anular este reporte de llegada tarde? La acción queda registrada en la auditoría.', aceptar: 'Anular', peligro: true }))) return;
      try { await api.del(`/api/tardanzas/${b.dataset.anular}`, {}); toast('Reporte anulado.', 'exito'); cargarHoy(); cargarLista({ silencioso: true }); } catch (ex) { toast(ex.message, 'error'); }
    }
  });

  // Sincronización periódica con el servidor (varios docentes reportando a la vez)
  const sync = setInterval(() => { if (!document.hidden) { cargarHoy(); if (estudiantes.length) cargarLista({ silencioso: true }); } }, 30000);

  await Promise.all([cargarHoy(), cargarLista()]);
  return () => { clearInterval(reloj); clearInterval(sync); };
}
