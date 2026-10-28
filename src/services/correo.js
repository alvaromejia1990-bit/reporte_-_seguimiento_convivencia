'use strict';

const nodemailer = require('nodemailer');

let transporte = null;

function correoConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.CORREO_REMITENTE);
}

function obtenerTransporte() {
  if (!correoConfigurado()) {
    throw new Error('El servicio de correo no está configurado (SMTP_HOST y CORREO_REMITENTE en .env).');
  }
  if (!transporte) {
    const puerto = Number(process.env.SMTP_PUERTO) || 587;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: process.env.SMTP_SEGURO ? process.env.SMTP_SEGURO === 'true' : puerto === 465,
      auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE } : undefined,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      tls: process.env.SMTP_TLS_INSEGURO === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return transporte;
}

/**
 * Envía un correo. Devuelve { estado, detalle, messageId }:
 *  - enviado: el servidor SMTP aceptó el mensaje para el destinatario.
 *  - rechazado: el servidor SMTP rechazó el destinatario.
 *  - fallido: error de conexión, autenticación u otro.
 */
async function enviar({ para, asunto, html, texto, adjuntos, responderA }) {
  try {
    const info = await obtenerTransporte().sendMail({
      from: process.env.CORREO_REMITENTE,
      to: para,
      replyTo: responderA || process.env.CORREO_RESPONDER_A || undefined,
      subject: asunto,
      html,
      text: texto,
      attachments: adjuntos,
    });
    const aceptado = (info.accepted || []).map(String).some((a) => a.toLowerCase().includes(String(para).toLowerCase()));
    if (aceptado) return { estado: 'enviado', detalle: String(info.response || 'Aceptado por el servidor de correo'), messageId: info.messageId };
    return { estado: 'rechazado', detalle: `Rechazado por el servidor: ${(info.rejected || []).join(', ')} ${info.response || ''}`.trim(), messageId: info.messageId };
  } catch (e) {
    // EENVELOPE / códigos 5xx: el servidor rechazó la dirección del destinatario.
    if (e.code === 'EENVELOPE' || (e.responseCode >= 500 && e.responseCode < 600 && e.command === 'RCPT TO')) {
      return { estado: 'rechazado', detalle: `Destinatario rechazado: ${e.response || e.message}`, messageId: null };
    }
    return { estado: 'fallido', detalle: e.message, messageId: null };
  }
}

async function verificar() {
  await obtenerTransporte().verify();
  return true;
}

/** Reinicia el transporte (útil en pruebas). */
function reiniciar() {
  if (transporte) transporte.close();
  transporte = null;
}

module.exports = { enviar, verificar, correoConfigurado, reiniciar };
