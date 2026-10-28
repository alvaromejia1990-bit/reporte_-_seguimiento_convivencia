// Plantilla del correo institucional de notificación al acudiente.
// (La versión del navegador para el modo demostración está en js/plantilla-correo.js)
import { esc } from "./comun.ts";

export interface DatosCorreo {
  institucion: { nombre: string; ciudad?: string | null; telefono?: string | null; correo?: string | null; responsable?: string | null; cargo?: string | null; logo?: string | null };
  estudiante: { nombre: string; documento: string; tipo: string; grado: string; curso: string };
  acudiente: { nombre: string; parentesco?: string | null; correo: string; telefono?: string | null; direccion?: string | null };
  periodo: { nombre: string; anio: number };
  llegadas: { fecha: string; hora: string }[];
  umbral: number;
}

const fmtFecha = (f: string) => {
  const t = new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function construirCorreo(d: DatosCorreo): { asunto: string; html: string; texto: string } {
  const n = d.llegadas.length;
  const asunto = `Notificación de llegadas tarde – ${d.estudiante.nombre} (${d.estudiante.curso}) – ${d.periodo.nombre} ${d.periodo.anio}`;
  const filas = d.llegadas.map((l, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e9f0;color:#5b6475">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e9f0">${esc(fmtFecha(l.fecha))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e9f0;font-variant-numeric:tabular-nums">${esc(l.hora.slice(0, 5))}</td>
      </tr>`).join("");
  const dato = (k: string, v: unknown) => v ? `<tr><td style="padding:4px 0;color:#5b6475;width:150px">${k}</td><td style="padding:4px 0;color:#1b2333;font-weight:600">${esc(v)}</td></tr>` : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f2f4f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2333">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dfe4ec">
  <tr><td style="background:#123a6b;padding:22px 28px;color:#ffffff">
    ${d.institucion.logo ? `<img src="${esc(d.institucion.logo)}" alt="" height="48" style="float:right;max-height:48px">` : ""}
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">${esc(d.institucion.nombre)}</div>
    <div style="font-size:21px;font-weight:700;margin-top:4px">Notificación de llegadas tarde</div>
  </td></tr>
  <tr><td style="height:4px;background:#c8a24a"></td></tr>
  <tr><td style="padding:26px 28px 8px">
    <p style="margin:0 0 14px">Señor(a) <strong>${esc(d.acudiente.nombre || "acudiente")}</strong>:</p>
    <p style="margin:0 0 14px;line-height:1.55">Reciba un cordial saludo. Le informamos que el/la estudiante
      <strong>${esc(d.estudiante.nombre)}</strong>, del grado <strong>${esc(d.estudiante.grado)}</strong>, curso
      <strong>${esc(d.estudiante.curso)}</strong>, registra <strong>${n} llegada${n === 1 ? "" : "s"} tarde</strong> durante el
      <strong>${esc(d.periodo.nombre)} de ${d.periodo.anio}</strong>, superando el límite institucional de ${d.umbral}.</p>
    <p style="margin:0 0 18px;line-height:1.55">La puntualidad es parte de los compromisos del Manual de Convivencia. Le solicitamos
      acompañar este proceso desde casa y, si lo considera necesario, comunicarse con la institución.</p>
  </td></tr>
  <tr><td style="padding:0 28px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;border-radius:10px;padding:14px 18px;font-size:14px">
      <tr><td colspan="2" style="padding-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#123a6b;font-weight:700">Datos del estudiante</td></tr>
      ${dato("Estudiante", d.estudiante.nombre)}
      ${dato("Documento", `${d.estudiante.tipo} ${d.estudiante.documento}`)}
      ${dato("Grado", d.estudiante.grado)}
      ${dato("Curso", d.estudiante.curso)}
      ${dato("Período académico", `${d.periodo.nombre} ${d.periodo.anio}`)}
      ${dato("Cantidad de reportes", String(n))}
    </table>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#123a6b;font-weight:700;margin-bottom:6px">Fechas de las llegadas tarde</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;border:1px solid #e5e9f0;border-radius:8px">
      <tr style="background:#eef2f8"><th align="left" style="padding:8px 12px">#</th><th align="left" style="padding:8px 12px">Fecha</th><th align="left" style="padding:8px 12px">Hora de llegada</th></tr>
      ${filas}
    </table>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;border-radius:10px;padding:14px 18px;font-size:14px">
      <tr><td colspan="2" style="padding-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#123a6b;font-weight:700">Datos del acudiente registrados</td></tr>
      ${dato("Nombre", d.acudiente.nombre)}
      ${dato("Parentesco", d.acudiente.parentesco)}
      ${dato("Correo", d.acudiente.correo)}
      ${dato("Teléfono", d.acudiente.telefono)}
      ${dato("Dirección", d.acudiente.direccion)}
    </table>
    <p style="font-size:12px;color:#5b6475;margin:8px 0 0">Si algún dato no es correcto, por favor infórmelo a la institución para actualizarlo.</p>
  </td></tr>
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0">Atentamente,</p>
    <p style="margin:14px 0 0;font-weight:700">${esc(d.institucion.responsable || "")}</p>
    <p style="margin:0;color:#5b6475">${esc(d.institucion.cargo || "")}<br>${esc(d.institucion.nombre)}${d.institucion.ciudad ? " · " + esc(d.institucion.ciudad) : ""}
      ${d.institucion.telefono ? "<br>Tel. " + esc(d.institucion.telefono) : ""}${d.institucion.correo ? "<br>" + esc(d.institucion.correo) : ""}</p>
  </td></tr>
  <tr><td style="background:#f6f8fb;padding:14px 28px;font-size:11px;line-height:1.5;color:#6b7385;border-top:1px solid #e5e9f0">
    Mensaje generado automáticamente por el sistema institucional de control de llegadas tarde.
    La información contenida es confidencial y está dirigida exclusivamente al acudiente registrado; se trata conforme a la
    Ley 1581 de 2012 y el Decreto 1377 de 2013 de protección de datos personales. Si recibió este correo por error, por favor elimínelo e infórmenos.
  </td></tr>
</table></td></tr></table></body></html>`;

  const texto = [
    `${d.institucion.nombre} – Notificación de llegadas tarde`, "",
    `Señor(a) ${d.acudiente.nombre}:`,
    `El/la estudiante ${d.estudiante.nombre} (grado ${d.estudiante.grado}, curso ${d.estudiante.curso}) registra ${n} llegadas tarde en el ${d.periodo.nombre} ${d.periodo.anio}.`,
    "", "Fechas:", ...d.llegadas.map((l, i) => `${i + 1}. ${fmtFecha(l.fecha)} – ${l.hora.slice(0, 5)}`), "",
    `Acudiente: ${d.acudiente.nombre} · ${d.acudiente.correo}${d.acudiente.telefono ? " · " + d.acudiente.telefono : ""}`, "",
    `${d.institucion.responsable ?? ""} – ${d.institucion.cargo ?? ""}`,
  ].join("\n");

  return { asunto, html, texto };
}
