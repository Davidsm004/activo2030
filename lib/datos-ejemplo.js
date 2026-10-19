/*
 * DATOS DE EJEMPLO para la propuesta. En la versión real todo esto vive cifrado en la rama `datos`
 * (configuración general con la llave del administrador; cada socio con su propia llave).
 * El IBAN y los comprobantes son ficticios.
 */
window.CONFIG_CLUB = {
  club: 'Club Activo 20-30 de San José',
  tesoreria: 'Tesorería',
  periodo: '2026-2027',
  emitidoPor: 'David Solís Miranda -Tesorero 2026-2027',
  cuentaNombre: 'ASOCIACIÓN CLUB ACTIVO VEINTE TREINTA INTERNACIONAL SAN JOSÉ',
  iban: 'CR00 0000 0000 0000 0000 00',
  sinpe: '8401-2030',
  inicioPeriodo: '2026-07-01',
  mesesPorPeriodo: 13,
  sesionInicial: 2355,
  sesionFinal: 2384,
  cuotaMensual: 6000,
  maceriaMinima: 1000,
  inasistenciaJustificada: 1000,
  inasistenciaInjustificada: 5000,
  montos: [
    { concepto: 'Cuota de membresía mensual:', monto: 6000 },
    { concepto: 'Inasistencia justificada a sesión (Aprobado en sesion 2357):', monto: 1000 },
    { concepto: 'Inasistencia injustificada a sesión:', monto: 5000 },
    { concepto: 'Mínimo macería de socio por sesión:', monto: 1000 },
    { concepto: 'Chaleco nuevo socio:', monto: 21000 },
    { concepto: 'Cuota de ingreso socios:', monto: 35000 }
  ]
};

(function () {
  // Sesiones del club (fechas reales del calendario de ejemplo).
  var calendario = {
    2355: '2026-07-06', 2356: '2026-07-15', 2357: '2026-07-20', 2358: '2026-08-03', 2359: '2026-08-17',
    2360: '2026-08-31', 2361: '2026-09-14', 2362: '2026-09-28', 2363: '2026-10-05'
  };
  var extra = { 2356: true };

  function ref(banco, n) { return banco + ' # 20260' + String(7000000000000000 + n * 7919).slice(0, 17); }

  /* Arma un socio: hasta qué mes pagó la membresía, cuántas sesiones pagó y sus inasistencias. */
  function socio(nombre, correo, clave, opts) {
    var meses = ['jul-26', 'ago-26', 'sep-26', 'oct-26'], fechasPago = ['2026-05-31', '2026-07-31', '2026-08-30', '2026-10-02'];
    var cuotas = {};
    for (var i = 0; i < (opts.mesesPagados || 0); i++) cuotas[meses[i]] = { medio: 'SINPE', fecha: fechasPago[i], pago: 6000, obs: 'COMPROBANTE ' + ref('BAC', i + nombre.length) };
    var sesiones = {}, k = 0;
    Object.keys(calendario).forEach(function (n) {
      n = +n; var asis = (opts.ausencias || {})[n] || 'A', cobro = extra[n] ? 0 : asis === 'I' ? 5000 : 1000;
      var pagar = !extra[n] && k < (opts.sesionesPagadas || 0);
      if (!extra[n]) k++;
      sesiones[n] = { fecha: calendario[n], extraordinaria: !!extra[n], asistencia: asis,
        monto: pagar ? cobro : 0, fechaPago: pagar ? calendario[n] : '', medio: pagar ? 'SINPE' : '', obs: pagar ? ref(n % 2 ? 'BAC' : 'BCR', n) : '' };
    });
    return { nombre: nombre, correo: correo, clave: clave, cuotas: cuotas, sesiones: sesiones, otras: opts.otras || [], observaciones: opts.obs || '' };
  }

  window.SOCIOS_EJEMPLO = [
    socio('David Solís Miranda', 'davidsm004@gmail.com', 'ejemplo2030', { mesesPagados: 2, sesionesPagadas: 2 }),
    socio('Andrés Mora Jiménez', 'andres.mora@correo.com', 'Sierra#22', { mesesPagados: 4, sesionesPagadas: 8 }),
    socio('Daniela Céspedes Solano', 'dani.cespedes@correo.com', 'Reloj-532', { mesesPagados: 1, sesionesPagadas: 3, ausencias: { 2359: 'I', 2361: 'J' } }),
    socio('Felipe Arias Quesada', 'felipe.arias@correo.com', 'Activo!2030', { mesesPagados: 4, sesionesPagadas: 8, otras: [{ concepto: 'Chaleco nuevo socio', monto: 21000, pagado: 21000, metodo: 'SINPE', fecha: '2026-08-10' }] }),
    socio('Valeria Chaves Brenes', 'vale.chaves@correo.com', 'Servir_2026', { mesesPagados: 3, sesionesPagadas: 6, ausencias: { 2362: 'J' } }),
    socio('José Pablo Ulate Ruiz', 'jp.ulate@correo.com', 'Pleno*15', { mesesPagados: 0, sesionesPagadas: 0, ausencias: { 2358: 'I', 2360: 'I' }, otras: [{ concepto: 'Cuota de ingreso socios', monto: 35000, pagado: 0, vence: '2026-07-15' }], obs: 'Pendiente coordinar arreglo de pago con Tesorería.' })
  ];
})();
