// Función de servidor: recibe los eventos de entrega del proveedor de correo
// (Brevo o Resend) y actualiza el estado en el historial de notificaciones.
//
// URL a registrar en el proveedor:
//   https://<proyecto>.supabase.co/functions/v1/webhook-correo?token=<WEBHOOK_TOKEN>
// Desplegar con:  supabase functions deploy webhook-correo --no-verify-jwt
import { clienteServicio, json } from "../_shared/comun.ts";

// Jerarquía: un estado no retrocede (p. ej. "abierto" no vuelve a "entregado")
const NIVEL: Record<string, number> = { pendiente: 0, enviado: 1, entregado: 2, abierto: 3, rebotado: 4, fallido: 4 };

function mapear(evento: string): string | null {
  const e = evento.toLowerCase().replace(/^email\./, "");
  if (["delivered"].includes(e)) return "entregado";
  if (["opened", "unique_opened", "click", "clicked", "proxy_open", "unique_proxy_open"].includes(e)) return "abierto";
  if (["hard_bounce", "soft_bounce", "bounced", "blocked", "invalid_email", "complained", "spam", "error"].includes(e)) return "rebotado";
  if (["delivery_delayed", "deferred"].includes(e)) return null;
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token !== Deno.env.get("WEBHOOK_TOKEN")) return json({ error: "No autorizado" }, 401);

  const cuerpo = await req.json().catch(() => null);
  if (!cuerpo) return json({ error: "Cuerpo inválido" }, 400);
  const eventos = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  const db = clienteServicio();
  let actualizados = 0;

  for (const ev of eventos) {
    // Brevo: { event, "message-id", reason }   ·   Resend: { type, data: { email_id } }
    const tipo = ev.event ?? ev.type ?? "";
    const mensajeId = ev["message-id"] ?? ev.messageId ?? ev.data?.email_id ?? null;
    const estado = mapear(tipo);
    if (!estado || !mensajeId) continue;

    const { data: n } = await db.from("notificaciones").select("id, estado").eq("mensaje_id", mensajeId).maybeSingle();
    if (!n || (NIVEL[estado] ?? 0) <= (NIVEL[n.estado] ?? 0)) continue;
    await db.from("notificaciones").update({
      estado,
      error: estado === "rebotado" ? String(ev.reason ?? ev.data?.bounce?.message ?? tipo).slice(0, 500) : null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", n.id);
    actualizados++;
  }
  return json({ ok: true, actualizados });
});
