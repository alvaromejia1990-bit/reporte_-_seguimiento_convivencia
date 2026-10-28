/* Exportación de informes profesionales a PDF (jsPDF) y Excel (ExcelJS) */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const AZUL = [18, 58, 107], ORO = [200, 162, 74], GRIS = [91, 100, 117];

  const institucion = () => (LT.estado && LT.estado.cat && LT.estado.cat.config) || {};
  const usuario = () => (LT.estado && LT.estado.usuario) || {};
  const sello = () => { const a = U.ahora(); return `${U.fmtFecha(a.fecha)} ${a.hora.slice(0, 5)}`; };

  /** Imagen PNG de un gráfico Chart.js con fondo blanco */
  function imagenGrafico(canvas) {
    const c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, 0);
    return { url: c.toDataURL("image/png"), ancho: c.width, alto: c.height };
  }

  /* ----------------------------------------------------------------- PDF */
  async function pdf({ titulo, subtitulo = "", filtros = [], bloques = [], nombre, horizontal = false }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: horizontal ? "landscape" : "portrait", unit: "mm", format: "letter" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    const inst = institucion();
    let y = 0;

    const cabecera = () => {
      doc.setFillColor(...AZUL); doc.rect(0, 0, W, 22, "F");
      doc.setFillColor(...ORO); doc.rect(0, 22, W, 1.2, "F");
      doc.setTextColor(255); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(String(inst.nombre_institucion || "Institución Educativa").toUpperCase(), M, 9);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(titulo, M, 16.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(`Generado: ${sello()}`, W - M, 9, { align: "right" });
      if (usuario().nombre) doc.text(`Por: ${usuario().nombre}`, W - M, 14, { align: "right" });
      y = 30;
    };
    const asegurar = (alto) => { if (y + alto > H - 16) { doc.addPage(); cabecera(); } };
    cabecera();

    if (subtitulo) { doc.setTextColor(...GRIS); doc.setFontSize(10); doc.text(subtitulo, M, y); y += 6; }
    if (filtros.length) {
      doc.setFontSize(8.5); doc.setTextColor(...GRIS);
      const t = filtros.map(([k, v]) => `${k}: ${v}`).join("   ·   ");
      const lineas = doc.splitTextToSize(t, W - 2 * M);
      doc.setFillColor(242, 246, 252); doc.roundedRect(M, y - 4, W - 2 * M, lineas.length * 4 + 4, 1.5, 1.5, "F");
      doc.text(lineas, M + 3, y); y += lineas.length * 4 + 5;
    }

    for (const b of bloques) {
      if (b.tipo === "kpis") {
        const n = b.items.length, porFila = horizontal ? 6 : 3, gap = 3;
        const ancho = (W - 2 * M - gap * (porFila - 1)) / porFila;
        for (let i = 0; i < n; i += porFila) {
          asegurar(20);
          b.items.slice(i, i + porFila).forEach(([k, v, d], j) => {
            const x = M + j * (ancho + gap);
            doc.setDrawColor(223, 228, 236); doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, ancho, 17, 1.5, 1.5, "FD");
            doc.setFillColor(...(j % 2 ? ORO : AZUL)); doc.rect(x, y, 1.2, 17, "F");
            doc.setTextColor(...GRIS); doc.setFontSize(7.5); doc.text(doc.splitTextToSize(k, ancho - 6)[0], x + 4, y + 5);
            doc.setTextColor(10, 31, 61); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(String(v), x + 4, y + 12);
            doc.setFont("helvetica", "normal");
            if (d) { doc.setFontSize(6.5); doc.setTextColor(138, 146, 163); doc.text(doc.splitTextToSize(String(d), ancho - 6)[0], x + 4, y + 15.5); }
          });
          y += 21;
        }
      } else if (b.tipo === "titulo") {
        asegurar(14);
        doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(b.texto, M, y + 4);
        doc.setFont("helvetica", "normal"); y += 9;
      } else if (b.tipo === "texto") {
        doc.setFontSize(9.5); doc.setTextColor(27, 35, 51);
        const lineas = doc.splitTextToSize(b.texto, W - 2 * M);
        asegurar(lineas.length * 4.5 + 2); doc.text(lineas, M, y + 3); y += lineas.length * 4.5 + 3;
      } else if (b.tipo === "ficha") {
        const col = horizontal ? 4 : 3, ancho = (W - 2 * M) / col;
        for (let i = 0; i < b.pares.length; i += col) {
          asegurar(12);
          b.pares.slice(i, i + col).forEach(([k, v], j) => {
            doc.setFontSize(7); doc.setTextColor(138, 146, 163); doc.text(String(k).toUpperCase(), M + j * ancho, y + 3);
            doc.setFontSize(9.5); doc.setTextColor(27, 35, 51); doc.setFont("helvetica", "bold");
            // Reduce la letra para que valores largos sin espacios (correos) quepan completos
            const val = String(v ?? "—");
            let tam = 9.5;
            while (tam > 6.5 && doc.getTextWidth(val) > ancho - 4) { tam -= 0.5; doc.setFontSize(tam); }
            doc.text(doc.splitTextToSize(val, ancho - 4)[0], M + j * ancho, y + 8); doc.setFont("helvetica", "normal");
          });
          y += 12;
        }
        y += 2;
      } else if (b.tipo === "grafico" && b.canvas) {
        const img = imagenGrafico(b.canvas);
        const anchoMax = b.ancho || (W - 2 * M);
        let w = anchoMax, h = (img.alto / img.ancho) * w;
        if (h > 95) { h = 95; w = (img.ancho / img.alto) * h; }
        asegurar(h + 12);
        if (b.titulo) { doc.setFontSize(9.5); doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.text(b.titulo, M, y + 3); doc.setFont("helvetica", "normal"); y += 6; }
        doc.addImage(img.url, "PNG", M + (W - 2 * M - w) / 2, y, w, h, undefined, "FAST");
        y += h + 6;
      } else if (b.tipo === "tabla") {
        asegurar(24);
        if (b.titulo) { doc.setFontSize(10.5); doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.text(b.titulo, M, y + 3); doc.setFont("helvetica", "normal"); y += 6; }
        doc.autoTable({
          startY: y, head: [b.columnas], body: b.filas.length ? b.filas : [[{ content: "Sin datos para los filtros seleccionados", colSpan: b.columnas.length, styles: { halign: "center", textColor: [138, 146, 163] } }]],
          margin: { left: M, right: M, top: 30, bottom: 18 }, theme: "grid",
          styles: { fontSize: 8, cellPadding: 1.8, lineColor: [223, 228, 236], lineWidth: 0.1, textColor: [27, 35, 51] },
          headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [247, 249, 252] },
          columnStyles: b.estilos || {},
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }

    // Cabecera en páginas creadas por autoTable y pie en todas
    const paginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      if (i > 1) {
        // cabecera compacta (si autoTable creó la página no la tenía)
        doc.setFillColor(...AZUL); doc.rect(0, 0, W, 22, "F"); doc.setFillColor(...ORO); doc.rect(0, 22, W, 1.2, "F");
        doc.setTextColor(255); doc.setFontSize(8); doc.setFont("helvetica", "normal");
        doc.text(String(inst.nombre_institucion || "Institución Educativa").toUpperCase(), M, 9);
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(titulo, M, 16.5); doc.setFont("helvetica", "normal");
        doc.setFontSize(8); doc.text(`Generado: ${sello()}`, W - M, 9, { align: "right" });
      }
      doc.setDrawColor(223, 228, 236); doc.line(M, H - 12, W - M, H - 12);
      doc.setFontSize(7); doc.setTextColor(138, 146, 163);
      doc.text("Documento confidencial · Datos personales tratados conforme a la Ley 1581 de 2012 · Uso exclusivo institucional", M, H - 8);
      doc.text(`Página ${i} de ${paginas}`, W - M, H - 8, { align: "right" });
    }
    doc.save(`${U.nombreArchivo(nombre || titulo)}.pdf`);
  }

  /* --------------------------------------------------------------- Excel */
  async function excel({ nombre, hojas }) {
    const wb = new window.ExcelJS.Workbook();
    const inst = institucion();
    wb.creator = usuario().nombre || "Sistema de llegadas tarde";
    wb.created = new Date();
    const AZ = "FF123A6B", ORO_X = "FFC8A24A";

    for (const h of hojas) {
      const ws = wb.addWorksheet(h.nombre.slice(0, 31), { views: [{ state: "frozen", ySplit: 0 }], properties: { defaultRowHeight: 18 } });
      const nCols = Math.max(h.columnas ? h.columnas.length : 1, 4);
      let fila = 1;
      ws.mergeCells(fila, 1, fila, nCols);
      ws.getCell(fila, 1).value = String(inst.nombre_institucion || "Institución Educativa").toUpperCase();
      ws.getCell(fila, 1).font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      ws.getCell(fila, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZ } };
      fila++;
      ws.mergeCells(fila, 1, fila, nCols);
      ws.getCell(fila, 1).value = h.titulo || h.nombre;
      ws.getCell(fila, 1).font = { bold: true, size: 14, color: { argb: AZ } };
      ws.getRow(fila).height = 24;
      fila++;
      ws.mergeCells(fila, 1, fila, nCols);
      ws.getCell(fila, 1).value = `Generado: ${sello()}${usuario().nombre ? " · Por: " + usuario().nombre : ""}`;
      ws.getCell(fila, 1).font = { size: 9, color: { argb: "FF5B6475" } };
      fila++;
      (h.filtros || []).forEach(([k, v]) => {
        ws.getCell(fila, 1).value = k; ws.getCell(fila, 1).font = { bold: true, size: 9, color: { argb: "FF5B6475" } };
        ws.getCell(fila, 2).value = v; ws.getCell(fila, 2).font = { size: 9 };
        fila++;
      });
      fila++;

      if (h.pares) {
        h.pares.forEach(([k, v]) => {
          ws.getCell(fila, 1).value = k; ws.getCell(fila, 1).font = { bold: true, color: { argb: "FF5B6475" } };
          ws.getCell(fila, 2).value = v; ws.getCell(fila, 2).font = { bold: true, size: 12 };
          ws.getCell(fila, 1).border = ws.getCell(fila, 2).border = { bottom: { style: "thin", color: { argb: "FFE5E9F0" } } };
          fila++;
        });
        fila++;
      }

      if (h.columnas) {
        const filaCab = fila;
        h.columnas.forEach((c, i) => {
          const celda = ws.getCell(fila, i + 1);
          celda.value = c.t;
          celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
          celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZ } };
          celda.alignment = { vertical: "middle", wrapText: true };
          celda.border = { bottom: { style: "medium", color: { argb: ORO_X } } };
          ws.getColumn(i + 1).width = c.ancho || 16;
        });
        ws.getRow(fila).height = 22;
        fila++;
        h.filas.forEach((r, j) => {
          r.forEach((v, i) => {
            const celda = ws.getCell(fila, i + 1);
            celda.value = v;
            const fmt = h.columnas[i].fmt;
            if (fmt) celda.numFmt = fmt;
            if (j % 2) celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
            celda.border = { bottom: { style: "hair", color: { argb: "FFDFE4EC" } } };
          });
          fila++;
        });
        if (h.filas.length) ws.autoFilter = { from: { row: filaCab, column: 1 }, to: { row: filaCab, column: h.columnas.length } };
        ws.views = [{ state: "frozen", ySplit: filaCab }];
        if (h.totales) {
          h.totales.forEach((v, i) => { const c = ws.getCell(fila, i + 1); c.value = v; c.font = { bold: true }; c.border = { top: { style: "thin", color: { argb: AZ } } }; });
          fila++;
        }
        fila++;
      }

      if (h.imagenes) {
        ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 0, 14);
        for (const im of h.imagenes) {
          if (!im.canvas) continue;
          const img = imagenGrafico(im.canvas);
          ws.getCell(fila, 1).value = im.titulo; ws.getCell(fila, 1).font = { bold: true, size: 12, color: { argb: AZ } };
          fila++;
          const id = wb.addImage({ base64: img.url, extension: "png" });
          const ancho = 760, alto = Math.round((img.alto / img.ancho) * ancho);
          ws.addImage(id, { tl: { col: 0, row: fila - 1 }, ext: { width: ancho, height: alto } });
          fila += Math.ceil(alto / 20) + 2;
        }
      }
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 };
      ws.headerFooter.oddFooter = "&8Documento confidencial · Ley 1581 de 2012 · Página &P de &N";
    }
    const buf = await wb.xlsx.writeBuffer();
    U.descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${U.nombreArchivo(nombre)}.xlsx`);
  }

  /* Plantilla de carga masiva (Excel) */
  async function plantillaEstudiantes() {
    const wb = new window.ExcelJS.Workbook();
    const ws = wb.addWorksheet("Estudiantes");
    const cols = [
      ["tipo_documento", 14], ["documento", 16], ["apellidos", 24], ["nombres", 22], ["edad", 8], ["grado", 12], ["curso", 10],
      ["acudiente_nombre", 26], ["acudiente_parentesco", 16], ["acudiente_correo", 30], ["acudiente_telefono", 16], ["direccion", 34],
    ];
    ws.columns = cols.map(([k, w]) => ({ header: k, key: k, width: w }));
    ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123A6B" } }; });
    ws.addRow({ tipo_documento: "TI", documento: "1105123456", apellidos: "Pérez Gómez", nombres: "Ana María", edad: 12, grado: "Sexto", curso: "601",
      acudiente_nombre: "Luisa Gómez", acudiente_parentesco: "Madre", acudiente_correo: "luisa.gomez@correo.com", acudiente_telefono: "3101234567", direccion: "Calle 10 # 5-20" });
    ws.addRow({ tipo_documento: "TI", documento: "1105987654", apellidos: "Ramírez Díaz", nombres: "Juan David", edad: 13, grado: "7", curso: "702",
      acudiente_nombre: "Carlos Ramírez", acudiente_parentesco: "Padre", acudiente_correo: "carlos.ramirez@correo.com", acudiente_telefono: "3209876543", direccion: "Carrera 8 # 12-40" });
    ws.getColumn("documento").numFmt = "@";
    const ins = wb.addWorksheet("Instrucciones");
    ins.getColumn(1).width = 110;
    [
      "INSTRUCCIONES PARA LA CARGA MASIVA DE ESTUDIANTES",
      "",
      "1. Diligencie una fila por estudiante en la hoja «Estudiantes». No cambie los nombres de las columnas.",
      "2. Obligatorios: documento, nombres, grado y curso. Recomendado: correo del acudiente (necesario para notificar).",
      "3. tipo_documento: RC, TI, CC, CE, PPT, PEP, NUIP, PAS u OTRO (si se deja vacío se asume TI).",
      "4. grado: puede escribir el nombre (Sexto) o el número (6). curso: tal como está configurado (601, 602, A...).",
      "5. Si el documento ya existe, el estudiante se ACTUALIZA (no se duplica). Las celdas vacías conservan el dato anterior.",
      "6. Se rechazan filas con documento repetido dentro del archivo o con el mismo nombre en el mismo curso.",
      "7. También se aceptan archivos CSV (separados por coma o punto y coma) con estos mismos encabezados.",
      "8. Elimine las filas de ejemplo antes de cargar el archivo.",
    ].forEach((t, i) => { const c = ins.getCell(i + 1, 1); c.value = t; if (i === 0) c.font = { bold: true, size: 13, color: { argb: "FF123A6B" } }; });
    const buf = await wb.xlsx.writeBuffer();
    U.descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "plantilla_estudiantes.xlsx");
  }

  LT.exportar = { pdf, excel, plantillaEstudiantes, imagenGrafico };
})();
