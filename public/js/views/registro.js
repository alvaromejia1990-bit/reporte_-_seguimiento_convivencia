import { api, qs } from '../api.js';
import {
  $, $$, esc, icono, modal, confirmar, toast, conCarga, cargando, vacio, guardarBlob, debounce,
  opcionesGrado, opcionesCurso, enlazarGradoCurso, fechaCorta, fechaLarga, claseContador, numero,
} from '../ui.js';

export async function render(cont, ctx) {
  const admin = ctx.esAdmin;
  const estado = { q: '', grado_id: '', curso_id: '', estado: 'activos', pagina: 1 };

  cont.innerHTML = `
    <div class="encabezado-vista">
      <div>
        <h1>Registro de estudiantes</h1>
        <p>${admin ? 'Consulte, registre y actualice la base de estudiantes y sus acudientes.' : 'Consulta de estudiantes. Los datos de contacto están protegidos.'}</p>
      </div>
      ${admin ? `<div class="acciones">
        <button class="btn btn-secundario" id="btn-exportar">${icono('excel')}Exportar</button>
        <button class="btn btn-secundario" id="btn-importar">${icono('subir')}Carga masiva</button>
        <button class="btn btn-primario" id="btn-nuevo">${icono('mas')}Nuevo estudiante</button>
      </div>` : ''}
    </div>
    <div class="tarjeta">
      <div class="filtros">
        <div class="campo campo--ancho buscador">
          <label for="f-q">Buscar</label>
          <div class="buscador">${icono('buscar')}<input id="f-q" class="control" type="search" placeholder="Nombre, documento o acudiente"></div>
        </div>
        <div class="campo"><label for="f-grado">Grado</label><select id="f-grado" class="control">${opcionesGrado(ctx.config)}</select></div>
        <div class="campo"><label for="f-curso">Curso</label><select id="f-curso" class="control">${opcionesCurso(ctx.config, '')}</select></div>
        <div class="campo"><label for="f-estado">Estado</label>
          <select id="f-estado" class="control"><option value="activos">Activos</option><option value="retirados">Retirados</option><option value="todos">Todos</option></select>
        </div>
      </div>
      <div id="tabla-estudiantes">${cargando()}</div>
    </div>`;

  const cargar = async () => {
    const zona = $('#tabla-estudiantes', cont);
    try {
      const r = await api.get(`/api/estudiantes${qs({ ...estado, limite: 25 })}`);
      const umbral = ctx.config.umbral;
      if (!r.estudiantes.length) {
        zona.innerHTML = vacio(estado.q || estado.grado_id ? 'No hay estudiantes que coincidan con la búsqueda.' : 'Aún no hay estudiantes registrados.');
        return;
      }
      zona.innerHTML = `
        <div class="tabla-env"><table class="tabla tabla--responsiva">
          <thead><tr><th>Estudiante</th><th>Grado · Curso</th><th class="num">Edad</th><th>Acudiente</th><th>Contacto</th><th class="num" title="Llegadas tarde en el período actual / total">Llegadas tarde</th><th></th></tr></thead>
          <tbody>${r.estudiantes.map((e) => `
            <tr>
              <td class="nombre-celda"><strong>${esc(e.nombre)}</strong><small>${e.documento ? `Doc. ${esc(e.documento)}` : 'Sin documento'}${e.activo ? '' : ' · <span class="insignia insignia--gris">Retirado</span>'}</small></td>
              <td data-label="Grado · Curso">${esc(e.grado)} · <strong>${esc(e.curso)}</strong></td>
              <td data-label="Edad" class="num">${e.edad ?? '—'}</td>
              <td data-label="Acudiente">${esc(e.acudiente || '—')}</td>
              <td data-label="Contacto"><div><div>${esc(e.correo_acudiente || '—')}</div><small style="color:var(--texto-3)">${esc(e.telefono || '')}</small></div></td>
              <td data-label="Llegadas tarde (período / total)" class="num"><span class="${claseContador(e.tardanzas_periodo, umbral)}">${e.tardanzas_periodo}</span> <small style="color:var(--texto-3)">/ ${e.tardanzas_total}</small></td>
              <td class="acciones-celda">
                <button class="btn btn-fantasma btn-sm" data-ver="${e.id}">${icono('ojo')}Ver</button>
                ${admin ? `<button class="btn btn-fantasma btn-sm" data-editar="${e.id}">${icono('editar')}Editar</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody></table></div>
        <div class="paginacion">
          <span>${numero(r.total)} estudiante(s) · página ${r.pagina} de ${r.paginas}</span>
          <div class="acciones">
            <button class="btn btn-secundario btn-sm" data-pag="${r.pagina - 1}" ${r.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
            <button class="btn btn-secundario btn-sm" data-pag="${r.pagina + 1}" ${r.pagina >= r.paginas ? 'disabled' : ''}>Siguiente</button>
          </div>
        </div>`;
    } catch (e) {
      zona.innerHTML = `<div class="aviso aviso--peligro" style="margin:16px">${esc(e.message)}</div>`;
    }
  };

  const recargar = () => { estado.pagina = 1; cargar(); };
  $('#f-q', cont).addEventListener('input', debounce((e) => { estado.q = e.target.value.trim(); recargar(); }, 300));
  enlazarGradoCurso($('#f-grado', cont), $('#f-curso', cont), ctx.config);
  $('#f-grado', cont).addEventListener('change', (e) => { estado.grado_id = e.target.value; estado.curso_id = ''; recargar(); });
  $('#f-curso', cont).addEventListener('change', (e) => { estado.curso_id = e.target.value; recargar(); });
  $('#f-estado', cont).addEventListener('change', (e) => { estado.estado = e.target.value; recargar(); });

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pag) { estado.pagina = Number(b.dataset.pag); cargar(); }
    else if (b.dataset.ver) verEstudiante(Number(b.dataset.ver), ctx, cargar);
    else if (b.dataset.editar) formularioEstudiante(ctx, Number(b.dataset.editar), cargar);
    else if (b.id === 'btn-nuevo') formularioEstudiante(ctx, null, cargar);
    else if (b.id === 'btn-importar') cargaMasiva(ctx, cargar);
    else if (b.id === 'btn-exportar') {
      await conCarga(b, async () => {
        try { const { blob, nombre } = await api.archivo('/api/estudiantes/exportar.xlsx'); guardarBlob(blob, nombre); } catch (ex) { toast(ex.message, 'error'); }
      });
    }
  });

  await cargar();
}

/* ---------------- Detalle ---------------- */
async function verEstudiante(id, ctx, refrescar) {
  let d;
  try { d = await api.get(`/api/estudiantes/${id}`); } catch (e) { toast(e.message, 'error'); return; }
  const e = d.estudiante;
  const admin = ctx.esAdmin;
  const m = modal({
    titulo: e.nombre,
    ancho: true,
    cuerpo: `
      ${e.protegido ? `<div class="aviso">${icono('llave')}Datos de contacto protegidos. Solo el personal administrador puede consultarlos completos.</div>` : ''}
      <div class="ficha">
        <div><small>Documento</small><span>${esc(e.documento || '—')}</span></div>
        <div><small>Grado · Curso</small><span>${esc(e.grado)} · ${esc(e.curso)}</span></div>
        <div><small>Edad</small><span>${e.edad ? `${e.edad} años` : '—'}</span></div>
        <div><small>Estado</small><span>${e.activo ? '<span class="insignia insignia--exito">Activo</span>' : '<span class="insignia insignia--gris">Retirado</span>'}</span></div>
        <div><small>Acudiente</small><span>${esc(e.acudiente || '—')}</span></div>
        <div><small>Correo del acudiente</small><span>${esc(e.correo_acudiente || '—')}</span></div>
        <div><small>Teléfono</small><span>${esc(e.telefono || '—')}</span></div>
        <div><small>Dirección</small><span>${esc(e.direccion || '—')}</span></div>
      </div>
      <h3 style="font-size:15px;color:var(--azul-800);margin-bottom:8px">Historial de llegadas tarde (${d.tardanzas.length})</h3>
      ${d.tardanzas.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Período</th><th>Registrado por</th><th>Observación</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
        ${d.tardanzas.map((t) => `<tr><td style="text-transform:capitalize">${esc(fechaLarga(t.fecha))}</td><td>${esc(t.hora)}</td><td>${esc(t.periodo)}</td><td>${esc(t.registrado_por || '—')}</td><td>${esc(t.observacion || '—')}</td>
        ${admin ? `<td class="acciones-celda"><button class="btn btn-fantasma btn-sm" data-anular="${t.id}" title="Anular reporte">${icono('papelera')}</button></td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : vacio('Sin llegadas tarde registradas.')}`,
    pie: admin ? `
      <button class="btn btn-peligro" data-eliminar style="margin-right:auto">${icono('papelera')}Eliminar</button>
      <button class="btn btn-secundario" data-estado>${e.activo ? 'Retirar estudiante' : 'Reactivar estudiante'}</button>
      <button class="btn btn-primario" data-editar>${icono('editar')}Editar</button>` : '<button class="btn btn-secundario" data-cerrar>Cerrar</button>',
  });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.anular) {
      if (!(await confirmar({ titulo: 'Anular reporte', mensaje: 'El reporte de llegada tarde se eliminará y el contador del estudiante se actualizará. La acción queda registrada en la auditoría.', aceptar: 'Anular', peligro: true }))) return;
      try { await api.del(`/api/tardanzas/${b.dataset.anular}`, {}); toast('Reporte anulado.', 'exito'); m.cerrar(); verEstudiante(id, ctx, refrescar); refrescar(); } catch (ex) { toast(ex.message, 'error'); }
    } else if ('editar' in b.dataset) { m.cerrar(); formularioEstudiante(ctx, id, refrescar); }
    else if ('estado' in b.dataset) {
      if (!(await confirmar({ mensaje: e.activo ? `¿Retirar a <strong>${esc(e.nombre)}</strong>? Su historial se conserva y dejará de aparecer en los reportes diarios.` : `¿Reactivar a <strong>${esc(e.nombre)}</strong>?`, aceptar: e.activo ? 'Retirar' : 'Reactivar' }))) return;
      try { await api.patch(`/api/estudiantes/${id}/estado`, { activo: !e.activo }); toast('Estado actualizado.', 'exito'); m.cerrar(); refrescar(); } catch (ex) { toast(ex.message, 'error'); }
    } else if ('eliminar' in b.dataset) {
      if (!(await confirmar({ titulo: 'Eliminar definitivamente', mensaje: `Se eliminarán de forma permanente los datos de <strong>${esc(e.nombre)}</strong>, su historial de llegadas tarde y notificaciones. Use esta opción solo ante solicitudes de supresión de datos. Para estudiantes que se retiran, use "Retirar estudiante".`, aceptar: 'Eliminar definitivamente', peligro: true }))) return;
      try { await api.del(`/api/estudiantes/${id}`, {}); toast('Estudiante eliminado.', 'exito'); m.cerrar(); refrescar(); } catch (ex) { toast(ex.message, 'error'); }
    }
  });
}

/* ---------------- Formulario ---------------- */
async function formularioEstudiante(ctx, id, refrescar) {
  let e = { grado_id: '', curso_id: '' };
  if (id) {
    try { e = (await api.get(`/api/estudiantes/${id}`)).estudiante; } catch (ex) { toast(ex.message, 'error'); return; }
  }
  if (!ctx.config.grados.length) { toast('Primero configure grados y cursos en Configuración.', 'error'); return; }
  const v = (k) => esc(e[k] ?? '');
  const m = modal({
    titulo: id ? 'Editar estudiante' : 'Nuevo estudiante',
    cuerpo: `
      <form id="form-est" class="form-rejilla" novalidate>
        <div id="form-error" class="aviso aviso--peligro completo" hidden></div>
        <div class="seccion-form">Datos del estudiante</div>
        <div class="campo completo"><label for="e-nombre">Nombre completo *</label><input id="e-nombre" name="nombre" class="control" value="${v('nombre')}" required maxlength="120" autofocus></div>
        <div class="campo"><label for="e-doc">Documento de identidad</label><input id="e-doc" name="documento" class="control" value="${v('documento')}" maxlength="20" inputmode="numeric"><span class="ayuda">Recomendado: evita registros duplicados.</span></div>
        <div class="campo"><label for="e-edad">Edad</label><input id="e-edad" name="edad" class="control" type="number" min="3" max="30" value="${v('edad')}"></div>
        <div class="campo"><label for="e-grado">Grado *</label><select id="e-grado" name="grado_id" class="control" required>${opcionesGrado(ctx.config, e.grado_id, 'Seleccione…')}</select></div>
        <div class="campo"><label for="e-curso">Curso *</label><select id="e-curso" name="curso_id" class="control" required>${opcionesCurso(ctx.config, e.grado_id || '-1', e.curso_id, 'Seleccione…')}</select></div>
        <div class="seccion-form">Datos del acudiente</div>
        <div class="campo completo"><label for="e-acu">Nombre del acudiente</label><input id="e-acu" name="acudiente" class="control" value="${v('acudiente')}" maxlength="120"></div>
        <div class="campo"><label for="e-correo">Correo electrónico del acudiente</label><input id="e-correo" name="correo_acudiente" type="email" class="control" value="${v('correo_acudiente')}"></div>
        <div class="campo"><label for="e-tel">Teléfono</label><input id="e-tel" name="telefono" type="tel" class="control" value="${v('telefono')}"></div>
        <div class="campo completo"><label for="e-dir">Dirección</label><input id="e-dir" name="direccion" class="control" value="${v('direccion')}" maxlength="200"></div>
      </form>`,
    pie: `<button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" data-guardar>${icono('check')}Guardar</button>`,
  });
  const f = $('#form-est', m.el);
  enlazarGradoCurso($('#e-grado', f), $('#e-curso', f), ctx.config, 'Seleccione…');
  const guardar = async (boton) => {
    const datos = Object.fromEntries(new FormData(f));
    const err = $('#form-error', f);
    err.hidden = true;
    $$('.control', f).forEach((c) => c.classList.remove('invalido'));
    const faltan = ['nombre', 'grado_id', 'curso_id'].filter((k) => !String(datos[k] || '').trim());
    if (faltan.length) {
      faltan.forEach((k) => f.elements[k].classList.add('invalido'));
      err.textContent = 'Complete los campos obligatorios.';
      err.hidden = false;
      return;
    }
    await conCarga(boton, async () => {
      try {
        const r = id ? await api.put(`/api/estudiantes/${id}`, datos) : await api.post('/api/estudiantes', datos);
        toast(id ? 'Estudiante actualizado.' : 'Estudiante registrado.', 'exito');
        if (r.advertencias?.length) toast(r.advertencias.join(' '), 'info', 6000);
        m.cerrar();
        refrescar();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        m.el.querySelector('.modal__cuerpo').scrollTop = 0;
      }
    });
  };
  $('[data-guardar]', m.el).addEventListener('click', (ev) => guardar(ev.currentTarget));
  f.addEventListener('submit', (ev) => { ev.preventDefault(); guardar($('[data-guardar]', m.el)); });
}

/* ---------------- Carga masiva ---------------- */
function cargaMasiva(ctx, refrescar) {
  let archivo = null;
  const m = modal({
    titulo: 'Carga masiva de estudiantes',
    ancho: true,
    cuerpo: `
      <div class="aviso">${icono('info')}<div>Use un archivo <strong>Excel (.xlsx)</strong> o <strong>CSV</strong> con las columnas: Documento, Nombre completo, Edad, Grado, Curso, Acudiente, Correo acudiente, Teléfono y Dirección. Si el estudiante ya existe (por documento o nombre), sus datos se <strong>actualizan</strong>; no se crean duplicados.</div></div>
      <label class="zona-archivo" id="zona">
        ${icono('subir')}
        <div><strong id="nombre-archivo">Seleccione o arrastre el archivo aquí</strong></div>
        <small style="color:var(--texto-3)">Máximo 5 MB · hasta 5.000 estudiantes</small>
        <input type="file" id="archivo" accept=".xlsx,.csv" hidden>
      </label>
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0">
        <label class="casilla"><input type="checkbox" id="crear-faltantes"> Crear automáticamente grados y cursos que no existan</label>
        <button class="btn btn-fantasma btn-sm" data-plantilla>${icono('bajar')}Descargar plantilla</button>
      </div>
      <div id="resultado"></div>`,
    pie: `<button class="btn btn-secundario" data-cerrar>Cerrar</button>
          <button class="btn btn-secundario" data-validar disabled>Validar archivo</button>
          <button class="btn btn-primario" data-aplicar disabled>${icono('check')}Guardar cambios</button>`,
  });
  const zona = $('#zona', m.el);
  const input = $('#archivo', m.el);
  const bValidar = $('[data-validar]', m.el);
  const bAplicar = $('[data-aplicar]', m.el);
  const res = $('#resultado', m.el);

  const elegir = (f) => {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) { toast('Seleccione un archivo .xlsx o .csv', 'error'); return; }
    archivo = f;
    $('#nombre-archivo', m.el).textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
    bValidar.disabled = false;
    bAplicar.disabled = true;
    res.innerHTML = '';
    enviar('previsualizar', bValidar);
  };
  input.addEventListener('change', () => elegir(input.files[0]));
  ['dragover', 'dragenter'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('arrastrando'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, () => zona.classList.remove('arrastrando')));
  zona.addEventListener('drop', (e) => { e.preventDefault(); elegir(e.dataTransfer.files[0]); });
  $('#crear-faltantes', m.el).addEventListener('change', () => { if (archivo) enviar('previsualizar', bValidar); });

  const enviar = (modo, boton) => conCarga(boton, async () => {
    const fd = new FormData();
    fd.append('archivo', archivo);
    fd.append('modo', modo);
    fd.append('crear_faltantes', String($('#crear-faltantes', m.el).checked));
    try {
      const r = await api.post('/api/estudiantes/importar', fd);
      mostrarResultado(r);
      if (modo === 'aplicar') {
        bAplicar.disabled = true;
        toast(`Carga completada: ${r.resumen.crear} nuevos, ${r.resumen.actualizar} actualizados.`, 'exito', 6000);
        await ctx.recargarConfig();
        refrescar();
      } else {
        bAplicar.disabled = !(r.resumen.crear + r.resumen.actualizar);
      }
    } catch (ex) {
      res.innerHTML = `<div class="aviso aviso--peligro">${icono('alerta')}${esc(ex.message)}</div>`;
      bAplicar.disabled = true;
    }
  });
  bValidar.addEventListener('click', () => enviar('previsualizar', bValidar));
  bAplicar.addEventListener('click', () => enviar('aplicar', bAplicar));
  $('[data-plantilla]', m.el).addEventListener('click', async (e) => {
    try { const { blob, nombre } = await api.archivo('/api/estudiantes/plantilla.xlsx'); guardarBlob(blob, nombre); } catch (ex) { toast(ex.message, 'error'); }
    e.preventDefault();
  });

  function mostrarResultado(r) {
    const s = r.resumen;
    const etiquetas = { crear: ['exito', 'Nuevo'], actualizar: ['alerta', 'Actualizar'], sin_cambios: ['gris', 'Sin cambios'], error: ['peligro', 'Error'] };
    const filas = [...r.filas].sort((a, b) => (a.accion === 'error' ? -1 : 0) - (b.accion === 'error' ? -1 : 0) || a.fila - b.fila);
    res.innerHTML = `
      ${r.aplicado ? `<div class="aviso aviso--exito">${icono('check')}Los cambios se guardaron correctamente.</div>` : `<div class="aviso aviso--alerta">${icono('info')}Vista previa: revise los resultados. Aún no se ha guardado nada.</div>`}
      <div class="resumen-chips">
        <span class="insignia">${s.total} filas</span>
        <span class="insignia insignia--exito">${s.crear} nuevos</span>
        <span class="insignia insignia--alerta">${s.actualizar} por actualizar</span>
        <span class="insignia insignia--gris">${s.sin_cambios} sin cambios</span>
        <span class="insignia insignia--peligro">${s.errores} con errores (se omiten)</span>
      </div>
      ${s.nuevos_grados.length || s.nuevos_cursos.length ? `<div class="aviso">${icono('info')}Se ${r.aplicado ? 'crearon' : 'crearán'}: ${esc([...s.nuevos_grados.map((g) => `grado ${g}`), ...s.nuevos_cursos.map((c) => `curso ${c}`)].join(', '))}</div>` : ''}
      <div class="tabla-env" style="max-height:340px;overflow:auto;border:1px solid var(--borde);border-radius:8px">
        <table class="tabla"><thead><tr><th>Fila</th><th>Estudiante</th><th>Grado · Curso</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>
        ${filas.map((f) => `<tr><td>${f.fila}</td><td>${esc(f.nombre || '—')}</td><td>${esc(f.grado)} · ${esc(f.curso)}</td>
          <td><span class="insignia insignia--${etiquetas[f.accion][0]}">${etiquetas[f.accion][1]}</span></td>
          <td style="font-size:13px">${f.errores.length ? `<span style="color:var(--peligro)">${esc(f.errores.join(' '))}</span>` : ''}${f.cambios ? `Cambia: ${esc(f.cambios.join(', '))}` : ''}${f.advertencias.length && !f.errores.length ? `<div style="color:var(--texto-3)">${esc(f.advertencias.join(' '))}</div>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
  }
}
