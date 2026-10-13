/* Brisa · v0.2.4 — app web instalable. Todo se guarda en este móvil (localStorage). */
(function () {
  'use strict';
  const B = window.BrisaCategorizador;
  const KEY = 'brisa:v1';
  const VERSION_APP = '0.2.4';
  // Ritmo de ahorro: gastar un % menos que tu gasto normal
  const RITMOS = { suave: { label: 'Suave', r: 0.05, hint: 'Para empezar sin notarlo' },
                   equilibrado: { label: 'Equilibrado', r: 0.10, hint: 'Un poco menos, sin sufrir' },
                   ambicioso: { label: 'Ambicioso', r: 0.20, hint: 'Si quieres ir rápido' } };
  // Gastos que ya están reservados en «lo fijo» y no restan del día a día
  const FIJAS = new Set(['Deporte', 'Suscripciones', 'Seguros', 'Facturas', 'Mascotas', 'Impuestos y comisiones']);
  const GRANDE = 200; // un gasto puntual de 200 € o más no es «gasto normal»
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
      fijos: [], fijosEstado: {}, fijosIgnorados: {}, v2: true, v3: true,
      ahorro: { base: 0, vistos: [] },
      ultimaImportacion: null
    };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || nuevoEstado(); } catch (e) { S = nuevoEstado(); }
  // Id de un movimiento: BBVA cambia el texto del concepto entre descargas
  // (a veces añade la ciudad), así que usamos fecha, importe y saldo resultante.
  function idMov(m) {
    if (m.saldo !== null && m.saldo !== undefined && m.saldo !== '') return [m.fecha, m.fechaValor, m.importe, m.saldo].join('|');
    return [m.fecha, m.fechaValor, m.importe, B.limpiar(m.concepto).slice(0, 12), B.limpiar(m.tipo).slice(0, 12)].join('|');
  }
  // El Excel de BBVA trae el número entero de la tarjeta y de la cuenta: solo guardamos los 4 últimos
  const tapar = (s) => String(s ?? '').replace(/\d{12,}/g, (n) => '*' + n.slice(-4));
  function taparMov(m) { m.concepto = tapar(m.concepto); m.tipo = tapar(m.tipo); m.observaciones = tapar(m.observaciones); return m; }
  function migrar() {
    // v0.1.1: el ahorro pasa a calcularse solo. Lo apuntado a mano antes se toma como saldo de partida.
    if (!S.ahorro) {
      const manual = (S.metas || []).reduce((a, m) => a + (Number(m.ahorrado) || 0), 0);
      S.ahorro = { base: manual, vistos: manual ? (S.movs || []).map((m) => m.id) : [] };
    }
    // v0.1.2: nuevo id de movimiento y limpieza de duplicados
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
      S.v2 = true;
    }
    // v0.2.3: tarjeta tapada, fijos duplicados fuera
    if (!S.v3) {
      (S.movs || []).forEach(taparMov);
      const firma = (f) => [f.busca, Number(f.importe).toFixed(2), f.desde || '', f.hasta || '', JSON.stringify(f.cuotas || [])].join('|');
      const porFirma = {};
      for (const f of S.fijos || []) {
        const k = firma(f);
        // Si hay dos iguales, nos quedamos con el que sabe distinguir importes (min/max)
        if (!porFirma[k] || (!porFirma[k].min && f.min)) porFirma[k] = f;
      }
      S.fijos = (S.fijos || []).filter((f) => porFirma[firma(f)] === f);
      S.v3 = true;
    }
    S.fijos = S.fijos || []; S.fijosEstado = S.fijosEstado || {}; S.fijosIgnorados = S.fijosIgnorados || {};
    S.reglas = S.reglas || { reglasUsuario: {}, palabras: [], importes: [] };
    S.reglas.reglasUsuario = S.reglas.reglasUsuario || {}; S.reglas.palabras = S.reglas.palabras || []; S.reglas.importes = S.reglas.importes || [];
    if (S.perfil && !RITMOS[S.perfil.ritmo]) S.perfil.ritmo = 'equilibrado';
  }
  migrar();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
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
  const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const fmtF = (s) => { const [, m, d] = s.split('-').map(Number); return d + ' ' + MESES[m - 1]; };
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const aDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dias = (a, b) => Math.round((aDate(b) - aDate(a)) / 86400000);
  const masDias = (s, n) => { const d = aDate(s); d.setDate(d.getDate() + n); return iso(d); };
  const hoyIso = () => iso(new Date());
  const sumarMes = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return iso(d).slice(0, 7); };
  const mesTexto = (ym) => MESES_L[Number(ym.slice(5, 7)) - 1] + ' de ' + ym.slice(0, 4);
  // «hoy», «mañana», «el jueves 16» o «el 8 nov»
  function cuando(f) {
    const d = dias(hoyIso(), f);
    if (d === 0) return 'hoy'; if (d === 1) return 'mañana';
    if (d > 1 && d < 7) return 'el ' + DIAS[aDate(f).getDay()].toLowerCase() + ' ' + aDate(f).getDate();
    return 'el ' + fmtF(f);
  }
  const mediana = (xs) => { const a = [...xs].sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function numero(v) { return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0; }
  const SPARK = '<svg class="spark" viewBox="0 0 24 24" style="stroke:none" aria-hidden="true"><path d="M12 1.5c.7 5.2 2.6 7.3 8.5 8.5-5.9 1.2-7.8 3.3-8.5 8.5-.7-5.2-2.6-7.3-8.5-8.5 5.9-1.2 7.8-3.3 8.5-8.5z"/></svg>';
  const orn = (sz, color, pos, cls) => `<svg class="orn ${cls || ''}" style="${pos};fill:${color}" width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.7 5.2 2.6 7.3 8.5 8.5-5.9 1.2-7.8 3.3-8.5 8.5-.7-5.2-2.6-7.3-8.5-8.5 5.9-1.2 7.8-3.3 8.5-8.5z"/></svg>`;
  const heart = (sz, color, pos) => `<svg class="orn" style="${pos};fill:${color}" width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.8-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.8-8 10.6-8 10.6z"/></svg>`;
  // Diseño pixel acordado: corazones de vida, corazón grande y destello
  const PIX = {"big": "<svg class=\"orn pix-art\" style=\"top: 18px; right: 20px\" aria-hidden=\"true\" width=\"39\" height=\"27\" viewBox=\"0 0 13 9\" shape-rendering=\"crispEdges\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"1\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"3\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"1\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"4\" y=\"2\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"7\" y=\"2\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"2\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"3\" width=\"4\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"5\" y=\"3\" width=\"3\" height=\"1\" fill=\"#B03A72\"/><rect x=\"8\" y=\"3\" width=\"4\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"4\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"4\" y=\"4\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"7\" y=\"4\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"4\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"5\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"5\" width=\"3\" height=\"1\" fill=\"#B03A72\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"5\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"12\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"6\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"10\" y=\"6\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E27FA8\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#B03A72\"/></svg>", "spark": "<svg class=\"orn pix-art\" style=\"top: 66px; right: 30px\" aria-hidden=\"true\" width=\"15\" height=\"15\" viewBox=\"0 0 5 5\" shape-rendering=\"crispEdges\"><rect x=\"2\" y=\"0\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"0\" y=\"2\" width=\"5\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/></svg>", "full": "<svg  aria-hidden=\"true\" viewBox=\"0 0 7 6\" shape-rendering=\"crispEdges\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"1\" width=\"2\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"3\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"5\" y=\"1\" width=\"1\" height=\"1\" fill=\"#FFFFFF\"/><rect x=\"6\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"2\" width=\"5\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"3\" width=\"3\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#F29CC0\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/></svg>", "empty": "<svg  aria-hidden=\"true\" viewBox=\"0 0 7 6\" shape-rendering=\"crispEdges\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"0\" width=\"2\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"1\" width=\"2\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"3\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"4\" y=\"1\" width=\"2\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"6\" y=\"1\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"2\" width=\"5\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"3\" width=\"3\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#FADCE8\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#B03A72\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#B03A72\"/></svg>"};
  const corazones = (n, w, h) => { n = Math.max(0, Math.min(10, Math.round(n))); const sz = (x) => x.replace('<svg', `<svg width="${w}" height="${h}"`); return sz(PIX.full).repeat(n) + sz(PIX.empty).repeat(10 - n); };
  // Iconos de dos tonos: trazo + relleno al 20 %
  const ic2 = (relleno, trazo, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}><path d="${relleno}" fill="currentColor" fill-opacity=".2" stroke="none"/>${trazo}</svg>`;
  const IC = {
    gear: ic2('M17.7 7.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM11.2 16.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z', '<path d="M4 7.5h9.3M17.7 7.5H20M4 16.5h2.8M11.2 16.5H20"/><circle cx="15.5" cy="7.5" r="2.2"/><circle cx="9" cy="16.5" r="2.2"/>'),
    back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="18" height="18" style="flex-shrink:0"><path d="M9 6l6 6-6 6"/></svg>',
    file: ic2('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 17v-6M9.5 13.5L12 11l2.5 2.5"/>'),
    uturn: ic2('M4.5 9.5l4-4v8z', '<path d="M8.5 5.5 4.5 9.5l4 4"/><path d="M4.5 9.5h10a5 5 0 0 1 0 10H11"/>'),
    spark: ic2('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z', '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5v4M16.5 17.5h4"/>'),
    card: ic2('M3.5 10h17v6.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z', '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 10h17M7 15h4"/>'),
    cal: ic2('M4 9.5h16V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><circle cx="12" cy="14.5" r="1.2" fill="currentColor" stroke="none"/>'),
    repeat: ic2('M5 12a7 7 0 0 1 12-4.9L19 9v-4M19 12a7 7 0 0 1-12 4.9L5 15v4', '<path d="M19 5v4h-4"/><path d="M5 19v-4h4"/><path d="M5.5 10a7 7 0 0 1 12.3-2.2L19 9M18.5 14a7 7 0 0 1-12.3 2.2L5 15"/>'),
    sun: ic2('M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
    alert: ic2('M12 3.5 21 19.5H3z', '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>'),
    plus: '<svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  const linkCard = (o) => `<${o.href ? 'a href="' + o.href + '"' : 'button type="button"'} class="link-card" ${o.attrs || ''} style="${o.style || ''}">
    <span class="ic" style="${o.icStyle || ''}">${o.icon}</span>
    <span class="t"><b>${o.titulo}</b><span class="small" style="${o.subStyle || 'color:var(--muted)'}">${o.sub}</span></span>${IC.chev}</${o.href ? 'a' : 'button'}>`;

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
    if (!c.cuentaComoGasto || deFijo(m)) return 0;
    if (c.reparto) return c.reparto.filter((p) => !esFijo(m, c, p.categoria)).reduce((a, p) => a - p.importe, 0);
    return esFijo(m, c, c.categoria) ? 0 : -m.importe;
  }
  const esGrande = (m, c) => c.cuentaComoGasto && -m.importe >= GRANDE && !deFijo(m) && variable(m, c) > 0;
  function nombreMov(m) {
    if (/^bizum/i.test(m.concepto)) return 'Bizum · ' + m.tipo.replace(/^(enviado|recibido):\s*/i, '');
    if (/^(transferencia|traspaso|adeudo|abono)/i.test(m.concepto) && m.tipo && !/^otros$/i.test(m.tipo)) return m.tipo;
    const l = B.limpiar(m.concepto) || m.concepto;
    return l.charAt(0).toUpperCase() + l.slice(1);
  }

  /* ---------- Pagos fijos y su calendario ---------- */
  // Un fijo es { id, nombre, importe, dia, busca, min, max, desde, hasta } (cada mes)
  // o, si es a plazos, lleva cuotas: [{ fecha: 'AAAA-MM-DD', importe }] con su fecha e importe propios.
  const reFijo = (x) => { try { return new RegExp(x.busca, 'i'); } catch (e) { return null; } };
  const esCuotas = (x) => Array.isArray(x.cuotas) && x.cuotas.length > 0;
  // ¿Este movimiento es un cargo de este fijo? (imp: importe de la cuota concreta)
  function encajaFijo(x, m, imp) {
    if (m.importe >= 0) return false;
    const re = reFijo(x); if (!re || !re.test(B.limpiar(m.concepto + ' ' + m.tipo))) return false;
    const v = Math.abs(m.importe);
    if (imp) return v >= imp * 0.9 && v <= imp * 1.1;
    if (esCuotas(x)) return x.cuotas.some((q) => v >= q.importe * 0.9 && v <= q.importe * 1.1);
    return (!x.min || v >= x.min) && (!x.max || v <= x.max);
  }
  const deFijo = (m) => (S.fijos || []).some((x) => encajaFijo(x, m));
  // Cargos previstos de un fijo entre dos fechas [desde, hasta)
  function cargosDe(x, desde, hasta) {
    if (esCuotas(x)) {
      return x.cuotas.map((q, i) => ({ fijo: x, fecha: q.fecha, importe: Number(q.importe), n: i + 1, de: x.cuotas.length }))
        .filter((q) => q.fecha >= desde && q.fecha < hasta);
    }
    const out = []; const h = aDate(hasta);
    let d = aDate(desde); d = new Date(d.getFullYear(), d.getMonth(), 1);
    while (d < h) {
      const ym = iso(d).slice(0, 7);
      if ((!x.desde || ym >= x.desde) && (!x.hasta || ym <= x.hasta)) {
        const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const f = iso(new Date(d.getFullYear(), d.getMonth(), Math.min(Number(x.dia) || 1, ult)));
        if (f >= desde && f < hasta) out.push({ fijo: x, fecha: f, importe: Number(x.importe) });
      }
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return out;
  }
  const todosLosCargos = (desde, hasta) => (S.fijos || []).flatMap((x) => cargosDe(x, desde, hasta)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const claveEstado = (fin, q, unica) => unica ? [fin + '|' + q.fijo.id + '|' + q.fecha, fin + '|' + q.fijo.id] : [fin + '|' + q.fijo.id + '|' + q.fecha];
  // Cargos que caen en este ciclo (desde el cobro hasta el siguiente), con lo ya pagado.
  // Cada cargo real del Excel se asigna al cargo previsto más cercano en fecha.
  function cargosCiclo(inicio, fin) {
    const lista = todosLosCargos(inicio, fin).map((q) => ({ ...q, pagado: 0 }));
    const movs = S.movs.filter((m) => m.importe < 0 && m.fecha >= inicio && m.fecha < fin);
    for (const x of S.fijos || []) {
      const suyos = lista.filter((q) => q.fijo === x);
      if (!suyos.length) continue;
      for (const m of movs) {
        const cand = suyos.filter((q) => encajaFijo(x, m, esCuotas(x) ? q.importe : 0));
        if (!cand.length) continue;
        cand.sort((a, b) => Math.abs(dias(a.fecha, m.fecha)) - Math.abs(dias(b.fecha, m.fecha)));
        cand[0].pagado += -m.importe;
      }
    }
    const E = S.fijosEstado || {};
    return lista.map((q) => {
      const unica = lista.filter((o) => o.fijo === q.fijo).length === 1;
      const k = claveEstado(fin, q, unica).find((kk) => E[kk]);
      const est = k ? E[k] : null;
      const pendiente = est === 'pagado' ? 0 : est === 'pendiente' ? q.importe : Math.max(0, Math.round((q.importe - q.pagado) * 100) / 100);
      return { ...q, pendiente, manual: !!est, clave: fin + '|' + q.fijo.id + '|' + q.fecha };
    });
  }
  function faltanFijos() {
    // Sin ningún fijo indefinido (pole, suscripciones…), el número del día sale más alto de lo real
    return !(S.fijos || []).some((x) => !esCuotas(x) && !x.hasta);
  }

  /* ---------- Plan del mes ---------- */
  function mesesCompletos() {
    const meses = [...new Set(S.movs.map((m) => m.fecha.slice(0, 7)))].sort();
    return meses.length > 2 ? meses.slice(1, -1) : [];
  }
  // Gasto variable de los meses completos: media por categoría, grandes aparte
  function habitos() {
    const comp = mesesCompletos(); const set = new Set(comp);
    const porCat = {}; let total = 0, grandes = 0; const lista = [];
    const sem = [0, 0, 0, 0, 0, 0, 0];
    for (const m of S.movs) {
      if (!set.has(m.fecha.slice(0, 7))) continue;
      const c = cat(m); const v = variable(m, c);
      if (v <= 0) continue;
      if (esGrande(m, c)) { grandes += v; lista.push(m); continue; }
      total += v; porCat[c.categoria] = (porCat[c.categoria] || 0) + v;
      // Fecha valor: BBVA apunta el lunes las compras del finde
      sem[aDate(m.fechaValor || m.fecha).getDay()] += v;
    }
    const n = Math.max(1, comp.length);
    Object.keys(porCat).forEach((k) => (porCat[k] = porCat[k] / n));
    // Peso de cada día de la semana (1 = un día medio)
    const cuenta = [0, 0, 0, 0, 0, 0, 0];
    for (const ym of comp) {
      const [y, mm] = ym.split('-').map(Number); const ult = new Date(y, mm, 0).getDate();
      for (let d = 1; d <= ult; d++) cuenta[new Date(y, mm - 1, d).getDay()]++;
    }
    const media = sem.map((t, i) => (cuenta[i] ? t / cuenta[i] : 0));
    const prom = media.reduce((a, b) => a + b, 0) / 7;
    const pesos = media.map((x) => (prom > 0 ? Math.max(0.5, Math.min(2, x / prom)) : 1));
    return { meses: comp, normal: total / n, grandes: grandes / n, porCat, pesos, hay: comp.length > 0 };
  }
  function plan(inicio, fin, H) {
    H = H || habitos();
    const p = S.perfil || { ingresos: 0, fijos: 0, ritmo: 'equilibrado' };
    const nominas = S.movs.filter((m) => m.importe > 0 && /nomina/.test(B.limpiar(m.concepto + ' ' + m.tipo)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3).map((m) => m.importe);
    const cobras = nominas.length ? mediana(nominas) : Number(p.ingresos) || 0;
    // Lo fijo de un mes: cada fijo mensual una vez, más las cuotas que caen en este ciclo
    const ymFin = fin.slice(0, 7);
    const fijos = S.fijos.length ? S.fijos.reduce((a, x) => a + (esCuotas(x)
      ? cargosDe(x, inicio, fin).reduce((b, q) => b + q.importe, 0)
      : ((!x.desde || ymFin >= x.desde) && (!x.hasta || ymFin <= x.hasta) ? Number(x.importe) : 0)), 0) : Number(p.fijos) || 0;
    const ritmo = RITMOS[p.ritmo] ? p.ritmo : 'equilibrado';
    const normal = H.hay ? H.normal : Math.max(0, cobras - fijos - 330);
    const diaADia = normal * (1 - RITMOS[ritmo].r);
    const paraTi = Math.max(0, cobras - fijos - diaADia);
    return { cobras, fijos, normal, grandes: H.grandes, sobra: cobras - fijos - normal, diaADia, paraTi, ritmo, H, deNomina: nominas.length > 0 };
  }

  /* ---------- Cálculos del ciclo ---------- */
  function ciclo() {
    const hoy = hoyIso();
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
    const H = habitos();
    const P = plan(inicio, fin, H);
    const fijosC = cargosCiclo(inicio, fin);
    const pendiente = fijosC.reduce((a, f) => a + f.pendiente, 0);
    let gastado = 0, rescates = 0, forzados = 0; const porCat = {}; const grandes = [];
    for (const m of S.movs.filter((x) => x.fecha >= inicio)) {
      const c = cat(m);
      const v = variable(m, c);
      // Los gastos grandes y puntuales se avisan aparte: no gastan tu presupuesto del día a día
      if (esGrande(m, c)) grandes.push(m);
      else { gastado += v; if (v > 0) porCat[c.categoria] = (porCat[c.categoria] || 0) + v; }
      if (c.categoria === 'Rescate del ahorro' && m.importe > 0) {
        rescates += m.importe;
        // Solo la parte que tapa los números rojos es forzada; el resto es un rescate normal
        if (typeof m.saldo === 'number') forzados += Math.min(m.importe, Math.max(0, m.importe - m.saldo));
      }
    }
    const presupuesto = P.diaADia;
    const queda = presupuesto - gastado;
    // Saldo real: el del movimiento más reciente
    const ult = [...S.movs].filter((m) => typeof m.saldo === 'number')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.imp || 0) - (a.imp || 0) || (a.ord || 0) - (b.ord || 0))[0];
    // Pagos con tarjeta retenidos: el Excel no los trae, se apuntan a mano desde la app del banco
    const retenido = S.retenido && S.retenido.importe > 0 ? Number(S.retenido.importe) : 0;
    let modoSaldo = false, disponible = null;
    if (ult && ult.fecha >= inicio) { modoSaldo = true; disponible = ult.saldo - pendiente - retenido; }
    const libre = Math.max(0, modoSaldo ? Math.min(queda, disponible) : queda);
    // Reparto del dinero libre hasta el cobro según el peso de cada día de la semana
    const lista = []; for (let k = 0; k < restantes; k++) lista.push(masDias(hoy, k));
    const pesoDe = (f) => H.pesos[aDate(f).getDay()] || 1;
    const sumaP = lista.reduce((a, f) => a + pesoDe(f), 0) || 1;
    const reparto = lista.map((f) => ({ fecha: f, importe: libre * pesoDe(f) / sumaP }));
    const hoyPuedes = reparto[0] ? reparto[0].importe : 0;
    // El finde: de viernes a domingo (el que viene, o el que estás viviendo)
    const dw = aDate(hoy).getDay();
    const aViernes = dw === 0 || dw >= 5 ? 0 : 5 - dw;
    const finde = reparto.filter((r) => { const d = dias(hoy, r.fecha); const w = aDate(r.fecha).getDay(); return d >= aViernes && d <= aViernes + 2 && (w === 5 || w === 6 || w === 0); });
    return { inicio, fin, restantes, gastado, rescates, forzados, porCat, presupuesto, ahorro: P.paraTi, P, H, queda, hoyPuedes,
      modoSaldo, retenido, saldo: ult ? ult.saldo : null, saldoFecha: ult ? ult.fecha : null, pendiente, fijosC, disponible, libre,
      reparto, finde, findeTotal: finde.reduce((a, r) => a + r.importe, 0), grandes };
  }

  /* ---------- Compras a plazos ---------- */
  const PLAZOS = [['Klarna', 'klarna(?!.*member)'], ['Scalapay', 'scalapay'], ['Aplazame', 'aplazame'], ['SeQura', 'sequra'],
    ['Oney', '\\boney\\b'], ['Cofidis', 'cofidis'], ['Pagantis', 'pagantis'], ['PayPal a plazos', 'paypal.*(plazos|en 3|pay in)']];
  // n cuotas de un importe, una al mes, desde la fecha dada (la última puede cambiar)
  function generarCuotas(primera, n, imp, impUltima) {
    const [y, m, d] = primera.split('-').map(Number); const out = [];
    for (let k = 0; k < n; k++) {
      const ult = new Date(y, m - 1 + k + 1, 0).getDate();
      out.push({ fecha: iso(new Date(y, m - 1 + k, Math.min(d, ult))), importe: k === n - 1 && impUltima ? impUltima : imp });
    }
    return out;
  }
  // La próxima vez que caiga el día «dia» a partir de mañana
  function proximoDia(dia, desde) {
    const h = aDate(desde || hoyIso()); h.setDate(h.getDate() + 1);
    for (let k = 0; k < 2; k++) {
      const ult = new Date(h.getFullYear(), h.getMonth() + k + 1, 0).getDate();
      const f = new Date(h.getFullYear(), h.getMonth() + k, Math.min(dia, ult));
      if (f >= h) return iso(f);
    }
    return iso(h);
  }
  // Cargos de Klarna, Scalapay… recientes que no encajan con ningún pago fijo y no se han descartado
  function plazosNuevos() {
    if (!S.movs.length) return [];
    const ign = S.plazosIgnorados || {};
    const lim = masDias(S.movs[0].fecha, -40);
    const vistos = {};
    for (const m of S.movs) {
      if (m.importe >= 0 || m.fecha < lim) continue;
      const t = B.limpiar(m.concepto + ' ' + m.tipo);
      const p = PLAZOS.find(([, re]) => new RegExp(re, 'i').test(t));
      if (!p) continue;
      const k = p[0] + '|' + Math.abs(m.importe).toFixed(2);
      if (ign[k] || vistos[k]) continue;
      if (deFijo(m)) continue;
      vistos[k] = { clave: k, prov: p[0], busca: p[1], mov: m };
    }
    return Object.values(vistos);
  }
  function tarjetaPlazos(lista) {
    return lista.map((p) => linkCard({ attrs: `data-plazo="${esc(p.clave)}"`, style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.card,
      titulo: `Cargo nuevo de ${esc(p.prov)}: ${eur(Math.abs(p.mov.importe), true)}`, sub: '¿Es una compra a plazos? Toca y dime cuántas cuotas quedan', subStyle: 'color:var(--butter-d)' })).join('');
  }
  function abrirPlazo(clave) {
    const p = plazosNuevos().find((x) => x.clave === clave);
    if (!p) return;
    const imp = Math.abs(p.mov.importe);
    const diaCargo = Number(p.mov.fecha.slice(8, 10));
    $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:6px">Cargo de ${esc(p.prov)}</div>
      <p class="small muted" style="margin:0 0 14px;line-height:1.5">${eur(imp, true)} el ${fmtF(p.mov.fecha)}. ¿Es una compra a plazos?</p>
      <form id="sForm"><label class="field">¿Cuántas cuotas quedan por pagar?<input name="n" inputmode="numeric" placeholder="Sin contar esta (0 si era la última)" required></label>
      <div class="tiles" style="margin-bottom:0"><label class="field">Importe de cada una (€)<input name="i" inputmode="decimal" value="${esc(String(imp).replace('.', ','))}"></label>
      <label class="field">Día del cargo<input name="d" inputmode="numeric" value="${diaCargo}"></label></div>
      <label class="field">¿La última es distinta? (opcional, €)<input name="u" inputmode="decimal" placeholder="Igual que las demás"></label>
      <label class="field">¿Qué compraste? (opcional)<input name="q" placeholder="Zapatillas"></label>
      <div class="btns"><button type="button" class="btn ghost" id="sNo">No es a plazos</button><button class="btn" type="submit">Guardar</button></div></form>`;
    $sheet.onclick = (e) => { if (e.target === $sheet) $sheet.close(); };
    $sheet.querySelector('#sNo').onclick = () => {
      S.plazosIgnorados = S.plazosIgnorados || {}; S.plazosIgnorados[clave] = true;
      guardar(); $sheet.close(); render(); toast('Vale, no lo vuelvo a preguntar');
    };
    $sheet.querySelector('#sForm').onsubmit = (e) => {
      e.preventDefault(); const t = e.target;
      const n = Math.round(numero(t.n.value));
      S.plazosIgnorados = S.plazosIgnorados || {}; S.plazosIgnorados[clave] = true;
      if (n < 1) { guardar(); $sheet.close(); render(); toast('Era la última: no reservo nada'); return; }
      const cuota = numero(t.i.value) || imp; const dia = Math.min(31, Math.max(1, Math.round(numero(t.d.value)) || diaCargo));
      const que = t.q.value.trim();
      const fijo = { id: 'f' + Date.now(), nombre: p.prov + (que ? ' · ' + que : ' · a plazos'), importe: cuota, dia, busca: p.busca,
        cuotas: generarCuotas(proximoDia(dia, p.mov.fechaValor || p.mov.fecha), n, cuota, numero(t.u.value)) };
      S.fijos.push(fijo);
      guardar(); $sheet.close(); render(); toast('Guardado: la última cuota es el ' + fmtF(fijo.cuotas[n - 1].fecha));
    };
    $sheet.showModal();
  }

  /* ---------- Fijos automáticos ---------- */
  const NO_AUTO = new Set(['Supermercado', 'Comer fuera', 'Estanco', 'Efectivo', 'Ahorro', 'Ingresos', 'Rescate del ahorro', 'Coche y gasolina']);
  // Cargos que se repiten cada mes (importe ±15 %, cada 20–40 días) y aún no están en tu lista
  function sugerirFijos() {
    if (!S.movs.length) return [];
    const ultima = S.movs[0].fecha; const lim = masDias(ultima, -100);
    const grupos = {};
    for (const m of S.movs) {
      if (m.importe >= 0 || m.fecha < lim || deFijo(m)) continue;
      const t = B.limpiar(m.concepto + ' ' + m.tipo);
      if (PLAZOS.some(([, re]) => new RegExp(re, 'i').test(t))) continue;
      const c = cat(m); if (NO_AUTO.has(c.categoria)) continue;
      const k = B.claveRegla(m); if (!k || S.fijosIgnorados[k]) continue;
      (grupos[k] = grupos[k] || []).push(m);
    }
    const out = [];
    for (const [k, l0] of Object.entries(grupos)) {
      const l = [...l0].sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (l.length < 2) continue;
      const meses = new Set(l.map((m) => m.fecha.slice(0, 7)));
      if (meses.size < l.length) continue;
      const imps = l.map((m) => -m.importe); const med = mediana(imps);
      if (!imps.every((v) => Math.abs(v - med) <= med * 0.15)) continue;
      if (!l.slice(1).every((m, i) => { const d = dias(l[i].fecha, m.fecha); return d >= 20 && d <= 40; })) continue;
      if (dias(l[l.length - 1].fecha, ultima) > 45) continue;
      const m0 = l[l.length - 1];
      const texto = /^(bizum|transferencia|adeudo|traspaso|abono)/i.test(m0.concepto) ? B.limpiar(m0.tipo) : B.limpiar(m0.concepto);
      const bonito = nombreMov(m0).replace(/^(www|help)\./i, '').replace(/\.(com|es|fm)\b/gi, '').replace(/^pago de seguro /i, 'Seguro ').replace(/\b(\w+) \1\b/i, '$1');
      out.push({ clave: k, nombre: bonito.charAt(0).toUpperCase() + bonito.slice(1), importe: Math.round(med * 100) / 100, dia: Math.round(mediana(l.map((m) => Number((m.fechaValor || m.fecha).slice(8, 10))))),
        meses: [...meses].map((ym) => MESES[Number(ym.slice(5, 7)) - 1]), busca: escRe(texto) });
    }
    return out.sort((a, b) => b.importe - a.importe);
  }
  function abrirSugerido(clave) {
    const s = sugerirFijos().find((x) => x.clave === clave); if (!s) return;
    $sheet.innerHTML = `<div class="row" style="align-items:flex-start"><div class="num" style="font-size:20px">${esc(s.nombre)}</div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
      <p class="small" style="line-height:1.5;margin:10px 0 14px">Lo has pagado ${s.meses.length} veces (${s.meses.join(', ')}), unos ${eur(s.importe, true)} hacia el día ${s.dia}. ¿Es un pago fijo?</p>
      <form id="sForm"><label class="field">Nombre<input name="n" value="${esc(s.nombre)}" required></label>
      <div class="btns"><button type="button" class="btn ghost" id="sNo">No, es casualidad</button><button class="btn" type="submit">Sí, es fijo</button></div></form>`;
    $sheet.onclick = (e) => { if (e.target.closest('#sCerrar') || e.target === $sheet) $sheet.close(); };
    $sheet.querySelector('#sNo').onclick = () => { S.fijosIgnorados[clave] = true; guardar(); $sheet.close(); render(); toast('Vale, no lo vuelvo a preguntar'); };
    $sheet.querySelector('#sForm').onsubmit = (e) => {
      e.preventDefault();
      S.fijos.push({ id: 'f' + Date.now(), nombre: e.target.n.value.trim() || s.nombre, importe: s.importe, dia: s.dia, busca: s.busca,
        min: Math.round(s.importe * 85) / 100, max: Math.round(s.importe * 115) / 100 });
      guardar(); $sheet.close(); render(); toast('Apuntado en tus pagos fijos');
    };
    $sheet.showModal();
  }

  /* ---------- Ahorro y metas ---------- */
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
  function metaEta(paraTi) {
    const m = ahorro().metas.find((x) => x.ahorrado < x.objetivo);
    if (!m || !S.perfil || !(paraTi > 0)) return '';
    const meses = Math.ceil((m.objetivo - m.ahorrado) / paraTi);
    const d = new Date(); d.setMonth(d.getMonth() + meses);
    return `«${esc(m.nombre)}» lista en ${MESES_L[d.getMonth()]} de ${d.getFullYear()}.`;
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
      const leidos = B.leerExtracto(filas).map(taparMov);
      const ids = new Set(S.movs.map((m) => m.id));
      const nuevos = []; let dup = 0;
      const ahora = Date.now();
      leidos.forEach((m, i) => {
        m.id = idMov(m); m.imp = ahora; m.ord = i;
        if (ids.has(m.id)) { dup++; return; }
        ids.add(m.id); nuevos.push(m);
      });
      S.movs = S.movs.concat(nuevos).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const fechas = leidos.map((m) => m.fecha).sort();
      S.ultimaImportacion = { cuando: hoyIso(), ids: nuevos.map((m) => m.id), duplicados: dup, desde: fechas[0], hasta: fechas[fechas.length - 1] };
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
  const ritmoBotones = (actual, attr) => Object.entries(RITMOS).map(([k, r]) => `<button type="button" ${attr}="${k}" aria-pressed="${actual === k}">${r.label}<br><span class="xs">−${Math.round(r.r * 100)} %</span></button>`).join('');

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
      <label class="field">Gastos fijos al mes (€)<input name="fijos" inputmode="decimal" value="${esc(p.fijos)}" required><span class="xs muted" style="font-weight:400">Aproximado. Luego los apuntas uno a uno en Pagos fijos y Brisa usa esa lista.</span></label>
      <div class="field" style="margin-bottom:6px">¿A qué ritmo ahorramos?<span class="xs muted" style="font-weight:400">Gastar un poco menos que tu normal</span></div>
      <div class="seg" role="group" aria-label="Ritmo de ahorro">${ritmoBotones(p.ritmo, 'data-ritmo')}</div>
      <input type="hidden" name="ritmo" value="${esc(p.ritmo)}">
      <button class="btn" type="submit">${S.perfil ? 'Guardar' : 'Empezar'}</button>
    </form>`;
  };

  R.subir = () => `
    <div class="top"><a class="icon-btn" href="#${S.movs.length ? 'inicio' : 'bienvenida'}" aria-label="Volver">${IC.back}</a></div>
    <h1 style="margin-bottom:8px">Sube tu Excel${SPARK}</h1>
    <p class="muted" style="margin:0 0 22px;line-height:1.5">En la app de BBVA: Movimientos → Descargar → Excel. Luego súbelo aquí y yo lo ordeno.</p>
    <button class="drop" id="bSubir" type="button">
      <span class="ic-big" style="background:var(--sky);color:var(--sky-d)">${IC.file}</span>
      <b style="font-size:17px">Elegir el archivo</b>
      <span class="small muted">.xlsx · .xls · .csv</span>
    </button>
    <p class="small muted" style="text-align:center;margin-top:16px">Puedes subir el mismo Excel varias veces: no se duplica nada.<br>Tus movimientos solo se guardan en este móvil.</p>`;

  R.cargando = () => `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:110px;gap:18px">
      <div style="position:relative;width:140px;height:140px;border-radius:70px;background:var(--rose);display:flex;align-items:center;justify-content:center;color:var(--berry)">
        <svg class="orn spin" style="inset:-14px;stroke:#E9A8C3;stroke-width:2" width="168" height="168" viewBox="0 0 168 168"><circle cx="84" cy="84" r="80" stroke-dasharray="6 10"/></svg>
        ${orn(22, '#E27FA8', 'top:6px;right:4px', 'tw')}
        <svg viewBox="0 0 24 24" width="56" height="56" style="stroke-width:1.4"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" fill="currentColor" fill-opacity=".2" stroke="none"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>
      </div>
      <div class="h1">Leyendo tu Excel…</div>
      <p class="muted" style="margin:0;line-height:1.5">Ordeno tus movimientos y busco<br>lo que ha cambiado.</p>
    </div>`;

  const retenidoCard = (estilo) => linkCard({ attrs: 'id="bRetenido"', style: estilo, icStyle: 'background:var(--lilac);color:var(--lilac-d)', icon: IC.card,
    titulo: 'Retenido con tarjeta: ' + eur(S.retenido && S.retenido.importe || 0, true),
    sub: (S.retenido && S.retenido.fecha ? 'Dato del ' + fmtF(S.retenido.fecha) + ' · ' : '') + 'El Excel no lo trae: míralo en tu app del banco' });

  R.importado = () => {
    const u = S.ultimaImportacion;
    if (!u) return R.inicio();
    const nuevos = S.movs.filter((m) => u.ids.includes(m.id));
    const cs = nuevos.map((m) => [m, cat(m)]);
    const auto = cs.filter(([, c]) => c.confianza >= 0.7).length;
    const rev = cs.filter(([m, c]) => c.confianza < 0.7 && m.importe < 0).length;
    const porCat = {};
    let resc = 0, apart = 0;
    const grandes = cs.filter(([m, c]) => esGrande(m, c));
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
    const sug = sugerirFijos();
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
    ${sug.length ? linkCard({ href: '#fijos', style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.repeat, titulo: sug.length === 1 ? 'Un pago se repite cada mes' : sug.length + ' pagos se repiten cada mes', sub: '¿Son pagos fijos? Un toque y los apunto', subStyle: 'color:var(--butter-d)' }) : ''}
    ${grandes.length ? `<div class="card" style="background:var(--lilac);border:0;color:var(--lilac-d)"><b>${grandes.length === 1 ? 'Un gasto grande' : grandes.length + ' gastos grandes'}</b><p class="small" style="margin:4px 0 0;line-height:1.45">${grandes.map(([m]) => esc(nombreMov(m)) + ' · ' + eur(-m.importe)).join('<br>')}<br>No cuentan como gasto normal, pero se comen lo que te sobra.</p></div>` : ''}
    ${top.length ? `<div class="h2">En qué se fue</div>
    ${top.map(([k, v], i) => `<div style="margin-bottom:10px"><div class="row" style="font-size:14px;margin-bottom:5px"><span>${esc(k)}</span><span class="num">${eur(v)}</span></div><div class="bar l" style="height:6px"><i style="width:${Math.round(v / max * 100)}%;background:${BARRAS[i % BARRAS.length]}"></i></div></div>`).join('')}` : ''}
    ${apart || resc ? `<div class="card dash" style="color:#4A2E3C;margin-top:14px;display:flex;flex-direction:column;gap:6px">
      ${apart ? `<div class="row small"><span>Apartado a tu ahorro</span><span class="num" style="color:var(--mint-d)">+${eur(apart, true)}</span></div>` : ''}
      ${resc ? `<div class="row small"><span>Rescatado de tu ahorro</span><span class="num" style="color:var(--berry)">−${eur(resc, true)}</span></div>` : ''}
    </div>` : ''}
    <div class="card" style="margin-top:14px;background:var(--lilac);border:0">
      <b>¿Tienes pagos retenidos?</b>
      <p class="small" style="margin:4px 0 10px;color:var(--lilac-d);line-height:1.45">El Excel no los incluye. Mira «Retenciones» en tu app de BBVA y apunta el total para que tu número del día sea exacto.</p>
      ${retenidoCard('background:#fff;margin:0')}
    </div>
    <div class="btns">${rev ? '<a class="btn ghost" href="#movimientos">Revisar ' + rev + '</a>' : ''}<a class="btn" href="#inicio">Ir a Inicio</a></div>`;
  };

  // Corazones: cuánto de tu dinero del día a día del mes te queda (10 = el mes entero)
  function corazonesN(c) {
    const base = Math.max(1, c.presupuesto);
    return Math.max(0, Math.min(10, Math.round(c.libre / base * 10)));
  }
  R.inicio = () => {
    if (!S.movs.length) return `
      <div class="top"><div><div class="small muted">Hola, ${esc(S.perfil.nombre)}</div><h1>${DIAS[new Date().getDay()]}${SPARK}</h1></div><a class="icon-btn" href="#ajustes" aria-label="Ajustes">${IC.gear}</a></div>
      <div class="hero"><div class="h1" style="font-size:24px">Aún no tengo tus movimientos</div><p style="color:#4A2E3C;line-height:1.5">Sube el Excel de tu banco y en unos segundos te digo cuánto puedes gastar hoy.</p></div>
      <a class="btn" href="#subir">Subir mi Excel</a>`;
    const c = ciclo();
    const ultimo = S.movs[0].fecha;
    const viejo = dias(ultimo, hoyIso()) > 6;
    const rev = porRevisar().length;
    const finTxt = fmtF(c.fin);
    const n = corazonesN(c);
    const hoy = hoyIso();
    const pronto = c.fijosC.filter((q) => q.pendiente > 0 && q.fecha >= hoy && dias(hoy, q.fecha) <= 3);
    const sug = sugerirFijos();
    const plz = plazosNuevos();
    return `
    <div class="top">
      <div><div class="small muted">Hola, ${esc(S.perfil.nombre)}</div><h1>${DIAS[new Date().getDay()]}${SPARK}</h1></div>
      <a class="icon-btn" href="#ajustes" aria-label="Ajustes">${IC.gear}</a>
    </div>
    <section class="hero">
      ${PIX.big.replace(/style="[^"]*"/, 'style="top:18px;right:20px"')}${PIX.spark.replace(/style="[^"]*"/, 'style="top:66px;right:30px"')}
      <div class="pix" style="font-size:14px;color:#8C2A5A;letter-spacing:.5px">HOY PUEDES GASTAR</div>
      <div class="big" style="margin:8px 0 10px">${eur(c.hoyPuedes)}</div>
      ${c.modoSaldo ? `
      <div style="font-size:13px;line-height:1.5;color:#4A2E3C;margin-bottom:10px">${c.disponible > 0 ? 'Con lo que tienes de verdad:' : 'Ojo: tus pagos pendientes superan tu saldo.'} <b>${eur(c.saldo)}</b> en cuenta${c.retenido ? ` − <a href="#fijos" style="color:var(--berry-d)">${eur(c.retenido)} retenido</a>` : ''} − <a href="#fijos" style="color:var(--berry-d)">${eur(c.pendiente)} de fijos</a>.</div>` : `
      <div style="font-size:14px;line-height:1.45;color:#4A2E3C;margin-bottom:12px">${c.queda >= 0 ? `Sin pasarte hasta el ${finTxt} y apartando ${eur(c.ahorro)} para ti.` : `Te has pasado ${eur(-c.queda)} este mes. Mañana lo vemos con calma.`}</div>`}
      <div class="hearts" role="img" aria-label="Te quedan ${n} de 10 corazones: ${eur(c.libre)} libres de ${eur(c.presupuesto)}">${corazones(n, 21, 18)}</div>
      <div class="row small" style="color:#6A3A50;margin-top:8px"><span style="white-space:nowrap">Te quedan ${n} de 10 ♡ · ${eur(c.libre)}</span><span style="white-space:nowrap">Hasta el ${aDate(c.fin).getDate()} · ${c.restantes} días</span></div>
    </section>
    ${faltanFijos() ? linkCard({ href: '#fijos', style: 'background:var(--peach)', icStyle: 'color:var(--peach-d)', icon: IC.alert, titulo: 'Faltan tus pagos fijos', sub: 'Sin ellos tu número del día sale más alto de lo real. Añádelos o cárgalos desde Ajustes', subStyle: 'color:#5A4238' }) : ''}
    ${pronto.map((q) => linkCard({ href: '#fijos', style: 'background:#fff;border:1px solid var(--line)', icStyle: 'background:var(--lilac);color:var(--lilac-d)', icon: IC.cal,
      titulo: `${cuando(q.fecha).charAt(0).toUpperCase() + cuando(q.fecha).slice(1)} te cobran ${eur(q.pendiente, true)}`, sub: esc(q.fijo.nombre) + (q.de ? ` · cuota ${q.n} de ${q.de}` : '') + ' · ya está reservado' })).join('')}
    ${c.finde.length ? linkCard({ href: '#finde', style: 'background:var(--sky)', icStyle: 'color:var(--sky-d)', icon: IC.sun, titulo: `${aDate(hoy).getDay() >= 5 || aDate(hoy).getDay() === 0 ? 'Este finde te quedan' : 'Este finde puedes gastar'} ${eur(c.findeTotal)}`, sub: 'Viernes a domingo · repartido según tus hábitos', subStyle: 'color:var(--sky-d)' }) : ''}
    ${sug.length ? linkCard({ href: '#fijos', style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.repeat, titulo: sug.length === 1 ? 'Un pago se repite cada mes' : sug.length + ' pagos se repiten cada mes', sub: '¿Es un pago fijo? Un toque y lo apunto', subStyle: 'color:var(--butter-d)' }) : ''}
    ${S.retenido && S.retenido.importe > 0 && S.ultimaImportacion && S.retenido.fecha < S.ultimaImportacion.cuando ? linkCard({ href: '#fijos', style: 'background:var(--lilac)', icStyle: 'color:var(--lilac-d)', icon: IC.card, titulo: `¿Sigue retenido ${eur(S.retenido.importe)}?`, sub: 'Has subido un Excel nuevo: actualízalo para no descontarlo dos veces', subStyle: 'color:var(--lilac-d)' }) : ''}
    ${linkCard({ attrs: 'id="bSubirHome"', style: viejo ? 'background:var(--sky)' : 'background:#fff;border:1px solid var(--line)', icStyle: (viejo ? '' : 'background:var(--sky);') + 'color:var(--sky-d)', icon: IC.file, titulo: viejo ? 'Toca subir el Excel' : 'Subir el Excel de la semana', sub: 'Datos hasta el ' + fmtF(ultimo) })}
    ${linkCard({ href: '#metas', style: 'background:#fff;border:1.5px dashed #F0C3D5', icStyle: 'background:var(--rose);color:var(--berry)', icon: IC.uturn, titulo: `Rescates: ${eur(c.rescates - c.forzados)} de ${eur(S.limiteRescates)}`, sub: c.forzados ? `Más ${eur(c.forzados)} para cubrir números rojos` : 'Lo que ha vuelto de tu ahorro este mes' })}
    ${plz.length > 1 ? linkCard({ href: '#fijos', style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.card, titulo: `${plz.length} cargos de pago a plazos`, sub: [...new Set(plz.map((p) => p.prov))].join(', ') + ' · ¿cuántas cuotas quedan?', subStyle: 'color:var(--butter-d)' }) : tarjetaPlazos(plz)}
    ${rev ? linkCard({ href: '#movimientos', style: 'background:var(--peach)', icStyle: 'color:var(--peach-d)', icon: IC.spark, titulo: `${rev} ${rev === 1 ? 'movimiento' : 'movimientos'} por revisar`, sub: 'Un toque cada uno y los aprendo', subStyle: 'color:#5A4238' }) : ''}`;
  };

  R.finde = () => {
    if (!S.movs.length) return R.inicio();
    const c = ciclo();
    const hoy = hoyIso();
    const enFinde = aDate(hoy).getDay() >= 5 || aDate(hoy).getDay() === 0;
    // Lo gastado este finde (si estás en él): por fecha valor, viernes a hoy
    const vie = masDias(hoy, -((aDate(hoy).getDay() + 2) % 7));
    const gastos = enFinde ? S.movs.filter((m) => (m.fechaValor || m.fecha) >= vie && variable(m, cat(m)) > 0) : [];
    const gastado = gastos.reduce((a, m) => a + variable(m, cat(m)), 0);
    const total = c.findeTotal + gastado;
    const n = total > 0 ? Math.round(c.findeTotal / total * 10) : 0;
    const diaTxt = (f) => (f === hoy ? 'Hoy, ' + DIAS[aDate(f).getDay()].toLowerCase() : DIAS[aDate(f).getDay()]) + ' ' + aDate(f).getDate();
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver">${IC.back}</a><div style="flex-grow:1"><h1>Modo finde${SPARK}</h1><div class="small muted">De viernes a domingo, un solo número</div></div></div>
    <section class="hero">
      ${PIX.spark.replace(/style="[^"]*"/, 'style="top:22px;right:26px"')}
      <div class="pix" style="font-size:14px;color:#8C2A5A;letter-spacing:.5px">${enFinde ? 'TE QUEDAN ESTE FINDE' : 'ESTE FINDE PUEDES GASTAR'}</div>
      <div class="big" style="margin:8px 0 10px">${eur(c.findeTotal)}${enFinde && gastado ? `<span class="small muted" style="font-family:var(--sans);letter-spacing:0;margin-left:8px">de ${eur(total)}</span>` : ''}</div>
      <div class="hearts" role="img" aria-label="${n} de 10 corazones del finde">${corazones(enFinde ? n : 10, 21, 18)}</div>
      <div class="card" style="margin:14px 0 0;background:rgba(255,255,255,.75);border:0;padding:6px 16px">
        ${c.finde.length ? c.finde.map((r) => `<div class="row" style="min-height:40px;border-bottom:1px dashed #F0C3D5"><span>${diaTxt(r.fecha)}</span><span class="num">${eur(r.importe)}</span></div>`).join('') : '<div class="small" style="padding:8px 0">Tu cobro llega antes del finde: el número cambiará con tu nómina.</div>'}
      </div>
    </section>
    <button type="button" class="link-card" id="bProximos" style="background:#fff;border:1px solid var(--line)"><span class="t"><span class="small" style="line-height:1.45">Repartido con tus hábitos: ${habitoFinde(c.H)} <b style="color:var(--berry)">Ver tus próximos días</b></span></span>${IC.chev}</button>
    ${enFinde ? `<div class="h2">Gastado este finde</div>
    <div class="card" style="padding:4px 16px">${gastos.length ? gastos.map((m) => `<div class="row" style="min-height:44px;border-bottom:1px solid var(--line)"><span>${esc(nombreMov(m))} <span class="xs muted">· ${DIAS_C[aDate(m.fechaValor || m.fecha).getDay()].toLowerCase()}</span></span><span class="num">${eur(-m.importe, true)}</span></div>`).join('') : '<div class="empty" style="padding:16px">Aún nada en tu Excel</div>'}</div>` : ''}
    <p class="xs muted" style="line-height:1.45">Lo que no gastes un día pasa a los siguientes. Las compras del finde salen en tu Excel el lunes: Brisa usa la fecha real de la compra.</p>`;
  };
  function habitoFinde(H) {
    if (!H.hay) return 'cuando tenga un mes completo, lo ajusto a ti.';
    const fin = (H.pesos[5] + H.pesos[6] + H.pesos[0]) / 3; const sem = (H.pesos[1] + H.pesos[2] + H.pesos[3] + H.pesos[4]) / 4;
    if (fin > sem * 1.15) return 'en finde gastas más que entre semana.';
    if (fin < sem * 0.85) return 'en finde gastas menos que entre semana.';
    return 'en finde gastas parecido a entre semana.';
  }
  function abrirProximos() {
    const c = ciclo(); const hoy = hoyIso();
    $sheet.innerHTML = `<div class="row" style="align-items:flex-start"><div class="num" style="font-size:20px">Tus próximos días</div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
      <p class="small muted" style="line-height:1.5;margin:8px 0 10px">Te quedan ${eur(c.libre)} hasta el ${fmtF(c.fin)}. Los reparto según cómo sueles gastar cada día. Lo que no gastes un día pasa a los siguientes.</p>
      <div style="max-height:55vh;overflow-y:auto">${c.reparto.map((r) => { const w = aDate(r.fecha).getDay(); const fd = w === 0 || w >= 5;
        return `<div class="row" style="min-height:42px;border-bottom:1px solid var(--line);${fd ? 'color:var(--peach-d);font-weight:700' : ''}"><span>${r.fecha === hoy ? 'Hoy, ' + DIAS[w].toLowerCase() : DIAS[w]} ${aDate(r.fecha).getDate()}</span><span class="num">${eur(r.importe)}</span></div>`; }).join('')}</div>`;
    $sheet.onclick = (e) => { if (e.target.closest('#sCerrar') || e.target === $sheet) $sheet.close(); };
    $sheet.showModal();
  }

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

  const AJUSTABLES = { 'Comer fuera': 'Lo más fácil de ajustar', 'Transporte': 'Algún Uber menos, más metro', 'Compras': 'Antes de pagar, ¿me lo compro?',
    'Ocio y planes': 'Elige los planes que más te llenan', 'Cuidado personal': 'Lo justo, sin caprichos de impulso', 'Estanco': 'Un paquete menos a la semana', 'Otra cuenta': 'Menos recargas a Revolut' };
  function sugeridos(H, r) {
    return Object.entries(H.porCat).filter(([k]) => AJUSTABLES[k]).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => ({ cat: k, media: v, tope: Math.round(v * (1 - r)), why: AJUSTABLES[k] }));
  }
  R.presupuesto = () => {
    const c = ciclo(); const P = c.P; const H = c.H;
    const r = RITMOS[P.ritmo].r;
    const ing = Math.max(1, P.cobras);
    const w = (n) => Math.max(0, Math.min(100, n / ing * 100)).toFixed(1) + '%';
    const filas = Object.entries(H.porCat).filter(([k]) => k !== 'Por revisar').sort((a, b) => b[1] - a[1]).slice(0, 8);
    const sug = sugeridos(H, r);
    const topes = (S.plan && S.plan.topes) || {};
    const maxP = Math.max(...H.pesos);
    const eta = metaEta(P.paraTi);
    return `
    <div class="top"><div><h1>Tu presupuesto${SPARK}</h1><div class="small muted">Con tus datos reales. Tú no haces cuentas.</div></div></div>
    <section class="card dash" style="display:flex;flex-direction:column;gap:10px;border-radius:28px;padding:18px 20px">
      <span class="num" style="font-size:17px">Lo que puedes ahorrar</span>
      <div class="ln"><span>Cobras<br><span class="xs muted">${P.deNomina ? 'Tu nómina, sacada del Excel' : 'Lo que pusiste en Ajustes'}</span></span><span class="num" style="color:var(--mint-d)">+${eur(P.cobras)}</span></div>
      <div class="ln"><span><a href="#fijos" style="color:inherit">Pagos fijos</a><br><span class="xs muted">${S.fijos.length ? 'Los de tu lista que caen este mes' : 'El aproximado de Ajustes'}</span></span><span class="num" style="color:var(--berry)">−${eur(P.fijos)}</span></div>
      <div class="ln"><span>Tu gasto normal<br><span class="xs muted">${H.hay ? 'La media de tus ' + H.meses.length + ' meses completos' : 'Aún no hay un mes completo: es una estimación'}</span></span><span class="num" style="color:var(--berry)">−${eur(P.normal)}</span></div>
      <div style="border-top:1.5px dashed var(--rose3)"></div>
      <div class="ln"><b>${P.sobra >= 0 ? 'Te sobran al mes' : 'Te faltan al mes'}</b><span class="num" style="color:${P.sobra >= 0 ? 'var(--mint-d)' : 'var(--berry)'}">${eur(Math.abs(P.sobra))}</span></div>
      ${P.grandes > 0 ? `<div style="background:var(--lilac);border-radius:16px;padding:10px 14px;line-height:1.5;color:var(--lilac-d)" class="small">Aparte, los gastos grandes de más de ${GRANDE} € te han costado <b>${eur(P.grandes)} al mes</b> de media. No cuentan como gasto normal, pero se comen lo que te sobra.</div>` : ''}
    </section>
    <div class="h2">¿A qué ritmo ahorras?</div>
    <div class="seg" role="group" aria-label="Ritmo de ahorro">${ritmoBotones(P.ritmo, 'data-ritmo2')}</div>
    <section class="card" style="display:flex;flex-direction:column;gap:12px;border-radius:28px;padding:18px 20px">
      <div style="display:flex;gap:4px;height:14px"><i style="width:${w(P.fijos)};background:#E8A6BB;border-radius:7px"></i><i style="width:${w(P.diaADia)};background:#93C0E6;border-radius:7px"></i><i style="width:${w(P.paraTi)};background:#8FCFB0;border-radius:7px"></i></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px" class="xs muted">
        <div>Lo fijo<br><span class="num" style="font-size:16px;color:var(--ink)">${eur(P.fijos)}</span></div>
        <div>Día a día<br><span class="num" style="font-size:16px;color:var(--ink)">${eur(P.diaADia)}</span></div>
        <div>Para ti<br><span class="num" style="font-size:16px;color:var(--mint-d)">${eur(P.paraTi)}</span></div>
      </div>
      <div style="background:var(--mint);border-radius:16px;padding:10px 14px;line-height:1.5;color:#22392E" class="small">Gastando un ${Math.round(r * 100)} % menos que tu normal (${eur(P.normal * r)} menos al mes) ahorras <b>${eur(P.paraTi)} al mes</b>. ${eta}</div>
    </section>
    ${H.hay ? `<div class="h2">Tu semana</div>
    <section class="card" style="display:flex;flex-direction:column;gap:10px;border-radius:28px;padding:18px 20px">
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;align-items:end;height:92px">
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%"><div style="width:100%;height:${Math.round(H.pesos[d] / maxP * 66)}px;border-radius:6px;background:${d >= 5 || d === 0 ? '#93C0E6' : '#F3C9D8'}"></div><span class="xs muted">${DIAS_C[d]}</span></div>`).join('')}
      </div>
      <span class="small" style="line-height:1.5">Lo que sueles gastar cada día, con la fecha real de la compra. ${habitoFinde(H).replace(/^./, (x) => x.toUpperCase())} Tu número del día sigue este patrón.</span>
    </section>` : ''}
    ${sug.length ? `<div class="h2">Ajustes sugeridos</div>
    ${sug.map((a, i) => `<div class="card row" style="border-radius:20px;padding:12px 16px;margin-bottom:8px"><span class="dot" style="background:${BARRAS[(i + 4) % BARRAS.length]}"></span><span style="display:flex;flex-direction:column;gap:2px;flex-grow:1"><b style="font-size:15px;font-weight:600">${esc(a.cat)}</b><span class="xs muted">${esc(a.why)}</span></span><span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="num" style="font-size:16px">${eur(a.tope)}</span><span class="xs muted">media ${eur(a.media)}</span></span></div>`).join('')}
    <button class="btn" id="bAplicar" style="margin-top:6px">Aplicar este presupuesto</button>
    ${S.plan && S.plan.fecha ? `<p class="xs muted" style="text-align:center;margin:8px 0 0">Aplicado el ${fmtF(S.plan.fecha)} (${RITMOS[S.plan.ritmo] ? RITMOS[S.plan.ritmo].label.toLowerCase() : ''})</p>` : ''}` : ''}
    <div class="h2">Este mes, por categoría</div>
    ${filas.length ? `<div class="card">${filas.map(([k, avg], i) => {
      const act = c.porCat[k] || 0; const ref = topes[k] || avg; const pc = Math.min(100, Math.round(act / Math.max(ref, 1) * 100));
      return `<div style="margin:6px 0 12px"><div class="row" style="font-size:14px;margin-bottom:5px"><span>${esc(k)}</span><span><span class="num">${eur(act)}</span> <span class="xs muted">/ ${topes[k] ? 'tope' : 'media'} ${eur(ref)}</span></span></div><div class="bar l" style="height:6px"><i style="width:${pc}%;background:${act > ref ? '#B03A72' : BARRAS[i % BARRAS.length]}"></i></div></div>`;
    }).join('')}</div>` : '<div class="empty">Cuando tengas un mes completo verás aquí tus categorías.</div>'}
    <p class="xs muted">La media sale de tus meses completos, sin los gastos grandes. Lo que está en tus pagos fijos no cuenta aquí: ya está reservado.</p>`;
  };
  function aplicarPresupuesto() {
    const c = ciclo(); const P = c.P;
    const topes = {}; sugeridos(c.H, RITMOS[P.ritmo].r).forEach((a) => (topes[a.cat] = a.tope));
    S.plan = { ritmo: P.ritmo, fecha: hoyIso(), topes, paraTi: Math.round(P.paraTi) };
    guardar(); render();
    const capa = document.createElement('div'); capa.className = 'scrim';
    capa.innerHTML = `<div class="pop stitch modal" role="dialog" aria-modal="true" aria-label="Presupuesto aplicado">
      ${orn(34, '#fff', 'top:18px;left:26px', 'tw d1')}${orn(16, '#E27FA8', 'top:54px;left:64px', 'tw d2')}${orn(26, '#fff', 'top:22px;right:30px', 'tw d3')}${orn(14, '#E27FA8', 'top:70px;right:70px', 'tw d4')}${orn(18, '#fff', 'bottom:92px;left:22px', 'tw d5')}${orn(20, '#fff', 'bottom:100px;right:24px', 'tw d6')}
      <div style="width:72px;height:72px;border-radius:36px;background:#fff;display:flex;align-items:center;justify-content:center;color:var(--berry);margin-bottom:6px"><svg width="34" height="34" viewBox="0 0 24 24" stroke-width="2"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <span class="h1" style="font-size:28px;line-height:1.1">¡Presupuesto aplicado!</span>
      <span style="font-size:15px;line-height:1.45;color:#4A2E3C">Desde hoy Brisa usa estos topes y aparta <b>${eur(P.paraTi)}</b> al mes para ti.</span>
      <button class="btn" id="mCerrar" style="margin-top:10px">Genial</button></div>`;
    document.body.appendChild(capa);
    const cerrar = () => capa.remove();
    capa.onclick = (e) => { if (e.target === capa || e.target.closest('#mCerrar')) cerrar(); };
  }

  R.metas = () => {
    const c = ciclo();
    const aporte = c.P.paraTi;
    const A = ahorro();
    const activa = A.metas.find((x) => x.ahorrado < x.objetivo);
    const usado = c.rescates - c.forzados;
    const pr = Math.min(100, Math.round(usado / Math.max(1, S.limiteRescates) * 100));
    const linea = (txt, v, signo) => v ? `<div class="row small"><span>${txt}</span><span class="num" style="color:${signo === '+' ? 'var(--mint-d)' : 'var(--berry)'}">${signo}${eur(v)}</span></div>` : '';
    const eta = metaEta(aporte).replace(/^«.*?» /, '');
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
          <span class="xs">${pc >= 100 ? '¡Conseguida!' : es ? eur(aporte) + '/mes' + (eta ? ' · ' + eta : '') : 'Empieza al terminar la anterior'}</span>
        </div>
      </section>`;
    }).join('')}
    <section class="card dash">
      <div class="row" style="margin-bottom:8px"><span style="display:flex;gap:10px;align-items:center"><span style="width:36px;height:36px;border-radius:18px;background:var(--rose);color:var(--berry);display:flex;align-items:center;justify-content:center">${IC.uturn.replace('viewBox', 'width="18" height="18" viewBox')}</span><b>Rescates del ahorro</b></span><span class="num" style="white-space:nowrap">${eur(usado)} <span class="xs muted">de ${eur(S.limiteRescates)}</span></span></div>
      ${c.forzados ? `<p class="xs" style="margin:0 0 8px;color:var(--berry)">Además, ${eur(c.forzados)} volvieron para tapar números rojos. No cuentan en tu límite: son la señal de que el banco aparta más de lo que tu mes aguanta.</p>` : ''}
      <div class="bar l"><i style="width:${pr}%;${usado > S.limiteRescates ? 'background:var(--berry)' : ''}"></i></div>
      <p class="xs muted" style="margin:8px 0 0;line-height:1.45">${usado > S.limiteRescates ? `Este mes te has pasado ${eur(usado - S.limiteRescates)} del límite. ` : ''}Dinero que ha vuelto de tu ahorro este mes. Sacar no está prohibido: solo queremos que se vea.</p>
    </section>
    ${linkCard({ attrs: 'id="bNuevaMeta"', style: 'background:rgba(255,255,255,.6);border:1.5px dashed var(--rose3)', icStyle: 'background:var(--peach);color:var(--peach-d)', icon: IC.plus, titulo: 'Crear otra meta', sub: 'Empieza al completar la anterior' })}`;
  };

  /* ---------- Pagos fijos: calendario y lista ---------- */
  let calMes = null; let calDia = null;
  function estadoCargo(q, c) {
    if (q.fecha < c.inicio) return 'pasado';
    if (q.fecha >= c.fin) return 'despues';
    const k = c.fijosC.find((x) => x.fijo === q.fijo && x.fecha === q.fecha);
    return k && k.pendiente > 0 ? 'pendiente' : 'pagado';
  }
  const COL_EST = { pendiente: 'var(--berry)', pagado: 'var(--mint-b)', despues: '#A99BE8', pasado: '#D9C3CC' };
  const TXT_EST = { pendiente: 'Pendiente', pagado: 'Pagado', despues: 'Después de cobrar', pasado: 'Ya pasó' };
  function calendario(c) {
    const ym = calMes || hoyIso().slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const desde = ym + '-01'; const hasta = sumarMes(ym, 1) + '-01';
    const cargos = todosLosCargos(desde, hasta);
    const porDia = {}; cargos.forEach((q) => (porDia[q.fecha] = porDia[q.fecha] || []).push(q));
    const ult = new Date(y, m, 0).getDate();
    const hueco = (new Date(y, m - 1, 1).getDay() + 6) % 7; // lunes primero
    const hoy = hoyIso();
    let celdas = '';
    for (let k = 0; k < hueco; k++) celdas += '<span></span>';
    for (let d = 1; d <= ult; d++) {
      const f = ym + '-' + String(d).padStart(2, '0');
      const qs = porDia[f] || [];
      const cobro = f === c.fin;
      const sel = calDia === f;
      celdas += `<button type="button" class="cal-d${f === hoy ? ' hoy' : ''}${sel ? ' sel' : ''}" data-dia="${f}" aria-label="${d} de ${MESES_L[m - 1]}${qs.length ? ', ' + qs.length + (qs.length === 1 ? ' cargo' : ' cargos') : ''}${cobro ? ', día de cobro' : ''}">
        <span>${d}</span><span class="cal-p">${cobro ? PIX.full.replace('<svg', '<svg width="10" height="9"') : qs.slice(0, 3).map((q) => `<i style="background:${COL_EST[estadoCargo(q, c)]}"></i>`).join('')}</span></button>`;
    }
    const delDia = calDia && calDia.slice(0, 7) === ym ? (porDia[calDia] || []) : null;
    const total = cargos.reduce((a, q) => a + q.importe, 0);
    return `<section class="card cal" aria-label="Calendario de cargos">
      <div class="row" style="margin-bottom:8px"><button type="button" class="icon-btn sm" data-cal="-1" aria-label="Mes anterior">${IC.back}</button>
        <span style="text-align:center"><span class="num" style="font-size:17px;text-transform:capitalize">${MESES_L[m - 1]} ${y}</span><br><span class="xs muted">${cargos.length} cargos · ${eur(total)}</span></span>
        <button type="button" class="icon-btn sm" data-cal="1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <div class="cal-g">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span class="cal-h">${x}</span>`).join('')}${celdas}</div>
      <div class="cal-ley xs muted"><span><i style="background:${COL_EST.pendiente}"></i>Pendiente</span><span><i style="background:${COL_EST.pagado}"></i>Pagado</span><span><i style="background:${COL_EST.despues}"></i>Después de cobrar</span><span>${PIX.full.replace('<svg', '<svg width="10" height="9"')} Cobro</span></div>
      ${delDia ? `<div style="border-top:1px dashed var(--rose3);margin-top:10px;padding-top:6px"><div class="small" style="font-weight:700;margin-bottom:2px">${DIAS[aDate(calDia).getDay()]} ${aDate(calDia).getDate()} de ${MESES_L[m - 1]}${calDia === c.fin ? ' · te llega la nómina' : ''}</div>
        ${delDia.length ? delDia.map((q) => filaCargo(q, estadoCargo(q, c))).join('') : '<div class="small muted" style="padding:6px 0">Sin cargos este día</div>'}</div>` : ''}
    </section>`;
  }
  function filaCargo(q, est, importe) {
    const bg = { pendiente: 'var(--peach)', pagado: 'var(--mint)', despues: 'var(--lilac)', pasado: '#F3ECEF' }[est];
    const col = { pendiente: 'var(--peach-d)', pagado: 'var(--mint-d)', despues: 'var(--lilac-d)', pasado: 'var(--muted)' }[est];
    return `<button class="mov" data-fijo="${esc(q.fijo.id)}" data-fecha="${q.fecha}">
      <span class="av" style="background:${bg};color:${col};flex-direction:column;line-height:1"><b style="font-size:15px">${aDate(q.fecha).getDate()}</b><span style="font-size:9px;font-family:var(--sans)">${MESES[aDate(q.fecha).getMonth()]}</span></span>
      <span class="t"><span class="n">${esc(q.fijo.nombre)}</span><span class="xs muted">${TXT_EST[est]}${q.de ? ` · cuota ${q.n} de ${q.de}` : ''}${q.manual ? ' · marcado por ti' : ''}</span></span>
      <span class="amt">${eur(importe !== undefined ? importe : q.importe, true)}</span></button>`;
  }
  R.fijos = () => {
    const c = ciclo();
    const pend = c.fijosC.filter((q) => q.pendiente > 0);
    const pag = c.fijosC.filter((q) => q.pendiente <= 0);
    const enCiclo = new Set(c.fijosC.map((q) => q.fijo));
    const futuros = (S.fijos || []).filter((x) => !enCiclo.has(x)).map((x) => ({ x, q: todosLosCargos(c.fin, masDias(c.fin, 400)).find((q) => q.fijo === x) })).filter((o) => o.q);
    const sug = sugerirFijos();
    const plz = plazosNuevos();
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Pagos fijos${SPARK}</h1></div>
    <p class="small muted" style="margin-top:0;line-height:1.5">Lo que tiene que salir antes de tu cobro del ${fmtF(c.fin)}. Brisa lo reserva para que tu número del día sea real y lo marca como pagado sola cuando sale en tu Excel. Toca uno para cambiarlo o darlo de baja.</p>
    ${faltanFijos() ? `<div class="card" style="background:var(--peach);border:0;color:#5A4238"><b>Aún no tienes tus fijos de cada mes</b><p class="small" style="margin:4px 0 0;line-height:1.45">Pole, suscripciones, seguros… Añádelos abajo o cárgalos desde <a href="#ajustes">Ajustes → Restaurar copia o reglas</a>.</p></div>` : ''}
    ${calendario(c)}
    <div class="total-pix"><span class="pix">TOTAL PENDIENTE</span><span class="num" style="font-size:22px">${eur(c.pendiente, true)}</span></div>
    ${pend.length ? `<div class="h2">Antes de cobrar</div><div class="card" style="padding:4px 16px">${pend.map((q) => filaCargo(q, 'pendiente', q.pendiente)).join('')}</div>` : ''}
    ${pag.length ? `<div class="h2">Pagados en este ciclo</div><div class="card" style="padding:4px 16px">${pag.map((q) => filaCargo(q, 'pagado')).join('')}</div>` : ''}
    ${plz.length ? `<div class="h2">Pagos a plazos sin apuntar</div>${tarjetaPlazos(plz)}` : ''}
    ${sug.length ? `<div class="h2">¿Estos también son fijos?</div><p class="xs muted" style="margin:-4px 0 8px;line-height:1.45">Se repiten cada mes con un importe parecido. Toca uno para decirme si lo es.</p>
    <div class="card" style="padding:4px 16px;background:#FFFBEA">${sug.map((s) => `<button class="mov" data-sug="${esc(s.clave)}"><span class="av" style="background:var(--butter);color:var(--butter-d)">?</span><span class="t"><span class="n">${esc(s.nombre)}</span><span class="xs muted">${s.meses.join(', ')} · hacia el día ${s.dia}</span></span><span class="amt">${eur(s.importe, true)}</span></button>`).join('')}</div>` : ''}
    ${futuros.length ? `<div class="h2">Empiezan más adelante</div><div class="card" style="padding:4px 16px">${futuros.map((o) => filaCargo({ ...o.q, n: o.q.n }, 'despues')).join('')}</div>` : ''}
    ${retenidoCard('background:var(--lilac);margin-top:12px')}
    ${linkCard({ attrs: 'id="bNuevoFijo"', style: 'background:rgba(255,255,255,.6);border:1.5px dashed var(--rose3)', icStyle: 'background:var(--peach);color:var(--peach-d)', icon: IC.plus, titulo: 'Añadir pago fijo', sub: 'Alquiler, una cuota, una suscripción…' })}`;
  };

  /* ---------- Ajustes ---------- */
  const filaAj = (o) => `<${o.href ? 'a href="' + o.href + '"' : o.btn ? 'button type="button" id="' + o.btn + '"' : 'div'} class="aj-row">
    <span class="t"><b>${o.t}</b>${o.s ? `<span class="xs muted">${o.s}</span>` : ''}</span>${o.input || ''}${o.v ? `<span class="small muted">${o.v}</span>` : ''}${o.href || o.btn ? IC.chev : ''}</${o.href ? 'a' : o.btn ? 'button' : 'div'}>`;
  R.ajustes = () => {
    const p = S.perfil; const c = S.movs.length ? ciclo() : null;
    const nReglas = Object.keys(S.reglas.reglasUsuario).length + S.reglas.palabras.length + S.reglas.importes.length;
    const desde = S.movs.length ? S.movs[S.movs.length - 1].fecha.slice(0, 7) : null;
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Ajustes${SPARK}</h1></div>
    <section class="hero" style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:24px;margin-bottom:14px">
      ${orn(20, '#fff', 'top:12px;right:18px')}
      <span style="width:48px;height:48px;border-radius:24px;background:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:22px;font-style:italic;color:var(--berry);flex-shrink:0">${esc((p.nombre || '?').charAt(0).toUpperCase())}</span>
      <span style="display:flex;flex-direction:column;gap:2px"><b style="font-size:16px">${esc(p.nombre)}</b><span class="small" style="color:#6A3A50">${desde ? 'Tus datos desde ' + mesTexto(desde) : 'Aún sin movimientos'}</span></span>
    </section>
    <div class="aj-lbl">Tu dinero</div>
    <div class="aj-grp">
      ${filaAj({ btn: 'bSubirAj', t: 'Subir el Excel de la semana', s: S.movs.length ? 'Datos hasta el ' + fmtF(S.movs[0].fecha) + ' · ' + S.movs.length + ' movimientos' : 'Aún no has subido ninguno' })}
      ${filaAj({ t: 'Cobras al mes', s: c && c.P.deNomina ? 'Uso tu nómina del Excel: ' + eur(c.P.cobras) : 'Hasta que suba una nómina', input: `<input class="aj-in" data-campo="ingresos" inputmode="decimal" value="${esc(p.ingresos)}" aria-label="Cobras al mes" style="width:76px"><span class="small muted">€</span>` })}
      ${filaAj({ t: 'Día de cobro', s: 'Ese día empieza tu mes', input: `<input class="aj-in" data-campo="diaCobro" inputmode="numeric" value="${esc(p.diaCobro)}" aria-label="Día de cobro" style="width:56px">` })}
      ${filaAj({ href: '#presupuesto', t: 'Ritmo de ahorro', s: 'Cámbialo cuando quieras', v: RITMOS[p.ritmo].label })}
      ${filaAj({ href: '#fijos', t: 'Pagos fijos', s: 'Lo que Brisa reserva cada mes', v: c ? eur(c.P.fijos) : (S.fijos.length + '') })}
      ${filaAj({ t: 'Límite de rescates', s: 'Lo que te permites sacar del ahorro al mes', input: `<input class="aj-in" data-campo="limite" inputmode="decimal" value="${esc(S.limiteRescates)}" aria-label="Límite de rescates" style="width:76px"><span class="small muted">€</span>` })}
    </div>
    <div class="aj-lbl">Tus datos</div>
    <div class="aj-grp">
      ${filaAj({ t: 'Tu nombre', input: `<input class="aj-in" data-campo="nombre" value="${esc(p.nombre)}" aria-label="Tu nombre" style="width:120px;text-align:left">` })}
      ${filaAj({ btn: 'bExport', t: 'Descargar copia', s: `Todo vive solo en este móvil: ${S.movs.length} movimientos, ${nReglas} reglas y ${S.fijos.length} pagos fijos` })}
      ${filaAj({ btn: 'bImport', t: 'Restaurar copia o reglas', s: 'Desde un archivo .json' })}
    </div>
    <button class="btn ghost" id="bBorrar" style="color:var(--berry);border:0;background:none">Borrar todos mis datos</button>
    <p class="xs muted" style="text-align:center;margin-top:8px">Brisa v${VERSION_APP}</p>`;
  };

  /* ---------- Hoja para cambiar la categoría ---------- */
  function abrirMov(id) {
    const m = S.movs.find((x) => x.id === id); if (!m) return;
    const c = cat(m);
    let elegida = c.categoria === 'Por revisar' ? null : c.categoria;
    const dibujar = () => {
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">${esc(nombreMov(m))}</div><div class="small muted">${fmtF(m.fecha)} · ${eur(m.importe, true)}</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
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

  // Hoja de un pago fijo: marcar este cargo, editar, ver cuotas o quitarlo
  function abrirFijo(id, fecha) {
    const c = ciclo(); const real = S.fijos.find((x) => x.id === id);
    if (!real) return;
    const q = c.fijosC.find((x) => x.fijo === real && (!fecha || x.fecha === fecha)) || null;
    const cuotas = esCuotas(real);
    const vista = (modo) => {
      if (modo === 'editar') {
        $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">Editar pago fijo</div>
          <form id="sForm"><label class="field">Nombre<input name="n" value="${esc(real.nombre)}" required></label>
          ${cuotas ? `<div class="field" style="margin-bottom:6px">Cuotas<span class="xs muted" style="font-weight:400">Cambia el importe de la que sea distinta</span></div>
            <div class="cuotas-ed">${real.cuotas.map((k, i) => `<label class="field" style="margin:0">${fmtF(k.fecha)}${aDate(k.fecha).getFullYear() !== new Date().getFullYear() ? ' ' + aDate(k.fecha).getFullYear() : ''}<input name="q${i}" inputmode="decimal" value="${esc(String(k.importe).replace('.', ','))}"></label>`).join('')}</div>`
          : `<div class="tiles" style="margin-bottom:0"><label class="field">Importe al mes (€)<input name="i" inputmode="decimal" value="${esc(String(real.importe).replace('.', ','))}" required></label><label class="field">Día aproximado<input name="d" inputmode="numeric" value="${esc(real.dia)}"></label></div>`}
          <div class="btns"><button type="button" class="btn ghost" id="sCancel">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`;
        $sheet.querySelector('#sForm').onsubmit = (e) => {
          e.preventDefault(); const t = e.target;
          real.nombre = t.n.value.trim() || real.nombre;
          if (cuotas) real.cuotas.forEach((k, i) => { const v = numero(t['q' + i].value); if (v > 0) k.importe = v; });
          else { const imp = numero(t.i.value); if (imp > 0 && real.min) { real.min = Math.round(imp * 85) / 100; real.max = Math.round(imp * 115) / 100; } real.importe = imp || real.importe; real.dia = Math.min(31, Math.max(1, Math.round(numero(t.d.value)) || real.dia)); }
          guardar(); $sheet.close(); render(); toast('Guardado');
        };
        return;
      }
      const quedan = cuotas ? real.cuotas.filter((k) => k.fecha >= hoyIso()) : [];
      const resto = quedan.reduce((a, k) => a + Number(k.importe), 0);
      const sub = cuotas ? `A plazos · ${quedan.length ? `quedan ${quedan.length} (${eur(resto, true)})` : 'ya no quedan cuotas'}` : `${eur(Number(real.importe), true)} al mes · hacia el día ${esc(real.dia)}`;
      const est = q ? (q.pendiente > 0 ? `Pendiente: ${eur(q.pendiente, true)} ${cuando(q.fecha) === 'hoy' ? 'hoy' : (q.fecha < hoyIso() ? 'desde el ' + fmtF(q.fecha) : cuando(q.fecha))}.` : 'Pagado en este ciclo.') : 'No tiene cargos antes de tu próximo cobro, así que ahora no se reserva.';
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">${esc(real.nombre)}</div><div class="small muted">${sub}</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
        <p class="small" style="line-height:1.5;margin:14px 0">${est} Cuando el cargo aparezca en tu Excel, Brisa lo marca como pagado sola.</p>
        ${cuotas ? `<div class="card" style="background:var(--mint);border:0;margin:0 0 14px;padding:10px 16px">${real.cuotas.map((k, i) => `<div class="row small" style="min-height:30px;${k.fecha < hoyIso() ? 'opacity:.55' : ''}"><span>Cuota ${i + 1} · ${fmtF(k.fecha)}${aDate(k.fecha).getFullYear() !== new Date().getFullYear() ? ' ' + aDate(k.fecha).getFullYear() : ''}</span><span class="num">${eur(Number(k.importe), true)}</span></div>`).join('')}
          <div class="xs" style="margin-top:6px;color:var(--mint-d)">Terminan solas: no tienes que hacer nada.</div></div>` : ''}
        <button class="btn ${cuotas ? 'ghost' : ''}" id="sQuitar">${cuotas ? 'Ya está pagado del todo' : 'Ya no lo pago'}</button>
        <p class="xs muted" style="margin:6px 0 14px;text-align:center">Lo quito de tu lista y deja de reservarse.</p>
        <div style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap" class="small">
          <a href="#fijos" id="sEditar">${cuotas ? 'Cambiar cuotas' : 'Cambiar importe'}</a>
          ${q ? `<a href="#fijos" id="sMarcar">${q.pendiente > 0 ? 'Ya lo pagué y no sale' : 'No está pagado'}</a>` : ''}
        </div>`;
      if (q) $sheet.querySelector('#sMarcar').onclick = (e) => {
        e.preventDefault();
        S.fijosEstado[q.clave] = q.pendiente > 0 ? 'pagado' : 'pendiente';
        // El estado antiguo (por ciclo) ya no manda
        delete S.fijosEstado[c.fin + '|' + real.id];
        guardar(); $sheet.close(); render(); toast(q.pendiente > 0 ? 'Marcado como pagado' : 'Marcado como pendiente');
      };
      $sheet.querySelector('#sEditar').onclick = (e) => { e.preventDefault(); vista('editar'); };
      $sheet.querySelector('#sQuitar').onclick = () => {
        S.fijos = S.fijos.filter((x) => x !== real); guardar(); $sheet.close(); render(); toast('Quitado de tus pagos fijos');
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
      e.preventDefault(); const o = numero(e.target.o.value);
      if (o > 0) { S.metas.push({ id: 'm' + Date.now(), nombre: e.target.n.value.trim(), objetivo: o, ahorrado: 0 }); guardar(); }
      $sheet.close(); render();
    };
    $sheet.showModal();
  }
  function nuevoFijo() {
    $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">Nuevo pago fijo</div>
      <form id="sForm"><label class="field">Nombre<input name="n" placeholder="Gimnasio" required></label>
      <div class="tiles" style="margin-bottom:0"><label class="field">Importe (€)<input name="i" inputmode="decimal" required></label><label class="field">Día del cargo<input name="d" inputmode="numeric" value="1"></label></div>
      <label class="field">Palabra que aparece en el banco<input name="b" placeholder="gimnasio" required></label>
      <div class="field">¿Es una compra a plazos?<div class="seg" style="margin:0"><button type="button" data-pl="no" aria-pressed="true">No, es indefinido</button><button type="button" data-pl="si" aria-pressed="false">Sí, a plazos</button></div></div>
      <div id="sCuotas" hidden><div class="tiles" style="margin-bottom:0"><label class="field">¿Cuántas cuotas quedan?<input name="c" inputmode="numeric" placeholder="3"></label>
      <label class="field">¿La última es distinta? (€)<input name="u" inputmode="decimal" placeholder="Opcional"></label></div></div>
      <div class="btns"><button type="button" class="btn ghost" id="sCancel">Cancelar</button><button class="btn" type="submit">Añadir</button></div></form>`;
    $sheet.querySelectorAll('[data-pl]').forEach((b) => b.onclick = () => {
      $sheet.querySelectorAll('[data-pl]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $sheet.querySelector('#sCuotas').hidden = b.dataset.pl !== 'si';
    });
    $sheet.onclick = (e) => { if (e.target.closest('#sCancel') || e.target === $sheet) $sheet.close(); };
    $sheet.querySelector('#sForm').onsubmit = (e) => {
      e.preventDefault(); const t = e.target;
      const pal = escRe(t.b.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
      const imp = numero(t.i.value); const dia = Math.min(31, Math.max(1, Math.round(numero(t.d.value)) || 1));
      const nuevo = { id: 'f' + Date.now(), nombre: t.n.value.trim(), importe: imp, dia, busca: pal };
      const n = Math.round(numero(t.c.value));
      if (!$sheet.querySelector('#sCuotas').hidden && n >= 1) {
        nuevo.cuotas = generarCuotas(proximoDia(dia, masDias(hoyIso(), -1)), n, imp, numero(t.u.value));
        toast('La última cuota es el ' + fmtF(nuevo.cuotas[n - 1].fecha));
      }
      S.fijos.push(nuevo);
      guardar(); $sheet.close(); render();
    };
    $sheet.showModal();
  }

  /* ---------- Reglas y fijos personales (archivo o enlace) ---------- */
  const esReglas = (d) => !!(d && (d.reglasUsuario || d.palabras || d.importes || d.fijos));
  function cargarReglas(d) {
    const sinRepetir = (xs) => { const v = new Set(); return xs.filter((x) => { const k = JSON.stringify(x); if (v.has(k)) return false; v.add(k); return true; }); };
    Object.assign(S.reglas.reglasUsuario, d.reglasUsuario || {});
    S.reglas.palabras = sinRepetir(S.reglas.palabras.concat(d.palabras || []));
    S.reglas.importes = sinRepetir(S.reglas.importes.concat(d.importes || []));
    if (d.quitar) S.fijos = S.fijos.filter((f) => !d.quitar.includes(f.id));
    if (d.fijos) { const ids = new Set(d.fijos.map((f) => f.id)); S.fijos = S.fijos.filter((f) => !ids.has(f.id)).concat(d.fijos); }
  }
  // Enlace mágico: …/#cargar=<json en base64url>. Lo que va tras # nunca sale del móvil.
  function cargarDesdeEnlace() {
    const h = location.hash;
    if (!h.startsWith('#cargar=')) return false;
    history.replaceState(null, '', location.pathname + location.search + '#inicio');
    try {
      const b64 = h.slice(8).replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
      const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
      if (!esReglas(d)) throw 0;
      const n = (d.fijos || []).length;
      const r = Object.keys(d.reglasUsuario || {}).length + (d.palabras || []).length + (d.importes || []).length;
      if (!confirm(`¿Cargar en Brisa ${n} pagos fijos y ${r} reglas?`)) return false;
      cargarReglas(d); guardar(); setTimeout(() => toast('Reglas y fijos cargados'), 300);
    } catch (e) { setTimeout(() => toast('Ese enlace no es válido.'), 300); }
    return true;
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
    ['#bSubir', '#bSubirHome', '#bSubirAj'].forEach((s) => { if (q(s)) q(s).onclick = abrirSelector; });
    $app.querySelectorAll('[data-mov]').forEach((b) => b.onclick = () => abrirMov(b.dataset.mov));
    if (q('#bMas')) q('#bMas').onclick = () => { verTodos += 60; render(); };
    $app.querySelectorAll('[data-ritmo2]').forEach((b) => b.onclick = () => { S.perfil.ritmo = b.dataset.ritmo2; guardar(); render(); });
    if (q('#bAplicar')) q('#bAplicar').onclick = aplicarPresupuesto;
    if (q('#bProximos')) q('#bProximos').onclick = abrirProximos;
    if (q('#bAjustarAhorro')) q('#bAjustarAhorro').onclick = () => {
      pedirNumero('¿Cuánto tienes hoy en tu cuenta de ahorro?', Math.round(ahorro().saldo), (v) => {
        // Ese saldo ya incluye todo lo subido hasta hoy; a partir de aquí suma y resta lo nuevo
        S.ahorro = { base: v, vistos: S.movs.map((m) => m.id) }; guardar(); toast('Ahorro ajustado');
      });
    };
    if (q('#bNuevaMeta')) q('#bNuevaMeta').onclick = nuevaMeta;
    if (q('#bRetenido')) q('#bRetenido').onclick = () => pedirNumero('¿Cuánto tienes retenido ahora? (pon 0 si nada)', S.retenido ? S.retenido.importe : 0, (v) => {
      S.retenido = { importe: Math.max(0, v), fecha: hoyIso() }; guardar(); toast('Retenido actualizado');
    });
    $app.querySelectorAll('[data-fijo]').forEach((b) => b.onclick = () => abrirFijo(b.dataset.fijo, b.dataset.fecha));
    $app.querySelectorAll('[data-plazo]').forEach((b) => b.onclick = () => abrirPlazo(b.dataset.plazo));
    $app.querySelectorAll('[data-sug]').forEach((b) => b.onclick = () => abrirSugerido(b.dataset.sug));
    $app.querySelectorAll('[data-cal]').forEach((b) => b.onclick = () => { calMes = sumarMes(calMes || hoyIso().slice(0, 7), Number(b.dataset.cal)); calDia = null; render(); });
    $app.querySelectorAll('[data-dia]').forEach((b) => b.onclick = () => { calDia = calDia === b.dataset.dia ? null : b.dataset.dia; const y = window.scrollY; render(); window.scrollTo(0, y); });
    if (q('#bNuevoFijo')) q('#bNuevoFijo').onclick = nuevoFijo;
    if (r === 'ajustes') {
      $app.querySelectorAll('[data-campo]').forEach((inp) => inp.onchange = () => {
        const k = inp.dataset.campo; const v = inp.value;
        if (k === 'nombre') S.perfil.nombre = v.trim() || S.perfil.nombre;
        else if (k === 'ingresos') S.perfil.ingresos = numero(v);
        else if (k === 'diaCobro') S.perfil.diaCobro = Math.min(31, Math.max(1, numero(v) || 30));
        else if (k === 'limite') S.limiteRescates = numero(v);
        guardar(); toast('Guardado');
      });
      q('#bExport').onclick = () => {
        const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'brisa-copia-' + hoyIso() + '.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      q('#bImport').onclick = () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => {
          try {
            const d = JSON.parse(await inp.files[0].text());
            if (d.movs && d.reglas) { S = d; migrar(); guardar(); toast('Copia restaurada'); }
            else if (esReglas(d)) { cargarReglas(d); guardar(); toast('Reglas y fijos cargados'); }
            else throw 0;
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
  cargarDesdeEnlace();
  window.addEventListener('hashchange', () => { if (cargarDesdeEnlace()) render(); window.scrollTo(0, 0); render(); });
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
