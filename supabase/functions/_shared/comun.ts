// Utilidades compartidas por las funciones de servidor (Supabase Edge Functions, Deno)
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGEN = Deno.env.get("SITE_URL") ?? "*";

export const cors = {
  "Access-Control-Allow-Origin": ORIGEN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

export function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

export class ErrorHttp extends Error {
  constructor(public estado: number, mensaje: string) { super(mensaje); }
}

export interface Perfil { id: string; nombre: string; correo: string; rol: "admin" | "docente"; activo: boolean }

/** Cliente con privilegios de servicio (omite RLS). Úselo solo después de validar permisos. */
export function clienteServicio(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Valida el token del usuario que llama y devuelve su perfil activo. */
export async function usuarioActual(req: Request, servicio: SupabaseClient): Promise<Perfil> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErrorHttp(401, "Sesión requerida");
  const { data, error } = await servicio.auth.getUser(token);
  if (error || !data?.user) throw new ErrorHttp(401, "Sesión inválida o vencida");
  const { data: perfil } = await servicio.from("perfiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!perfil || !perfil.activo) throw new ErrorHttp(403, "Usuario sin acceso o inactivo");
  return perfil as Perfil;
}

export function manejar(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof ErrorHttp) return json({ error: e.message }, e.estado);
      console.error(e);
      return json({ error: "Error interno: " + (e instanceof Error ? e.message : String(e)) }, 500);
    }
  };
}

// ---------------------------------------------------------------------------
// Envío de correo mediante un servicio real (Brevo o Resend)
// ---------------------------------------------------------------------------
export interface Correo { para: string; paraNombre?: string; asunto: string; html: string; texto?: string; responderA?: string }
export interface ResultadoEnvio { proveedor: string; mensajeId: string | null }

export async function enviarCorreo(c: Correo): Promise<ResultadoEnvio> {
  const proveedor = (Deno.env.get("EMAIL_PROVIDER") ?? "brevo").toLowerCase();
  const remitente = Deno.env.get("EMAIL_FROM");
  const remitenteNombre = Deno.env.get("EMAIL_FROM_NAME") ?? "Institución Educativa";
  if (!remitente) throw new ErrorHttp(500, "Falta configurar el secreto EMAIL_FROM (correo remitente)");

  if (proveedor === "brevo") {
    const clave = Deno.env.get("BREVO_API_KEY");
    if (!clave) throw new ErrorHttp(500, "Falta configurar el secreto BREVO_API_KEY");
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": clave, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        sender: { name: remitenteNombre, email: remitente },
        to: [{ email: c.para, name: c.paraNombre || c.para }],
        subject: c.asunto,
        htmlContent: c.html,
        textContent: c.texto,
        ...(c.responderA ? { replyTo: { email: c.responderA } } : {}),
        tags: ["llegadas-tarde"],
      }),
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${cuerpo?.message ?? JSON.stringify(cuerpo)}`);
    return { proveedor: "brevo", mensajeId: cuerpo?.messageId ?? null };
  }

  if (proveedor === "resend") {
    const clave = Deno.env.get("RESEND_API_KEY");
    if (!clave) throw new ErrorHttp(500, "Falta configurar el secreto RESEND_API_KEY");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${remitenteNombre} <${remitente}>`,
        to: [c.para],
        subject: c.asunto,
        html: c.html,
        text: c.texto,
        ...(c.responderA ? { reply_to: c.responderA } : {}),
      }),
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Resend ${r.status}: ${cuerpo?.message ?? JSON.stringify(cuerpo)}`);
    return { proveedor: "resend", mensajeId: cuerpo?.id ?? null };
  }

  throw new ErrorHttp(500, `EMAIL_PROVIDER no reconocido: ${proveedor} (use brevo o resend)`);
}

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
