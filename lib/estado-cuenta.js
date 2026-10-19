/*
 * Estado de cuenta del Club Activo 20-30 San José #532
 * - calcular(): saca saldos, pendientes y asistencia a una fecha de corte.
 * - generar(): arma el PDF con el formato oficial de Tesorería.
 * La pantalla del socio y el PDF usan este mismo cálculo, así siempre coinciden.
 */
(function (global) {
  'use strict';

  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var PUNTOS = { A: 1, J: 0.5, I: 0 };

  /* ---------- Fechas y montos ---------- */
  function d(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }
  function corta(s) { if (!s) return ''; var x = d(s); return ('0' + x.getDate()).slice(-2) + '-' + MES[x.getMonth()] + '-' + String(x.getFullYear()).slice(2); }
  function claveMes(dt) { return MES[dt.getMonth()] + '-' + String(dt.getFullYear()).slice(2); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function larga(s) { var x = d(s); return ('0' + x.getDate()).slice(-2) + ' de ' + cap(MES_LARGO[x.getMonth()]) + ' ' + x.getFullYear(); }
  function num(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function colones(n) { return '₡' + num(n); }
  /* En tablas: monto con decimales, o guion cuando es cero (formato contable de Tesorería). */
  function celda(n) { return n ? num(n) : '-'; }

  /* Meses del periodo, de julio a julio. */
  function mesesPeriodo(cfg) {
    var out = [], x = d(cfg.inicioPeriodo);
    for (var i = 0; i < cfg.mesesPorPeriodo; i++) { out.push(new Date(x.getFullYear(), x.getMonth() + i, 1)); }
    return out;
  }

  /* ---------- Cálculo ---------- */
  function calcular(socio, cfg, corteISO) {
    var corte = d(corteISO);
    var pagadoAlCorte = function (fecha) { return fecha && d(fecha) <= corte; };

    // Cuotas de membresía: vencen el primer día de cada mes.
    var cuotas = mesesPeriodo(cfg).map(function (m) {
      var k = claveMes(m), p = (socio.cuotas || {})[k], vence = m <= corte;
      var pago = p && pagadoAlCorte(p.fecha) ? +p.pago : 0;
      var pend = vence ? Math.max(0, cfg.cuotaMensual - pago) : 0;
      var usado = vence || pago > 0;
      return { mes: k, medio: pago ? p.medio : '', fecha: pago ? corta(p.fecha) : '', pago: pago, pendiente: pend, obs: pago ? (p.obs || '') : '', usado: usado };
    });

    // Sesiones: macería por sesión, inasistencias según el tipo. Las extraordinarias no se cobran.
    var sesiones = [];
    for (var n = cfg.sesionInicial; n <= cfg.sesionFinal; n++) {
      var s = (socio.sesiones || {})[n];
      var realizada = !!(s && s.fecha && d(s.fecha) <= corte);
      if (!realizada) { sesiones.push({ n: n, vacia: true }); continue; }
      var cobro = s.extraordinaria ? 0 : (s.asistencia === 'I' ? cfg.inasistenciaInjustificada : s.asistencia === 'J' ? cfg.inasistenciaJustificada : cfg.maceriaMinima);
      var pagado = pagadoAlCorte(s.fechaPago) ? +(s.monto || 0) : 0;
      sesiones.push({
        n: n, fecha: corta(s.fecha), fechaPago: s.extraordinaria ? 'N/A' : (pagado ? corta(s.fechaPago) : ''),
        monto: pagado, pendiente: Math.max(0, cobro - pagado), medio: pagado ? s.medio : '',
        obs: s.extraordinaria ? 'SESIÓN EXTRAORDINARIA NO SE COBRA' : (pagado ? (s.obs || '') : ''),
        extraordinaria: !!s.extraordinaria, puntos: PUNTOS[s.asistencia || 'A']
      });
    }
    var hechas = sesiones.filter(function (s) { return !s.vacia; });
    var asistencia = hechas.length ? hechas.reduce(function (a, s) { return a + s.puntos; }, 0) / hechas.length : 1;

    var otras = (socio.otras || []).filter(function (o) { return d(o.fecha || o.vence) <= corte; }).map(function (o) {
      var pag = pagadoAlCorte(o.fecha) ? +o.pagado : 0;
      return { concepto: o.concepto, metodo: pag ? o.metodo : '', fecha: pag ? corta(o.fecha) : '', pagado: pag, porPagar: Math.max(0, +o.monto - pag) };
    });

    var sum = function (arr, k) { return arr.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
    var resumen = [
      { concepto: 'Cuotas de membresía', pagado: sum(cuotas, 'pago'), pendiente: sum(cuotas, 'pendiente') },
      { concepto: 'Cuotas de macerías e inasistencias', pagado: sum(hechas, 'monto'), pendiente: sum(hechas, 'pendiente') },
      { concepto: 'Otras cuotas', pagado: sum(otras, 'pagado'), pendiente: sum(otras, 'porPagar') }
    ];
    var totalPagado = sum(resumen, 'pagado'), totalPendiente = sum(resumen, 'pendiente');

    return {
      corte: corteISO, corteLarga: larga(corteISO), mesCorte: MES_LARGO[corte.getMonth()],
      cuotas: cuotas, sesiones: sesiones, otras: otras, resumen: resumen,
      totalPagado: totalPagado, totalPendiente: totalPendiente,
      asistencia: asistencia, sesionesRealizadas: hechas.length
    };
  }

  /* Nombre del archivo: DSolis_Ago_26.pdf */
  function nombreArchivo(socio, corteISO) {
    var limpio = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, ''); };
    var p = socio.nombre.trim().split(/\s+/), x = d(corteISO);
    return limpio(p[0]).charAt(0).toUpperCase() + limpio(p.length >= 3 ? p[p.length - 2] : (p[1] || p[0])) + '_' + cap(MES[x.getMonth()]) + '_' + String(x.getFullYear()).slice(2) + '.pdf';
  }

  /* ---------- PDF ---------- */
  var C = {
    navy: [0, 32, 96], celeste: [220, 232, 246], amarillo: [255, 192, 0], verde: [146, 208, 80],
    barra: [38, 114, 194], titulo: [11, 42, 122], gris: [127, 127, 127], grisClaro: [242, 242, 242],
    linea: [150, 150, 150], texto: [30, 30, 30], rojo: [230, 0, 0], obsFondo: [220, 232, 246]
  };
  var X0 = 18.3, ANCHO = 176;

  function generar(socio, cfg, corteISO, logoDataUrl) {
    var JS = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    var doc = new JS({ unit: 'mm', format: 'a4' });
    var F = global.FUENTES_PDF;
    doc.addFileToVFS('Arimo-Regular.ttf', F.regular); doc.addFont('Arimo-Regular.ttf', 'Arimo', 'normal');
    doc.addFileToVFS('Arimo-Bold.ttf', F.bold); doc.addFont('Arimo-Bold.ttf', 'Arimo', 'bold');
    doc.addFont('Arimo-Regular.ttf', 'Arimo', 'italic');
    doc.setFont('Arimo', 'normal');
    doc.setProperties({ title: 'Estado de cuenta ' + cap(MES_LARGO[d(corteISO).getMonth()]) + ' - ' + socio.nombre, author: cfg.emitidoPor, creator: cfg.club + ' - ' + cfg.tesoreria });

    var e = calcular(socio, cfg, corteISO);

    /* Encabezado */
    if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', 19.5, 22.5, 30, 30);
    doc.setTextColor.apply(doc, C.texto);
    doc.setFont('Arimo', 'bold'); doc.setFontSize(11.5);
    doc.text(cfg.club.toUpperCase(), 53.6, 28.2);
    doc.text(cfg.tesoreria.toUpperCase(), 53.6, 34.4);
    doc.setFont('Arimo', 'normal'); doc.setFontSize(11); doc.setTextColor(85, 85, 85);
    doc.text('PERIODO ' + cfg.periodo, 53.6, 40.3);
    doc.setFont('Arimo', 'bold'); doc.setFontSize(6.2);
    doc.text('Emitido por: ' + cfg.emitidoPor, 53.6, 44.2);
    doc.setFontSize(15.5); doc.setTextColor.apply(doc, C.titulo);
    doc.text('ESTADO DE CUENTA ' + e.mesCorte.toUpperCase(), 106.2, 55.2, { align: 'center' });
    doc.setFillColor.apply(doc, C.barra); doc.rect(X0, 56.6, ANCHO, 3.3, 'F');

    var base = {
      theme: 'grid', margin: { left: X0, right: 210 - X0 - ANCHO, top: 22, bottom: 16 },
      styles: { font: 'Arimo', fontSize: 7, cellPadding: { top: 0.75, bottom: 0.75, left: 1.2, right: 1.4 }, lineColor: C.linea, lineWidth: 0.15, textColor: C.texto, valign: 'middle', minCellHeight: 3.9 },
      headStyles: { fillColor: C.celeste, textColor: C.texto, fontStyle: 'bold', halign: 'center', fontSize: 7.4 },
      showHead: 'firstPage', rowPageBreak: 'avoid'
    };
    function seccion(titulo, cols) { return [{ content: titulo, colSpan: cols, styles: { fillColor: C.navy, textColor: [255, 255, 255], fontSize: 8.6, halign: 'center', minCellHeight: 5.3 } }]; }
    /* Dibuja el ₡ a la izquierda de las columnas de dinero, como en la hoja de Tesorería. */
    function conColon(columnas) {
      return function (h) {
        if (h.section === 'head' || columnas.indexOf(h.column.index) < 0) return;
        var t = (h.cell.text || []).join('');
        if (!t || h.cell.raw === null || (h.cell.raw && h.cell.raw.sinColon)) return;
        var st = h.cell.styles;
        doc.setFont('Arimo', st.fontStyle === 'bold' ? 'bold' : 'normal'); doc.setFontSize(st.fontSize);
        var col = st.textColor; doc.setTextColor(col[0], col[1], col[2]);
        doc.text('₡', h.cell.x + 1.2, h.cell.y + h.cell.height / 2, { baseline: 'middle' });
      };
    }
    function siguiente(gap) { return doc.lastAutoTable.finalY + (gap || 4.6); }
    function plata(cols) { var o = {}; cols.forEach(function (c) { o[c] = { halign: 'right' }; }); return o; }

    /* Datos del socio */
    var etiqueta = { fontStyle: 'bold', fontSize: 6.9 };
    doc.autoTable(Object.assign({}, base, {
      startY: 63.4, margin: { left: X0, right: 210 - 107.3 },
      styles: Object.assign({}, base.styles, { fontSize: 6.9, minCellHeight: 3.9, cellPadding: { top: 0.5, bottom: 0.5, left: 1, right: 1 } }),
      columnStyles: { 0: { cellWidth: 34.8, fontStyle: 'bold' }, 1: { cellWidth: 54.2 } },
      body: [
        [{ content: 'Socio:', styles: etiqueta }, socio.nombre],
        ['Fecha de corte:', e.corteLarga],
        [{ content: 'Cuenta bancaria (socios):', styles: { halign: 'center' } }, { content: cfg.cuentaNombre, styles: { fontSize: 5.6 } }],
        ['IBAN:', 'IBAN: ' + cfg.iban],
        ['SINPE Móvil:', cfg.sinpe],
        [{ content: 'Calificación de asistencia:', styles: { halign: 'center' } }, { content: Math.round(e.asistencia * 100) + '%', styles: { fontStyle: 'bold', fontSize: 9 } }],
        [{ content: 'Total por pagar:', styles: { textColor: C.rojo, fontSize: 9.6 } }, { content: celda(e.totalPendiente), styles: { textColor: C.rojo, fontStyle: 'bold', fontSize: 9.6, halign: 'right', cellPadding: { left: 1, right: 4 } } }]
      ],
      didDrawCell: function (h) {
        if (h.row.index === 6 && h.column.index === 1) {
          doc.setFont('Arimo', 'bold'); doc.setFontSize(9.6); doc.setTextColor.apply(doc, C.rojo);
          doc.text('₡', h.cell.x + 3.5, h.cell.y + h.cell.height / 2, { baseline: 'middle' });
        }
      }
    }));
    var finIzq = doc.lastAutoTable.finalY;

    /* Montos establecidos */
    doc.autoTable(Object.assign({}, base, {
      startY: 63.4, margin: { left: 124.5, right: 210 - 194.3 }, theme: 'plain',
      styles: Object.assign({}, base.styles, { fontSize: 5.5, lineWidth: 0, cellPadding: { top: 0.6, bottom: 0.6, left: 1.2, right: 1 }, fillColor: C.grisClaro }),
      head: [[{ content: 'Montos establecidos', colSpan: 2, styles: { fillColor: C.gris, textColor: [255, 255, 255], fontSize: 7.6, halign: 'center' } }]],
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 19.8 } },
      body: cfg.montos.map(function (m) { return ['•  ' + m.concepto, colones(m.monto)]; }),
      didDrawCell: function (h) {
        if (h.section !== 'body') return;
        doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
        doc.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
      }
    }));
    var y = Math.max(finIzq, doc.lastAutoTable.finalY) + 5.5;

    /* Resumen */
    var tot = { fillColor: C.amarillo, fontStyle: 'bold', fontSize: 8.2 };
    var totN = { fillColor: C.amarillo, fontStyle: 'bold', fontSize: 7.3 };
    doc.autoTable(Object.assign({}, base, {
      startY: y,
      head: [seccion('RESUMEN DEL ESTADO DE CUENTA', 3), ['Concepto', 'Total pagado en el periodo', 'Pendiente']],
      columnStyles: { 0: { cellWidth: 71.6, halign: 'center' }, 1: { cellWidth: 52.3, halign: 'right' }, 2: { cellWidth: 52.1, halign: 'right' } },
      styles: Object.assign({}, base.styles, { fontSize: 7.8, minCellHeight: 5.2 }),
      body: e.resumen.map(function (r) { return [r.concepto, celda(r.pagado), celda(r.pendiente)]; }).concat([[
        { content: 'TOTAL', styles: Object.assign({ halign: 'center' }, tot) }, { content: celda(e.totalPagado), styles: tot }, { content: celda(e.totalPendiente), styles: tot }
      ]]),
      didDrawCell: conColon([1, 2])
    }));

    /* Cuotas de membresía */
    doc.autoTable(Object.assign({}, base, {
      startY: siguiente(),
      head: [seccion('CUOTAS DE MEMBRESÍA', 6), ['Mes', 'Medio', 'Fecha de\npago', 'Pago', 'Pendiente', 'Observación']],
      columnStyles: Object.assign({ 0: { cellWidth: 17.3, halign: 'center' }, 1: { cellWidth: 17.5, halign: 'center' }, 2: { cellWidth: 19.3, halign: 'center' }, 5: { cellWidth: 87.1, fontSize: 6.4 } }, { 3: { cellWidth: 17.5, halign: 'right' }, 4: { cellWidth: 17.3, halign: 'right' } }),
      body: e.cuotas.map(function (c) {
        return [c.mes, c.medio, c.fecha, c.usado ? celda(c.pago) : '', c.usado ? celda(c.pendiente) : '', c.obs];
      }).concat([[
        { content: 'TOTAL', colSpan: 3, styles: Object.assign({ halign: 'center' }, tot) },
        { content: celda(e.resumen[0].pagado), styles: totN }, { content: celda(e.resumen[0].pendiente), styles: totN },
        { content: '', styles: { lineWidth: 0 } }
      ]]),
      didDrawCell: conColon([3, 4])
    }));

    /* Macerías e inasistencias */
    var verde = { fillColor: C.verde, textColor: [255, 255, 255], fontStyle: 'bold' };
    doc.autoTable(Object.assign({}, base, {
      startY: siguiente(),
      head: [seccion('CUOTAS DE MACERÍAS E INASISTENCIAS', 7), ['N° de\nsesión', 'Fecha de\nsesión', 'Fecha de\npago', 'Monto\npagado', 'Pendiente', 'Medio', 'Concepto | Observación']],
      columnStyles: { 0: { cellWidth: 17.3, halign: 'center' }, 1: { cellWidth: 17.5, halign: 'center' }, 2: { cellWidth: 19.3, halign: 'center' }, 3: { cellWidth: 17.5, halign: 'right' }, 4: { cellWidth: 17.3, halign: 'right' }, 5: { cellWidth: 17.3 }, 6: { cellWidth: 69.8, fontSize: 6.4 } },
      body: e.sesiones.map(function (s) {
        if (s.vacia) return [s.n, '', '', '', '', '', ''];
        var row = [s.n, s.fecha, s.fechaPago, s.extraordinaria ? '-' : celda(s.monto), s.extraordinaria ? '-' : celda(s.pendiente), s.medio, s.obs];
        return s.extraordinaria ? row.map(function (v, i) { return { content: v, styles: Object.assign({}, verde, i === 6 ? { fontSize: 7 } : {}) }; }) : row;
      }).concat([[
        { content: 'TOTAL', colSpan: 3, styles: Object.assign({ halign: 'center' }, tot) },
        { content: celda(e.resumen[1].pagado), styles: totN }, { content: celda(e.resumen[1].pendiente), styles: totN },
        { content: '', colSpan: 2, styles: { lineWidth: 0 } }
      ]]),
      didDrawCell: conColon([3, 4])
    }));

    /* Porcentaje de asistencia: 5 columnas de 7 sesiones */
    var lista = e.sesiones, filas = Math.max(7, Math.ceil(lista.length / 5)), cuerpo = [];
    for (var r = 0; r < filas; r++) {
      var fila = [];
      for (var c = 0; c < 5; c++) {
        var s = lista[c * filas + r];
        fila.push(s ? { content: String(s.n), styles: { halign: 'center' } } : '', s && !s.vacia ? { content: String(s.puntos), styles: { halign: 'center' } } : '');
      }
      cuerpo.push(fila);
    }
    var cols10 = {}; for (var k = 0; k < 10; k++) cols10[k] = { cellWidth: 17.6 };
    doc.autoTable(Object.assign({}, base, {
      startY: siguiente(5.5), pageBreak: 'auto',
      head: [seccion('PORCENTAJE DE ASISTENCIA', 10),
        [{ content: 'Asistencia: 1 punto | Inasistencia Justificada: 0,5 puntos | Inasistencia Injustificada: 0 puntos', colSpan: 7, styles: { fillColor: [255, 255, 255], fontStyle: 'normal', fontSize: 5.6 } },
         { content: 'Porcentaje', colSpan: 2, styles: { fillColor: [255, 255, 255], textColor: C.rojo, fontSize: 8 } },
         { content: Math.round(e.asistencia * 100) + '%', styles: { fillColor: [255, 255, 255], textColor: C.rojo, fontSize: 8, halign: 'right' } }],
        ['Sesión', 'Puntuación', 'Sesión', 'Puntuación', 'Sesión', 'Puntuación', 'Sesión', 'Puntuación', 'Sesión', 'Puntuación']],
      styles: Object.assign({}, base.styles, { fontSize: 6.6, minCellHeight: 3.4, cellPadding: 0.4 }),
      headStyles: Object.assign({}, base.headStyles, { fontSize: 6.6, cellPadding: 0.5 }),
      columnStyles: cols10, body: cuerpo
    }));

    /* Otras cuotas */
    var otrasBody = e.otras.length ? e.otras.map(function (o) { return [o.concepto, o.metodo, o.fecha, celda(o.pagado), celda(o.porPagar)]; })
      : [[{ content: 'Sin transacciones registradas en el periodo', colSpan: 5, styles: { halign: 'center', fontStyle: 'italic', fontSize: 6, textColor: [60, 60, 60] } }]];
    doc.autoTable(Object.assign({}, base, {
      startY: siguiente(5.5),
      head: [seccion('OTRAS CUOTAS', 5), ['Concepto', 'Método', 'Fecha de pago', 'Pagado', 'Por pagar']],
      headStyles: Object.assign({}, base.headStyles, { fontSize: 6.8 }),
      columnStyles: { 0: { cellWidth: 88.7 }, 1: { cellWidth: 17.3, halign: 'center' }, 2: { cellWidth: 35, halign: 'center' }, 3: { cellWidth: 17.5, halign: 'right' }, 4: { cellWidth: 17.5, halign: 'right' } },
      body: otrasBody, didDrawCell: conColon(e.otras.length ? [3, 4] : [])
    }));

    /* Observaciones */
    doc.autoTable(Object.assign({}, base, {
      startY: siguiente(5.5), theme: 'plain',
      head: [seccion('OBSERVACIONES', 1)],
      body: [[{ content: socio.observaciones || '', styles: { fillColor: C.obsFondo, minCellHeight: 27, valign: 'top', fontSize: 7.4, cellPadding: 2.5 } }]]
    }));

    return { doc: doc, archivo: nombreArchivo(socio, corteISO), estado: e };
  }

  global.EstadoCuenta = { calcular: calcular, generar: generar, nombreArchivo: nombreArchivo, colones: colones, corta: corta, larga: larga, mesesPeriodo: mesesPeriodo, claveMes: claveMes, MES_LARGO: MES_LARGO };
})(typeof window !== 'undefined' ? window : globalThis);
