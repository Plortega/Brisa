/* Brisa · v0.1 — app web instalable. Todo se guarda en este móvil (localStorage). */
(function () {
  'use strict';
  const B = window.BrisaCategorizador;
  const KEY = 'brisa:v1';
  const RITMOS = { suave: { label: 'Suave', importe: 200, hint: 'Para empezar sin notarlo' },
                   equilibrado: { label: 'Equilibrado', importe: 330, hint: 'Lo que pagabas por el coche' },
                   ambicioso: { label: 'Ambicioso', importe: 450, hint: 'Si quieres ir rápido' } };
  // Gastos que ya están reservados en «lo fijo» y no restan del día a día
  const FIJAS = new Set(['Deporte', 'Suscripciones', 'Seguros', 'Facturas', 'Mascotas', 'Impuestos y comisiones']);
  const COLORES = {
    'Ingresos': '#D5EFE3', 'Ahorro': '#D5EFE3', 'Rescate del ahorro': '#FADCE8', 'Supermercado': '#D5EFE3',
    'Comer fuera': '#F8EDC6', 'Transporte': '#D6E8F7', 'Coche y gasolina': '#D6E8F7', 'Suscripciones': '#EBDFFB',
    'Facturas': '#EBDFFB', 'Compras': '#FADFD2', 'Cuidado personal': '#FADCE8', 'Salud': '#FADCE8',
    'Mascotas': '#F8EDC6', 'Deporte': '#FADCE8', 'Estanco': '#F0E6E9', 'Ocio y planes': '#FADFD2', 'Viajes': '#D6E8F7',
    'Regalos': '#FADCE8', 'Efectivo': '#F0E6E9', 'Seguros': '#EBDFFB', 'Impuestos y comisiones': '#F0E6E9',
    'Otra cuenta': '#F0E6E9', 'Por revisar': '#FFFFFF'
  };
  const BARRAS = ['#E27FA8', '#93C0E6', '#E9A184', '#6FBF98', '#DDC064', '#A99BE8'];
  const ELEGIBLES = B.CATEGORIAS.filter((c) => !['Por revisar'].includes(c));

  /* ---------- Estado ---------- */
  function nuevoEstado() {
    return {
      perfil: null,
      movs: [],
      reglas: JSON.parse(JSON.stringify(window.BRISA_REGLAS_INICIALES || { reglasUsuario: {}, palabras: [], importes: [] })),
      overrides: {},
      metas: [{ id: 'colchon', nombre: 'Tu primer colchón', objetivo: 1000, ahorrado: 0 }],
      limiteRescates: 150,
      fijos: [], fijosEstado: {}, v2: true,
      ahorro: { base: 0, vistos: [] },
      ultimaImportacion: null
    };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || nuevoEstado(); } catch (e) { S = nuevoEstado(); }
  // Migración: el ahorro pasa a calcularse solo. Lo apuntado a mano antes se toma como saldo de partida.
  if (!S.ahorro) {
    const manual = (S.metas || []).reduce((a, m) => a + (Number(m.ahorrado) || 0), 0);
    S.ahorro = { base: manual, vistos: manual ? (S.movs || []).map((m) => m.id) : [] };
  }
  // Id de un movimiento: BBVA cambia el texto del concepto entre descargas
  // (a veces añade la ciudad), así que usamos fecha, importe y saldo resultante.
  function idMov(m) {
    if (m.saldo !== null && m.saldo !== undefined && m.saldo !== '') return [m.fecha, m.fechaValor, m.importe, m.saldo].join('|');
    return [m.fecha, m.fechaValor, m.importe, B.limpiar(m.concepto).slice(0, 12), B.limpiar(m.tipo).slice(0, 12)].join('|');
  }
  if (!S.v2) {
    const mapa = {}; const vistos = new Set(); const limpios = [];
    for (const m of S.movs || []) {
      const nid = idMov(m); mapa[m.id] = nid;
      if (vistos.has(nid)) continue;
      vistos.add(nid); limpios.push({ ...m, id: nid });
    }
    S.movs = limpios;
    const ov = {}; for (const [k, v] of Object.entries(S.overrides || {})) ov[mapa[k] || k] = v; S.overrides = ov;
    if (S.ahorro && S.ahorro.vistos) S.ahorro.vistos = [...new Set(S.ahorro.vistos.map((k) => mapa[k] || k))];
    if (S.ultimaImportacion && S.ultimaImportacion.ids) S.ultimaImportacion.ids = [...new Set(S.ultimaImportacion.ids.map((k) => mapa[k] || k))];
    S.fijos = S.fijos || []; S.fijosEstado = S.fijosEstado || {};
    S.v2 = true;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }
  function guardar() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('No he podido guardar en este móvil.'); }
  }

  /* ---------- Utilidades ---------- */
  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $sheet = document.getElementById('sheet');
  const $file = document.getElementById('file');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function eur(n, dec) {
    const neg = n < 0; n = Math.abs(n);
    const [ent, d] = n.toFixed(dec ? 2 : 0).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + miles + (d ? ',' + d : '') + ' €';
  }
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const fmtF = (iso) => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MESES[m - 1]; };
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dias = (a, b) => Math.round((aDate(b) - aDate(a)) / 86400000);
  const SPARK = '<svg class="spark" viewBox="0 0 24 24" style="stroke:none" aria-hidden="true"><path d="M12 1.5c.7 5.2 2.6 7.3 8.5 8.5-5.9 1.2-7.8 3.3-8.5 8.5-.7-5.2-2.6-7.3-8.5-8.5 5.9-1.2 7.8-3.3 8.5-8.5z"/></svg>';
  const orn = (sz, color, pos, cls) => `<svg class="orn ${cls || ''}" style="${pos};fill:${color}" width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.7 5.2 2.6 7.3 8.5 8.5-5.9 1.2-7.8 3.3-8.5 8.5-.7-5.2-2.6-7.3-8.5-8.5 5.9-1.2 7.8-3.3 8.5-8.5z"/></svg>`;
  const heart = (sz, color, pos) => `<svg class="orn" style="${pos};fill:${color}" width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.8-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.8-8 10.6-8 10.6z"/></svg>`;
  // Diseño pixel acordado: corazones de vida, corazón grande y destello
  const PIX = {"big": "<svg class=\"orn pix-art\" style=\"top: 18px; right: 20px\" aria-hidden=\"true\" width=\"39\" height=\"27\" viewBox=\"0 0 13 9\" shape-rendering=\"crispEdges\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"1\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"3\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"1\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"4\" y=\"2\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"7\" y=\"2\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"2\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"3\" width=\"4\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"5\" y=\"3\" width=\"3\" height=\"1\" fill=\"#B03A72\"/><rect x=\"8\" y=\"3\" width=\"4\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"4\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"4\" y=\"4\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"7\" y=\"4\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"4\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"5\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"5\" width=\"3\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"5\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"6\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"6\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#B03A72\"/></svg>", "spark": "<svg class=\"orn pix-art\" style=\"top: 66px; right: 30px\" aria-hidden=\"true\" width=\"15\" height=\"15\" viewBox=\"0 0 5 5\" shape-rendering=\"crispEdges\"><rect x=\"2\" y=\"0\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"0\" y=\"2\" width=\"5\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/></svg>", "full": "<svg  aria-hidden=\"true\" viewBox=\"0 0 7 6\" shape-rendering=\"crispEdges\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"1\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"3\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"5\" y=\"1\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"6\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"2\" width=\"5\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"3\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/></svg>", "empty": "<svg  aria-hidden=\"true\" viewBox=\"0 0 7 6\" shape-rendering=\"crispEdges\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"1\" width=\"2\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"3\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"1\" width=\"2\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"6\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"2\" width=\"5\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"3\" width=\"3\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/></svg>"};
  const corazones = (n, w, h) => { n = Math.max(0, Math.min(10, Math.round(n))); const sz = (x) => x.replace('<svg', `<svg width="${w}" height="${h}"`); return sz(PIX.full).repeat(n) + sz(PIX.empty).repeat(10 - n); };
  const IC = {
    gear: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M17.7 7.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM11.2 16.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z\" fill=\"currentColor\" fill-opacity=\".2\" stroke=\"none\"/><path d=\"M4 7.5h9.3M17.7 7.5H20M4 16.5h2.8M11.2 16.5H20\"/><circle cx=\"15.5\" cy=\"7.5\" r=\"2.2\"/><circle cx=\"9\" cy=\"16.5\" r=\"2.2\"/></svg>",
    back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 17v-6M9.5 13.5L12 11l2.5 2.5"/></svg>',
    uturn: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8.5 5.5 4.5 9.5l4 4\"/><path d=\"M4.5 9.5h10a5 5 0 0 1 0 10H11\"/></svg>",
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>'
  };
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  /* ---------- Categorías ---------- */
  function cat(m) {
    const c = B.categorizar(m, S.reglas);
    if (S.overrides[m.id]) return { ...c, categoria: S.overrides[m.id], confianza: 1, motivo: 'Lo cambiaste tú', reparto: undefined,
      cuentaComoGasto: !['Ingresos', 'Ahorro', 'Rescate del ahorro'].includes(S.overrides[m.id]) && m.importe < 0 };
    return c;
  }
  function esFijo(m, c, categoria) {
    const regla = S.reglas.reglasUsuario[B.claveRegla(m)];
    if (regla && typeof regla === 'object' && regla.terminado) return true;
    return FIJAS.has(categoria) || (c.motivo === 'Psicóloga' && categoria === 'Salud');
  }
  // Gasto variable (el que resta del día a día) de un movimiento
  function variable(m, c) {
    if (!c.cuentaComoGasto) return 0;
    if (c.reparto) return c.reparto.filter((p) => !esFijo(m, c, p.categoria)).reduce((a, p) => a - p.importe, 0);
    return esFijo(m, c, c.categoria) ? 0 : -m.importe;
  }
  function nombreMov(m) {
    if (/^bizum/i.test(m.concepto)) return 'Bizum · ' + m.tipo.replace(/^(enviado|recibido):\s*/i, '');
    if (/^(transferencia|traspaso|adeudo|abono)/i.test(m.concepto) && m.tipo && !/^otros$/i.test(m.tipo)) return m.tipo;
    const l = B.limpiar(m.concepto) || m.concepto;
    return l.charAt(0).toUpperCase() + l.slice(1);
  }

  /* ---------- Cálculos del ciclo ---------- */
  function ciclo() {
    const hoy = iso(new Date());
    const D = S.perfil ? Number(S.perfil.diaCobro) || 30 : 30;
    const payday = (y, m) => new Date(y, m, Math.min(D, new Date(y, m + 1, 0).getDate()));
    const nominas = S.movs.filter((m) => m.importe > 0 && /nomina/.test(B.limpiar(m.concepto + ' ' + m.tipo)) && m.fecha <= hoy)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    let inicio;
    if (nominas[0] && dias(nominas[0].fecha, hoy) <= 35) inicio = nominas[0].fecha;
    else {
      const h = aDate(hoy); let p = payday(h.getFullYear(), h.getMonth());
      if (p > h) p = payday(h.getFullYear(), h.getMonth() - 1);
      inicio = iso(p);
    }
    const i = aDate(inicio);
    const fin = iso(i.getDate() >= 15 ? payday(i.getFullYear(), i.getMonth() + 1) : payday(i.getFullYear(), i.getMonth()));
    const restantes = Math.max(1, dias(hoy, fin));
    const enCiclo = S.movs.filter((m) => m.fecha >= inicio);
    let gastado = 0, rescates = 0, forzados = 0, porCat = {};
    for (const m of enCiclo) {
      const c = cat(m);
      const v = variable(m, c);
      gastado += v;
      if (v > 0) porCat[c.categoria] = (porCat[c.categoria] || 0) + v;
      if (c.categoria === 'Rescate del ahorro') {
        rescates += m.importe;
        // Si antes del traspaso la cuenta estaba en negativo, fue para cubrir números rojos
        if (typeof m.saldo === 'number' && m.saldo - m.importe < 0) forzados += m.importe;
      }
    }
    const p = S.perfil || { ingresos: 0, fijos: 0, ritmo: 'equilibrado' };
    const ahorro = RITMOS[p.ritmo || 'equilibrado'].importe;
    const presupuesto = Math.max(0, Number(p.ingresos) - Number(p.fijos) - ahorro);
    const queda = presupuesto - gastado;
    // Saldo real: el del movimiento más reciente
    const ult = [...S.movs].filter((m) => typeof m.saldo === 'number')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.imp || 0) - (a.imp || 0) || (a.ord || 0) - (b.ord || 0))[0];
    const fijosC = fijosDelCiclo(fin, inicio);
    const pendiente = fijosC.reduce((a, f) => a + f.pendiente, 0);
    // Pagos con tarjeta retenidos: el Excel no los trae, se apuntan a mano desde la app del banco
    const retenido = S.retenido && S.retenido.importe > 0 ? Number(S.retenido.importe) : 0;
    let hoyPuedes = Math.max(0, queda / restantes), modoSaldo = false, disponible = null;
    if (ult && ult.fecha >= inicio) {
      modoSaldo = true;
      disponible = ult.saldo - pendiente - retenido;
      hoyPuedes = Math.max(0, Math.min(queda, disponible) / restantes);
    }
    return { inicio, fin, restantes, gastado, rescates, forzados, porCat, presupuesto, ahorro, queda, hoyPuedes,
      modoSaldo, retenido, saldo: ult ? ult.saldo : null, saldoFecha: ult ? ult.fecha : null, pendiente, fijosC, disponible };
  }
  // Pagos fijos: pendiente = importe − lo ya pagado este mes (desde el día 1 del mes del próximo cobro)
  function fijosDelCiclo(fin, inicio) {
    const f = aDate(fin); const desdeMes = iso(new Date(f.getFullYear(), f.getMonth(), 1));
    const mesFin = fin.slice(0, 7);
    return (S.fijos || []).filter((x) => (!x.desde || mesFin >= x.desde) && (!x.hasta || mesFin <= x.hasta)).map((x) => {
      let re; try { re = new RegExp(x.busca, 'i'); } catch (e) { re = /$^/; }
      // ventana 'ciclo': cuenta desde el cobro (cuotas que caen justo después de cobrar)
      const desde = x.ventana === 'ciclo' && inicio ? inicio : desdeMes;
      const pagos = S.movs.filter((m) => m.importe < 0 && m.fecha >= desde && m.fecha < fin && re.test(B.limpiar(m.concepto + ' ' + m.tipo))
        && (!x.min || Math.abs(m.importe) >= x.min) && (!x.max || Math.abs(m.importe) <= x.max));
      const pagado = pagos.reduce((a, m) => a - m.importe, 0);
      const est = (S.fijosEstado || {})[fin + '|' + x.id];
      const pendiente = est === 'pagado' ? 0 : est === 'pendiente' ? Number(x.importe) : Math.max(0, Number(x.importe) - pagado);
      return { ...x, pagado, pendiente, manual: !!est };
    });
  }
  /* ---------- Compras a plazos ---------- */
  const PLAZOS = [['Klarna', 'klarna(?!.*member)'], ['Scalapay', 'scalapay'], ['Aplazame', 'aplazame'], ['SeQura', 'sequra'],
    ['Oney', '\\boney\\b'], ['Cofidis', 'cofidis'], ['Pagantis', 'pagantis'], ['PayPal a plazos', 'paypal.*(plazos|en 3|pay in)']];
  const sumarMes = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return iso(d).slice(0, 7); };
  const mesTexto = (ym) => MESES_L[Number(ym.slice(5, 7)) - 1] + ' de ' + ym.slice(0, 4);
  function encajaFijo(x, m) {
    let re; try { re = new RegExp(x.busca, 'i'); } catch (e) { return false; }
    const v = Math.abs(m.importe);
    return re.test(B.limpiar(m.concepto + ' ' + m.tipo)) && (!x.min || v >= x.min) && (!x.max || v <= x.max);
  }
  // n = cuotas que quedan por pagar. Si la de este mes ya está pagada, empieza a contar el mes que viene.
  function ponerCuotas(fijo, n) {
    const c = ciclo(); const mes = c.fin.slice(0, 7);
    const tmp = fijosDelCiclo(c.fin, c.inicio).find((x) => x.id === fijo.id);
    const yaPagada = tmp && tmp.pagado >= Number(fijo.importe) * 0.9;
    fijo.desde = yaPagada ? sumarMes(mes, 1) : mes;
    fijo.hasta = sumarMes(fijo.desde, Math.max(1, n) - 1);
    return fijo;
  }
  // Cargos de Klarna, Scalapay… recientes que no encajan con ningún pago fijo y no se han descartado
  function plazosNuevos() {
    if (!S.movs.length) return [];
    const ign = S.plazosIgnorados || {};
    const lim = iso(new Date(aDate(S.movs[0].fecha).getTime() - 40 * 864e5));
    const vistos = {};
    for (const m of S.movs) {
      if (m.importe >= 0 || m.fecha < lim) continue;
      const t = B.limpiar(m.concepto + ' ' + m.tipo);
      const p = PLAZOS.find(([, re]) => new RegExp(re, 'i').test(t));
      if (!p) continue;
      const k = p[0] + '|' + Math.abs(m.importe).toFixed(2);
      if (ign[k] || vistos[k]) continue;
      if ((S.fijos || []).some((x) => encajaFijo(x, m))) continue;
      vistos[k] = { clave: k, prov: p[0], busca: p[1], mov: m };
    }
    return Object.values(vistos);
  }
  function tarjetaPlazos(lista) {
    if (!lista.length) return '';
    return lista.map((p) => `<button class="link-card" data-plazo="${esc(p.clave)}" style="background:var(--butter)">
      <span class="ic" style="color:var(--butter-d)"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg></span>
      <span class="t"><b>Cargo nuevo de ${esc(p.prov)}: ${eur(Math.abs(p.mov.importe), true)}</b><span class="small" style="color:var(--butter-d)">¿Es una compra a plazos? Toca y dime cuántas cuotas quedan</span></span>${IC.chev}</button>`).join('');
  }
  function abrirPlazo(clave) {
    const p = plazosNuevos().find((x) => x.clave === clave);
    if (!p) return;
    const imp = Math.abs(p.mov.importe);
    $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:6px">Cargo de ${esc(p.prov)}</div>
      <p class="small muted" style="margin:0 0 14px;line-height:1.5">${eur(imp, true)} el ${fmtF(p.mov.fecha)}. ¿Es una compra a plazos?</p>
      <form id="sForm"><label class="field">¿Cuántas cuotas quedan por pagar?<input name="n" inputmode="numeric" placeholder="Sin contar esta (0 si era la última)" required></label>
      <label class="field">¿Qué compraste? (opcional)<input name="q" placeholder="Zapatillas"></label>
      <div class="btns"><button type="button" class="btn ghost" id="sNo">No es a plazos</button><button class="btn" type="submit">Guardar</button></div></form>`;
    $sheet.onclick = (e) => { if (e.target === $sheet) $sheet.close(); };
    $sheet.querySelector('#sNo').onclick = () => {
      S.plazosIgnorados = S.plazosIgnorados || {}; S.plazosIgnorados[clave] = true;
      guardar(); $sheet.close(); render(); toast('Vale, no lo vuelvo a preguntar');
    };
    $sheet.querySelector('#sForm').onsubmit = (e) => {
      e.preventDefault();
      const n = Math.round(numero(e.target.n.value));
      S.plazosIgnorados = S.plazosIgnorados || {}; S.plazosIgnorados[clave] = true;
      if (n < 1) { guardar(); $sheet.close(); render(); toast('Era la última: no reservo nada'); return; }
      const que = e.target.q.value.trim();
      const fijo = { id: 'f' + Date.now(), nombre: p.prov + (que ? ' · ' + que : ' · a plazos'), importe: Math.round(imp * 100) / 100,
        dia: Number(p.mov.fecha.slice(8, 10)), busca: p.busca, min: Math.round(imp * 95) / 100, max: Math.round(imp * 105) / 100 };
      // Las cuotas que quedan son las siguientes a este cargo
      const c = ciclo(); const mesCargo = p.mov.fecha >= c.inicio ? c.fin.slice(0, 7) : sumarMes(c.fin.slice(0, 7), -1);
      fijo.desde = sumarMes(mesCargo, 1); fijo.hasta = sumarMes(fijo.desde, n - 1);
      S.fijos = S.fijos || []; S.fijos.push(fijo);
      guardar(); $sheet.close(); render(); toast('Guardado: termina en ' + mesTexto(fijo.hasta));
    };
    $sheet.showModal();
  }
  function mediasMensuales() {
    const meses = [...new Set(S.movs.map((m) => m.fecha.slice(0, 7)))].sort();
    const completos = meses.length > 2 ? meses.slice(1, -1) : meses;
    const tot = {};
    for (const m of S.movs) {
      if (!completos.includes(m.fecha.slice(0, 7))) continue;
      const c = cat(m); const v = variable(m, c);
      if (v > 0) tot[c.categoria] = (tot[c.categoria] || 0) + v;
    }
    const n = Math.max(1, completos.length);
    Object.keys(tot).forEach((k) => (tot[k] = tot[k] / n));
    return tot;
  }
  // Tu ahorro = saldo de partida + lo apartado (nómina, redondeos, traspasos) − lo rescatado
  function ahorro() {
    const vistos = new Set(S.ahorro.vistos || []);
    const d = { nomina: 0, redondeo: 0, otros: 0, rescatado: 0 };
    for (const m of S.movs) {
      if (vistos.has(m.id)) continue;
      const c = cat(m);
      if (c.categoria === 'Ahorro') {
        const t = B.limpiar(m.concepto + ' ' + m.tipo);
        const v = Math.abs(m.importe);
        if (/redondeo/.test(t)) d.redondeo += v; else if (/nomina/.test(t)) d.nomina += v; else d.otros += v;
      } else if (c.categoria === 'Rescate del ahorro') d.rescatado += Math.abs(m.importe);
    }
    const saldo = Math.max(0, (Number(S.ahorro.base) || 0) + d.nomina + d.redondeo + d.otros - d.rescatado);
    // Reparto en orden: la primera meta se llena antes de pasar a la siguiente
    let resto = saldo;
    const metas = S.metas.map((m) => { const a = Math.min(resto, m.objetivo); resto -= a; return { ...m, ahorrado: a }; });
    return { ...d, saldo, metas, sobra: resto };
  }
  const porRevisar = () => S.movs.filter((m) => cat(m).confianza < 0.7 && m.importe < 0);

  /* ---------- Importar el Excel ---------- */
  $file.addEventListener('change', async () => {
    const f = $file.files[0]; $file.value = '';
    if (!f) return;
    location.hash = '#cargando';
    const t0 = Date.now();
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', raw: true });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      const leidos = B.leerExtracto(filas);
      const ids = new Set(S.movs.map((m) => m.id));
      let nuevos = [], dup = 0;
      for (const m of leidos) {
        m.id = idMov(m); m.imp = Date.now(); m.ord = leidos.indexOf(m);
        if (ids.has(m.id)) { dup++; continue; }
        ids.add(m.id); nuevos.push(m);
      }
      S.movs = S.movs.concat(nuevos).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const fechas = leidos.map((m) => m.fecha).sort();
      S.ultimaImportacion = { cuando: iso(new Date()), ids: nuevos.map((m) => m.id), duplicados: dup, desde: fechas[0], hasta: fechas[fechas.length - 1] };
      guardar();
      setTimeout(() => (location.hash = '#importado'), Math.max(0, 1400 - (Date.now() - t0)));
    } catch (e) {
      console.error(e);
      toast('No he podido leer ese archivo. ¿Es el Excel de movimientos del banco?');
      location.hash = S.movs.length ? '#inicio' : '#subir';
    }
  });
  const abrirSelector = () => $file.click();

  /* ---------- Pantallas ---------- */
  const R = {};

  R.bienvenida = () => {
    const p = S.perfil || { nombre: '', ingresos: 1980, diaCobro: 30, fijos: 415, ritmo: 'equilibrado' };
    return `
    <div class="hero" style="padding:30px 24px;margin-bottom:22px">
      ${orn(34, '#fff', 'top:20px;right:24px', 'tw')}${orn(14, '#E27FA8', 'top:60px;right:66px', 'tw')}${heart(14, '#fff', 'top:70px;right:26px')}
      <div class="h1" style="font-size:40px">Brisa</div>
      <p style="margin:8px 0 0;font-size:16px;line-height:1.5;color:#4A2E3C">Hola, soy Brisa. Te ayudo a gastar con calma y ahorrar sin pensarlo. Primero, tu mes en cuatro datos (aproximado vale).</p>
    </div>
    <form id="fPerfil">
      <label class="field">¿Cómo te llamas?<input name="nombre" value="${esc(p.nombre)}" autocomplete="given-name" required></label>
      <div class="tiles" style="margin-bottom:0">
        <label class="field">Cobras al mes (€)<input name="ingresos" inputmode="decimal" value="${esc(p.ingresos)}" required></label>
        <label class="field">Día de cobro<input name="diaCobro" inputmode="numeric" value="${esc(p.diaCobro)}" required></label>
      </div>
      <label class="field">Gastos fijos al mes (€)<input name="fijos" inputmode="decimal" value="${esc(p.fijos)}" required><span class="xs muted" style="font-weight:400">Psicóloga, pole, suscripciones, seguros…</span></label>
      <div class="field" style="margin-bottom:6px">¿A qué ritmo ahorramos?</div>
      <div class="seg" role="group" aria-label="Ritmo de ahorro">${Object.entries(RITMOS).map(([k, r]) => `<button type="button" data-ritmo="${k}" aria-pressed="${p.ritmo === k}">${r.label}<br><span class="xs">${r.importe} €</span></button>`).join('')}</div>
      <input type="hidden" name="ritmo" value="${esc(p.ritmo)}">
      <button class="btn" type="submit">${S.perfil ? 'Guardar' : 'Empezar'}</button>
    </form>`;
  };

  R.subir = () => `
    <div class="top"><a class="icon-btn" href="#${S.movs.length ? 'inicio' : 'bienvenida'}" aria-label="Volver">${IC.back}</a></div>
    <h1 style="margin-bottom:8px">Sube tu Excel${SPARK}</h1>
    <p class="muted" style="margin:0 0 22px;line-height:1.5">En la app de BBVA: Movimientos → Descargar → Excel. Luego súbelo aquí y yo lo ordeno.</p>
    <button class="drop" id="bSubir" type="button">
      <span class="link-card" style="padding:0;margin:0;width:auto"><span class="ic" style="background:var(--sky);color:var(--sky-d);width:56px;height:56px;border-radius:28px">${IC.file}</span></span>
      <b style="font-size:17px">Elegir el archivo</b>
      <span class="small muted">.xlsx · .xls · .csv</span>
    </button>
    <p class="small muted" style="text-align:center;margin-top:16px">Puedes subir el mismo Excel varias veces: no se duplica nada.<br>Tus movimientos solo se guardan en este móvil.</p>`;

  R.cargando = () => `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:110px;gap:18px">
      <div style="position:relative;width:140px;height:140px;border-radius:70px;background:var(--rose);display:flex;align-items:center;justify-content:center;color:var(--berry)">
        <svg class="orn spin" style="inset:-14px;stroke:#E9A8C3;stroke-width:2" width="168" height="168" viewBox="0 0 168 168"><circle cx="84" cy="84" r="80" stroke-dasharray="6 10"/></svg>
        ${orn(22, '#E27FA8', 'top:6px;right:4px', 'tw')}
        <svg viewBox="0 0 24 24" width="56" height="56" style="stroke-width:1.4"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>
      </div>
      <div class="h1">Leyendo tu Excel…</div>
      <p class="muted" style="margin:0;line-height:1.5">Ordeno tus movimientos y busco<br>lo que ha cambiado.</p>
    </div>`;

  R.importado = () => {
    const u = S.ultimaImportacion;
    if (!u) return R.inicio();
    const nuevos = S.movs.filter((m) => u.ids.includes(m.id));
    const cs = nuevos.map((m) => [m, cat(m)]);
    const auto = cs.filter(([, c]) => c.confianza >= 0.7).length;
    const rev = cs.filter(([m, c]) => c.confianza < 0.7 && m.importe < 0).length;
    const porCat = {};
    let resc = 0, apart = 0;
    for (const [m, c] of cs) {
      if (c.categoria === 'Rescate del ahorro') resc += m.importe;
      if (c.categoria === 'Ahorro') apart += Math.abs(m.importe);
      if (c.cuentaComoGasto) {
        const partes = c.reparto || [{ categoria: c.categoria, importe: m.importe }];
        for (const p of partes) porCat[p.categoria] = (porCat[p.categoria] || 0) - p.importe;
      }
    }
    delete porCat['Por revisar'];
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = top.length ? top[0][1] : 1;
    return `
    <header style="position:relative;margin-bottom:16px">
      ${orn(28, '#F5B8CF', 'top:-6px;right:8px', 'tw')}${orn(14, '#E27FA8', 'top:30px;right:46px', 'tw')}
      <h1 style="font-size:30px">¡Excel leído!</h1>
      <div class="small muted">${u.desde ? fmtF(u.desde) + ' – ' + fmtF(u.hasta) : ''} · ${nuevos.length} nuevos${u.duplicados ? ' · ' + u.duplicados + ' ya los tenía' : ''}</div>
    </header>
    <div class="tiles">
      <div class="tile" style="background:var(--mint)"><span class="num">${auto}</span><span class="small">ordenados solos</span></div>
      <a class="tile" href="#movimientos" style="background:var(--peach)"><span class="num">${rev}</span><span class="small">por revisar →</span></a>
    </div>
    ${tarjetaPlazos(plazosNuevos())}
    ${top.length ? `<div class="h2">En qué se fue</div>
    ${top.map(([k, v], i) => `<div style="margin-bottom:10px"><div class="row" style="font-size:14px;margin-bottom:5px"><span>${esc(k)}</span><span class="num">${eur(v)}</span></div><div class="bar l" style="height:6px"><i style="width:${Math.round(v / max * 100)}%;background:${BARRAS[i % BARRAS.length]}"></i></div></div>`).join('')}` : ''}
    ${apart || resc ? `<div class="card dash" style="color:#4A2E3C;margin-top:14px;display:flex;flex-direction:column;gap:6px">
      ${apart ? `<div class="row small"><span>Apartado a tu ahorro</span><span class="num" style="color:var(--mint-d)">+${eur(apart, true)}</span></div>` : ''}
      ${resc ? `<div class="row small"><span>Rescatado de tu ahorro</span><span class="num" style="color:var(--berry)">−${eur(resc, true)}</span></div>` : ''}
    </div>` : ''}
    <div class="card" style="margin-top:14px;background:var(--lilac);border:0">
      <b>¿Tienes pagos retenidos?</b>
      <p class="small" style="margin:4px 0 10px;color:var(--lilac-d);line-height:1.45">El Excel no los incluye. Mira «Retenciones» en tu app de BBVA y apunta el total para que tu número del día sea exacto.</p>
      <button class="link-card" id="bRetenido" style="background:#fff;margin:0">
      <span class="ic" style="background:var(--lilac);color:var(--lilac-d)"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg></span>
      <span class="t"><b>Retenido con tarjeta: ${eur(S.retenido && S.retenido.importe || 0, true)}</b><span class="small muted">${S.retenido && S.retenido.fecha ? 'Dato del ' + fmtF(S.retenido.fecha) + ' · ' : ''}El Excel no lo trae: míralo en tu app del banco</span></span>${IC.chev}</button>
    </div>
    <div class="btns">${rev ? '<a class="btn ghost" href="#movimientos">Revisar ' + rev + '</a>' : ''}<a class="btn" href="#inicio">Ir a Inicio</a></div>`;
  };

  // Corazones: cuánto de tu dinero del día a día del mes te queda (10 = el mes entero)
  function corazonesN(c) {
    const base = Math.max(1, c.presupuesto);
    const queda = c.modoSaldo ? Math.max(0, c.disponible) : Math.max(0, c.queda);
    return Math.max(0, Math.min(10, Math.round(queda / base * 10)));
  }
  R.inicio = () => {
    if (!S.movs.length) return `
      <div class="top"><div><div class="small muted">Hola, ${esc(S.perfil.nombre)}</div><h1>${DIAS[new Date().getDay()]}${SPARK}</h1></div><a class="icon-btn" href="#ajustes" aria-label="Ajustes">${IC.gear}</a></div>
      <div class="hero"><div class="h1" style="font-size:24px">Aún no tengo tus movimientos</div><p style="color:#4A2E3C;line-height:1.5">Sube el Excel de tu banco y en unos segundos te digo cuánto puedes gastar hoy.</p></div>
      <a class="btn" href="#subir">Subir mi Excel</a>`;
    const c = ciclo();
    const ultimo = S.movs[0].fecha;
    const viejo = dias(ultimo, iso(new Date())) > 6;
    const rev = porRevisar().length;
    const pct = c.presupuesto ? Math.min(100, Math.round(c.gastado / c.presupuesto * 100)) : 0;
    const finTxt = fmtF(c.fin);
    return `
    <div class="top">
      <div><div class="small muted">Hola, ${esc(S.perfil.nombre)}</div><h1>${DIAS[new Date().getDay()]}${SPARK}</h1></div>
      <a class="icon-btn" href="#ajustes" aria-label="Ajustes">${IC.gear}</a>
    </div>
    <section class="hero">
      ${PIX.big.replace('style="', 'style="').replace(/style="[^"]*"/, 'style="top:18px;right:20px"')}${PIX.spark.replace(/style="[^"]*"/, 'style="top:66px;right:30px"')}
      <div class="pix" style="font-size:14px;color:#8C2A5A;letter-spacing:.5px">HOY PUEDES GASTAR</div>
      <div class="big" style="margin:8px 0 10px">${eur(c.hoyPuedes)}</div>
      ${c.modoSaldo ? `
      <div style="font-size:13px;line-height:1.5;color:#4A2E3C;margin-bottom:10px">${c.disponible > 0 ? 'Con lo que tienes de verdad:' : 'Ojo: tus pagos pendientes superan tu saldo.'} <b>${eur(c.saldo)}</b> en cuenta${c.retenido ? ` − <a href="#fijos" style="color:var(--berry-d)">${eur(c.retenido)} retenido</a>` : ''} − <a href="#fijos" style="color:var(--berry-d)">${eur(c.pendiente)} de fijos</a>.</div>
      <div class="hearts" role="img" aria-label="Te quedan ${corazonesN(c)} de 10 corazones: ${eur(Math.max(0, c.disponible))} libres">${corazones(corazonesN(c), 21, 18)}</div>
      <div class="row small" style="color:#6A3A50;margin-top:8px"><span style="white-space:nowrap">Te quedan ${corazonesN(c)} de 10 ♡ · ${eur(Math.max(0, c.disponible))}</span><span style="white-space:nowrap">${c.restantes} días</span></div>` : `
      <div style="font-size:14px;line-height:1.45;color:#4A2E3C;margin-bottom:12px">${c.queda >= 0 ? `Sin pasarte hasta el ${finTxt} y apartando ${eur(c.ahorro)} para ti.` : `Te has pasado ${eur(-c.queda)} este mes. Mañana lo vemos con calma.`}</div>
      <div class="hearts" role="img" aria-label="Te quedan ${corazonesN(c)} de 10 corazones">${corazones(corazonesN(c), 21, 18)}</div>
      <div class="row small" style="color:#6A3A50;margin-top:8px"><span style="white-space:nowrap">Te quedan ${corazonesN(c)} de 10 ♡ · ${eur(Math.max(0, c.queda))}</span><span>Quedan ${c.restantes} días</span></div>`}
    </section>
    ${S.retenido && S.retenido.importe > 0 && S.ultimaImportacion && S.retenido.fecha < S.ultimaImportacion.cuando ? `<a class="link-card" href="#fijos" style="background:var(--lilac)"><span class="ic" style="color:var(--lilac-d)">${IC.spark}</span><span class="t"><b>¿Sigue retenido ${eur(S.retenido.importe)}?</b><span class="small" style="color:var(--lilac-d)">Has subido un Excel nuevo: actualízalo para no descontarlo dos veces</span></span>${IC.chev}</a>` : ''}
    <button class="link-card" id="bSubirHome" style="background:${viejo ? 'var(--sky)' : '#fff'};${viejo ? '' : 'border:1px solid var(--line)'}">
      <span class="ic" style="${viejo ? '' : 'background:var(--sky);'}color:var(--sky-d)">${IC.file}</span>
      <span class="t"><b>${viejo ? 'Toca subir el Excel' : 'Subir el Excel de la semana'}</b><span class="small muted">Datos hasta el ${fmtF(ultimo)}</span></span>${IC.chev}
    </button>
    <a class="link-card" href="#metas" style="background:#fff;border:1.5px dashed #F0C3D5">
      <span class="ic" style="background:var(--rose);color:var(--berry)">${IC.uturn}</span>
      <span class="t"><b>Rescates: ${eur(c.rescates - c.forzados)} de ${eur(S.limiteRescates)}</b><span class="small muted">${c.forzados ? `Más ${eur(c.forzados)} para cubrir números rojos` : 'Lo que ha vuelto de tu ahorro este mes'}</span></span>${IC.chev}
    </a>
    ${tarjetaPlazos(plazosNuevos())}
    ${rev ? `<a class="link-card" href="#movimientos" style="background:var(--peach)"><span class="ic" style="color:var(--peach-d)">${IC.spark}</span><span class="t"><b>${rev} ${rev === 1 ? 'movimiento' : 'movimientos'} por revisar</b><span class="small" style="color:#5A4238">Un toque cada uno y los aprendo</span></span>${IC.chev}</a>` : ''}`;
  };

  let verTodos = 60;
  R.movimientos = () => {
    const rev = porRevisar();
    const lista = S.movs.slice(0, verTodos);
    const fila = (m) => {
      const c = cat(m);
      return `<button class="mov" data-mov="${esc(m.id)}">
        <span class="av" style="background:${COLORES[c.categoria] || '#fff'};${c.categoria === 'Por revisar' ? 'border:1.5px dashed var(--rose3)' : ''}">${esc(nombreMov(m).charAt(0).toUpperCase())}</span>
        <span class="t"><span class="n">${esc(nombreMov(m))}</span><span class="xs muted"><span class="chip" style="background:${COLORES[c.categoria] || '#fff'}">${esc(c.categoria)}</span> ${fmtF(m.fecha)}${c.aplazado ? ' · aplazado' : ''}</span></span>
        <span class="amt ${m.importe > 0 ? 'pos' : ''}">${m.importe > 0 ? '+' : ''}${eur(m.importe, true)}</span></button>`;
    };
    return `
    <div class="top"><div><h1>Movimientos${SPARK}</h1><div class="small muted">Del Excel que subiste. Tú solo confirmas lo dudoso.</div></div></div>
    ${S.movs.length ? `<div class="card" style="background:var(--mint);border:0;display:flex;gap:12px;align-items:center"><span style="color:var(--mint-d);width:22px;height:22px;display:inline-flex">${IC.spark}</span><span><b>${S.movs.length - rev.length} de ${S.movs.length}</b> ordenados solos${rev.length ? '<br><span class="small">' + rev.length + ' necesitan un vistazo</span>' : ''}</span></div>` : ''}
    ${rev.length ? `<div class="h2">Por revisar</div><div class="card" style="padding:4px 16px">${rev.slice(0, 15).map(fila).join('')}</div>` : ''}
    <div class="h2">Todos</div>
    ${S.movs.length ? `<div class="card" style="padding:4px 16px">${lista.map(fila).join('')}</div>` : '<div class="empty">Aún no hay movimientos. <a href="#subir">Sube tu Excel</a>.</div>'}
    ${S.movs.length > verTodos ? '<button class="btn ghost" id="bMas">Ver más</button>' : ''}`;
  };

  R.presupuesto = () => {
    const c = ciclo();
    const p = S.perfil;
    const med = mediasMensuales();
    delete med['Por revisar'];
    const filas = Object.entries(med).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const ing = Number(p.ingresos) || 1;
    const w = (n) => Math.max(0, n / ing * 100).toFixed(1) + '%';
    return `
    <div class="top"><div><h1>Tu presupuesto${SPARK}</h1><div class="small muted">Con tus datos reales. Tú no haces cuentas.</div></div></div>
    <div class="seg" role="group" aria-label="Ritmo de ahorro">${Object.entries(RITMOS).map(([k, r]) => `<button data-ritmo2="${k}" aria-pressed="${p.ritmo === k}">${r.label}</button>`).join('')}</div>
    <div class="card dash">
      <div class="row"><span class="small muted">Ingresos del mes</span><span class="num" style="font-size:22px">${eur(ing)}</span></div>
      <div style="display:flex;gap:4px;height:14px;margin:12px 0"><i style="width:${w(p.fijos)};background:#E8A6BB;border-radius:7px"></i><i style="width:${w(c.presupuesto)};background:#93C0E6;border-radius:7px"></i><i style="width:${w(c.ahorro)};background:#8FCFB0;border-radius:7px"></i></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px" class="xs muted">
        <div>Lo fijo<br><span class="num" style="font-size:16px;color:var(--ink)">${eur(Number(p.fijos))}</span></div>
        <div>Día a día<br><span class="num" style="font-size:16px;color:var(--ink)">${eur(c.presupuesto)}</span></div>
        <div>Para ti<br><span class="num" style="font-size:16px;color:var(--mint-d)">${eur(c.ahorro)}</span></div>
      </div>
      <div style="background:var(--mint);border-radius:16px;padding:10px 14px;margin-top:12px" class="small">${RITMOS[p.ritmo].hint}. ${metaEta()}</div>
    </div>
    <div class="h2">Este mes, por categoría</div>
    ${filas.length ? `<div class="card">${filas.map(([k, avg], i) => {
      const act = c.porCat[k] || 0; const pc = Math.min(100, Math.round(act / Math.max(avg, 1) * 100));
      return `<div style="margin:6px 0 12px"><div class="row" style="font-size:14px;margin-bottom:5px"><span>${esc(k)}</span><span><span class="num">${eur(act)}</span> <span class="xs muted">/ media ${eur(avg)}</span></span></div><div class="bar l" style="height:6px"><i style="width:${pc}%;background:${act > avg ? '#B03A72' : BARRAS[i % BARRAS.length]}"></i></div></div>`;
    }).join('')}</div>` : '<div class="empty">Cuando subas tu Excel verás aquí tus categorías.</div>'}
    <p class="xs muted">La media sale de tus meses completos. Lo fijo (pole, psicóloga, suscripciones…) no cuenta aquí: ya está reservado.</p>`;
  };

  function metaEta() {
    const m = ahorro().metas.find((x) => x.ahorrado < x.objetivo);
    if (!m || !S.perfil) return '';
    const faltan = m.objetivo - m.ahorrado;
    const meses = Math.ceil(faltan / RITMOS[S.perfil.ritmo].importe);
    const d = new Date(); d.setMonth(d.getMonth() + meses);
    return `«${esc(m.nombre)}» lista en ${MESES_L[d.getMonth()]} de ${d.getFullYear()}.`;
  }

  R.metas = () => {
    const c = ciclo();
    const aporte = RITMOS[S.perfil.ritmo].importe;
    const A = ahorro();
    const activa = A.metas.find((x) => x.ahorrado < x.objetivo);
    const pr = Math.min(100, Math.round((c.rescates - c.forzados) / Math.max(1, S.limiteRescates) * 100));
    const linea = (txt, v, signo) => v ? `<div class="row small"><span>${txt}</span><span class="num" style="color:${signo === '+' ? 'var(--mint-d)' : 'var(--berry)'}">${signo}${eur(v)}</span></div>` : '';
    return `
    <div class="top"><div><h1>Tus metas${SPARK}</h1><div class="small muted">Primero un colchón. Luego, lo que tú quieras.</div></div></div>
    <section class="card" style="display:flex;flex-direction:column;gap:6px">
      <div class="row"><span class="small muted">Tu ahorro</span><span class="num" style="font-size:28px">${eur(A.saldo)}</span></div>
      ${S.ahorro.base ? `<div class="row small muted"><span>Saldo de partida</span><span class="num">${eur(S.ahorro.base)}</span></div>` : ''}
      ${linea('Apartado de la nómina', A.nomina, '+')}${linea('Redondeos de tus compras', A.redondeo, '+')}${linea('Otros traspasos al ahorro', A.otros, '+')}${linea('Rescatado', A.rescatado, '−')}
      <p class="xs muted" style="margin:4px 0 6px;line-height:1.45">Se calcula solo con tu Excel: suma lo que tu banco aparta y resta lo que vuelve a tu cuenta.</p>
      <button class="btn small ghost" id="bAjustarAhorro" style="align-self:flex-start">Ajustar al saldo real</button>
    </section>
    ${A.metas.map((m) => {
      const pc = Math.min(100, Math.round(m.ahorrado / m.objetivo * 100));
      const dash = (pc / 100 * 276.5).toFixed(0);
      const es = m === activa;
      return `<section class="hero" style="background:${es ? 'var(--mint)' : '#fff'};display:flex;gap:16px;align-items:center;padding:20px;${es ? '' : 'outline:0;border:1px solid var(--line)'}">
        ${es ? orn(14, '#fff', 'bottom:16px;right:22px') : ''}
        <div style="position:relative;width:96px;height:96px;flex-shrink:0">
          <svg width="96" height="96" viewBox="0 0 104 104" role="img" aria-label="${pc} % completado"><circle cx="52" cy="52" r="44" stroke="rgba(255,255,255,.8)" stroke-width="10"/>${pc > 0 ? `<circle cx="52" cy="52" r="44" stroke="#6FBF98" stroke-width="10" stroke-dasharray="${dash} 277" transform="rotate(-90 52 52)"/>` : ''}</svg>
          <span class="num" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px">${pc}%</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;flex-grow:1">
          <span class="num" style="font-size:19px">${esc(m.nombre)}</span>
          <span class="small">${eur(m.ahorrado)} de ${eur(m.objetivo)}</span>
          <div class="hearts" style="gap:3px" role="img" aria-label="${Math.round(pc / 10)} de 10 corazones">${corazones(pc / 10, 14, 12)}</div>
          <span class="xs">${pc >= 100 ? '¡Conseguida!' : es ? aporte + ' €/mes · ' + metaEta().replace(/^«.*?» /, '') : 'Empieza al terminar la anterior'}</span>
        </div>
      </section>`;
    }).join('')}
    <section class="card dash">
      <div class="row" style="margin-bottom:8px"><span style="display:flex;gap:10px;align-items:center"><span style="width:36px;height:36px;border-radius:18px;background:var(--rose);color:var(--berry);display:flex;align-items:center;justify-content:center">${IC.uturn.replace('viewBox', 'width="18" height="18" viewBox')}</span><b>Rescates del ahorro</b></span><span class="num" style="white-space:nowrap">${eur(c.rescates - c.forzados)} <span class="xs muted">de ${eur(S.limiteRescates)}</span></span></div>
      ${c.forzados ? `<p class="xs" style="margin:0 0 8px;color:var(--berry)">Además, ${eur(c.forzados)} volvieron para cubrir números rojos. No cuentan en tu límite: son la señal de que el banco aparta más de lo que tu mes aguanta.</p>` : ''}
      <div class="bar l"><i style="width:${pr}%"></i></div>
      <p class="xs muted" style="margin:8px 0 0;line-height:1.45">Dinero que ha vuelto de tu ahorro este mes. Sacar no está prohibido: solo queremos que se vea.</p>
    </section>
    <button class="link-card" id="bNuevaMeta" style="background:rgba(255,255,255,.6);border:1.5px dashed var(--rose3)"><span class="ic" style="background:var(--peach);color:var(--peach-d)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="t"><b>Crear otra meta</b><span class="small muted">Empieza al completar la anterior</span></span></button>`;
  };

  R.fijos = () => {
    const c = ciclo();
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Pagos fijos${SPARK}</h1></div>
    <p class="small muted" style="margin-top:0;line-height:1.5">Lo que tiene que salir de tu cuenta antes del ${fmtF(c.fin)}. Brisa lo reserva para que tu número del día sea real. Se marcan como pagados solos cuando el cargo aparece en tu Excel. Toca uno para cambiarlo o darlo de baja.</p>
    <div class="card" style="padding:4px 16px">
      ${c.fijosC.length ? c.fijosC.map((f) => `<button class="mov" data-fijo="${esc(f.id)}">
        <span class="av" style="background:${f.pendiente > 0 ? 'var(--peach)' : 'var(--mint)'}">${f.pendiente > 0 ? '·' : '✓'}</span>
        <span class="t"><span class="n">${esc(f.nombre)}</span><span class="xs muted">${f.pendiente > 0 ? 'Pendiente · hacia el día ' + esc(f.dia) : 'Pagado este mes'}${f.manual ? ' · marcado por ti' : ''}</span></span>
        <span class="amt">${f.pendiente > 0 ? eur(f.pendiente, true) : eur(Number(f.importe), true)}</span></button>`).join('') : '<div class="empty">Aún no tienes pagos fijos. Añádelos abajo o carga tus reglas desde Ajustes.</div>'}
    </div>
    <div class="card row"><b>Total pendiente</b><span class="num" style="font-size:20px">${eur(c.pendiente, true)}</span></div>
    <button class="link-card" id="bRetenido" style="background:#fff;border:1.5px dashed #F0C3D5">
      <span class="ic" style="background:var(--lilac);color:var(--lilac-d)"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg></span>
      <span class="t"><b>Retenido con tarjeta: ${eur(S.retenido && S.retenido.importe || 0, true)}</b><span class="small muted">${S.retenido && S.retenido.fecha ? 'Dato del ' + fmtF(S.retenido.fecha) + ' · ' : ''}El Excel no lo trae: míralo en tu app del banco</span></span>${IC.chev}</button>
    <button class="link-card" id="bNuevoFijo" style="background:rgba(255,255,255,.6);border:1.5px dashed var(--rose3)"><span class="ic" style="background:var(--peach);color:var(--peach-d)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="t"><b>Añadir pago fijo</b><span class="small muted">Alquiler, una cuota, una suscripción…</span></span></button>`;
  };

  R.ajustes = () => {
    const p = S.perfil;
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Ajustes${SPARK}</h1></div>
    <form id="fAjustes" class="card">
      <label class="field">Tu nombre<input name="nombre" value="${esc(p.nombre)}"></label>
      <div class="tiles" style="margin-bottom:0">
        <label class="field">Cobras al mes (€)<input name="ingresos" inputmode="decimal" value="${esc(p.ingresos)}"></label>
        <label class="field">Día de cobro<input name="diaCobro" inputmode="numeric" value="${esc(p.diaCobro)}"></label>
      </div>
      <div class="tiles" style="margin-bottom:0">
        <label class="field">Gastos fijos (€)<input name="fijos" inputmode="decimal" value="${esc(p.fijos)}"></label>
        <label class="field">Límite de rescates (€)<input name="limite" inputmode="decimal" value="${esc(S.limiteRescates)}"></label>
      </div>
      <button class="btn" type="submit">Guardar</button>
    </form>
    <div class="h2">Tus datos</div>
    <div class="card">
      <p class="small muted" style="margin-top:0;line-height:1.5">Todo se guarda solo en este móvil: ${S.movs.length} movimientos y ${Object.keys(S.reglas.reglasUsuario).length + S.reglas.palabras.length + S.reglas.importes.length} reglas. Haz una copia de vez en cuando por si cambias de móvil.</p>
      <div class="btns" style="flex-wrap:wrap"><button class="btn ghost small" id="bExport">Descargar copia</button><button class="btn ghost small" id="bImport">Restaurar copia o reglas</button></div>
    </div>
    <button class="btn ghost" id="bBorrar" style="color:var(--berry)">Borrar todos mis datos</button>
    <p class="xs muted" style="text-align:center;margin-top:16px">Brisa v0.1.7</p>`;
  };

  /* ---------- Hoja para cambiar la categoría ---------- */
  function abrirMov(id) {
    const m = S.movs.find((x) => x.id === id); if (!m) return;
    const c = cat(m);
    let elegida = c.categoria === 'Por revisar' ? null : c.categoria;
    const dibujar = () => {
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">${esc(nombreMov(m))}</div><div class="small muted">${fmtF(m.fecha)} · ${eur(m.importe, true)}</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        ${c.motivo ? `<p class="xs muted" style="margin:8px 0 0">${esc(c.motivo)}</p>` : ''}
        <div class="cats">${ELEGIBLES.map((k) => `<button data-cat="${esc(k)}" aria-pressed="${elegida === k}"><span class="dot" style="background:${COLORES[k]};border:1px solid #E8D5DC"></span>${esc(k)}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="sRecordar" checked> Recordarlo para los parecidos</label>
        <button class="btn" id="sGuardar" ${elegida ? '' : 'disabled style="opacity:.5"'}>Guardar</button>`;
    };
    dibujar();
    $sheet.onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) { elegida = b.dataset.cat; const r = $sheet.querySelector('#sRecordar').checked; dibujar(); $sheet.querySelector('#sRecordar').checked = r; return; }
      if (e.target.closest('#sCerrar') || e.target === $sheet) { $sheet.close(); return; }
      if (e.target.closest('#sGuardar') && elegida) {
        if ($sheet.querySelector('#sRecordar').checked) {
          const k = B.claveRegla(m); const prev = S.reglas.reglasUsuario[k];
          S.reglas.reglasUsuario[k] = prev && typeof prev === 'object' ? { ...prev, categoria: elegida } : elegida;
          delete S.overrides[m.id];
        } else S.overrides[m.id] = elegida;
        guardar(); $sheet.close(); render(); toast('Aprendido');
      }
    };
    $sheet.showModal();
  }

  // Hoja de un pago fijo: marcar este mes, editar, terminar o eliminar
  function abrirFijo(id) {
    const c = ciclo(); const f = c.fijosC.find((x) => x.id === id); const real = S.fijos.find((x) => x.id === id);
    if (!f || !real) return;
    const mes = c.fin.slice(0, 7);
    const [ay, am] = mes.split('-').map(Number);
    const mesTxt = MESES_L[am - 1];
    const vista = (modo) => {
      if (modo === 'editar') {
        $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">Editar pago fijo</div>
          <form id="sForm"><label class="field">Nombre<input name="n" value="${esc(real.nombre)}" required></label>
          <div class="tiles" style="margin-bottom:0"><label class="field">Importe al mes (€)<input name="i" inputmode="decimal" value="${esc(String(real.importe).replace('.', ','))}" required></label><label class="field">Día aproximado<input name="d" inputmode="numeric" value="${esc(real.dia)}"></label></div>
          <div class="btns"><button type="button" class="btn ghost" id="sCancel">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`;
        $sheet.querySelector('#sForm').onsubmit = (e) => {
          e.preventDefault(); const t = e.target;
          Object.assign(real, { nombre: t.n.value.trim(), importe: numero(t.i.value), dia: numero(t.d.value) || real.dia });
          guardar(); $sheet.close(); render(); toast('Guardado');
        };
        return;
      }
      const cuotas = !!real.hasta;
      const finTxt = cuotas ? MESES_L[Number(real.hasta.slice(5, 7)) - 1] + ' de ' + real.hasta.slice(0, 4) : '';
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">${esc(real.nombre)}</div><div class="small muted">${eur(Number(real.importe), true)} al mes · hacia el día ${esc(real.dia)}</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <p class="small" style="line-height:1.5;margin:14px 0">${f.pendiente > 0 ? 'Pendiente este mes. ' : 'Pagado este mes. '}Cuando el cargo aparezca en tu Excel, Brisa lo marca como pagado sola.</p>
        ${cuotas ? `<div class="card" style="background:var(--mint);border:0;margin:0 0 14px"><b>Son cuotas: terminan solas en ${finTxt}.</b><br><span class="small">No tienes que hacer nada.</span></div>`
                 : `<button class="btn" id="sTerminar">Ya no lo pago</button><p class="xs muted" style="margin:6px 0 14px;text-align:center">Se queda reservado este mes y desaparece desde ${MESES_L[am % 12]}.</p>`}
        <div style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap" class="small">
          <a href="#fijos" id="sEditar">Cambiar importe</a>
          <a href="#fijos" id="sMarcar">${f.pendiente > 0 ? 'Ya lo pagué y no sale' : 'No está pagado'}</a>
        </div>`;
      $sheet.querySelector('#sMarcar').onclick = (e) => {
        e.preventDefault();
        const k = c.fin + '|' + id; S.fijosEstado = S.fijosEstado || {};
        S.fijosEstado[k] = f.pendiente > 0 ? 'pagado' : 'pendiente';
        guardar(); $sheet.close(); render(); toast(f.pendiente > 0 ? 'Marcado como pagado' : 'Marcado como pendiente');
      };
      $sheet.querySelector('#sEditar').onclick = (e) => { e.preventDefault(); vista('editar'); };
      if (!cuotas) $sheet.querySelector('#sTerminar').onclick = () => {
        // Se queda este mes (por si aún falta el último cargo) y desaparece desde el siguiente
        real.hasta = mes; guardar(); $sheet.close(); render(); toast('Desde ' + MESES_L[am % 12] + ' ya no se reserva');
      };
    };
    $sheet.onclick = (e) => { if (e.target.closest('#sCancel') || e.target.closest('#sCerrar') || e.target === $sheet) $sheet.close(); };
    vista('menu');
    $sheet.showModal();
  }

  function pedirNumero(titulo, valor, cb) {
    $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">${esc(titulo)}</div>
      <form id="sForm"><label class="field">Importe (€)<input name="v" inputmode="decimal" value="${esc(valor)}" required></label>
      <div class="btns"><button type="button" class="btn ghost" id="sCancel">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`;
    $sheet.onclick = (e) => { if (e.target.closest('#sCancel') || e.target === $sheet) $sheet.close(); };
    $sheet.querySelector('#sForm').onsubmit = (e) => { e.preventDefault(); const v = parseFloat(String(e.target.v.value).replace(/\./g, '').replace(',', '.')); if (!isNaN(v)) cb(v); $sheet.close(); render(); };
    $sheet.showModal();
  }
  function nuevaMeta() {
    $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">Nueva meta</div>
      <form id="sForm"><label class="field">Nombre<input name="n" placeholder="Viaje a Japón" required></label>
      <label class="field">¿Cuánto necesitas? (€)<input name="o" inputmode="decimal" required></label>
      <div class="btns"><button type="button" class="btn ghost" id="sCancel">Cancelar</button><button class="btn" type="submit">Crear</button></div></form>`;
    $sheet.onclick = (e) => { if (e.target.closest('#sCancel') || e.target === $sheet) $sheet.close(); };
    $sheet.querySelector('#sForm').onsubmit = (e) => {
      e.preventDefault(); const o = parseFloat(String(e.target.o.value).replace(/\./g, '').replace(',', '.'));
      if (!isNaN(o) && o > 0) { S.metas.push({ id: 'm' + Date.now(), nombre: e.target.n.value.trim(), objetivo: o, ahorrado: 0 }); guardar(); }
      $sheet.close(); render();
    };
    $sheet.showModal();
  }

  /* ---------- Router ---------- */
  function ruta() {
    let r = location.hash.slice(1) || 'inicio';
    if (!S.perfil && r !== 'bienvenida') r = 'bienvenida';
    if (!R[r]) r = 'inicio';
    return r;
  }
  function render() {
    const r = ruta();
    $app.innerHTML = R[r]();
    const conNav = ['inicio', 'movimientos', 'presupuesto', 'metas'].includes(r);
    $nav.hidden = !conNav;
    $app.classList.toggle('full', !conNav);
    $nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.r === r));
    enlazar(r);
  }
  function numero(v) { return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0; }
  function enlazar(r) {
    const q = (s) => $app.querySelector(s);
    if (r === 'bienvenida') {
      $app.querySelectorAll('[data-ritmo]').forEach((b) => b.onclick = () => {
        $app.querySelectorAll('[data-ritmo]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        q('[name=ritmo]').value = b.dataset.ritmo;
      });
      q('#fPerfil').onsubmit = (e) => {
        e.preventDefault(); const f = e.target;
        const nuevo = !S.perfil;
        S.perfil = { nombre: f.nombre.value.trim(), ingresos: numero(f.ingresos.value), diaCobro: Math.min(31, Math.max(1, numero(f.diaCobro.value) || 30)), fijos: numero(f.fijos.value), ritmo: f.ritmo.value };
        guardar(); location.hash = nuevo ? '#subir' : '#inicio';
      };
    }
    if (q('#bSubir')) q('#bSubir').onclick = abrirSelector;
    if (q('#bSubirHome')) q('#bSubirHome').onclick = abrirSelector;
    $app.querySelectorAll('[data-mov]').forEach((b) => b.onclick = () => abrirMov(b.dataset.mov));
    if (q('#bMas')) q('#bMas').onclick = () => { verTodos += 60; render(); };
    $app.querySelectorAll('[data-ritmo2]').forEach((b) => b.onclick = () => { S.perfil.ritmo = b.dataset.ritmo2; guardar(); render(); });
    if (q('#bAjustarAhorro')) q('#bAjustarAhorro').onclick = () => {
      pedirNumero('¿Cuánto tienes hoy en tu cuenta de ahorro?', Math.round(ahorro().saldo), (v) => {
        // Ese saldo ya incluye todo lo subido hasta hoy; a partir de aquí suma y resta lo nuevo
        S.ahorro = { base: v, vistos: S.movs.map((m) => m.id) }; guardar(); toast('Ahorro ajustado');
      });
    };
    if (q('#bNuevaMeta')) q('#bNuevaMeta').onclick = nuevaMeta;
    if (q('#bRetenido')) q('#bRetenido').onclick = () => pedirNumero('¿Cuánto tienes retenido ahora? (pon 0 si nada)', S.retenido ? S.retenido.importe : 0, (v) => {
      S.retenido = { importe: Math.max(0, v), fecha: iso(new Date()) }; guardar(); toast('Retenido actualizado');
    });
    $app.querySelectorAll('[data-fijo]').forEach((b) => b.onclick = () => abrirFijo(b.dataset.fijo));
    $app.querySelectorAll('[data-plazo]').forEach((b) => b.onclick = () => abrirPlazo(b.dataset.plazo));
    if (q('#bNuevoFijo')) q('#bNuevoFijo').onclick = () => {
      $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">Nuevo pago fijo</div>
        <form id="sForm"><label class="field">Nombre<input name="n" placeholder="Gimnasio" required></label>
        <div class="tiles" style="margin-bottom:0"><label class="field">Importe al mes (€)<input name="i" inputmode="decimal" required></label><label class="field">Día aproximado<input name="d" inputmode="numeric" value="1"></label></div>
        <label class="field">Palabra que aparece en el banco<input name="b" placeholder="gimnasio" required></label>
        <div class="field">¿Es una compra a plazos?<div class="seg" style="margin:0"><button type="button" data-pl="no" aria-pressed="true">No, es indefinido</button><button type="button" data-pl="si" aria-pressed="false">Sí, a plazos</button></div></div>
        <label class="field" id="sCuotas" hidden>¿Cuántas cuotas te quedan por pagar?<input name="c" inputmode="numeric" placeholder="3"></label>
        <div class="btns"><button type="button" class="btn ghost" id="sCancel">Cancelar</button><button class="btn" type="submit">Añadir</button></div></form>`;
      $sheet.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => {
        $sheet.querySelectorAll('[data-pl]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        $sheet.querySelector('#sCuotas').hidden = b.dataset.pl !== 'si';
      });
      $sheet.onclick = (e) => { if (e.target.closest('#sCancel') || e.target === $sheet) $sheet.close(); };
      $sheet.querySelector('#sForm').onsubmit = (e) => {
        e.preventDefault(); const t = e.target;
        const pal = t.b.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        S.fijos = S.fijos || [];
        const nuevo = { id: 'f' + Date.now(), nombre: t.n.value.trim(), importe: numero(t.i.value), dia: numero(t.d.value) || 1, busca: pal };
        S.fijos.push(nuevo);
        const n = Math.round(numero(t.c.value));
        if (!$sheet.querySelector('#sCuotas').hidden && n >= 1) { ponerCuotas(nuevo, n); toast('Termina sola en ' + mesTexto(nuevo.hasta)); }
        guardar(); $sheet.close(); render();
      };
      $sheet.showModal();
    };
    if (r === 'ajustes') {
      q('#fAjustes').onsubmit = (e) => {
        e.preventDefault(); const f = e.target;
        Object.assign(S.perfil, { nombre: f.nombre.value.trim(), ingresos: numero(f.ingresos.value), diaCobro: Math.min(31, Math.max(1, numero(f.diaCobro.value) || 30)), fijos: numero(f.fijos.value) });
        S.limiteRescates = numero(f.limite.value); guardar(); toast('Guardado');
      };
      q('#bExport').onclick = () => {
        const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'brisa-copia-' + iso(new Date()) + '.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      q('#bImport').onclick = () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => {
          try {
            const d = JSON.parse(await inp.files[0].text());
            if (d.movs && d.reglas) { S = d; guardar(); toast('Copia restaurada'); }
            else if (d.reglasUsuario || d.palabras || d.importes || d.fijos) {
              Object.assign(S.reglas.reglasUsuario, d.reglasUsuario || {});
              S.reglas.palabras = S.reglas.palabras.concat(d.palabras || []);
              S.reglas.importes = S.reglas.importes.concat(d.importes || []);
              if (d.fijos) { const ids = new Set(d.fijos.map((f) => f.id)); S.fijos = (S.fijos || []).filter((f) => !ids.has(f.id)).concat(d.fijos); }
              guardar(); toast('Reglas cargadas');
            } else throw 0;
            render();
          }
          catch (e) { toast('Ese archivo no es una copia de Brisa.'); }
        };
        inp.click();
      };
      q('#bBorrar').onclick = () => {
        if (confirm('¿Seguro? Se borran tus movimientos, reglas y metas de este móvil.')) { S = nuevoEstado(); guardar(); location.hash = '#bienvenida'; render(); }
      };
    }
  }
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
