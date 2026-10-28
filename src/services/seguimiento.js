'use strict';

const { db, leerConfig, periodoDeFecha, auditar } = require('../db');
const est = require('./estudiantes');
const correo = require('./correo');
const pdf = require('./pdf');
const { ahora, fechaCorta, fechaLarga, DIAS, diaSemana, marcaTiempo, ErrorHttp } = require('../utils');

/** Interpreta el parámetro de período: '' => vigente (o el más reciente), 'todos' => null, id => ese período. */
function resolverPeriodo(valor) {
  if (valor === 'todos') return null;
  if (valor) {
    const p = db.prepare('SELECT * FROM periodos WHERE id = ?').get(Number(valor));
    if (!p) throw new ErrorHttp(404, 'Período no encontrado.');
    return p;
  }
  return periodoDeFecha(ahora().fecha)
    || db.prepare('SELECT * FROM periodos WHERE fecha_inicio <= ? ORDER BY fecha_inicio DESC LIMIT 1').get(ahora().fecha)
    || db.prepare('SELECT * FROM periodos ORDER BY fecha_inicio DESC LIMIT 1').get()
    || null;
}

/** Estudiantes que superan el umbral de llegadas tarde. */
function listar({ periodo, grado_id, curso_id, umbral }) {
  const where = ['e.activo = 1'];
  const p = { umbral };
  if (periodo) { where.push('lt.periodo_id = @periodo_id'); p.periodo_id = periodo.id; }
  if (grado_id) { where.push('e.grado_id = @grado_id'); p.grado_id = Number(grado_id); }
  if (curso_id) { where.push('e.curso_id = @curso_id'); p.curso_id = Number(curso_id); }
  const filtroNotif = periodo ? 'AND n.periodo_id = @periodo_id' : '';
  return db.prepare(`
    SELECT e.id, e.nombre, e.acudiente, e.correo_acudiente, g.nombre AS grado, c.nombre AS curso,
           COUNT(lt.id) AS cantidad, MIN(lt.fecha) AS primera, MAX(lt.fecha) AS ultima,
           GROUP_CONCAT(lt.fecha, ',') AS fechas,
           (SELECT n.fecha_envio FROM notificaciones n WHERE n.estudiante_id = e.id ${filtroNotif} ORDER BY n.id DESC LIMIT 1) AS ultima_notificacion,
           (SELECT n.estado FROM notificaciones n WHERE n.estudiante_id = e.id ${filtroNotif} ORDER BY n.id DESC LIMIT 1) AS estado_notificacion,
           (SELECT n.cantidad_reportes FROM notificaciones n WHERE n.estudiante_id = e.id ${filtroNotif} AND n.estado = 'enviado' ORDER BY n.id DESC LIMIT 1) AS reportes_notificados
    FROM llegadas_tarde lt
    JOIN estudiantes e ON e.id = lt.estudiante_id
    JOIN grados g ON g.id = e.grado_id
    JOIN cursos c ON c.id = e.curso_id
    WHERE ${where.join(' AND ')}
    GROUP BY e.id
    HAVING COUNT(lt.id) > @umbral
    ORDER BY cantidad DESC, g.orden, c.nombre, e.nombre`).all(p)
    .map((f) => ({ ...f, fechas: (f.fechas || '').split(',').filter(Boolean).sort() }));
}

/** Detalle completo de un estudiante para el reporte individual. */
function detalle(estudianteId, periodo) {
  const e = est.obtener(estudianteId);
  if (!e) throw new ErrorHttp(404, 'Estudiante no encontrado.');
  const tardanzas = db.prepare(`
    SELECT lt.fecha, lt.hora, lt.observacion, p.nombre AS periodo, u.nombre AS registrado_por
    FROM llegadas_tarde lt
    JOIN periodos p ON p.id = lt.periodo_id
    LEFT JOIN usuarios u ON u.id = lt.registrado_por
    WHERE lt.estudiante_id = ? ${periodo ? 'AND lt.periodo_id = ?' : ''}
    ORDER BY lt.fecha`).all(...(periodo ? [e.id, periodo.id] : [e.id]));
  const notificaciones = db.prepare(`
    SELECT n.id, n.fecha_envio, n.destinatario, n.estado, n.detalle, n.cantidad_reportes, p.nombre AS periodo, u.nombre AS enviado_por
    FROM notificaciones n
    LEFT JOIN periodos p ON p.id = n.periodo_id
    LEFT JOIN usuarios u ON u.id = n.enviado_por
    WHERE n.estudiante_id = ? ${periodo ? 'AND n.periodo_id = ?' : ''}
    ORDER BY n.id DESC`).all(...(periodo ? [e.id, periodo.id] : [e.id]));
  return { estudiante: e, periodo, tardanzas, notificaciones };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Contenido del correo al acudiente. */
function construirCorreo(d, config) {
  const e = d.estudiante;
  const nombrePeriodo = d.periodo ? d.periodo.nombre : 'Todos los períodos';
  const inst = config.institucion_nombre;
  const asunto = `${inst}: reporte de llegadas tarde de ${e.nombre} (${nombrePeriodo})`;
  const filas = d.tardanzas.map((t, i) => `
      <tr style="background:${i % 2 ? '#F3F6F9' : '#FFFFFF'}">
        <td style="padding:7px 10px;border-bottom:1px solid #E3E8EE">${i + 1}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #E3E8EE">${esc(DIAS[diaSemana(t.fecha)])} ${esc(fechaCorta(t.fecha))}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #E3E8EE">${esc(t.hora)}</td>
      </tr>`).join('');
  const dato = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#5B6B7B;font-size:13px">${k}</td><td style="padding:4px 0;font-weight:600;font-size:13px">${esc(v || '—')}</td></tr>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#EEF2F6;font-family:Segoe UI,Arial,sans-serif;color:#1F2933">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F6;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden">
    <tr><td style="background:#16324F;padding:22px 28px;color:#FFFFFF">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#E5C68E">Notificación institucional</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">${esc(inst)}</div>
    </td></tr>
    <tr><td style="padding:26px 28px 8px">
      <p style="margin:0 0 14px;font-size:15px">Estimado(a) <strong>${esc(e.acudiente || 'acudiente')}</strong>:</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6">Le informamos que el(la) estudiante <strong>${esc(e.nombre)}</strong> registra
      <strong style="color:#B42318">${d.tardanzas.length} llegadas tarde</strong> en el período académico <strong>${esc(nombrePeriodo)}</strong>,
      lo que supera el límite establecido por la institución (${config.umbral_seguimiento}). Solicitamos su acompañamiento para promover la puntualidad.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px">
        ${dato('Estudiante', e.nombre)}${dato('Grado', e.grado)}${dato('Curso', e.curso)}${dato('Período académico', nombrePeriodo)}
        ${dato('Cantidad de reportes', String(d.tardanzas.length))}${dato('Acudiente', e.acudiente)}${dato('Correo del acudiente', e.correo_acudiente)}${dato('Teléfono registrado', e.telefono)}
      </table>
      <div style="font-weight:700;font-size:14px;margin:0 0 8px;color:#16324F">Fechas de llegada tarde</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E8EE;border-radius:6px;font-size:13px;border-collapse:collapse">
        <tr style="background:#16324F;color:#FFFFFF"><th align="left" style="padding:8px 10px">#</th><th align="left" style="padding:8px 10px">Fecha</th><th align="left" style="padding:8px 10px">Hora de llegada</th></tr>
        ${filas}
      </table>
      <p style="margin:18px 0 6px;font-size:13px;line-height:1.6">Adjuntamos el reporte individual en PDF. Si tiene inquietudes, puede comunicarse con la institución respondiendo a este correo.</p>
      <p style="margin:16px 0 0;font-size:14px">Cordialmente,<br><strong>${esc(config.firma_correo || 'Coordinación')}</strong><br>${esc(inst)}</p>
    </td></tr>
    <tr><td style="padding:16px 28px 22px;font-size:11px;color:#7A8896;border-top:1px solid #E3E8EE;margin-top:16px">
      Este mensaje contiene información personal protegida por la Ley 1581 de 2012 y está dirigido exclusivamente al acudiente registrado.
      Si lo recibió por error, por favor elimínelo e informe a la institución.
    </td></tr>
  </table></td></tr></table></body></html>`;
  const texto = [
    `${inst}`, '', `Estimado(a) ${e.acudiente || 'acudiente'}:`, '',
    `El(la) estudiante ${e.nombre} (grado ${e.grado}, curso ${e.curso}) registra ${d.tardanzas.length} llegadas tarde (${nombrePeriodo}).`,
    '', 'Fechas:', ...d.tardanzas.map((t, i) => `${i + 1}. ${fechaCorta(t.fecha)} - ${t.hora}`), '',
    `Acudiente: ${e.acudiente || '—'} · Correo: ${e.correo_acudiente || '—'} · Teléfono: ${e.telefono || '—'}`, '',
    'Cordialmente,', config.firma_correo || 'Coordinación', inst,
  ].join('\n');
  return { asunto, html, texto };
}

/** PDF del reporte individual. */
async function pdfIndividual(d, usuario) {
  const config = leerConfig();
  const e = usuario?.rol === 'admin' ? d.estudiante : est.proteger(d.estudiante, usuario);
  const nombrePeriodo = d.periodo ? d.periodo.nombre : 'Todos los períodos';
  const { doc, terminado } = pdf.nuevoDocumento(`Reporte individual - ${e.nombre}`);
  pdf.encabezado(doc, config, 'Reporte individual de llegadas tarde',
    `Período académico: ${nombrePeriodo}${d.periodo ? ` (${fechaCorta(d.periodo.fecha_inicio)} – ${fechaCorta(d.periodo.fecha_fin)})` : ''}`);

  pdf.tituloSeccion(doc, 'Datos del estudiante');
  pdf.fichaDatos(doc, [
    ['Estudiante', e.nombre], ['Documento', e.documento],
    ['Grado', e.grado], ['Curso', e.curso],
    ['Edad', e.edad ? `${e.edad} años` : null], ['Estado', e.activo ? 'Activo' : 'Retirado'],
  ]);
  pdf.tituloSeccion(doc, 'Datos del acudiente');
  pdf.fichaDatos(doc, [
    ['Acudiente', e.acudiente], ['Correo electrónico', e.correo_acudiente],
    ['Teléfono', e.telefono], ['Dirección', e.direccion],
  ]);

  const umbral = config.umbral_seguimiento;
  pdf.tituloSeccion(doc, 'Resumen');
  pdf.indicadores(doc, [
    { valor: d.tardanzas.length, etiqueta: 'Llegadas tarde en el período', color: d.tardanzas.length > umbral ? pdf.COLOR.peligro : pdf.COLOR.primario },
    { valor: umbral, etiqueta: 'Límite institucional' },
    { valor: d.notificaciones.filter((n) => n.estado === 'enviado').length, etiqueta: 'Notificaciones enviadas' },
    { valor: d.tardanzas.length ? fechaCorta(d.tardanzas[d.tardanzas.length - 1].fecha) : '—', etiqueta: 'Última llegada tarde' },
  ]);

  pdf.tituloSeccion(doc, 'Detalle de llegadas tarde');
  pdf.tabla(doc, [
    { titulo: '#', campo: (_, i) => i + 1, ancho: 0.4, alinear: 'center' },
    { titulo: 'Fecha', campo: (t) => fechaLarga(t.fecha), ancho: 2.4 },
    { titulo: 'Hora', campo: 'hora', ancho: 0.8, alinear: 'center' },
    ...(d.periodo ? [] : [{ titulo: 'Período', campo: 'periodo', ancho: 1.2 }]),
    { titulo: 'Registrado por', campo: 'registrado_por', ancho: 1.9 },
    { titulo: 'Observación', campo: 'observacion', ancho: 2 },
  ], d.tardanzas);

  pdf.tituloSeccion(doc, 'Historial de notificaciones al acudiente');
  pdf.tabla(doc, [
    { titulo: 'Fecha de envío', campo: (n) => `${fechaCorta(n.fecha_envio)} ${String(n.fecha_envio).slice(11, 16)}`, ancho: 1.3 },
    { titulo: 'Destinatario', campo: (n) => (usuario?.rol === 'admin' ? n.destinatario : '(reservado)'), ancho: 2 },
    { titulo: 'Reportes', campo: 'cantidad_reportes', ancho: 0.8, alinear: 'center' },
    { titulo: 'Estado', campo: (n) => ({ enviado: 'Enviado', rechazado: 'Rechazado', fallido: 'Fallido' }[n.estado]), ancho: 0.9 },
    { titulo: 'Enviado por', campo: 'enviado_por', ancho: 1.5 },
  ], d.notificaciones, { vacio: 'No se han enviado notificaciones.' });

  pdf.asegurarEspacio(doc, 90);
  doc.moveDown(2.5);
  const x = doc.page.margins.left;
  const w = pdf.anchoUtil(doc);
  const y = doc.y;
  [['Coordinación de convivencia', x], ['Acudiente', x + w / 2 + 20]].forEach(([t, cx]) => {
    doc.moveTo(cx, y).lineTo(cx + w / 2 - 40, y).lineWidth(0.7).strokeColor('#8896A4').stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(pdf.COLOR.suave).text(t, cx, y + 4, { width: w / 2 - 40, align: 'center' });
  });
  pdf.finalizar(doc, usuario?.nombre);
  return terminado;
}

/** Envía la notificación al acudiente y la registra en el historial. */
async function notificar(estudianteId, periodo, req, { forzar = false } = {}) {
  const config = leerConfig();
  const d = detalle(estudianteId, periodo);
  const e = d.estudiante;
  if (!e.correo_acudiente) throw new ErrorHttp(400, 'El estudiante no tiene correo de acudiente registrado.');
  if (!d.tardanzas.length) throw new ErrorHttp(400, 'El estudiante no tiene llegadas tarde en el período seleccionado.');
  if (!correo.correoConfigurado()) throw new ErrorHttp(503, 'El servicio de correo no está configurado. Un administrador debe definir los datos SMTP en el archivo .env.');

  if (!forzar) {
    const hoy = ahora().fecha;
    const reciente = db.prepare(`SELECT id FROM notificaciones WHERE estudiante_id = ? AND estado = 'enviado' AND substr(fecha_envio,1,10) = ? ${periodo ? 'AND periodo_id = ?' : ''} LIMIT 1`)
      .get(...(periodo ? [e.id, hoy, periodo.id] : [e.id, hoy]));
    if (reciente) throw new ErrorHttp(409, 'Ya se envió una notificación hoy a este acudiente. ¿Desea enviarla de nuevo?', { requiere_confirmacion: true });
  }

  const { asunto, html, texto } = construirCorreo(d, config);
  const adjunto = await pdfIndividual(d, { rol: 'admin', nombre: req.usuario.nombre });
  const r = await correo.enviar({
    para: e.correo_acudiente, asunto, html, texto,
    adjuntos: [{ filename: `reporte_llegadas_tarde_${e.nombre.replace(/\s+/g, '_')}.pdf`, content: adjunto, contentType: 'application/pdf' }],
  });
  const info = db.prepare(`
    INSERT INTO notificaciones (estudiante_id, periodo_id, enviado_por, destinatario, asunto, cantidad_reportes, fechas, estado, detalle, message_id, fecha_envio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    e.id, periodo?.id ?? null, req.usuario.id, e.correo_acudiente, asunto, d.tardanzas.length,
    JSON.stringify(d.tardanzas.map((t) => t.fecha)), r.estado, String(r.detalle).slice(0, 500), r.messageId, marcaTiempo());
  auditar(req, 'notificar_acudiente', { estudiante_id: e.id, estado: r.estado });
  return { id: Number(info.lastInsertRowid), estado: r.estado, detalle: r.detalle, destinatario: e.correo_acudiente };
}

module.exports = { resolverPeriodo, listar, detalle, construirCorreo, pdfIndividual, notificar };
