import { api, qs } from '../api.js';
import {
  $, esc, icono, modal, toast, conCarga, cargando, vacio, guardarBlob, debounce, confirmar,
  opcionesGrado, opcionesCurso, opcionesPeriodo, enlazarGradoCurso, fechaCorta, fechaLarga, fechaHora,
  diaSemanaCorto, insigniaEstado,
} from '../ui.js';

export async function render(cont, ctx) {
  const periodoInicial = ctx.config.periodo_actual?.id || ctx.config.periodos.at(-1)?.id || 'todos';
  const estado = { periodo_id: String(periodoInicial), grado_id: '', curso_id: '', pestana: 'estudiantes', estadoNotif: '', q: '' };

  cont.innerHTML = `
    <div class="encabezado-vista">
      <div><h1>Seguimiento y notificaciones</h1><p>Estudiantes que superan el límite institucional de <strong>${ctx.config.umbral}</strong> llegadas tarde.</p></div>
    </div>
    ${ctx.config.correo_configurado ? '' : `<div class="aviso aviso--alerta">${icono('alerta')}<div>El servicio de correo no está configurado. ${ctx.esAdmin ? 'Defina los datos SMTP en el archivo <code>.env</code> del servidor (ver instrucciones de implementación).' : 'Informe al administrador.'}</div></div>`}
    <div class="pestanas" role="tablist">
      <button role="tab" aria-selected="true" data-pestana="estudiantes">Estudiantes en seguimiento</button>
      <button role="tab" aria-selected="false" data-pestana="historial">Historial de notificaciones</button>
    </div>
    <div class="tarjeta">
      <div class="filtros">
        <div class="campo"><label for="s-periodo">Período académico</label><select id="s-periodo" class="control">${opcionesPeriodo(ctx.config, estado.periodo_id)}</select></div>
        <div class="campo f-est"><label for="s-grado">Grado</label><select id="s-grado" class="control">${opcionesGrado(ctx.config)}</select></div>
        <div class="campo f-est"><label for="s-curso">Curso</label><select id="s-curso" class="control">${opcionesCurso(ctx.config, '')}</select></div>
        <div class="campo f-hist" hidden><label for="s-estado">Estado de entrega</label><select id="s-estado" class="control"><option value="">Todos</option><option value="enviado">Enviado</option><option value="rechazado">Rechazado</option><option value="fallido">Fallido</option></select></div>
        <div class="campo campo--ancho f-hist" hidden><label for="s-q">Estudiante</label><div class="buscador">${icono('buscar')}<input id="s-q" type="search" class="control" placeholder="Buscar por nombre"></div></div>
      </div>
      <div id="s-contenido">${cargando()}</div>
    </div>`;

  const zona = () => $('#s-contenido', cont);

  const cargarEstudiantes = async () => {
    zona().innerHTML = cargando();
    try {
      const r = await api.get(`/api/seguimiento${qs({ periodo_id: estado.periodo_id, grado_id: estado.grado_id, curso_id: estado.curso_id })}`);
      if (!r.estudiantes.length) { zona().innerHTML = vacio(`No hay estudiantes con más de ${r.umbral} llegadas tarde para los filtros seleccionados.`); return; }
      const sinNotificar = r.estudiantes.filter((e) => e.estado_notificacion !== 'enviado' || e.reportes_notificados < e.cantidad).length;
      zona().innerHTML = `
        <div class="tarjeta__cab"><span><strong>${r.estudiantes.length}</strong> estudiante(s) en seguimiento · ${esc(r.periodo?.nombre || 'Todos los períodos')}</span>
          ${sinNotificar ? `<span class="insignia insignia--alerta">${sinNotificar} con reportes nuevos sin notificar</span>` : '<span class="insignia insignia--exito">Todos notificados</span>'}</div>
        <div class="tabla-env"><table class="tabla tabla--responsiva">
          <thead><tr><th>Estudiante</th><th>Grado · Curso</th><th class="num">Reportes</th><th>Fechas</th><th>Acudiente</th><th>Última notificación</th><th></th></tr></thead>
          <tbody>${r.estudiantes.map((e) => {
            const pendiente = e.estado_notificacion !== 'enviado' || (e.reportes_notificados ?? 0) < e.cantidad;
            const fechas = e.fechas.slice(-6);
            return `<tr>
              <td class="nombre-celda"><strong>${esc(e.nombre)}</strong>${pendiente ? '<small style="color:var(--alerta)">Pendiente de notificar</small>' : ''}</td>
              <td data-label="Grado · Curso">${esc(e.grado)} · ${esc(e.curso)}</td>
              <td data-label="Reportes" class="num"><span class="contador contador--peligro">${e.cantidad}</span></td>
              <td data-label="Fechas recientes" style="min-width:250px;max-width:300px"><div>${e.fechas.length > 6 ? `<small style="color:var(--texto-3)">+${e.fechas.length - 6} </small>` : ''}${fechas.map((f) => `<span class="chip-fecha" title="${esc(fechaLarga(f))}">${diaSemanaCorto(f)} ${fechaCorta(f).slice(0, 5)}</span>`).join('')}</div></td>
              <td data-label="Acudiente"><div><div>${esc(e.acudiente || '—')}</div><small style="color:var(--texto-3)">${esc(e.correo_acudiente || 'Sin correo')}</small></div></td>
              <td data-label="Última notificación"><div>${e.ultima_notificacion ? `${insigniaEstado(e.estado_notificacion)}<div><small style="color:var(--texto-3)">${esc(fechaHora(e.ultima_notificacion))}</small></div>` : insigniaEstado(null)}</div></td>
              <td class="acciones-celda">
                <button class="btn btn-fantasma btn-sm" data-reporte="${e.id}">${icono('ojo')}Reporte</button>
                <button class="btn btn-fantasma btn-sm" data-pdf="${e.id}" title="Descargar PDF">${icono('pdf')}PDF</button>
                <button class="btn ${pendiente ? 'btn-primario' : 'btn-secundario'} btn-sm" data-notificar="${e.id}" ${e.correo_acudiente ? '' : 'disabled title="Sin correo del acudiente"'}>${icono('correo')}Notificar acudiente</button>
              </td></tr>`;
          }).join('')}</tbody></table></div>`;
    } catch (e) {
      zona().innerHTML = `<div class="aviso aviso--peligro" style="margin:16px">${esc(e.message)}</div>`;
    }
  };

  const cargarHistorial = async () => {
    zona().innerHTML = cargando();
    try {
      const r = await api.get(`/api/seguimiento/notificaciones${qs({ periodo_id: estado.periodo_id, estado: estado.estadoNotif, q: estado.q })}`);
      if (!r.notificaciones.length) { zona().innerHTML = vacio('No hay notificaciones registradas para estos filtros.'); return; }
      zona().innerHTML = `
        <div class="tabla-env"><table class="tabla tabla--responsiva">
          <thead><tr><th>Fecha de envío</th><th>Estudiante</th><th>Período</th><th>Destinatario</th><th class="num">Reportes</th><th>Estado de entrega</th><th>Enviado por</th></tr></thead>
          <tbody>${r.notificaciones.map((n) => `<tr>
            <td data-label="Fecha de envío">${esc(fechaHora(n.fecha_envio))}</td>
            <td class="nombre-celda"><strong>${esc(n.nombre)}</strong><small>${esc(n.grado)} · ${esc(n.curso)}</small></td>
            <td data-label="Período">${esc(n.periodo || 'Todos')}</td>
            <td data-label="Destinatario">${esc(n.destinatario)}</td>
            <td data-label="Reportes" class="num">${n.cantidad_reportes}</td>
            <td data-label="Estado">${insigniaEstado(n.estado)}${n.estado !== 'enviado' ? `<div><small style="color:var(--peligro)">${esc(n.detalle || '')}</small></div>` : ''}</td>
            <td data-label="Enviado por">${esc(n.enviado_por || '—')}</td></tr>`).join('')}
          </tbody></table></div>`;
    } catch (e) {
      zona().innerHTML = `<div class="aviso aviso--peligro" style="margin:16px">${esc(e.message)}</div>`;
    }
  };

  const cargar = () => (estado.pestana === 'estudiantes' ? cargarEstudiantes() : cargarHistorial());

  enlazarGradoCurso($('#s-grado', cont), $('#s-curso', cont), ctx.config);
  $('#s-periodo', cont).addEventListener('change', (e) => { estado.periodo_id = e.target.value; cargar(); });
  $('#s-grado', cont).addEventListener('change', (e) => { estado.grado_id = e.target.value; estado.curso_id = ''; cargar(); });
  $('#s-curso', cont).addEventListener('change', (e) => { estado.curso_id = e.target.value; cargar(); });
  $('#s-estado', cont).addEventListener('change', (e) => { estado.estadoNotif = e.target.value; cargar(); });
  $('#s-q', cont).addEventListener('input', debounce((e) => { estado.q = e.target.value.trim(); cargar(); }, 300));

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pestana) {
      estado.pestana = b.dataset.pestana;
      cont.querySelectorAll('[data-pestana]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
      cont.querySelectorAll('.f-est').forEach((x) => { x.hidden = estado.pestana !== 'estudiantes'; });
      cont.querySelectorAll('.f-hist').forEach((x) => { x.hidden = estado.pestana === 'estudiantes'; });
      cargar();
    } else if (b.dataset.reporte) verReporte(Number(b.dataset.reporte), estado.periodo_id, ctx, cargar);
    else if (b.dataset.pdf) descargarPdf(Number(b.dataset.pdf), estado.periodo_id, b);
    else if (b.dataset.notificar) notificar(Number(b.dataset.notificar), estado.periodo_id, cargar);
  });

  await cargar();
}

async function descargarPdf(id, periodo, boton) {
  await conCarga(boton, async () => {
    try {
      const { blob, nombre } = await api.archivo(`/api/seguimiento/estudiante/${id}/reporte.pdf${qs({ periodo_id: periodo })}`);
      guardarBlob(blob, nombre);
    } catch (e) { toast(e.message, 'error'); }
  });
}

/** Reporte individual en pantalla. */
async function verReporte(id, periodo, ctx, refrescar) {
  let d;
  try { d = await api.get(`/api/seguimiento/estudiante/${id}${qs({ periodo_id: periodo })}`); } catch (e) { toast(e.message, 'error'); return; }
  const e = d.estudiante;
  const m = modal({
    titulo: `Reporte individual · ${e.nombre}`,
    ancho: true,
    cuerpo: `
      <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="kpi ${d.tardanzas.length > d.umbral ? 'kpi--peligro' : ''}"><div class="kpi__valor">${d.tardanzas.length}</div><div class="kpi__etiqueta">Llegadas tarde · ${esc(d.periodo?.nombre || 'todos los períodos')}</div></div>
        <div class="kpi kpi--oro"><div class="kpi__valor">${d.umbral}</div><div class="kpi__etiqueta">Límite institucional</div></div>
        <div class="kpi kpi--exito"><div class="kpi__valor">${d.notificaciones.filter((n) => n.estado === 'enviado').length}</div><div class="kpi__etiqueta">Notificaciones enviadas</div></div>
      </div>
      <div class="ficha">
        <div><small>Estudiante</small><span>${esc(e.nombre)}</span></div>
        <div><small>Grado · Curso</small><span>${esc(e.grado)} · ${esc(e.curso)}</span></div>
        <div><small>Acudiente</small><span>${esc(e.acudiente || '—')}</span></div>
        <div><small>Correo del acudiente</small><span>${esc(e.correo_acudiente || '—')}</span></div>
        <div><small>Teléfono</small><span>${esc(e.telefono || '—')}</span></div>
        <div><small>Período</small><span>${esc(d.periodo?.nombre || 'Todos')}</span></div>
      </div>
      <h3 style="font-size:15px;color:var(--azul-800);margin-bottom:8px">Fechas de llegada tarde</h3>
      <div class="tabla-env" style="margin-bottom:18px"><table class="tabla"><thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Registrado por</th><th>Observación</th></tr></thead><tbody>
        ${d.tardanzas.map((t, i) => `<tr><td>${i + 1}</td><td style="text-transform:capitalize">${esc(fechaLarga(t.fecha))}</td><td>${esc(t.hora)}</td><td>${esc(t.registrado_por || '—')}</td><td>${esc(t.observacion || '—')}</td></tr>`).join('')}
      </tbody></table></div>
      <h3 style="font-size:15px;color:var(--azul-800);margin-bottom:8px">Historial de notificaciones</h3>
      ${d.notificaciones.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Fecha</th><th>Destinatario</th><th class="num">Reportes</th><th>Estado</th><th>Enviado por</th></tr></thead><tbody>
        ${d.notificaciones.map((n) => `<tr><td>${esc(fechaHora(n.fecha_envio))}</td><td>${esc(n.destinatario)}</td><td class="num">${n.cantidad_reportes}</td><td>${insigniaEstado(n.estado)}</td><td>${esc(n.enviado_por || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : vacio('Aún no se ha notificado al acudiente.')}`,
    pie: `<a class="btn btn-secundario" href="/api/seguimiento/estudiante/${id}/reporte.pdf${qs({ periodo_id: periodo, ver: 1 })}" target="_blank" rel="noopener">${icono('ojo')}Ver PDF</a>
          <button class="btn btn-secundario" data-pdf>${icono('bajar')}Descargar PDF</button>
          <button class="btn btn-primario" data-notif ${e.correo_acudiente ? '' : 'disabled'}>${icono('correo')}Notificar acudiente</button>`,
  });
  m.el.querySelector('[data-pdf]').addEventListener('click', (ev) => descargarPdf(id, periodo, ev.currentTarget));
  m.el.querySelector('[data-notif]').addEventListener('click', () => { m.cerrar(); notificar(id, periodo, refrescar); });
}

/** Vista previa del correo y envío. */
async function notificar(id, periodo, refrescar) {
  let vista;
  try { vista = await api.get(`/api/seguimiento/estudiante/${id}/vista-correo${qs({ periodo_id: periodo })}`); } catch (e) { toast(e.message, 'error'); return; }
  const m = modal({
    titulo: 'Notificar al acudiente',
    ancho: true,
    cuerpo: `
      <div class="ficha" style="margin-bottom:12px">
        <div><small>Para</small><span>${esc(vista.destinatario)}</span></div>
        <div><small>Asunto</small><span>${esc(vista.asunto)}</span></div>
      </div>
      <div class="aviso">${icono('pdf')}Se adjuntará el reporte individual en PDF.</div>
      <iframe class="vista-correo" sandbox title="Vista previa del correo"></iframe>`,
    pie: `<button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" data-enviar>${icono('correo')}Enviar correo</button>`,
  });
  m.el.querySelector('iframe').srcdoc = vista.html;
  const enviar = async (boton, forzar = false) => conCarga(boton, async () => {
    try {
      const r = await api.post(`/api/seguimiento/estudiante/${id}/notificar`, { periodo_id: periodo, forzar });
      if (r.estado === 'enviado') toast(`Correo enviado a ${r.destinatario}.`, 'exito');
      else toast(`El correo no se pudo entregar (${r.estado}): ${r.detalle}`, 'error', 9000);
      m.cerrar();
      refrescar();
    } catch (e) {
      if (e.datos?.requiere_confirmacion) {
        if (await confirmar({ titulo: 'Notificación reciente', mensaje: e.message, aceptar: 'Enviar de nuevo' })) await enviar(boton, true);
      } else toast(e.message, 'error', 8000);
    }
  });
  m.el.querySelector('[data-enviar]').addEventListener('click', (ev) => enviar(ev.currentTarget));
}
