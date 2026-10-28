import { api } from '../api.js';
import { $, esc, icono, modal, confirmar, toast, conCarga, cargando, vacio, guardarBlob, fechaCorta, fechaHora } from '../ui.js';

const PESTANAS_ADMIN = [
  ['institucion', 'Institución'], ['periodos', 'Períodos académicos'], ['grados', 'Grados y cursos'],
  ['usuarios', 'Usuarios'], ['correo', 'Correo'], ['auditoria', 'Auditoría y respaldo'], ['cuenta', 'Mi cuenta'],
];

export async function render(cont, ctx, [pestanaInicial] = []) {
  const pestanas = ctx.esAdmin ? PESTANAS_ADMIN : [['cuenta', 'Mi cuenta']];
  let actual = pestanas.some(([k]) => k === pestanaInicial) ? pestanaInicial : pestanas[0][0];

  cont.innerHTML = `
    <div class="encabezado-vista"><div><h1>Configuración</h1><p>${ctx.esAdmin ? 'Parámetros institucionales, estructura académica, usuarios y seguridad.' : 'Opciones de su cuenta.'}</p></div></div>
    <div class="pestanas" role="tablist">${pestanas.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${k === actual}">${t}</button>`).join('')}</div>
    <div id="c-panel"></div>`;
  const panel = $('#c-panel', cont);

  const mostrar = async () => {
    panel.innerHTML = cargando();
    try {
      await ({ institucion, periodos, grados, usuarios, correo, auditoria, cuenta })[actual](panel, ctx);
    } catch (e) {
      panel.innerHTML = `<div class="aviso aviso--peligro">${esc(e.message)}</div>`;
    }
  };
  cont.querySelector('.pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    actual = b.dataset.tab;
    cont.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    history.replaceState(null, '', `#/configuracion/${actual}`);
    mostrar();
  });
  await mostrar();
}

/* ---------------- Institución ---------------- */
async function institucion(panel, ctx) {
  const i = ctx.config.institucion;
  panel.innerHTML = `
    <div class="tarjeta" style="max-width:760px"><div class="tarjeta__cuerpo">
      <form id="f-inst" class="form-rejilla">
        <div class="campo completo"><label>Nombre de la institución *</label><input class="control" name="nombre" value="${esc(i.nombre)}" required></div>
        <div class="campo"><label>Sigla</label><input class="control" name="sigla" value="${esc(i.sigla || '')}"></div>
        <div class="campo"><label>Ciudad / municipio</label><input class="control" name="ciudad" value="${esc(i.ciudad || '')}"></div>
        <div class="campo"><label>Firma de los correos</label><input class="control" name="firma_correo" value="${esc(i.firma_correo || '')}"><span class="ayuda">Ej.: Coordinación de Convivencia</span></div>
        <div class="campo"><label>Límite de llegadas tarde *</label><input class="control" type="number" min="1" max="50" name="umbral" value="${ctx.config.umbral}" required>
          <span class="ayuda">Los estudiantes con <strong>más</strong> de este número pasan a seguimiento.</span></div>
        <div class="completo" style="display:flex;justify-content:flex-end"><button class="btn btn-primario" type="submit">${icono('check')}Guardar cambios</button></div>
      </form>
      <div class="aviso" style="margin-top:12px;margin-bottom:0">${icono('info')}<div>Para usar el escudo de la institución, copie un archivo <code>logo.png</code> en la carpeta <code>public/img</code> del servidor. Aparecerá en la plataforma y en los informes PDF.</div></div>
    </div></div>`;
  $('#f-inst', panel).addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    datos.umbral = Number(datos.umbral);
    await conCarga(e.submitter, async () => {
      try { await api.put('/api/configuracion/institucion', datos); await ctx.recargarConfig(); toast('Configuración guardada.', 'exito'); } catch (ex) { toast(ex.message, 'error'); }
    });
  });
}

/* ---------------- Períodos ---------------- */
async function periodos(panel, ctx) {
  await ctx.recargarConfig();
  const lista = ctx.config.periodos;
  const hoy = ctx.config.hoy;
  panel.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta__cab"><h3>Períodos académicos</h3><button class="btn btn-primario btn-sm" data-nuevo>${icono('mas')}Nuevo período</button></div>
      ${lista.length ? `<div class="tabla-env"><table class="tabla tabla--responsiva"><thead><tr><th>Período</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr>
        <td class="nombre-celda"><strong>${esc(p.nombre)}</strong></td>
        <td data-label="Inicio">${fechaCorta(p.fecha_inicio)}</td><td data-label="Fin">${fechaCorta(p.fecha_fin)}</td>
        <td data-label="Estado">${hoy >= p.fecha_inicio && hoy <= p.fecha_fin ? '<span class="insignia insignia--exito">Vigente</span>' : hoy > p.fecha_fin ? '<span class="insignia insignia--gris">Finalizado</span>' : '<span class="insignia">Próximo</span>'}</td>
        <td class="acciones-celda"><button class="btn btn-fantasma btn-sm" data-editar="${p.id}">${icono('editar')}Editar</button><button class="btn btn-fantasma btn-sm" data-borrar="${p.id}">${icono('papelera')}</button></td>
      </tr>`).join('')}</tbody></table></div>` : vacio('No hay períodos configurados. Los reportes requieren un período vigente.')}
    </div>`;
  panel.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('nuevo' in b.dataset || b.dataset.editar) {
      const p = lista.find((x) => String(x.id) === b.dataset.editar) || {};
      const m = modal({
        titulo: p.id ? 'Editar período' : 'Nuevo período',
        cuerpo: `<form class="form-rejilla" id="f-per">
          <div class="campo completo"><label>Nombre *</label><input class="control" name="nombre" value="${esc(p.nombre || '')}" placeholder="Período 1" required autofocus></div>
          <div class="campo"><label>Fecha de inicio *</label><input class="control" type="date" name="fecha_inicio" value="${p.fecha_inicio || ''}" required></div>
          <div class="campo"><label>Fecha de finalización *</label><input class="control" type="date" name="fecha_fin" value="${p.fecha_fin || ''}" required></div></form>`,
        pie: '<button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" data-ok>Guardar</button>',
      });
      m.el.querySelector('[data-ok]').onclick = (ev) => conCarga(ev.currentTarget, async () => {
        const d = Object.fromEntries(new FormData($('#f-per', m.el)));
        try { p.id ? await api.put(`/api/configuracion/periodos/${p.id}`, d) : await api.post('/api/configuracion/periodos', d); toast('Período guardado.', 'exito'); m.cerrar(); periodos(panel, ctx); } catch (ex) { toast(ex.message, 'error'); }
      });
    } else if (b.dataset.borrar) {
      if (!(await confirmar({ mensaje: '¿Eliminar este período? Solo es posible si no tiene reportes.', aceptar: 'Eliminar', peligro: true }))) return;
      try { await api.del(`/api/configuracion/periodos/${b.dataset.borrar}`, {}); toast('Período eliminado.', 'exito'); periodos(panel, ctx); } catch (ex) { toast(ex.message, 'error'); }
    }
  };
}

/* ---------------- Grados y cursos ---------------- */
async function grados(panel, ctx) {
  await ctx.recargarConfig();
  const { grados: lista, cursos } = ctx.config;
  panel.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta__cab"><h3>Grados y cursos</h3><button class="btn btn-primario btn-sm" data-nuevo-grado>${icono('mas')}Nuevo grado</button></div>
      ${lista.length ? `<div class="tabla-env"><table class="tabla tabla--responsiva"><thead><tr><th>Grado</th><th class="num">Orden</th><th>Cursos</th><th class="num">Estudiantes</th><th></th></tr></thead><tbody>
      ${lista.map((g) => `<tr>
        <td class="nombre-celda"><strong>${esc(g.nombre)}</strong></td>
        <td data-label="Orden" class="num">${g.orden}</td>
        <td data-label="Cursos" class="sin-etiqueta">${cursos.filter((c) => c.grado_id === g.id).map((c) => `<span class="insignia" style="margin:2px">${esc(c.nombre)} <small style="opacity:.7">(${c.estudiantes})</small>
            <button class="btn-fantasma" style="border:0;background:none;cursor:pointer;padding:0 2px" data-editar-curso="${c.id}" title="Editar curso ${esc(c.nombre)}" aria-label="Editar curso ${esc(c.nombre)}">✎</button>
            <button style="border:0;background:none;cursor:pointer;padding:0 2px;color:var(--peligro)" data-borrar-curso="${c.id}" title="Eliminar curso" aria-label="Eliminar curso ${esc(c.nombre)}">×</button></span>`).join('') || '<small style="color:var(--texto-3)">Sin cursos</small>'}</td>
        <td data-label="Estudiantes" class="num">${g.estudiantes}</td>
        <td class="acciones-celda">
          <button class="btn btn-secundario btn-sm" data-nuevo-curso="${g.id}">${icono('mas')}Curso</button>
          <button class="btn btn-fantasma btn-sm" data-editar-grado="${g.id}">${icono('editar')}</button>
          <button class="btn btn-fantasma btn-sm" data-borrar-grado="${g.id}">${icono('papelera')}</button>
        </td></tr>`).join('')}</tbody></table></div>` : vacio('No hay grados configurados. También puede crearlos automáticamente durante la carga masiva.')}
    </div>`;

  const formulario = (titulo, campos, accion) => {
    const m = modal({
      titulo,
      cuerpo: `<form id="f-gc">${campos}</form>`,
      pie: '<button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" data-ok>Guardar</button>',
    });
    const enviar = (boton) => conCarga(boton, async () => {
      try { await accion(Object.fromEntries(new FormData($('#f-gc', m.el)))); toast('Cambios guardados.', 'exito'); m.cerrar(); grados(panel, ctx); } catch (ex) { toast(ex.message, 'error'); }
    });
    m.el.querySelector('[data-ok]').onclick = (ev) => enviar(ev.currentTarget);
    $('#f-gc', m.el).onsubmit = (ev) => { ev.preventDefault(); enviar(m.el.querySelector('[data-ok]')); };
  };

  panel.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('nuevoGrado' in d || d.editarGrado) {
      const g = lista.find((x) => String(x.id) === d.editarGrado) || {};
      formulario(g.id ? 'Editar grado' : 'Nuevo grado', `
        <div class="campo"><label>Nombre del grado *</label><input class="control" name="nombre" value="${esc(g.nombre || '')}" placeholder="Sexto" autofocus></div>
        <div class="campo"><label>Orden</label><input class="control" type="number" name="orden" value="${g.orden ?? ''}"><span class="ayuda">Define el orden en listados e informes (p. ej. 6 para Sexto).</span></div>`,
      (v) => (g.id ? api.put(`/api/configuracion/grados/${g.id}`, v) : api.post('/api/configuracion/grados', v)));
    } else if (d.nuevoCurso) {
      const g = lista.find((x) => String(x.id) === d.nuevoCurso);
      formulario(`Nuevo curso · ${g.nombre}`, '<div class="campo"><label>Nombre del curso *</label><input class="control" name="nombre" placeholder="601" autofocus></div>',
        (v) => api.post('/api/configuracion/cursos', { ...v, grado_id: g.id }));
    } else if (d.editarCurso) {
      const c = cursos.find((x) => String(x.id) === d.editarCurso);
      formulario('Editar curso', `<div class="campo"><label>Nombre del curso *</label><input class="control" name="nombre" value="${esc(c.nombre)}" autofocus></div>`,
        (v) => api.put(`/api/configuracion/cursos/${c.id}`, v));
    } else if (d.borrarGrado || d.borrarCurso) {
      if (!(await confirmar({ mensaje: `¿Eliminar este ${d.borrarGrado ? 'grado' : 'curso'}? Solo es posible si no tiene estudiantes ni reportes asociados.`, aceptar: 'Eliminar', peligro: true }))) return;
      try {
        await api.del(d.borrarGrado ? `/api/configuracion/grados/${d.borrarGrado}` : `/api/configuracion/cursos/${d.borrarCurso}`, {});
        toast('Eliminado.', 'exito');
        grados(panel, ctx);
      } catch (ex) { toast(ex.message, 'error'); }
    }
  };
}

/* ---------------- Usuarios ---------------- */
async function usuarios(panel, ctx) {
  const { usuarios: lista } = await api.get('/api/configuracion/usuarios');
  panel.innerHTML = `
    <div class="aviso">${icono('llave')}<div><strong>Administrador:</strong> gestiona estudiantes, carga masiva, configuración, usuarios y anulación de reportes; consulta todos los datos de contacto. <strong>Docente:</strong> reporta llegadas tarde, consulta seguimiento e informes y notifica acudientes, con datos de contacto protegidos.</div></div>
    <div class="tarjeta">
      <div class="tarjeta__cab"><h3>Usuarios (${lista.length})</h3><button class="btn btn-primario btn-sm" data-nuevo>${icono('mas')}Nuevo usuario</button></div>
      <div class="tabla-env"><table class="tabla tabla--responsiva"><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>
      ${lista.map((u) => `<tr>
        <td class="nombre-celda"><strong>${esc(u.nombre)}</strong><small>${esc(u.email)}</small></td>
        <td data-label="Rol">${u.rol === 'admin' ? '<span class="insignia">Administrador</span>' : '<span class="insignia insignia--gris">Docente</span>'}</td>
        <td data-label="Estado">${u.activo ? '<span class="insignia insignia--exito">Activo</span>' : '<span class="insignia insignia--peligro">Inactivo</span>'}</td>
        <td data-label="Último acceso">${esc(fechaHora(u.ultimo_acceso))}</td>
        <td class="acciones-celda"><button class="btn btn-fantasma btn-sm" data-editar="${u.id}">${icono('editar')}Editar</button></td>
      </tr>`).join('')}</tbody></table></div>
    </div>`;
  panel.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !('nuevo' in b.dataset || b.dataset.editar)) return;
    const u = lista.find((x) => String(x.id) === b.dataset.editar) || { rol: 'docente', activo: 1 };
    const m = modal({
      titulo: u.id ? 'Editar usuario' : 'Nuevo usuario',
      cuerpo: `<form class="form-rejilla" id="f-usr" autocomplete="off">
        <div class="campo completo"><label>Nombre completo *</label><input class="control" name="nombre" value="${esc(u.nombre || '')}" autofocus></div>
        <div class="campo completo"><label>Correo electrónico *</label><input class="control" type="email" name="email" value="${esc(u.email || '')}"></div>
        <div class="campo"><label>Rol *</label><select class="control" name="rol"><option value="docente" ${u.rol === 'docente' ? 'selected' : ''}>Docente</option><option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option></select></div>
        <div class="campo"><label>Estado</label><select class="control" name="activo"><option value="1" ${u.activo ? 'selected' : ''}>Activo</option><option value="0" ${u.activo ? '' : 'selected'}>Inactivo</option></select></div>
        <div class="campo completo"><label>${u.id ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label><input class="control" type="password" name="password" autocomplete="new-password"><span class="ayuda">Mínimo 8 caracteres, con letras y números.${u.id ? ' Al cambiarla se cierran las sesiones abiertas del usuario.' : ''}</span></div>
      </form>`,
      pie: '<button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" data-ok>Guardar</button>',
    });
    m.el.querySelector('[data-ok]').onclick = (ev) => conCarga(ev.currentTarget, async () => {
      const d = Object.fromEntries(new FormData($('#f-usr', m.el)));
      d.activo = d.activo === '1';
      if (u.id && !d.password) delete d.password;
      try { u.id ? await api.put(`/api/configuracion/usuarios/${u.id}`, d) : await api.post('/api/configuracion/usuarios', d); toast('Usuario guardado.', 'exito'); m.cerrar(); usuarios(panel, ctx); } catch (ex) { toast(ex.message, 'error'); }
    });
  };
}

/* ---------------- Correo ---------------- */
async function correo(panel, ctx) {
  panel.innerHTML = cargando();
  const s = await api.get('/api/configuracion/correo');
  panel.innerHTML = `
    <div class="tarjeta" style="max-width:760px"><div class="tarjeta__cuerpo">
      <div class="ficha">
        <div><small>Servicio</small><span>${s.configurado ? '<span class="insignia insignia--exito">Configurado</span>' : '<span class="insignia insignia--peligro">No configurado</span>'}</span></div>
        <div><small>Conexión con el servidor SMTP</small><span>${s.conexion === 'ok' ? '<span class="insignia insignia--exito">Correcta</span>' : s.conexion ? `<span class="insignia insignia--peligro">Error</span> <small style="color:var(--peligro)">${esc(s.conexion)}</small>` : '—'}</span></div>
        <div><small>Servidor</small><span>${esc(s.servidor || '—')}</span></div>
        <div><small>Remitente</small><span>${esc(s.remitente || '—')}</span></div>
      </div>
      <div class="aviso">${icono('info')}<div>Los datos del servidor de correo (SMTP) se definen en el archivo <code>.env</code> del servidor por seguridad; las contraseñas nunca se guardan en la base de datos. Consulte la guía de implementación para Google Workspace, Microsoft 365 o un servicio transaccional.</div></div>
      <form id="f-prueba" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="campo" style="flex:1 1 260px;margin:0"><label>Enviar correo de prueba a</label><input class="control" type="email" name="para" value="${esc(ctx.usuario.email)}"></div>
        <button class="btn btn-primario" type="submit" ${s.configurado ? '' : 'disabled'}>${icono('correo')}Enviar prueba</button>
      </form>
    </div></div>`;
  $('#f-prueba', panel).addEventListener('submit', (e) => {
    e.preventDefault();
    conCarga(e.submitter, async () => {
      try {
        const r = await api.post('/api/configuracion/correo/prueba', { para: new FormData(e.target).get('para') });
        toast(r.estado === 'enviado' ? 'Correo de prueba enviado.' : `No se pudo enviar: ${r.detalle}`, r.estado === 'enviado' ? 'exito' : 'error', 8000);
      } catch (ex) { toast(ex.message, 'error'); }
    });
  });
}

/* ---------------- Auditoría ---------------- */
const ACCIONES = {
  login: 'Inicio de sesión', login_fallido: 'Intento de ingreso fallido', cambio_clave: 'Cambio de contraseña',
  crear_estudiante: 'Registro de estudiante', editar_estudiante: 'Edición de estudiante', retirar_estudiante: 'Retiro de estudiante',
  reactivar_estudiante: 'Reactivación de estudiante', eliminar_estudiante: 'Eliminación de estudiante', importacion_estudiantes: 'Carga masiva',
  exportar_estudiantes: 'Exportación de estudiantes', reportar_tardanza: 'Reporte de llegada tarde', anular_tardanza: 'Anulación de reporte',
  notificar_acudiente: 'Notificación a acudiente', exportar_informe: 'Exportación de informe', descargar_respaldo: 'Descarga de respaldo',
  prueba_correo: 'Prueba de correo',
};
async function auditoria(panel) {
  const { registros } = await api.get('/api/configuracion/auditoria?limite=300');
  panel.innerHTML = `
    <div class="tarjeta" style="margin-bottom:18px"><div class="tarjeta__cuerpo" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between">
      <div><strong>Copia de seguridad</strong><div style="color:var(--texto-2);font-size:14px">Descargue una copia completa de la base de datos. Guárdela en un lugar seguro: contiene datos personales.</div></div>
      <button class="btn btn-secundario" id="btn-respaldo">${icono('bajar')}Descargar respaldo</button>
    </div></div>
    <div class="tarjeta"><div class="tarjeta__cab"><h3>Registro de auditoría (últimos ${registros.length})</h3></div>
      <div class="tabla-env" style="max-height:560px;overflow:auto"><table class="tabla tabla--responsiva"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead><tbody>
      ${registros.map((r) => `<tr><td data-label="Fecha">${esc(fechaHora(r.fecha))}</td><td data-label="Usuario">${esc(r.usuario || '—')}</td><td data-label="Acción">${esc(ACCIONES[r.accion] || r.accion)}</td>
        <td data-label="Detalle" style="font-size:12.5px;color:var(--texto-2);max-width:380px;word-break:break-word">${esc(r.detalle && r.detalle !== 'null' ? r.detalle : '')}</td><td data-label="IP" style="font-size:12.5px">${esc(r.ip || '')}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  $('#btn-respaldo', panel).addEventListener('click', (e) => conCarga(e.currentTarget, async () => {
    try { const { blob, nombre } = await api.archivo('/api/configuracion/respaldo'); guardarBlob(blob, nombre); } catch (ex) { toast(ex.message, 'error'); }
  }));
}

/* ---------------- Mi cuenta ---------------- */
async function cuenta(panel, ctx) {
  panel.innerHTML = `
    <div class="tarjeta" style="max-width:520px"><div class="tarjeta__cab"><h3>Cambiar contraseña</h3></div><div class="tarjeta__cuerpo">
      <p style="margin-top:0;color:var(--texto-2)">${esc(ctx.usuario.nombre)} · ${esc(ctx.usuario.email)}</p>
      <form id="f-clave">
        <div class="campo"><label>Contraseña actual</label><input class="control" type="password" name="actual" autocomplete="current-password" required></div>
        <div class="campo"><label>Nueva contraseña</label><input class="control" type="password" name="nueva" autocomplete="new-password" required><span class="ayuda">Mínimo 8 caracteres, con letras y números.</span></div>
        <div class="campo"><label>Confirmar nueva contraseña</label><input class="control" type="password" name="confirmar" autocomplete="new-password" required></div>
        <button class="btn btn-primario" type="submit">${icono('llave')}Actualizar contraseña</button>
      </form>
    </div></div>`;
  $('#f-clave', panel).addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (d.nueva !== d.confirmar) { toast('Las contraseñas nuevas no coinciden.', 'error'); return; }
    conCarga(e.submitter, async () => {
      try { await api.put('/api/auth/clave', d); e.target.reset(); toast('Contraseña actualizada. Las demás sesiones se cerraron.', 'exito'); } catch (ex) { toast(ex.message, 'error'); }
    });
  });
}
