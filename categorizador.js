/**
 * Brisa · categorizador de movimientos (v0.1)
 *
 * 1. leerExtracto(filas)  → convierte las filas del Excel del banco en movimientos limpios
 * 2. categorizar(mov, opciones) → { categoria, confianza, motivo, cuentaComoGasto, aplazado }
 * 3. aprender(reglas, mov, categoria) → guarda la corrección del usuario como regla
 * 4. detectarFijos(movs) → marca los movimientos que se repiten cada mes
 *
 * Probado con el extracto «Últimos movimientos» de BBVA (.xlsx).
 * Sin dependencias: funciona igual en el navegador (PWA) que en Node.
 */

const CATEGORIAS = [
  'Ingresos', 'Ahorro', 'Rescate del ahorro', 'Supermercado', 'Comer fuera', 'Transporte',
  'Coche y gasolina', 'Suscripciones', 'Facturas', 'Compras', 'Cuidado personal', 'Salud',
  'Mascotas', 'Deporte', 'Estanco', 'Ocio y planes', 'Viajes', 'Regalos', 'Efectivo', 'Seguros',
  'Impuestos y comisiones', 'Otra cuenta', 'Por revisar'
];

// Categorías que NO son gasto: mover dinero entre tus propias cuentas.
const NO_ES_GASTO = new Set(['Ingresos', 'Ahorro', 'Rescate del ahorro']);

/* ---------- 1. Leer el Excel ---------- */

// Nombres de cabecera que usan distintos bancos para cada dato.
const CABECERAS = {
  fecha: ['fecha', 'fecha operacion', 'fecha operación', 'f. operacion'],
  fechaValor: ['f.valor', 'f. valor', 'fecha valor'],
  concepto: ['concepto', 'descripcion', 'descripción', 'detalle'],
  tipo: ['movimiento', 'tipo', 'tipo de movimiento'],
  importe: ['importe', 'cantidad', 'importe (eur)'],
  saldo: ['disponible', 'saldo'],
  observaciones: ['observaciones', 'mas datos', 'más datos', 'información adicional']
};

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => sinTildes(s).toLowerCase().trim();

function leerExtracto(filas) {
  // Busca la fila de cabecera: la primera que tenga "concepto" e "importe" (o sinónimos).
  let cab = -1, mapa = {};
  for (let i = 0; i < Math.min(filas.length, 30) && cab < 0; i++) {
    const celdas = (filas[i] || []).map(clave);
    const m = {};
    for (const [campo, nombres] of Object.entries(CABECERAS)) {
      const idx = celdas.findIndex((c) => nombres.map(clave).includes(c));
      if (idx >= 0 && m[campo] === undefined) m[campo] = idx;
    }
    if (m.concepto !== undefined && m.importe !== undefined) { cab = i; mapa = m; }
  }
  if (cab < 0) throw new Error('No encuentro las columnas de concepto e importe en este archivo.');

  const movs = [];
  for (const f of filas.slice(cab + 1)) {
    if (!f || f[mapa.importe] === null || f[mapa.importe] === undefined || f[mapa.importe] === '') continue;
    movs.push({
      fecha: aFecha(f[mapa.fecha ?? mapa.fechaValor]),
      fechaValor: aFecha(f[mapa.fechaValor ?? mapa.fecha]),
      concepto: String(f[mapa.concepto] ?? '').trim(),
      tipo: String(f[mapa.tipo] ?? '').trim(),
      importe: aNumero(f[mapa.importe]),
      saldo: mapa.saldo !== undefined ? aNumero(f[mapa.saldo]) : null,
      observaciones: String(f[mapa.observaciones] ?? '').trim()
    });
  }
  return movs;
}

function aFecha(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); // fecha de Excel
  const m = String(v ?? '').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return String(v ?? '').slice(0, 10);
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function aNumero(v) {
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s|€|EUR/gi, '');
  // "1.234,56" → 1234.56 ; "1234.56" se queda igual
  return parseFloat(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s) || 0;
}

/* ---------- Limpieza del texto ---------- */

// "Mercadona virgen carmen  madrid       es" → "mercadona virgen carmen"
// "Bolt.euo2610022300" → "bolt" ; "Amazon prime*nv1uz02p4" → "amazon prime"
function limpiar(concepto) {
  let s = clave(concepto);
  s = s.replace(/\s{2,}.*$/, '');               // la ciudad y el país van tras varios espacios
  s = s.replace(/[*#.]?[a-z]*\d[\w-]{3,}/g, ' '); // códigos de operación y referencias
  s = s.replace(/[*]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/* ---------- 2. Reglas ---------- */

// Orden importante: la primera regla que coincide gana.
const REGLAS = [
  // Movimientos entre tus cuentas (no son gasto)
  [/trp ahorro|ahorro nomina|trp redondeo|redondeo tarjeta/, 'Ahorro'],
  // Ingresos
  [/abono de nomina|nomina/, 'Ingresos', { soloPositivo: true }],
  [/bonificacion/, 'Ingresos', { soloPositivo: true }],
  // Banco y Estado
  [/pago de impuestos|agencia tributaria|aeat/, 'Impuestos y comisiones'],
  [/liquidacion de intereses|comision/, 'Impuestos y comisiones'],
  [/ret\.? efectivo|cajero/, 'Efectivo'],
  // Seguros y mascotas
  [/barkibu|tiendanimal|kiwoko|veterinari/, 'Mascotas'],
  [/mutua|seguro|mapfre|axa|linea directa/, 'Seguros'],
  // Supermercado
  [/mercadona|carref|carrefour|ahorramas|aldi|lidl|\bdia\b|coviran|eroski|alcampo|hipercor|alimentacion|minimarket|smarket|life market|haimiao|plaza china|express sta|supermercado|fruteria|panaderia/, 'Supermercado'],
  // Comer fuera
  [/\bbar\b|cafe|cafeteria|cerveceria|\brest\b|restaurante|honest greens|costa coffee|telepizza|just eat|glovo|uber eats|rodilla|falafel|helados|malvon|maclaren|low country|pizza|burger|kebab|sushi|taberna|bubble/, 'Comer fuera'],
  // Transporte
  [/\bemt\b|metro de madrid|crtm|renfe|cabify|uber|bolt|free2move|movilidad mmd|voltio|taxi|alsa|blablacar/, 'Transporte'],
  // Estanco (antes que gasolina: comparten palabras)
  [/estanco|expendeduria/, 'Estanco'],
  // Coche
  [/cepsa|repsol|galp|moeve|cedipsa|\be\.\s?s[. ]|\ba\.s\.|norauto|aurgi|autopista|parking|\bitv\b|monegros|km200/, 'Coche y gasolina'],
  // Suscripciones
  [/spotify|hbomax|hbo max|netflix|filmin|disney|google one|amazon prime|podimo|anthropic|google play|youtube|icloud|apple\.com|klarna member/, 'Suscripciones'],
  // Facturas
  [/digi spain|movistar|vodafone|orange|iberdrola|endesa|naturgy|canal de isabel|totalenergies/, 'Facturas'],
  // Viajes
  [/travelodge|booking|airbnb|ryanair|vueling|iberia|ukvi|hotel|pack viajes/, 'Viajes'],
  // Ocio
  [/dice\.fm|fever|xoyo|festival|cashless eventos|entradas|ticketmaster|cine|yelmo|teatro|museo/, 'Ocio y planes'],
  // Cuidado y salud
  [/farmacia|clinica|dentista|optica/, 'Salud'],
  [/primor|aromas|sephora|druni|peluqueria|esencias/, 'Cuidado personal'],
  // Compras
  [/amazon|aliexpress|vinted|shein|zara|primark|ikea|el corte ingles|decathlon/, 'Compras'],
  // Billeteras: el dinero sale a otra cuenta tuya
  [/revolut|n26|paypal/, 'Otra cuenta']
];

// Palabras del concepto de un Bizum que delatan para qué era.
const PISTAS_BIZUM = [
  [/regalo|cumple/, 'Regalos'],
  [/vacaciones|viaje|hotel|vuelo/, 'Viajes'],
  [/cafe|vermut|croq|cena|comida|comir|pizza|bubble tea|birra|cana|tapas/, 'Comer fuera'],
  [/entrad|concierto|festival|cine/, 'Ocio y planes'],
  [/gasolina|peaje/, 'Coche y gasolina'],
  [/super|compra/, 'Supermercado']
];

/**
 * @param mov  movimiento de leerExtracto
 * @param opts { reglasUsuario: {clave: categoria}, palabras: [{contiene: ['pole'], categoria, nota}],
 *               importes: [{tipo: 'efectivo', min: 165, max: 175, categoria, nota, importe}],
 *               titular: 'nombre apellidos' }
 */
function categorizar(mov, opts = {}) {
  const reglasUsuario = opts.reglasUsuario || {};
  const titular = clave(opts.titular || '');
  const texto = clave(`${mov.concepto} ${mov.tipo} ${mov.observaciones}`);
  const k = claveRegla(mov);
  const regla = reglasUsuario[k];
  const aplazado = /klarna|scalapay|aplazame|sequra/.test(texto) || !!(regla && regla.aplazado);
  const r = (categoria, confianza, motivo) => ({
    categoria, confianza, motivo, aplazado,
    cuentaComoGasto: !NO_ES_GASTO.has(categoria) && mov.importe < 0
  });

  // 1. Lo que el usuario ya ha enseñado siempre gana
  // Una regla puede ser solo la categoría ('Regalos') o un objeto
  // { categoria, aplazado, terminado: 'AAAA-MM' } para pagos a plazos ya acabados.
  if (regla) return r(typeof regla === 'string' ? regla : regla.categoria, 1, 'Lo aprendí de ti');

  // 2. Traspasos entre tus propias cuentas (BBVA los llama «Traspaso desde/a cuenta»)
  const c0 = clave(mov.concepto);
  if (/^traspaso desde cuenta/.test(c0)) return r('Rescate del ahorro', 0.95, 'Dinero que vuelve de tu otra cuenta');
  if (/^traspaso (a cuenta|programa)/.test(c0)) return r('Ahorro', 0.95, 'Dinero que mandas a tu ahorro');
  if (titular && texto.includes(titular)) {
    return mov.importe > 0 ? r('Rescate del ahorro', 0.95, 'Dinero que vuelve de tu otra cuenta')
                           : r('Ahorro', 0.95, 'Dinero que mandas a tu otra cuenta');
  }

  // 2b. Palabras que el usuario asoció a una categoría ("pole" → Deporte)
  for (const p of opts.palabras || []) {
    const hit = p.contiene.some((w) => new RegExp('\\b' + clave(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(texto));
    if (hit && mov.importe < 0) return r(p.categoria, 0.95, p.nota || 'Lo aprendí de ti');
  }

  // 2c. Pagos que el usuario reconoce por su importe ("si saco 170 € es el pole")
  //     { tipo: 'efectivo' | 'transferencia', min, max, categoria, nota, importe }
  //     Si lleva 'importe', solo esa parte es de la categoría; el resto queda como Efectivo.
  for (const p of opts.importes || []) {
    const esTipo = p.tipo === 'efectivo' ? /ret\.? efectivo|cajero/.test(texto)
                 : p.tipo === 'transferencia' ? /^transferencia realizada/.test(clave(mov.concepto)) : false;
    const abs = Math.abs(mov.importe);
    if (mov.importe < 0 && esTipo && abs >= p.min && abs <= p.max) {
      const res = r(p.categoria, 0.9, p.nota || 'Lo aprendí de ti');
      if (p.importe && p.importe < abs) {
        res.reparto = [
          { categoria: p.categoria, importe: -p.importe },
          { categoria: p.tipo === 'efectivo' ? 'Efectivo' : 'Por revisar', importe: -(abs - p.importe) }
        ];
      }
      return res;
    }
  }

  // 3. Bizum: depende del concepto que se escribió
  if (/^bizum/.test(clave(mov.concepto))) {
    if (mov.importe > 0) return r('Ingresos', 0.7, 'Bizum recibido');
    const concepto = clave(mov.tipo).replace(/^enviado:\s*/, '');
    for (const [re, cat] of PISTAS_BIZUM) if (re.test(concepto)) return r(cat, 0.75, `Bizum «${concepto}»`);
    return r('Por revisar', 0, `Bizum «${concepto}»: ¿qué era?`);
  }

  // 4. Diccionario de comercios y palabras clave
  for (const [re, cat, cond] of REGLAS) {
    if (cond?.soloPositivo && mov.importe <= 0) continue;
    if (re.test(texto)) return r(cat, 0.9, mov.importe > 0 ? 'Te devolvieron dinero' : 'Comercio conocido');
  }

  // 5. Cualquier otro ingreso
  if (mov.importe > 0) return r('Ingresos', 0.75, 'Dinero que entra');

  // 6. Pago aplazado sin comercio reconocible
  if (aplazado) return r('Por revisar', 0, 'Pago aplazado: ¿de qué compra era?');

  // 7. No lo sé: te pregunto
  return r('Por revisar', 0, 'No reconozco este comercio');
}

/* ---------- 3. Aprender de las correcciones ---------- */

// La clave de una regla: el comercio limpio, o para un Bizum, su concepto.
function claveRegla(mov) {
  if (/^bizum/.test(clave(mov.concepto))) {
    return 'bizum:' + clave(mov.tipo).replace(/^(enviado|recibido):\s*/, '')
      .replace(/\d+|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  // En transferencias y recibos el concepto es genérico ("Transferencia realizada")
  // y el destinatario viene en la columna Movimiento: usamos ese.
  if (/^(transferencia|adeudo|traspaso|abono)/.test(clave(mov.concepto)) && mov.tipo) {
    return clave(mov.concepto).split(' ')[0] + ':' + limpiar(mov.tipo);
  }
  return limpiar(mov.concepto) || clave(mov.tipo);
}

function aprender(reglasUsuario, mov, categoria, extra) {
  return { ...reglasUsuario, [claveRegla(mov)]: extra ? { categoria, ...extra } : categoria };
}

// Marca un pago a plazos como terminado: su historial se conserva,
// pero deja de contarse como gasto fijo en los presupuestos futuros.
function terminarPago(reglasUsuario, claveR, mes) {
  const actual = reglasUsuario[claveR];
  const base = typeof actual === 'string' ? { categoria: actual } : (actual || { categoria: 'Por revisar' });
  return { ...reglasUsuario, [claveR]: { ...base, aplazado: true, terminado: mes } };
}

/* ---------- 4. Gastos que se repiten cada mes ---------- */

function detectarFijos(movs, reglasUsuario = {}) {
  const grupos = {};
  const variables = /mercadona|carref|ahorramas|aldi|lidl|ret\.? efectivo|cajero/;
  for (const m of movs) {
    if (m.importe >= 0 || variables.test(clave(m.concepto))) continue;
    const regla = reglasUsuario[claveRegla(m)];
    if (regla && regla.terminado) continue; // pago a plazos ya acabado
    (grupos[claveRegla(m)] ||= []).push(m);
  }
  const fijos = new Set();
  for (const [k, lista] of Object.entries(grupos)) {
    const meses = new Set(lista.map((m) => m.fecha.slice(0, 7)));
    const importes = lista.map((m) => Math.abs(m.importe));
    const media = importes.reduce((a, b) => a + b, 0) / importes.length;
    const parecidos = importes.every((x) => Math.abs(x - media) <= media * 0.15);
    if (meses.size >= 2 && parecidos && lista.length <= meses.size + 1) fijos.add(k);
  }
  return fijos;
}

const api = { CATEGORIAS, leerExtracto, limpiar, categorizar, aprender, terminarPago, claveRegla, detectarFijos };
if (typeof module !== 'undefined') module.exports = api;
else if (typeof window !== 'undefined') window.BrisaCategorizador = api;
