'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { ahora, fechaCorta } = require('../utils');

const COLOR = {
  primario: '#16324F',
  acento: '#C8963E',
  texto: '#1F2933',
  suave: '#5B6B7B',
  borde: '#D9E0E7',
  fondo: '#F3F6F9',
  peligro: '#B42318',
};
const RUTA_LOGO = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');

function nuevoDocumento(titulo, opciones = {}) {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: opciones.horizontal ? 'landscape' : 'portrait',
    margins: { top: 48, bottom: 56, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: titulo, Author: 'Plataforma de control de llegadas tarde' },
  });
  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const terminado = new Promise((ok) => doc.on('end', () => ok(Buffer.concat(partes))));
  return { doc, terminado };
}

const anchoUtil = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

function encabezado(doc, config, titulo, subtitulo) {
  const x = doc.page.margins.left;
  const w = anchoUtil(doc);
  let xTexto = x;
  if (fs.existsSync(RUTA_LOGO)) {
    try { doc.image(RUTA_LOGO, x, 40, { fit: [52, 52] }); xTexto = x + 64; } catch { /* logo no válido */ }
  }
  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(13)
    .text(config.institucion_nombre || 'Institución Educativa', xTexto, 44, { width: w - (xTexto - x) });
  const linea2 = [config.institucion_sigla, config.institucion_ciudad].filter(Boolean).join(' · ');
  if (linea2) doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text(linea2, xTexto, doc.y + 1);
  const yLinea = Math.max(doc.y + 8, 98);
  doc.moveTo(x, yLinea).lineTo(x + w, yLinea).lineWidth(2).strokeColor(COLOR.acento).stroke();
  doc.y = yLinea + 14;
  doc.x = x;
  doc.fillColor(COLOR.texto).font('Helvetica-Bold').fontSize(16).text(titulo, x, doc.y, { width: w });
  if (subtitulo) doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.suave).text(subtitulo, { width: w });
  doc.moveDown(0.8);
}

function tituloSeccion(doc, texto) {
  asegurarEspacio(doc, 60);
  const x = doc.page.margins.left;
  doc.moveDown(0.4);
  doc.rect(x, doc.y, 4, 14).fill(COLOR.acento);
  doc.fillColor(COLOR.primario).font('Helvetica-Bold').fontSize(11.5).text(texto, x + 10, doc.y + 1);
  doc.x = x;
  doc.moveDown(0.5);
}

function asegurarEspacio(doc, alto) {
  if (doc.y + alto > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/** Pares etiqueta/valor en dos columnas. */
function fichaDatos(doc, pares) {
  const x = doc.page.margins.left;
  const w = anchoUtil(doc);
  const colW = w / 2;
  for (let i = 0; i < pares.length; i += 2) {
    asegurarEspacio(doc, 30);
    const y = doc.y;
    let maxY = y;
    [pares[i], pares[i + 1]].forEach((par, j) => {
      if (!par) return;
      const cx = x + j * colW;
      doc.font('Helvetica').fontSize(8).fillColor(COLOR.suave).text(par[0].toUpperCase(), cx, y, { width: colW - 10 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.texto).text(par[1] === null || par[1] === undefined || par[1] === '' ? '—' : String(par[1]), cx, doc.y + 1, { width: colW - 10 });
      maxY = Math.max(maxY, doc.y);
    });
    doc.y = maxY + 7;
  }
  doc.x = x;
}

/** Tarjetas de indicadores. */
function indicadores(doc, items) {
  const x = doc.page.margins.left;
  const w = anchoUtil(doc);
  const gap = 8;
  const porFila = Math.min(items.length, 4);
  const cw = (w - gap * (porFila - 1)) / porFila;
  const h = 54;
  for (let i = 0; i < items.length; i += porFila) {
    asegurarEspacio(doc, h + 10);
    const y = doc.y;
    items.slice(i, i + porFila).forEach((it, j) => {
      const cx = x + j * (cw + gap);
      doc.roundedRect(cx, y, cw, h, 5).fillAndStroke(COLOR.fondo, COLOR.borde);
      doc.fillColor(it.color || COLOR.primario).font('Helvetica-Bold').fontSize(18).text(String(it.valor), cx + 10, y + 9, { width: cw - 20 });
      doc.fillColor(COLOR.suave).font('Helvetica').fontSize(8).text(it.etiqueta, cx + 10, y + 34, { width: cw - 20 });
    });
    doc.y = y + h + gap;
  }
  doc.x = x;
  doc.moveDown(0.3);
}

/**
 * Tabla con encabezado repetido en cada página.
 * columnas: [{ titulo, campo, ancho (fracción), alinear }]
 */
function tabla(doc, columnas, filas, { tamano = 8.5, vacio = 'Sin registros.' } = {}) {
  const x = doc.page.margins.left;
  const w = anchoUtil(doc);
  const totalFr = columnas.reduce((s, c) => s + (c.ancho || 1), 0);
  const anchos = columnas.map((c) => ((c.ancho || 1) / totalFr) * w);
  const pad = 5;

  const dibujarEncabezado = () => {
    doc.font('Helvetica-Bold').fontSize(tamano);
    const h = Math.max(...columnas.map((c, i) => doc.heightOfString(c.titulo, { width: anchos[i] - pad * 2 }))) + pad * 2;
    const y = doc.y;
    doc.rect(x, y, w, h).fill(COLOR.primario);
    let cx = x;
    columnas.forEach((c, i) => {
      doc.fillColor('#FFFFFF').text(c.titulo, cx + pad, y + pad, { width: anchos[i] - pad * 2, align: c.alinear || 'left' });
      cx += anchos[i];
    });
    doc.y = y + h;
  };

  asegurarEspacio(doc, 50);
  dibujarEncabezado();
  if (!filas.length) {
    doc.font('Helvetica-Oblique').fontSize(tamano).fillColor(COLOR.suave).text(vacio, x + pad, doc.y + pad);
    doc.moveDown(0.6);
    doc.x = x;
    return;
  }
  filas.forEach((f, idx) => {
    doc.font('Helvetica').fontSize(tamano);
    const textos = columnas.map((c) => {
      const v = typeof c.campo === 'function' ? c.campo(f, idx) : f[c.campo];
      return v === null || v === undefined || v === '' ? '—' : String(v);
    });
    const h = Math.max(...textos.map((t, i) => doc.heightOfString(t, { width: anchos[i] - pad * 2 }))) + pad * 2;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      dibujarEncabezado();
      doc.font('Helvetica').fontSize(tamano);
    }
    const y = doc.y;
    if (idx % 2 === 1) doc.rect(x, y, w, h).fill(COLOR.fondo);
    doc.moveTo(x, y + h).lineTo(x + w, y + h).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    let cx = x;
    textos.forEach((t, i) => {
      doc.fillColor(COLOR.texto).text(t, cx + pad, y + pad, { width: anchos[i] - pad * 2, align: columnas[i].alinear || 'left' });
      cx += anchos[i];
    });
    doc.y = y + h;
  });
  doc.x = x;
  doc.moveDown(0.8);
}

/** Inserta una imagen PNG (data URL) ajustada al ancho. */
function imagen(doc, dataUrl, { titulo, alto = 220 } = {}) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return;
  const buf = Buffer.from(m[2], 'base64');
  const w = anchoUtil(doc);
  asegurarEspacio(doc, alto + 30);
  if (titulo) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.texto).text(titulo);
    doc.moveDown(0.3);
  }
  const y = doc.y;
  doc.image(buf, doc.page.margins.left, y, { fit: [w, alto], align: 'center' });
  doc.y = y + alto + 10;
  doc.x = doc.page.margins.left;
}

/** Pie de página con numeración y fecha de generación; luego cierra el documento. */
function finalizar(doc, usuario) {
  const { fecha, hora } = ahora();
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const inferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    const x = doc.page.margins.left;
    const w = anchoUtil(doc);
    doc.moveTo(x, y - 6).lineTo(x + w, y - 6).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.suave)
      .text(`Generado el ${fechaCorta(fecha)} a las ${hora.slice(0, 5)}${usuario ? ` por ${usuario}` : ''} · Documento con datos personales protegidos (Ley 1581 de 2012). Uso institucional exclusivo.`, x, y, { width: w - 60, lineBreak: false, ellipsis: true });
    doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, x + w - 60, y, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = inferior;
  }
  doc.end();
}

module.exports = { COLOR, nuevoDocumento, encabezado, tituloSeccion, fichaDatos, indicadores, tabla, imagen, finalizar, asegurarEspacio, anchoUtil };
