import { api, qs } from '../api.js';
import {
  $, $$, esc, icono, toast, conCarga, cargando, vacio, guardarBlob,
  opcionesGrado, opcionesCurso, opcionesPeriodo, fechaCorta, numero,
} from '../ui.js';

const PALETA = ['#16324F', '#C8963E', '#2B8A8A', '#8C4F7D', '#5B7F2E', '#B85C38', '#4D6FA8', '#A07D2F', '#3F6E5A'];
const AZUL = '#1F4468';
const ORO = '#C8963E';
const ROJO = '#B42318';

let pluginRegistrado = false;
function prepararChart() {
  const C = window.Chart;
  if (!C) throw new Error('No se pudo cargar la librería de gráficos.');
  if (pluginRegistrado) return C;
  C.register({ id: 'fondoBlanco', beforeDraw(chart) { const { ctx, width, height } = chart; ctx.save(); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.restore(); } });
  C.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  C.defaults.color = '#52606D';
  C.defaults.plugins.legend.labels.boxWidth = 12;
  C.defaults.plugins.tooltip.backgroundColor = '#0E2236';
  C.defaults.maintainAspectRatio = false;
  C.defaults.devicePixelRatio = Math.max(2, window.devicePixelRatio || 1);
  pluginRegistrado = true;
  return C;
}

export async function render(cont, ctx) {
  const Chart = prepararChart();
  const filtros = { periodo_id: String(ctx.config.periodo_actual?.id || 'todos'), grado_id: '', curso_id: '', estudiante_id: '', desde: '', hasta: '' };
  const graficos = {};
  let datos = null;
  let modoTendencia = 'semanal';

  cont.innerHTML = `
    <div class="encabezado-vista">
      <div><h1>Informes y estadísticas</h1><p id="desc-filtros">Análisis de llegadas tarde por período, grado, curso y estudiante.</p></div>
      <div class="acciones">
        <button class="btn btn-secundario" id="exp-xlsx">${icono('excel')}Exportar Excel</button>
        <button class="btn btn-primario" id="exp-pdf">${icono('pdf')}Exportar PDF</button>
      </div>
    </div>
    <div class="tarjeta" style="margin-bottom:18px">
      <div class="filtros">
        <div class="campo"><label for="i-periodo">Período</label><select id="i-periodo" class="control">${opcionesPeriodo(ctx.config, filtros.periodo_id)}</select></div>
        <div class="campo"><label for="i-grado">Grado</label><select id="i-grado" class="control">${opcionesGrado(ctx.config)}</select></div>
        <div class="campo"><label for="i-curso">Curso</label><select id="i-curso" class="control">${opcionesCurso(ctx.config, '')}</select></div>
        <div class="campo"><label for="i-est">Estudiante</label><select id="i-est" class="control" disabled><option value="">Elija un curso primero</option></select></div>
        <div class="campo"><label for="i-desde">Desde</label><input id="i-desde" type="date" class="control"></div>
        <div class="campo"><label for="i-hasta">Hasta</label><input id="i-hasta" type="date" class="control"></div>
        <div class="campo" style="flex:0 0 auto"><label>&nbsp;</label><button class="btn btn-fantasma" id="i-limpiar">${icono('refrescar')}Limpiar</button></div>
      </div>
    </div>
    <div id="i-cuerpo">${cargando()}</div>`;

  const cuerpo = $('#i-cuerpo', cont);

  const destruir = () => { Object.values(graficos).forEach((g) => g.destroy()); Object.keys(graficos).forEach((k) => delete graficos[k]); };

  const crear = (clave, tipo, data, opciones = {}) => {
    const lienzo = $(`#g-${clave}`, cont);
    if (!lienzo) return;
    graficos[clave] = new Chart(lienzo, {
      type: tipo, data,
      options: {
        responsive: true,
        animation: { duration: 400 },
        plugins: { legend: { display: (data.datasets || []).length > 1, position: 'bottom' } },
        scales: tipo === 'doughnut' ? undefined : {
          x: { grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EEF1F4' } },
        },
        ...opciones,
      },
    });
  };

  const datosTendencia = () => {
    const t = datos.tendencia;
    if (modoTendencia === 'diaria') return { etiquetas: t.diaria.map((x) => fechaCorta(x.fecha).slice(0, 5)), valores: t.diaria.map((x) => x.cantidad) };
    if (modoTendencia === 'mensual') return { etiquetas: t.mensual.map((x) => x.etiqueta), valores: t.mensual.map((x) => x.cantidad) };
    return { etiquetas: t.semanal.map((x) => `Sem. ${fechaCorta(x.semana).slice(0, 5)}`), valores: t.semanal.map((x) => x.cantidad) };
  };

  const pintarTendencia = () => {
    graficos.tendencia?.destroy();
    const { etiquetas, valores } = datosTendencia();
    crear('tendencia', 'line', {
      labels: etiquetas,
      datasets: [{ label: 'Llegadas tarde', data: valores, borderColor: AZUL, backgroundColor: 'rgba(31,68,104,.10)', fill: true, tension: 0.3, pointRadius: valores.length > 60 ? 0 : 3, pointBackgroundColor: AZUL }],
    });
  };

  const pintar = () => {
    destruir();
    const k = datos.kpis;
    $('#desc-filtros', cont).textContent = datos.descripcion;
    if (!k.total_reportes) {
      cuerpo.innerHTML = `<div class="tarjeta">${vacio('No hay llegadas tarde registradas para los filtros seleccionados.')}</div>`;
      return;
    }
    const tarjeta = (clave, titulo, extra = '', alto = '') => `
      <div class="tarjeta"><div class="tarjeta__cab"><h3>${esc(titulo)}</h3>${extra}</div>
      <div class="tarjeta__cuerpo"><div class="grafico ${alto}"><canvas id="g-${clave}" role="img" aria-label="${esc(titulo)}"></canvas></div></div></div>`;
    cuerpo.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="kpi__valor">${numero(k.total_reportes)}</div><div class="kpi__etiqueta">Total de reportes</div><div class="kpi__nota">${k.dias_con_reporte} días con reportes · ${k.promedio_diario} por día</div></div>
        <div class="kpi kpi--oro"><div class="kpi__valor">${numero(k.estudiantes_con_reporte)}</div><div class="kpi__etiqueta">Estudiantes con reportes</div><div class="kpi__nota">${k.porcentaje_con_reporte}% de ${numero(k.poblacion)} activos</div></div>
        <div class="kpi kpi--peligro"><div class="kpi__valor">${numero(k.reincidentes)}</div><div class="kpi__etiqueta">Reincidentes (más de ${datos.umbral})</div><div class="kpi__nota">${k.estudiantes_con_reporte ? ((k.reincidentes / k.estudiantes_con_reporte) * 100).toFixed(1) : 0}% de quienes tienen reportes</div></div>
        <div class="kpi kpi--exito"><div class="kpi__valor">${k.promedio_por_estudiante}</div><div class="kpi__etiqueta">Promedio por estudiante</div><div class="kpi__nota">${k.dia_pico ? `Día pico: ${fechaCorta(k.dia_pico.fecha)} (${k.dia_pico.cantidad})` : ''}</div></div>
      </div>
      <div class="graficos">
        <div style="grid-column:1/-1">${tarjeta('tendencia', 'Tendencia temporal', `<div class="segmentado" role="group" aria-label="Agrupación">${['diaria', 'semanal', 'mensual'].map((m) => `<button type="button" data-tend="${m}" aria-pressed="${m === modoTendencia}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>`)}</div>
        ${tarjeta('grado', 'Llegadas tarde por grado')}
        ${tarjeta('curso', 'Llegadas tarde por curso')}
        ${tarjeta('periodos', 'Comparativo por período académico')}
        ${tarjeta('gradoPeriodo', 'Comparativo por grado y período')}
        ${tarjeta('dia', 'Distribución por día de la semana')}
        ${tarjeta('franja', 'Distribución por hora de llegada')}
        <div style="grid-column:1/-1">${tarjeta('top', 'Estudiantes con más llegadas tarde (top 10)', '', 'grafico--alto')}</div>
      </div>
      <div class="rejilla rejilla-2" style="margin-top:18px">
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Reincidentes (${datos.reincidentes.length})</h3></div>
          ${datos.reincidentes.length ? `<div class="tabla-env" style="max-height:420px;overflow:auto"><table class="tabla"><thead><tr><th>Estudiante</th><th>Curso</th><th class="num">Reportes</th><th>Última</th></tr></thead><tbody>
            ${datos.reincidentes.map((e) => `<tr><td>${esc(e.nombre)}</td><td>${esc(e.curso)}</td><td class="num"><span class="contador contador--peligro">${e.cantidad}</span></td><td>${fechaCorta(e.ultima)}</td></tr>`).join('')}
          </tbody></table></div>` : vacio('Ningún estudiante supera el límite.')}
        </div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Resumen por curso</h3></div>
          <div class="tabla-env" style="max-height:420px;overflow:auto"><table class="tabla"><thead><tr><th>Curso</th><th class="num">Reportes</th><th class="num">Estudiantes</th><th class="num">Matrícula</th><th class="num">Tasa</th></tr></thead><tbody>
            ${datos.porCurso.map((c) => `<tr><td>${esc(c.grado)} · <strong>${esc(c.nombre)}</strong></td><td class="num">${c.cantidad}</td><td class="num">${c.estudiantes}</td><td class="num">${c.matricula}</td><td class="num">${c.tasa ?? '—'}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;

    pintarTendencia();
    crear('grado', 'bar', { labels: datos.porGrado.map((g) => g.nombre), datasets: [{ label: 'Reportes', data: datos.porGrado.map((g) => g.cantidad), backgroundColor: AZUL, borderRadius: 5, maxBarThickness: 46 }] });
    crear('curso', 'bar', { labels: datos.porCurso.map((c) => c.nombre), datasets: [{ label: 'Reportes', data: datos.porCurso.map((c) => c.cantidad), backgroundColor: datos.porCurso.map((c) => (c.nombre === k.curso_critico?.nombre ? ROJO : AZUL)), borderRadius: 5, maxBarThickness: 40 }] });
    crear('periodos', 'bar', {
      labels: datos.comparativoPeriodos.map((p) => p.nombre),
      datasets: [
        { label: 'Reportes', data: datos.comparativoPeriodos.map((p) => p.cantidad), backgroundColor: AZUL, borderRadius: 5, maxBarThickness: 40 },
        { label: 'Estudiantes con reportes', data: datos.comparativoPeriodos.map((p) => p.estudiantes), backgroundColor: ORO, borderRadius: 5, maxBarThickness: 40 },
        { label: 'Reincidentes', data: datos.comparativoPeriodos.map((p) => p.reincidentes), backgroundColor: ROJO, borderRadius: 5, maxBarThickness: 40 },
      ],
    });
    crear('gradoPeriodo', 'bar', {
      labels: datos.comparativoGradoPeriodo.periodos,
      datasets: datos.comparativoGradoPeriodo.series.map((s, i) => ({ label: s.grado, data: s.valores, backgroundColor: PALETA[i % PALETA.length], borderRadius: 4, maxBarThickness: 26 })),
    });
    crear('dia', 'bar', { labels: datos.porDiaSemana.map((d) => d.dia), datasets: [{ label: 'Reportes', data: datos.porDiaSemana.map((d) => d.cantidad), backgroundColor: ORO, borderRadius: 5, maxBarThickness: 50 }] });
    crear('franja', 'bar', { labels: datos.porFranja.map((f) => f.franja), datasets: [{ label: 'Reportes', data: datos.porFranja.map((f) => f.cantidad), backgroundColor: '#2B8A8A', borderRadius: 5, maxBarThickness: 46 }] });
    const top = datos.porEstudiante.slice(0, 10);
    crear('top', 'bar', {
      labels: top.map((e) => `${e.nombre} (${e.curso})`),
      datasets: [{ label: 'Reportes', data: top.map((e) => e.cantidad), backgroundColor: top.map((e) => (e.cantidad > datos.umbral ? ROJO : AZUL)), borderRadius: 4, maxBarThickness: 22 }],
    }, {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EEF1F4' } }, y: { grid: { display: false } } },
    });
  };

  const cargar = async () => {
    cuerpo.innerHTML = cargando();
    try {
      datos = await api.get(`/api/informes${qs(filtros)}`);
      pintar();
    } catch (e) {
      cuerpo.innerHTML = `<div class="aviso aviso--peligro">${esc(e.message)}</div>`;
    }
  };

  const cargarEstudiantes = async () => {
    const sel = $('#i-est', cont);
    if (!filtros.curso_id) { sel.innerHTML = '<option value="">Elija un curso primero</option>'; sel.disabled = true; return; }
    const r = await api.get(`/api/estudiantes${qs({ curso_id: filtros.curso_id, estado: 'todos', limite: 500 })}`);
    sel.innerHTML = `<option value="">Todos los estudiantes</option>${r.estudiantes.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}`;
    sel.disabled = false;
  };

  // Filtros
  $('#i-periodo', cont).addEventListener('change', (e) => { filtros.periodo_id = e.target.value; cargar(); });
  $('#i-grado', cont).addEventListener('change', (e) => {
    filtros.grado_id = e.target.value; filtros.curso_id = ''; filtros.estudiante_id = '';
    $('#i-curso', cont).innerHTML = opcionesCurso(ctx.config, filtros.grado_id);
    cargarEstudiantes(); cargar();
  });
  $('#i-curso', cont).addEventListener('change', (e) => { filtros.curso_id = e.target.value; filtros.estudiante_id = ''; cargarEstudiantes(); cargar(); });
  $('#i-est', cont).addEventListener('change', (e) => { filtros.estudiante_id = e.target.value; cargar(); });
  $('#i-desde', cont).addEventListener('change', (e) => { filtros.desde = e.target.value; cargar(); });
  $('#i-hasta', cont).addEventListener('change', (e) => { filtros.hasta = e.target.value; cargar(); });
  $('#i-limpiar', cont).addEventListener('click', () => {
    Object.assign(filtros, { periodo_id: 'todos', grado_id: '', curso_id: '', estudiante_id: '', desde: '', hasta: '' });
    $('#i-periodo', cont).value = 'todos';
    $('#i-grado', cont).value = '';
    $('#i-curso', cont).innerHTML = opcionesCurso(ctx.config, '');
    $('#i-desde', cont).value = '';
    $('#i-hasta', cont).value = '';
    cargarEstudiantes(); cargar();
  });

  cont.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tend]');
    if (!b || !datos) return;
    modoTendencia = b.dataset.tend;
    $$('[data-tend]', cont).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    pintarTendencia();
  });

  const TITULOS = {
    tendencia: () => `Tendencia temporal (${modoTendencia})`, grado: () => 'Llegadas tarde por grado', curso: () => 'Llegadas tarde por curso',
    periodos: () => 'Comparativo por período académico', gradoPeriodo: () => 'Comparativo por grado y período',
    dia: () => 'Distribución por día de la semana', franja: () => 'Distribución por hora de llegada', top: () => 'Estudiantes con más llegadas tarde',
  };
  const exportar = (formato, boton) => conCarga(boton, async () => {
    try {
      const imgs = Object.entries(graficos).map(([k, g]) => ({ titulo: TITULOS[k]?.() || k, imagen: g.toBase64Image('image/png', 1) }));
      const { blob, nombre } = await api.archivoPost(`/api/informes/exportar/${formato}`, { filtros, graficos: imgs });
      guardarBlob(blob, nombre);
      toast('Informe generado.', 'exito');
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#exp-pdf', cont).addEventListener('click', (e) => exportar('pdf', e.currentTarget));
  $('#exp-xlsx', cont).addEventListener('click', (e) => exportar('xlsx', e.currentTarget));

  await cargar();
  return destruir;
}
