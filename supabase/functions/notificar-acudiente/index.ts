// Función de servidor: previsualiza o envía el correo institucional al acudiente
// y registra el resultado en el historial de notificaciones.
//
// POST { estudiante_id, periodo_id, modo: "previsualizar" | "enviar", forzar?: boolean }
import { clienteServicio, enviarCorreo, ErrorHttp, json, manejar, usuarioActual } from "../_shared/comun.ts";
import { construirCorreo } from "../_shared/plantilla.ts";

const ocultar = (correo: string) => correo.replace(/^(.{2}).*(@.*)$/, "$1•••$2");

Deno.serve(manejar(async (req) => {
  const db = clienteServicio();
  const usuario = await usuarioActual(req, db);
  const { estudiante_id, periodo_id, modo = "previsualizar", forzar = false } = await req.json().catch(() => ({}));
  if (!estudiante_id || !periodo_id) throw new ErrorHttp(400, "Debe indicar estudiante y período");

  const [{ data: est }, { data: periodo }, { data: conf }, { data: llegadas }] = await Promise.all([
    db.from("estudiantes").select("*, grados(nombre), cursos(nombre)").eq("id", estudiante_id).maybeSingle(),
    db.from("periodos").select("*").eq("id", periodo_id).maybeSingle(),
    db.from("configuracion").select("*").eq("id", 1).maybeSingle(),
    db.from("llegadas_tarde").select("fecha, hora").eq("estudiante_id", estudiante_id).eq("periodo_id", periodo_id).order("fecha"),
  ]);
  if (!est) throw new ErrorHttp(404, "Estudiante no encontrado");
  if (!periodo) throw new ErrorHttp(404, "Período no encontrado");
  if (!llegadas?.length) throw new ErrorHttp(400, "El estudiante no tiene llegadas tarde en ese período");
  if (!est.acudiente_correo) throw new ErrorHttp(400, "El estudiante no tiene correo de acudiente registrado");

  const correo = construirCorreo({
    institucion: {
      nombre: conf?.nombre_institucion ?? "Institución Educativa", ciudad: conf?.ciudad, telefono: conf?.telefono,
      correo: conf?.correo_institucional, responsable: conf?.responsable_nombre, cargo: conf?.responsable_cargo, logo: conf?.logo_url,
    },
    estudiante: {
      nombre: `${est.nombres} ${est.apellidos}`.trim(), documento: est.documento, tipo: est.tipo_documento,
      grado: est.grados?.nombre ?? "", curso: est.cursos?.nombre ?? "",
    },
    acudiente: {
      nombre: est.acudiente_nombre, parentesco: est.acudiente_parentesco, correo: est.acudiente_correo,
      telefono: est.acudiente_telefono, direccion: est.direccion,
    },
    periodo: { nombre: periodo.nombre, anio: periodo.anio },
    llegadas: llegadas as { fecha: string; hora: string }[],
    umbral: conf?.umbral_seguimiento ?? 4,
  });

  // Los docentes no ven el correo completo del acudiente
  const destinatarioVisible = usuario.rol === "admin" ? est.acudiente_correo : ocultar(est.acudiente_correo);

  if (modo === "previsualizar") {
    return json({ asunto: correo.asunto, html: correo.html, destinatario: destinatarioVisible, cantidad: llegadas.length });
  }

  // Evitar envíos repetidos el mismo día (salvo confirmación explícita)
  if (!forzar) {
    const desde = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: previas } = await db.from("notificaciones").select("id, enviado_en")
      .eq("estudiante_id", estudiante_id).eq("periodo_id", periodo_id)
      .in("estado", ["enviado", "entregado", "abierto"]).gte("enviado_en", desde).limit(1);
    if (previas?.length) {
      return json({ error: "Ya se envió una notificación a este acudiente en las últimas horas.", requiereConfirmacion: true }, 409);
    }
  }

  const { data: registro, error: errReg } = await db.from("notificaciones").insert({
    estudiante_id, periodo_id,
    destinatario: est.acudiente_correo,
    asunto: correo.asunto,
    cantidad_reportes: llegadas.length,
    fechas: llegadas.map((l) => l.fecha),
    estado: "pendiente",
    enviado_por: usuario.id,
    enviado_por_nombre: usuario.nombre || usuario.correo,
  }).select().single();
  if (errReg) throw new Error(errReg.message);

  try {
    const r = await enviarCorreo({
      para: est.acudiente_correo, paraNombre: est.acudiente_nombre, asunto: correo.asunto,
      html: correo.html, texto: correo.texto, responderA: conf?.correo_institucional ?? undefined,
    });
    await db.from("notificaciones").update({
      estado: "enviado", proveedor: r.proveedor, mensaje_id: r.mensajeId, actualizado_en: new Date().toISOString(),
    }).eq("id", registro.id);
    await db.from("auditoria").insert({
      usuario_id: usuario.id, usuario: usuario.nombre || usuario.correo, tabla: "notificaciones",
      accion: "ENVIO", registro_id: registro.id, detalle: { estudiante_id, periodo_id, cantidad: llegadas.length },
    });
    return json({ ok: true, estado: "enviado", id: registro.id, destinatario: destinatarioVisible });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await db.from("notificaciones").update({ estado: "fallido", error: mensaje.slice(0, 500), actualizado_en: new Date().toISOString() })
      .eq("id", registro.id);
    return json({ ok: false, estado: "fallido", error: mensaje }, 502);
  }
}));
