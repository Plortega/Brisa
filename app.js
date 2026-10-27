/* Brisa · v0.4.9 — app web instalable. Todo se guarda en este móvil (localStorage). */
(function () {
  'use strict';
  const B = window.BrisaCategorizador;
  const KEY = 'brisa:v1';
  const VERSION_APP = '0.4.9';
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
  let DEV = null; // devoluciones por Bizum: idGasto → total devuelto (se rehace al guardar y al pintar)
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
    // v0.3.2: ¿Me lo compro? — compras reservadas y lista de deseos
    S.reservas = S.reservas || []; S.deseos = S.deseos || [];
    // v0.4.8: devoluciones por Bizum
    S.devol = S.devol || {}; S.devolNo = S.devolNo || {};
    // v0.4.9: Brisa te recomienda
    S.consejos = S.consejos || {}; ['no', 'tipoNo', 'cancelados'].forEach((k) => (S.consejos[k] = S.consejos[k] || {}));
    S.reglas = S.reglas || { reglasUsuario: {}, palabras: [], importes: [] };
    S.reglas.reglasUsuario = S.reglas.reglasUsuario || {}; S.reglas.palabras = S.reglas.palabras || []; S.reglas.importes = S.reglas.importes || [];
    if (S.perfil && !RITMOS[S.perfil.ritmo]) S.perfil.ritmo = 'equilibrado';
  }
  migrar();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  function guardar() {
    S.actualizado = Date.now(); DEV = null;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('No he podido guardar en este móvil.'); }
    subirPronto();
  }

  /* ---------- Nube (Supabase): una fila por persona con todo su estado ---------- */
  const CFG = window.BRISA_NUBE || {};
  let NUBE = null;
  try { if (CFG.url && CFG.clave && window.supabase) NUBE = window.supabase.createClient(CFG.url, CFG.clave, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'brisa:nube' } }); } catch (e) { NUBE = null; }
  const nube = { email: null, ultima: null, error: null, ocupada: false };
  let tSubir = null;
  function subirPronto() { if (!NUBE || !nube.email) return; clearTimeout(tSubir); tSubir = setTimeout(subir, 1500); }
  async function subir() {
    if (!NUBE || !nube.email) return;
    try {
      const { error } = await NUBE.from('estados').upsert({ datos: S, actualizado: new Date(S.actualizado || Date.now()).toISOString() });
      if (error) throw error;
      nube.ultima = Date.now(); nube.error = null;
    } catch (e) { nube.error = 'No he podido guardar en la nube'; console.error(e); }
  }
  // Trae la copia de la nube si es más nueva que la del móvil; si no, sube la del móvil
  async function bajar() {
    if (!NUBE || !nube.email || nube.ocupada) return;
    nube.ocupada = true;
    try {
      const { data, error } = await NUBE.from('estados').select('datos, actualizado').maybeSingle();
      if (error) throw error;
      const remota = data ? Date.parse(data.actualizado) : 0;
      if (data && remota > (S.actualizado || 0) + 1000) {
        S = data.datos; migrar(); DEV = null; S.actualizado = remota;
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
        nube.ultima = Date.now(); render(); toast('Datos al día desde la nube');
      } else if (S.perfil && (!data || (S.actualizado || 0) > remota + 1000)) await subir();
      else nube.ultima = Date.now();
      nube.error = null;
    } catch (e) { nube.error = 'Sin conexión con la nube'; console.error(e); }
    nube.ocupada = false;
  }
  /* ---------- Conexión directa con BBVA (función «banco» en Supabase + Enable Banking) ---------- */
  const banco = { ocupado: false };
  async function llamarBanco(accion, extra) {
    const { data, error } = await NUBE.functions.invoke('banco', { body: { accion, ...(extra || {}) } });
    if (error) {
      let msg = error.message;
      try { const d = await error.context.json(); msg = d.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  async function conectarBanco() {
    if (!NUBE || !nube.email) { location.hash = '#cuenta'; return; }
    try {
      toast('Abriendo BBVA…');
      const r = await llamarBanco('empezar', { redirect: location.origin + location.pathname });
      try { localStorage.setItem('brisa:banco-pendiente', String(Date.now())); } catch (e) {}
      location.href = r.url;
    } catch (e) { console.error(e); toast('No he podido abrir BBVA: ' + e.message); }
  }
  // Movimientos del banco → Brisa, sin repetir los que ya llegaron por Excel
  function incorporarBanco(r) {
    // Solo la cuenta principal: lo que llegó antes de otras cuentas (p. ej. la de ahorro) se quita
    const princ = (r.cuentas || []).find((c) => c.principal);
    if (princ) S.movs = S.movs.filter((m) => m.origen !== 'banco' || m.cuenta === princ.fin);
    if (S.banco && r.cuentas) S.banco.cuentas = r.cuentas;
    const leidos = (r.movimientos || []).map(taparMov);
    const refs = new Set(S.movs.map((m) => m.ref).filter(Boolean));
    const cuenta = {};
    for (const m of S.movs) { if (m.ref) continue; const k = m.fecha + '|' + Number(m.importe).toFixed(2); cuenta[k] = (cuenta[k] || 0) + 1; }
    const ids = new Set(S.movs.map((m) => m.id));
    const nuevos = []; const ahora = Date.now();
    leidos.forEach((m, i) => {
      if (refs.has(m.ref)) return;
      const k = m.fecha + '|' + Number(m.importe).toFixed(2);
      if (cuenta[k] > 0) { cuenta[k]--; return; } // ya estaba (del Excel)
      m.id = idMov(m); m.imp = ahora; m.ord = i;
      if (ids.has(m.id)) m.id += '|' + m.ref;
      ids.add(m.id); refs.add(m.ref); nuevos.push(m);
    });
    if (nuevos.length) {
      S.movs = S.movs.concat(nuevos).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const f = nuevos.map((m) => m.fecha).sort();
      S.ultimaImportacion = { cuando: hoyIso(), ids: nuevos.map((m) => m.id), duplicados: 0, desde: f[0], hasta: f[f.length - 1], banco: true };
    }
    // Lo retenido con tarjeta ya lo da el banco: no hace falta apuntarlo a mano
    if (typeof r.retenido === 'number') S.retenido = { importe: r.retenido, fecha: hoyIso(), auto: true };
    S.reservas = reservasActivas();
    return nuevos.length;
  }
  async function sincronizarBanco(aviso) {
    if (!NUBE || !nube.email || !S.banco || !S.banco.conectado || banco.ocupado) return;
    banco.ocupado = true; if (aviso) toast('Mirando BBVA…');
    try {
      const r = await llamarBanco('sincronizar');
      if (r.caducada) { S.banco.caducada = true; guardar(); render(); return; }
      const n = incorporarBanco(r);
      S.banco.ultima = Date.now(); S.banco.caducada = false; S.banco.error = null;
      guardar(); render();
      if (n || aviso) toast(n ? `${n} ${n === 1 ? 'movimiento nuevo' : 'movimientos nuevos'} de BBVA` : 'BBVA al día');
    } catch (e) { console.error(e); S.banco.error = e.message; guardar(); if (aviso) toast('No he podido hablar con BBVA'); render(); }
    banco.ocupado = false;
  }
  // Vuelta desde BBVA: ?code=…&state=… en la dirección
  const vuelta = (() => {
    // Solo es la vuelta de BBVA si trae «state» y la empezamos nosotros. El enlace del correo
    // de la nube también vuelve con ?code= y ese es para iniciar sesión: no hay que tocarlo.
    const q = new URLSearchParams(location.search);
    let esperando = false; try { esperando = !!localStorage.getItem('brisa:banco-pendiente'); } catch (e) {}
    if (!q.get('state') || !esperando || (!q.get('code') && !q.get('error'))) return null;
    try { localStorage.removeItem('brisa:banco-pendiente'); } catch (e) {}
    const v = { code: q.get('code'), state: q.get('state'), error: q.get('error'), desc: q.get('error_description') };
    history.replaceState(null, '', location.pathname + '#ajustes');
    return v;
  })();
  async function terminarConexion() {
    if (!vuelta) return;
    const v = vuelta; vuelta.hecho = true;
    if (v.error || !v.code) { toast('BBVA no ha dado permiso' + (v.desc ? ': ' + v.desc : '')); return; }
    try {
      toast('Conectando con BBVA…');
      const r = await llamarBanco('codigo', { code: v.code, state: v.state });
      const est = await llamarBanco('estado');
      S.banco = { conectado: true, hasta: est.valid_until, ultima: Date.now(), cuentas: est.cuentas };
      const n = incorporarBanco(r);
      guardar(); location.hash = '#inicio'; render();
      toast(`¡BBVA conectado! ${n} ${n === 1 ? 'movimiento nuevo' : 'movimientos nuevos'}`);
    } catch (e) { console.error(e); toast('No he podido terminar la conexión: ' + e.message); comprobarBanco(); }
  }
  // Si la conexión ya existe en la nube (p. ej. se creó desde otro móvil o la vuelta de BBVA
  // no llegó a apuntarse), la app la adopta y trae los movimientos.
  async function comprobarBanco() {
    if (!NUBE || !nube.email || banco.ocupado) return;
    try {
      const est = await llamarBanco('estado');
      if (est && est.conectado) {
        S.banco = { conectado: true, hasta: est.valid_until, ultima: 0, cuentas: est.cuentas, caducada: est.error === 'caducada' };
        guardar(); render();
        await sincronizarBanco(true);
      }
    } catch (e) { console.error(e); }
  }
  async function desconectarBanco() {
    if (!confirm('¿Desconectar BBVA? Brisa dejará de traer tus movimientos y volverás a subir el Excel.')) return;
    try { await llamarBanco('desconectar'); } catch (e) { console.error(e); }
    S.banco = null; guardar(); render(); toast('BBVA desconectado');
  }
  const bancoActivo = () => !!(S.banco && S.banco.conectado && !S.banco.caducada);
  function diasPermiso() { return S.banco && S.banco.hasta ? Math.ceil((Date.parse(S.banco.hasta) - Date.now()) / 86400000) : null; }

  function iniciarNube() {
    if (!NUBE) return;
    NUBE.auth.onAuthStateChange((ev, ses) => {
      const antes = nube.email;
      nube.email = ses && ses.user ? ses.user.email : null;
      if (nube.email && !antes) {
        bajar().then(() => {
          if (ruta() === 'cuenta') location.hash = S.perfil ? '#ajustes' : '#bienvenida';
          render();
          // Al abrir: termina la conexión con BBVA si venimos de autorizar, o trae lo nuevo cada 2 horas
          if (vuelta && !vuelta.hecho) terminarConexion();
          else if (!S.banco || !S.banco.conectado) comprobarBanco();
          else if (bancoActivo() && (!S.banco.ultima || Date.now() - S.banco.ultima > 2 * 3600000 || S.movs.some((m) => m.origen === 'banco' && !m.cuenta))) sincronizarBanco(false);
        });
      }
      else if (!nube.email && antes) render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      bajar().then(() => { if (bancoActivo() && (!S.banco.ultima || Date.now() - S.banco.ultima > 2 * 3600000)) sincronizarBanco(false); });
    });
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
  function haceCuanto(ms) {
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 2) return 'ahora mismo'; if (min < 60) return 'hace ' + min + ' min';
    const h = Math.round(min / 60); if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
    const d = Math.round(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
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
    bag: ic2('M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z', '<path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
    split: ic2('M18.5 14a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z', '<circle cx="14" cy="14" r="4.5"/><path d="M14 12v4"/><path d="M8 3.5 4.5 7 8 10.5"/><path d="M4.5 7h6.5a5 5 0 0 1 4.3 2.5"/>'),
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
    // Un Bizum que es la devolución de un gasto va con ese gasto y no cuenta como ingreso
    const gid = S.devol && S.devol[m.id];
    if (gid) {
      const g = S.movs.find((x) => x.id === gid);
      if (g) return { categoria: cat(g).categoria, confianza: 1, motivo: 'Te devolvieron parte de ' + nombreMov(g), cuentaComoGasto: false, devolucion: g.id };
    }
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
  // Gasto variable (el que resta del día a día) de un movimiento, antes de devoluciones
  function variableBase(m, c) {
    if (!c.cuentaComoGasto || deFijo(m)) return 0;
    if (c.reparto) return c.reparto.filter((p) => !esFijo(m, c, p.categoria)).reduce((a, p) => a - p.importe, 0);
    return esFijo(m, c, c.categoria) ? 0 : -m.importe;
  }
  // …y lo que de verdad pagaste tú: menos lo que te devolvieron por Bizum
  function variable(m, c) {
    const v = variableBase(m, c);
    return v > 0 ? Math.max(0, Math.round((v - devueltoDe(m.id)) * 100) / 100) : v;
  }

  /* ---------- Devoluciones por Bizum (v0.4.8) ---------- */
  // S.devol[idBizum] = idGasto · S.devolNo[idBizum] = true si no es una devolución
  const esBizumRecibido = (m) => m.importe > 0 && /^bizum/i.test(String(m.concepto || '').trim());
  function conceptoBizum(m) {
    const t = /recibido:\s*(.*)$/i.exec(m.concepto || '') || /recibido:\s*(.*)$/i.exec(m.tipo || '');
    const s = t ? t[1].trim() : '';
    return /^sin concepto$/i.test(s) ? '' : s;
  }
  function devueltoDe(id) {
    if (!DEV) {
      DEV = {}; const porId = new Map(S.movs.map((m) => [m.id, m]));
      for (const [b, g] of Object.entries(S.devol || {})) { const mb = porId.get(b); if (mb && porId.has(g)) DEV[g] = (DEV[g] || 0) + mb.importe; }
    }
    return DEV[id] || 0;
  }
  const SOCIALES = new Set(['Comer fuera', 'Ocio y planes', 'Transporte', 'Supermercado', 'Viajes', 'Regalos', 'Compras', 'Coche y gasolina']);
  const palabras = (s) => B.limpiar(s || '').split(/[^a-zñ0-9]+/).filter((w) => w.length >= 4 && !/^(concepto|bizum|recibido|gracias)$/.test(w));
  // Gastos de los que puede venir un Bizum: hasta 3 días antes, y que no le hayan devuelto ya todo
  function candidatosDevol(b, usado, manual) {
    const pb = palabras(conceptoBizum(b));
    const out = [];
    for (const g of S.movs) {
      if (g.importe >= 0) continue;
      const ds = [g.fecha, g.fechaValor].filter(Boolean).map((f) => dias(f, b.fecha));
      const d = Math.min(...ds.map((x) => (x >= (manual ? -1 : 0) ? Math.abs(x) : 99)));
      if (d > (manual ? 10 : 3)) continue;
      const c = cat(g); const base = variableBase(g, c);
      if (base <= 0) continue;
      const resto = Math.round((base - devueltoDe(g.id) - ((usado || {})[g.id] || 0)) * 100) / 100;
      if (!manual && (resto <= 0 || b.importe > resto * 1.1 + 0.01)) continue;
      const nom = B.limpiar(nombreMov(g) + ' ' + g.concepto);
      const coincide = pb.some((w) => nom.includes(w.slice(0, 4)));
      out.push({ g, c, resto, d, score: d * 10 - (coincide ? 15 : 0) + (SOCIALES.has(c.categoria) ? 0 : 6) + (b.importe > resto ? 2 : 0) });
    }
    return manual ? out.sort((a, z) => z.g.fecha.localeCompare(a.g.fecha) || a.score - z.score) : out.sort((a, z) => a.score - z.score);
  }
  // Bizum recibidos que parecen devoluciones, cada uno con su gasto más probable
  function sugerenciasDevol() {
    const usado = {}; const out = [];
    const bs = S.movs.filter((m) => esBizumRecibido(m) && !(S.devol || {})[m.id] && !(S.devolNo || {})[m.id])
      .sort((a, z) => a.fecha.localeCompare(z.fecha));
    for (const b of bs) {
      const k = candidatosDevol(b, usado)[0]; if (!k) continue;
      usado[k.g.id] = (usado[k.g.id] || 0) + b.importe;
      out.push({ b, g: k.g, c: k.c });
    }
    return out.reverse(); // lo más reciente primero
  }
  function enlazarDevol(b, g) { S.devol[b.id] = g.id; delete S.devolNo[b.id]; guardar(); }
  const esGrande = (m, c) => c.cuentaComoGasto && -m.importe >= GRANDE && !deFijo(m) && variable(m, c) > 0;
  function nombreMov(m) {
    // Lo que llega de BBVA conectado viene como «TIPO // SUBTIPO // COMERCIO»: el nombre es la última parte
    const partes = String(m.concepto || '').split(' // ');
    const ult = partes.length > 2 ? partes[partes.length - 1] : '';
    if (/^bizum/i.test(m.concepto)) {
      const t = (ult || m.tipo || '').replace(/^(enviado|recibido):\s*/i, '');
      return 'Bizum · ' + (/^\**$/.test(t.trim()) ? '' : t);
    }
    if (/^(transferencia|traspaso|adeudo|abono)/i.test(m.concepto) && m.tipo && !/^otros$/i.test(m.tipo)) return m.tipo;
    const l = B.limpiar(ult || m.concepto) || ult || m.concepto;
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
    // Compras de «¿Me lo compro?» que aún no han llegado en el Excel
    const reservas = reservasActivas();
    const reservado = reservas.reduce((a, r) => a + Number(r.importe), 0);
    let modoSaldo = false, disponible = null;
    if (ult && ult.fecha >= inicio) { modoSaldo = true; disponible = ult.saldo - pendiente - retenido - reservado; }
    const libre = Math.max(0, modoSaldo ? Math.min(queda - reservado, disponible) : queda - reservado);
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
      modoSaldo, retenido, reservado, reservas, saldo: ult ? ult.saldo : null, saldoFecha: ult ? ult.fecha : null, pendiente, fijosC, disponible, libre,
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

  /* ---------- ¿Me lo compro? ---------- */
  const PLZ_BUSCA = 'klarna(?!.*member)|scalapay';
  // Una reserva se cumple cuando llega en el Excel un cargo de su importe (±10 %, mínimo 1 €)
  // desde la víspera de la compra. Cada cargo cumple como mucho una reserva.
  function reservasActivas() {
    const usados = new Set();
    return (S.reservas || []).filter((r) => {
      const imp = Number(r.importe);
      const m = S.movs.find((x) => x.importe < 0 && !usados.has(x.id) && (x.fechaValor || x.fecha) >= masDias(r.fecha, -1) && x.fecha >= masDias(r.fecha, -1)
        && Math.abs(-x.importe - imp) <= Math.max(1, imp * 0.1) && !deFijo(x));
      if (m) { usados.add(m.id); return false; }
      return true;
    });
  }
  // Veredicto: go = adelante · tight = cabe pero muy justa · next = después del cobro · rescue = solo rescatando
  function juzgarCompra(c, A, modo, n) {
    const L = c.libre;
    const enCiclo = modo === 'plazos' ? A / n : A;
    const left = L - enCiclo;
    const ratio = L > 0 ? c.hoyPuedes / L : 1 / Math.max(1, c.restantes);
    const diario = Math.max(0, left) * ratio;
    const B = Math.max(1, c.presupuesto);
    let kind;
    if (left >= 0 && diario >= 4) kind = 'go';
    else if (left >= 0) kind = 'tight';
    else if (modo !== 'plazos' && A <= B * 0.25) kind = 'next';
    else kind = 'rescue';
    return { enCiclo, left, diario, kind, rescate: Math.max(0, -left), B };
  }
  const CQ = { item: '', importe: '', modo: 'once', n: 4, hecho: null };
  const PIX_LOST = PIX.empty.replace(/#FADCE8/g, '#FFFFFF').replace('<svg', '<svg style="opacity:.55"');
  function resultadoCompra() {
    const c = ciclo();
    if (CQ.hecho) {
      const h = CQ.hecho;
      return `<section class="hero pop" style="background:var(--mint)">
        ${orn(22, '#fff', 'top:16px;right:20px')}
        <div class="pix" style="font-size:13px;color:var(--mint-d);letter-spacing:.5px">RESERVADO</div>
        <div class="h1" style="font-size:24px;margin:6px 0 8px;padding-right:36px">Hecho: ${esc(h.nombre.toLowerCase())}</div>
        <p style="margin:0;font-size:14px;line-height:1.45;color:#2E4A3C">${h.tipo === 'plazos'
          ? `He apuntado ${h.n} cuotas de ${eur(h.cuota, true)} en tus pagos fijos; la primera la resto ya. Hoy puedes gastar ${eur(c.hoyPuedes)}. Cuando el cargo aparezca en el Excel, lo cruzo solo.`
          : `He restado ${eur(h.importe, true)} de tu número del día: ahora hoy puedes gastar ${eur(c.hoyPuedes)}. Cuando el cargo aparezca en el Excel, lo cruzo y quito la reserva.`}</p>
        <div class="btns" style="margin-top:14px"><a class="btn" href="#inicio" style="background:var(--mint-d)">Volver a Inicio</a><button type="button" class="btn ghost" id="cqUndo" style="width:auto;background:transparent;border:1.5px solid var(--mint-d);color:var(--mint-d)">Deshacer</button></div>
      </section>`;
    }
    const A = numero(CQ.importe);
    if (!(A > 0)) return `<div class="card dash" style="text-align:center;color:var(--muted);line-height:1.5">Escribe qué quieres y cuánto cuesta. Brisa te dice cómo queda tu día, tus corazones y tu meta.</div>`;
    const nombre = CQ.item.trim() || 'Esto';
    const plazos = CQ.modo === 'plazos';
    const j = juzgarCompra(c, A, CQ.modo, CQ.n);
    const cuota = A / CQ.n;
    const ultMes = MESES_L[(aDate(hoyIso()).getMonth() + CQ.n - 1) % 12];
    const usados = c.rescates - c.forzados; const lim = Number(S.limiteRescates) || 0;
    let v;
    if (j.kind === 'go') v = { tag: 'ADELANTE', bg: 'var(--mint)', tc: 'var(--mint-d)', t: 'Sí, cabe sin tocar tu ahorro', b: plazos
      ? `Hoy pagas la 1.ª cuota (${eur(cuota, true)}) y las otras ${CQ.n - 1} van a tus pagos fijos hasta ${ultMes}. Hoy podrías gastar ${eur(j.diario)}.`
      : `${esc(nombre)} entra en lo que te queda este mes. Hoy podrías gastar ${eur(j.diario)} en vez de ${eur(c.hoyPuedes)}.` };
    else if (j.kind === 'tight') v = { tag: 'ESPERA AL COBRO', bg: 'var(--butter)', tc: 'var(--butter-d)', t: 'Cabe, pero te deja muy justa',
      b: `Te quedarían ${eur(j.diario)} al día hasta el ${aDate(c.fin).getDate()}. Si esperas a cobrar (en ${c.restantes} días), lo pagas sin apretarte.` };
    else if (j.kind === 'next') v = { tag: 'ESPERA AL COBRO', bg: 'var(--butter)', tc: 'var(--butter-d)', t: `Después del ${aDate(c.fin).getDate()}, sí`,
      b: `Este mes te faltan ${eur(j.rescate)}. Con la nómina entra sin tocar tu ahorro: el mes que viene te quedarían ${eur((j.B - A) / 30)} al día.` };
    else {
      const margen = lim - usados - j.rescate;
      v = { tag: 'SOLO RESCATANDO', bg: 'var(--rose)', tc: 'var(--berry-d)', t: 'Tocaría tu ahorro',
        b: `Te faltan ${eur(j.rescate)}: tendrías que rescatarlos del ahorro. Llevas ${eur(usados)} de ${eur(lim)} este mes${margen < 0 ? `, así que te pasarías en ${eur(-margen)}.` : ` y te quedarían ${eur(margen)} de margen.`}${plazos ? '' : ' Pagarlo a plazos o esperar al cobro lo suaviza.'}` };
    }
    const base = Math.max(1, c.presupuesto);
    const hAntes = corazonesN(c), hDesp = Math.max(0, Math.min(10, Math.round(Math.max(0, j.left) / base * 10)));
    const w = (x) => x.replace('<svg', '<svg width="21" height="18"');
    const hearts = w(PIX.full).repeat(hDesp) + w(PIX_LOST).repeat(Math.max(0, hAntes - hDesp)) + w(PIX.empty).repeat(10 - Math.max(hAntes, hDesp));
    const meta = ahorro().metas.find((x) => x.ahorrado < x.objetivo);
    const porDia = c.P.paraTi / 30;
    const retraso = j.kind === 'rescue' && porDia > 0 ? Math.ceil(j.rescate / porDia) : 0;
    const filas = [
      ['Hoy puedes gastar', eur(c.hoyPuedes), eur(j.diario), j.diario < 4 ? 'var(--berry)' : 'var(--mint-d)'],
      ['Del ahorro', '', j.kind === 'rescue' ? 'Rescatas ' + eur(j.rescate) : 'Nada', j.kind === 'rescue' ? 'var(--berry)' : 'var(--mint-d)'],
      [meta ? esc(meta.nombre) : 'Tu ahorro', '', j.kind !== 'rescue' ? 'Llega igual' : retraso ? retraso + (retraso === 1 ? ' día' : ' días') + ' más tarde' : '−' + eur(j.rescate), j.kind === 'rescue' ? 'var(--berry)' : 'var(--mint-d)']
    ];
    if (plazos) filas.push(['Pagos fijos', '', '+' + eur(cuota, true) + '/mes hasta ' + ultMes, 'var(--lilac-d)']);
    return `<section class="hero" style="background:${v.bg}">
        ${orn(24, '#fff', 'top:16px;right:20px')}${orn(12, '#fff', 'top:48px;right:52px')}
        <div class="pix" style="font-size:13px;color:${v.tc};letter-spacing:.5px">${v.tag}</div>
        <div class="h1" style="font-size:24px;margin:6px 0 8px;padding-right:40px;line-height:1.15">${v.t}</div>
        <p style="margin:0;font-size:14px;line-height:1.45;color:#4A2E3C">${v.b}</p>
      </section>
      <div class="card" style="padding:4px 16px">
        <div style="padding:12px 0 10px;border-bottom:1px solid var(--line)">
          <div class="row small"><span class="muted">Tus corazones</span><span style="color:#6A3A50"><b>${hDesp}</b> de 10 · ${hAntes > hDesp ? 'pierdes ' + (hAntes - hDesp) : 'no pierdes ninguno'}</span></div>
          <div class="hearts" role="img" aria-label="Te quedarían ${hDesp} de 10 corazones">${hearts}</div>
        </div>
        ${filas.map((f, i) => `<div class="row" style="min-height:44px;${i < filas.length - 1 ? 'border-bottom:1px solid var(--line)' : ''}"><span class="small muted">${f[0]}</span><span style="white-space:nowrap">${f[1] ? `<span class="small muted" style="text-decoration:line-through">${f[1]}</span> ` : ''}<b class="num" style="font-size:16px;color:${f[3]}">${f[2]}</b></span></div>`).join('')}
      </div>
      <button type="button" class="btn" id="cqBuy">${j.kind === 'rescue' ? 'Me lo compro igualmente' : 'Me lo compro'}</button>
      <button type="button" class="btn ghost" id="cqSave" style="margin-top:8px;border:1.5px dashed var(--rose3);color:var(--berry-d)">${ic2('M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z', '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>', ' width="18" height="18"')}Guardar para luego</button>
      <p class="xs muted" style="text-align:center;line-height:1.4;margin:8px 0 0">Si lo compras, lo reservo y lo resto de tu número del día hasta que aparezca en el Excel.</p>`;
  }
  function estadoDeseo(c, a) {
    const k = juzgarCompra(c, a, 'once', 1).kind;
    if (k === 'go') return { t: 'Cabe ya', bg: 'var(--mint)', co: 'var(--mint-d)', cabe: true };
    if (k === 'tight' || k === 'next') return { t: 'Después del ' + aDate(c.fin).getDate(), bg: 'var(--butter)', co: 'var(--butter-d)' };
    return { t: 'Aún no cabe · te aviso', bg: 'var(--rose)', co: 'var(--berry-d)' };
  }
  function comprar() {
    const A = numero(CQ.importe); if (!(A > 0)) return;
    const nombre = CQ.item.trim() || 'Compra';
    const hoy = hoyIso();
    if (CQ.modo === 'plazos') {
      const n = CQ.n; const cuota = Math.round(A / n * 100) / 100;
      const fijo = { id: 'f' + Date.now(), nombre: nombre + ' · a plazos', importe: cuota, dia: Number(hoy.slice(8, 10)), busca: PLZ_BUSCA,
        cuotas: generarCuotas(hoy, n, cuota, Math.round((A - cuota * (n - 1)) * 100) / 100) };
      S.fijos.push(fijo);
      CQ.hecho = { tipo: 'plazos', fijoId: fijo.id, nombre, cuota, n };
    } else {
      const r = { id: 'r' + Date.now(), nombre, importe: Math.round(A * 100) / 100, fecha: hoy };
      S.reservas.push(r);
      CQ.hecho = { tipo: 'once', resId: r.id, nombre, importe: r.importe };
    }
    // Si venía de la lista de deseos, sale de ella
    S.deseos = S.deseos.filter((d) => !(d.nombre === nombre && Math.abs(d.importe - A) < 0.01));
    guardar(); render();
  }
  function deshacerCompra() {
    const h = CQ.hecho; if (!h) return;
    if (h.tipo === 'plazos') S.fijos = S.fijos.filter((x) => x.id !== h.fijoId);
    else S.reservas = S.reservas.filter((r) => r.id !== h.resId);
    CQ.hecho = null; guardar(); render(); toast('Deshecho');
  }

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
      // Los que ya trajo la conexión con BBVA no se repiten
      const delBanco = {};
      for (const m of S.movs) { if (!m.ref) continue; const k = m.fecha + '|' + Number(m.importe).toFixed(2); delBanco[k] = (delBanco[k] || 0) + 1; }
      leidos.forEach((m, i) => {
        m.id = idMov(m); m.imp = ahora; m.ord = i;
        if (ids.has(m.id)) { dup++; return; }
        const kb = m.fecha + '|' + Number(m.importe).toFixed(2);
        if (delBanco[kb] > 0) { delBanco[kb]--; dup++; return; }
        ids.add(m.id); nuevos.push(m);
      });
      S.movs = S.movs.concat(nuevos).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const fechas = leidos.map((m) => m.fecha).sort();
      S.ultimaImportacion = { cuando: hoyIso(), ids: nuevos.map((m) => m.id), duplicados: dup, desde: fechas[0], hasta: fechas[fechas.length - 1] };
      // Las compras reservadas que ya han llegado en el Excel dejan de reservarse
      S.reservas = reservasActivas();
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

  R.cuenta = () => {
    const volver = S.perfil ? '#ajustes' : '#bienvenida';
    if (!NUBE) return `<div class="top"><a class="icon-btn" href="${volver}" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Tu cuenta${SPARK}</h1></div><div class="empty">La nube aún no está configurada.</div>`;
    if (nube.email) return `<div class="top"><a class="icon-btn" href="${volver}" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Tu cuenta${SPARK}</h1></div>
      <section class="hero"><b>Has entrado como ${esc(nube.email)}</b><p class="small" style="color:#4A2E3C;line-height:1.5;margin:6px 0 0">Tus datos se guardan solos en la nube cada vez que cambian.</p></section>
      <a class="btn" href="${volver}">Seguir</a>`;
    return `
    <div class="top"><a class="icon-btn" href="${volver}" aria-label="Volver">${IC.back}</a><h1 style="flex-grow:1">Tu cuenta${SPARK}</h1></div>
    <section class="hero" style="margin-bottom:18px">
      ${orn(22, '#fff', 'top:18px;right:22px', 'tw')}${heart(12, '#E27FA8', 'top:58px;right:24px')}
      <div class="h1" style="font-size:24px;padding-right:40px">Guarda Brisa en la nube</div>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#4A2E3C">Así no pierdes nada si cambias de móvil o borras Chrome. Sin contraseñas: te mando un enlace a tu correo.</p>
    </section>
    <form id="fCuenta">
      <label class="field">Tu correo<input name="email" type="email" autocomplete="email" inputmode="email" required placeholder="tu@correo.com"></label>
      <button class="btn" type="submit">Enviarme el enlace</button>
    </form>
    <div id="cuentaOk" class="card" style="background:var(--mint);border:0;margin-top:14px" hidden><b>¡Mira tu correo!</b><p class="small" style="margin:4px 0 0;line-height:1.5">Toca el enlace desde este móvil y ábrelo en Chrome. Volverás a Brisa con tu cuenta lista.</p></div>
    <p class="xs muted" style="line-height:1.5;margin-top:14px">Tus datos se guardan en Europa y solo tú puedes verlos.</p>`;
  };

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
    </form>
    ${NUBE && !S.perfil ? `<p class="small" style="text-align:center;margin-top:16px">¿Ya usabas Brisa en otro móvil? <a href="#cuenta">Entra y recupera tus datos</a></p>` : ''}`;
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
      if (c.devolucion) porCat[c.categoria] = (porCat[c.categoria] || 0) - m.importe;
      if (c.cuentaComoGasto) {
        const partes = c.reparto || [{ categoria: c.categoria, importe: m.importe }];
        for (const p of partes) porCat[p.categoria] = (porCat[p.categoria] || 0) - p.importe;
      }
    }
    delete porCat['Por revisar'];
    const top = Object.entries(porCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
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

  function tarjetaDevol() {
    const s = sugerenciasDevol(); if (!s.length) return '';
    const p = s[0]; const con = conceptoBizum(p.b);
    return linkCard({ attrs: 'id="bDevol"', style: 'background:var(--sky)', icStyle: 'color:var(--sky-d)', icon: IC.split,
      titulo: s.length === 1 ? `¿Te devolvieron ${eur(p.b.importe, true)} de ${esc(nombreMov(p.g))}?` : `${s.length} Bizum parecen devoluciones`,
      sub: s.length === 1 ? `Bizum ${con ? '«' + esc(con) + '»' : 'sin concepto'} · un toque y cuento solo tu parte` : 'Te devolvieron parte de algún gasto · un toque y cuento solo tu parte',
      subStyle: 'color:var(--sky-d)' });
  }

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
      <div style="font-size:13px;line-height:1.5;color:#4A2E3C;margin-bottom:10px">${c.disponible > 0 ? 'Con lo que tienes de verdad:' : 'Ojo: tus pagos pendientes superan tu saldo.'} <b>${eur(c.saldo)}</b> en cuenta${c.retenido ? ` − <a href="#fijos" style="color:var(--berry-d)">${eur(c.retenido)} retenido</a>` : ''} − <a href="#fijos" style="color:var(--berry-d)">${eur(c.pendiente)} de fijos</a>${c.reservado ? ` − <a href="#comprar" style="color:var(--berry-d)">${eur(c.reservado)} reservado</a>` : ''}.</div>` : `
      <div style="font-size:14px;line-height:1.45;color:#4A2E3C;margin-bottom:12px">${c.queda >= 0 ? `Sin pasarte hasta el ${finTxt} y apartando ${eur(c.ahorro)} para ti.` : `Te has pasado ${eur(-c.queda)} este mes. Mañana lo vemos con calma.`}${c.reservado ? ` Ya descuento <a href="#comprar" style="color:var(--berry-d)">${eur(c.reservado)} reservado</a>.` : ''}</div>`}
      <div class="hearts" role="img" aria-label="Te quedan ${n} de 10 corazones: ${eur(c.libre)} libres de ${eur(c.presupuesto)}">${corazones(n, 21, 18)}</div>
      <div class="row small" style="color:#6A3A50;margin-top:8px"><span style="white-space:nowrap">Te quedan ${n} de 10 ♡ · ${eur(c.libre)}</span><span style="white-space:nowrap">Hasta el ${aDate(c.fin).getDate()} · ${c.restantes} días</span></div>
    </section>
    <a class="cq-pill" href="#comprar"><span class="ic">${IC.bag}</span><b>¿Me lo compro?</b>${S.deseos.length ? `<span class="cnt">${S.deseos.length} ${S.deseos.length === 1 ? 'deseo' : 'deseos'}</span>` : ''}${IC.chev}</a>
    ${tarjetaConsejo()}
    ${S.deseos.filter((d) => estadoDeseo(c, d.importe).cabe).slice(0, 1).map((d) => linkCard({ attrs: `data-deseo="${esc(d.id)}"`, style: 'background:var(--mint)', icStyle: 'color:var(--mint-d)', icon: IC.bag,
      titulo: `Ya cabe: ${esc(d.nombre)} (${eur(d.importe)})`, sub: 'Está en tu lista de deseos · toca para decidir', subStyle: 'color:var(--mint-d)' })).join('')}
    ${faltanFijos() ? linkCard({ href: '#fijos', style: 'background:var(--peach)', icStyle: 'color:var(--peach-d)', icon: IC.alert, titulo: 'Faltan tus pagos fijos', sub: 'Sin ellos tu número del día sale más alto de lo real. Añádelos o cárgalos desde Ajustes', subStyle: 'color:#5A4238' }) : ''}
    ${pronto.map((q) => linkCard({ href: '#fijos', style: 'background:#fff;border:1px solid var(--line)', icStyle: 'background:var(--lilac);color:var(--lilac-d)', icon: IC.cal,
      titulo: `${cuando(q.fecha).charAt(0).toUpperCase() + cuando(q.fecha).slice(1)} te cobran ${eur(q.pendiente, true)}`, sub: esc(q.fijo.nombre) + (q.de ? ` · cuota ${q.n} de ${q.de}` : '') + ' · ya está reservado' })).join('')}
    ${c.finde.length ? linkCard({ href: '#finde', style: 'background:var(--peach)', icStyle: 'color:var(--peach-d)', icon: IC.sun, titulo: `${aDate(hoy).getDay() >= 5 || aDate(hoy).getDay() === 0 ? 'Este finde te quedan' : 'Este finde puedes gastar'} ${eur(c.findeTotal)}`, sub: 'Viernes a domingo · repartido según tus hábitos', subStyle: 'color:#5A4238' }) : ''}
    ${sug.length ? linkCard({ href: '#fijos', style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.repeat, titulo: sug.length === 1 ? 'Un pago se repite cada mes' : sug.length + ' pagos se repiten cada mes', sub: '¿Es un pago fijo? Un toque y lo apunto', subStyle: 'color:var(--butter-d)' }) : ''}
    ${S.retenido && S.retenido.importe > 0 && S.ultimaImportacion && S.retenido.fecha < S.ultimaImportacion.cuando ? linkCard({ href: '#fijos', style: 'background:var(--lilac)', icStyle: 'color:var(--lilac-d)', icon: IC.card, titulo: `¿Sigue retenido ${eur(S.retenido.importe)}?`, sub: 'Has subido un Excel nuevo: actualízalo para no descontarlo dos veces', subStyle: 'color:var(--lilac-d)' }) : ''}
    ${S.banco && S.banco.caducada ? linkCard({ attrs: 'id="bBanco"', style: 'background:var(--peach)', icStyle: 'color:var(--peach-d)', icon: IC.alert, titulo: 'Renueva el permiso con BBVA', sub: 'Ha caducado: un minuto y vuelvo a traer tus movimientos solos', subStyle: 'color:#5A4238' })
      : bancoActivo() ? (diasPermiso() !== null && diasPermiso() <= 7 ? linkCard({ attrs: 'id="bBanco"', style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.alert, titulo: `Tu permiso con BBVA caduca en ${Math.max(0, diasPermiso())} ${diasPermiso() === 1 ? 'día' : 'días'}`, sub: 'Renuévalo ahora para no volver al Excel', subStyle: 'color:var(--butter-d)' }) : '')
        + linkCard({ attrs: 'id="bSyncBanco"', style: 'background:#fff;border:1px solid var(--line)', icStyle: 'background:var(--sky);color:var(--sky-d)', icon: IC.repeat, titulo: 'Movimientos de BBVA al día', sub: (S.banco.ultima ? 'Última vez ' + haceCuanto(S.banco.ultima) : 'Aún sin traer') + ' · toca para actualizar' + (S.banco.error ? ' · último intento con error' : '') })
      : linkCard({ attrs: 'id="bSubirHome"', style: viejo ? 'background:var(--sky)' : 'background:#fff;border:1px solid var(--line)', icStyle: (viejo ? '' : 'background:var(--sky);') + 'color:var(--sky-d)', icon: IC.file, titulo: viejo ? 'Toca subir el Excel' : 'Subir el Excel de la semana', sub: 'Datos hasta el ' + fmtF(ultimo) })}
    ${linkCard({ href: '#metas', style: 'background:#fff;border:1.5px dashed #F0C3D5', icStyle: 'background:var(--rose);color:var(--berry)', icon: IC.uturn, titulo: `Rescates: ${eur(c.rescates - c.forzados)} de ${eur(S.limiteRescates)}`, sub: c.forzados ? `Más ${eur(c.forzados)} para cubrir números rojos` : 'Lo que ha vuelto de tu ahorro este mes' })}
    ${plz.length > 1 ? linkCard({ href: '#fijos', style: 'background:var(--butter)', icStyle: 'color:var(--butter-d)', icon: IC.card, titulo: `${plz.length} cargos de pago a plazos`, sub: [...new Set(plz.map((p) => p.prov))].join(', ') + ' · ¿cuántas cuotas quedan?', subStyle: 'color:var(--butter-d)' }) : tarjetaPlazos(plz)}
    ${tarjetaDevol()}
    ${rev ? linkCard({ href: '#movimientos', style: 'background:var(--peach)', icStyle: 'color:var(--peach-d)', icon: IC.spark, titulo: `${rev} ${rev === 1 ? 'movimiento' : 'movimientos'} por revisar`, sub: 'Un toque cada uno y los aprendo', subStyle: 'color:#5A4238' }) : ''}
    ${linkCard({ href: '#semana', style: 'background:var(--mint)', icStyle: 'color:var(--mint-d)', icon: IC.cal, titulo: 'Tu semana en 1 minuto', sub: (!S.semanaVista || dias(S.semanaVista, hoyIso()) >= 6) ? '4 tarjetas. Sin Excel, sin cuentas.' : 'Ya la has visto esta semana', subStyle: 'color:#3B4A43' })}`;
  };

  /* ---------- Brisa te recomienda (v0.4.9) ---------- */
  // Consejos calculados en el móvil con tus propios datos, sin IA ni internet.
  // S.consejos = { no: {clave: fecha}, tipoNo: {tipo: true}, cancelados: {grupo: {fecha, importe, nombre}} }
  IC.trend = ic2('M4 17.5l5.5-5.5 3.5 3.5L20 8v9.5z', '<path d="M4 17.5l5.5-5.5 3.5 3.5L20 8"/><path d="M15 8h5v5"/>');
  IC.receipt = ic2('M6 3.5h12v17l-3-2-3 2-3-2-3 2z', '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12.5h6"/>');
  IC.house = ic2('M5 10.5 12 4.5l7 6V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z', '<path d="M5 10.5 12 4.5l7 6V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z"/><path d="M10 20.5v-5h4v5"/>');
  IC.pie = ic2('M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z', '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12h8.5"/>');
  // Mismo comercio aunque cambie la referencia: «Spotifyes» y «Spotify P47E…» son el mismo grupo
  // (con el concepto en bruto: el limpiador corta tras varios espacios y «Uber   *one» quedaría en «uber»)
  const RUIDO = new Set(['www', 'com', 'es', 'help', 'sl', 'sa', 'eu', 'pago', 'payments']);
  function palabrasGrupo(m) {
    const partes = String(m.concepto || '').split(' // ');
    const bruto = (partes.length > 2 ? partes[partes.length - 1] : m.concepto || '').replace(/\s{5,}.*$/, '');
    return bruto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*./_-]/g, ' ')
      .split(/\s+/).filter((x) => x && !/\d/.test(x)).map((x) => x.replace(/[^a-zñ]/g, ''))
      .filter((x, i, a) => x.length >= 2 && !RUIDO.has(x) && x !== a[i - 1]).slice(0, 3);
  }
  const claveGrupo = (m) => palabrasGrupo(m).map((x) => x.slice(0, 7)).join(' ');
  // «Klarna*klarna member» → «Klarna member»
  function nombreGrupo(m) {
    const n = palabrasGrupo(m).join(' ');
    return n.length >= 3 ? n.charAt(0).toUpperCase() + n.slice(1) : nombreMov(m);
  }
  // Cargos que se repiten una vez al mes (suscripciones y parecidos), sin plazos ni Bizum
  function recurrentes() {
    const g = {}; const desde = masDias(hoyIso(), -200); const rePlz = new RegExp(PLZ_BUSCA, 'i');
    for (const m of S.movs) {
      if (m.importe >= 0 || m.fecha < desde || -m.importe > 120 || /^bizum/i.test(m.concepto)) continue;
      if (rePlz.test(B.limpiar(m.concepto + ' ' + m.tipo))) continue;
      if (!cat(m).cuentaComoGasto || (S.fijos || []).some((x) => esCuotas(x) && encajaFijo(x, m))) continue;
      const k = claveGrupo(m); if (k) (g[k] = g[k] || []).push(m);
    }
    const out = [];
    for (const [k, ms] of Object.entries(g)) {
      ms.sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (ms.length < 2 || new Set(ms.map((m) => m.fecha.slice(0, 7))).size < ms.length) continue;
      if (!ms.slice(1).every((m, i) => { const d = dias(ms[i].fecha, m.fecha); return d >= 20 && d <= 40; })) continue;
      out.push({ clave: k, nombre: nombreGrupo(ms[ms.length - 1]), movs: ms, ultimo: ms[ms.length - 1] });
    }
    return out;
  }
  // Membresías que solo compensan si las usas
  const MEMBRESIAS = [
    { es: /uber.*one/, uso: /uber.*(eats|trip|rides)/, nombre: 'Uber One' },
    { es: /glovo.*prime/, uso: /glovo(?!.*prime)/, nombre: 'Glovo Prime' },
    { es: /just ?eat.*(plus|\+)/, uso: /just ?eat(?!.*(plus|\+))/, nombre: 'Just Eat+' },
    { es: /cabify.*(club|plus)/, uso: /cabify(?!.*(club|plus))/, nombre: 'Cabify' }
  ];
  function consejos(todos) {
    const C = S.consejos; const hoy = hoyIso(); const L = [];
    if (!S.movs.length) return L;
    const c = ciclo();
    const transcurridos = Math.max(1, dias(c.inicio, hoy));
    const dCobro = aDate(c.fin).getDate();
    // 1 · Ritmo del ciclo
    if (c.modoSaldo && c.disponible < 0) {
      L.push({ clave: 'ritmo|' + c.fin, tipo: 'ritmo', prio: 100, aviso: true, icon: IC.alert, etiqueta: 'AVISO',
        titulo: c.saldo < 0 ? `Quedan ${c.restantes} ${c.restantes === 1 ? 'día' : 'días'} y vas en ${eur(c.saldo)}` : 'Tus pagos pendientes superan tu saldo',
        sub: (c.pendiente > 0 && c.saldo < 0 ? `Y aún faltan ${eur(c.pendiente)} de pagos fijos. ` : '') + (c.restantes <= 7
          ? 'Hasta el cobro, solo lo imprescindible. Lo que no gastes ahora, no se lo debes al mes que viene.'
          : `Mira qué puedes parar o retrasar hasta el día ${dCobro}.`),
        corto: 'Hasta el cobro, solo lo imprescindible', acciones: [['ok', 'Entendido', 1]] });
    } else if (transcurridos >= 5) {
      const ritmoDia = c.gastado / transcurridos;
      const base = c.modoSaldo ? c.disponible : c.queda - c.reservado;
      const proy = base - ritmoDia * c.restantes;
      if (proy < -20) L.push({ clave: 'ritmo|' + c.fin, tipo: 'ritmo', prio: 90, aviso: true, icon: IC.alert, etiqueta: 'AVISO',
        titulo: `A este ritmo acabas en −${eur(-proy)}`,
        sub: `Vas gastando unos ${eur(ritmoDia)} al día. Para llegar al ${dCobro}, como mucho ${eur(c.libre / c.restantes)} al día.`,
        corto: `Para llegar, como mucho ${eur(c.libre / c.restantes)} al día`, acciones: [['ok', 'Entendido', 1]] });
    }
    // 2 · Te han vuelto a cobrar algo que cancelaste
    const rec = recurrentes();
    for (const [k, x] of Object.entries(C.cancelados)) {
      const g = rec.find((r) => r.clave === k) || { movs: S.movs.filter((m) => m.importe < 0 && claveGrupo(m) === k) };
      const m = g.movs.find((mm) => (mm.fechaValor || mm.fecha) > masDias(x.fecha, 2));
      if (m) L.push({ clave: 'recobro|' + k + '|' + m.id, tipo: 'recobro', prio: 80, aviso: true, icon: IC.alert, etiqueta: 'OJO',
        titulo: `${esc(x.nombre)} te ha vuelto a cobrar`, sub: `${eur(-m.importe, true)} el ${fmtF(m.fecha)}. Lo marcaste como cancelado el ${fmtF(x.fecha)}: revisa que la baja se hizo.`,
        corto: 'Revisa que la baja se hizo', acciones: [['ok', 'Lo miro', 1]] });
    }
    // 3 · Categorías que se pasan del tope (o de tu media) a mitad de mes
    const topes = (S.plan && S.plan.topes) || {};
    const largo = Math.max(1, dias(c.inicio, c.fin)); const frac = Math.min(1, transcurridos / largo);
    const cats = Object.keys(AJUSTABLES).map((k) => {
      const ref = topes[k] || c.H.porCat[k] || 0; const act = c.porCat[k] || 0;
      if (ref < 20) return null;
      if (act > ref && act - ref >= 10) return { k, ref, act, pasado: true, peso: act - ref };
      if (frac < 0.8 && act >= ref * 0.5 && act > ref * frac * 1.3) return { k, ref, act, pasado: false, peso: act - ref * frac };
      return null;
    }).filter(Boolean).sort((a, b) => b.peso - a.peso).slice(0, 2);
    for (const x of cats) L.push({ clave: 'cat|' + x.k + '|' + c.fin + '|' + (x.pasado ? 'p' : 'r'), tipo: 'categoria', prio: x.pasado ? 70 : 65, icon: IC.pie,
      etiqueta: x.pasado ? 'TE HAS PASADO' : 'VA RÁPIDO',
      titulo: x.pasado ? `${esc(x.k)}: ${eur(x.act)} de ${eur(x.ref)}` : `${esc(x.k)} va rápido`,
      sub: x.pasado ? `Te has pasado ${eur(x.act - x.ref)} de tu ${topes[x.k] ? 'tope' : 'media'}. ${esc(AJUSTABLES[x.k])}.`
        : `Llevas ${eur(x.act)} de ${eur(x.ref)} y quedan ${c.restantes} días. ${esc(AJUSTABLES[x.k])}.`,
      corto: x.pasado ? `Te has pasado ${eur(x.act - x.ref)}` : `Llevas ${eur(x.act)} de ${eur(x.ref)}`,
      acciones: [['ok', 'Entendido'], ['#presupuesto', 'Ver presupuesto', 1]] });
    // 4 · Subidas de precio en cargos que se repiten
    for (const r of rec) {
      if (C.cancelados[r.clave]) continue;
      const a = -r.movs[r.movs.length - 2].importe; const b = -r.ultimo.importe;
      if (b > a * 1.15 && b - a >= 0.5 && dias(r.ultimo.fecha, hoy) <= 45) L.push({ clave: 'subida|' + r.clave + '|' + b, tipo: 'subida', prio: 60, icon: IC.trend, etiqueta: 'SUBIDA DE PRECIO',
        grupo: r.clave, nombre: r.nombre, importe: b, mov: r.ultimo.id,
        titulo: `${esc(r.nombre)} ha subido`, sub: `Pagabas ${eur(a, true)} y desde ${MESES_L[aDate(r.ultimo.fecha).getMonth()]} son ${eur(b, true)}. Son ${eur((b - a) * 12)} más al año.`,
        corto: `De ${eur(a, true)} a ${eur(b, true)} al mes`, acciones: [['quedo', 'Me lo quedo'], ['cancel', 'Ya lo cancelé', 1]], nunca: true });
    }
    // 5 · Membresías que casi no usas (últimos 90 días)
    const hace90 = masDias(hoy, -90);
    for (const mb of MEMBRESIAS) {
      const r = rec.find((x) => mb.es.test(x.clave)); if (!r || C.cancelados[r.clave]) continue;
      const pagos = r.movs.filter((m) => m.fecha >= hace90); if (pagos.length < 2) continue;
      const usos = S.movs.filter((m) => m.importe < 0 && m.fecha >= hace90 && mb.uso.test(claveGrupo(m)) && !mb.es.test(claveGrupo(m))).length;
      if (usos > 3) continue;
      const coste = pagos.reduce((s, m) => s - m.importe, 0);
      L.push({ clave: 'uso|' + r.clave + '|' + hoy.slice(0, 7), tipo: 'uso', prio: 50, icon: IC.receipt, etiqueta: 'CASI NO LO USAS',
        grupo: r.clave, nombre: mb.nombre, importe: -r.ultimo.importe, mov: r.ultimo.id,
        titulo: `${mb.nombre}: ${eur(coste, true)} en 3 meses`, sub: `Lo pagas cada mes, pero solo lo has usado ${usos === 0 ? 'ninguna vez' : usos === 1 ? 'una vez' : usos + ' veces'}.`,
        corto: `Solo lo has usado ${usos === 1 ? 'una vez' : usos + ' veces'} en 3 meses`, acciones: [['quedo', 'Me lo quedo'], ['cancel', 'Ya lo cancelé', 1]], nunca: true });
    }
    // 6 · Rescates por encima de tu límite
    const usado = c.rescates - c.forzados;
    if (usado > S.limiteRescates && S.limiteRescates > 0) L.push({ clave: 'resc|' + c.fin, tipo: 'rescates', prio: 40, icon: IC.uturn, etiqueta: 'RESCATES',
      titulo: `Has rescatado ${eur(usado)} este mes`, sub: `Tu límite es ${eur(S.limiteRescates)}. Si te pasa cada mes, es mejor apartar menos y no tocarlo.`,
      corto: `Tu límite es ${eur(S.limiteRescates)}`, acciones: [['ok', 'Entendido'], ['#metas', 'Ver metas', 1]], nunca: true });
    const vivos = todos ? L : L.filter((k) => !C.no[k.clave] && !C.tipoNo[k.tipo]);
    return vivos.sort((a, b) => b.prio - a.prio);
  }
  function tarjetaConsejo() {
    const L = consejos(); if (!L.length) return '';
    const k = L[0];
    return `<a class="rec-home ${k.aviso ? 'av' : ''}" href="#consejos">
      <span class="row"><span class="pix lab">${SPARK.replace('class="spark"', 'class="spark" style="margin:0 4px 0 0;width:12px;height:12px;vertical-align:-1px"')}BRISA TE RECOMIENDA</span><span class="cnt">${L.length}</span></span>
      <span class="rec-h"><span class="ic">${k.icon}</span><span class="t"><b>${k.titulo}</b><span class="small">${k.corto || k.sub}</span></span></span>
      <span class="xs mas">${L.length > 1 ? 'Ver los ' + L.length + ' consejos' : 'Ver el consejo'} ›</span></a>`;
  }
  const YS = { nombre: '', importe: '', cuando: 'proximo' };
  // Cobro siguiente a una fecha de cobro
  function siguienteCobro(f) {
    const D = S.perfil ? Number(S.perfil.diaCobro) || 30 : 30; const d = aDate(f);
    return iso(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(D, new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate())));
  }
  function resultadoYSi() {
    const x = numero(YS.importe);
    if (!(x > 0)) return '<p class="small muted" style="margin:4px 0 0;line-height:1.5">Escribe cuánto sería al mes y te digo cómo te afecta, mes a mes, con tus fijos y tus plazos.</p>';
    const c = ciclo(); const filas = []; let ini = c.fin;
    for (let k = 0; k < 4; k++) {
      const fin = siguienteCobro(ini); const P = plan(ini, fin, c.H);
      filas.push({ mes: MESES_L[aDate(masDias(ini, 15)).getMonth()], sin: P.sobra, con: P.sobra - x }); ini = fin;
    }
    const ult = filas[filas.length - 1];
    const ahoraTxt = YS.cuando === 'ahora' ? (() => {
      const queda = c.libre - x;
      return `<div class="ys-now ${queda < 0 ? 'mal' : ''}"><b>Este mes</b><span>${queda < 0 ? `No llegas: te faltarían ${eur(-queda)} hasta el ${aDate(c.fin).getDate()}.` : `Te quedarían ${eur(queda)}: unos ${eur(queda / c.restantes)} al día hasta el ${aDate(c.fin).getDate()}.`}</span></div>`;
    })() : '';
    const A = ahorro(); const meta = A.metas.find((m) => m.ahorrado < m.objetivo);
    const etaTxt = (s) => { if (!meta || s <= 0) return null; const d = new Date(); d.setMonth(d.getMonth() + Math.ceil((meta.objetivo - meta.ahorrado) / s)); return MESES_L[d.getMonth()] + ' de ' + d.getFullYear(); };
    const e1 = etaTxt(ult.sin), e2 = etaTxt(ult.con);
    return `${ahoraTxt}
      <div class="ys-t"><span></span><span class="xs muted">Sin él</span><span class="xs muted">Con él</span></div>
      ${filas.map((f) => `<div class="ys-t"><span>${f.mes.charAt(0).toUpperCase() + f.mes.slice(1)}</span><span class="num">${eur(f.sin)}</span><span class="num" style="color:${f.con < 0 ? 'var(--berry)' : 'var(--mint-d)'}">${f.con < 0 ? '−' + eur(-f.con) : eur(f.con)}</span></div>`).join('')}
      <p class="small" style="line-height:1.5;margin:10px 0 0">${ult.con >= 0 ? `Con tu gasto normal (${eur(c.P.normal)} al mes) te sobrarían unos <b>${eur(ult.con)} al mes</b>.` : `Con tu gasto normal (${eur(c.P.normal)} al mes) <b>no te llega</b>: tendrías que gastar ${eur(-ult.con)} menos al mes.`}${e1 && meta ? ` «${esc(meta.nombre)}»: ${e2 ? (e1 === e2 ? 'lista en ' + e2 + ', igual que sin él' : 'lista en ' + e2 + ' en vez de ' + e1) : 'sin fecha, porque no te sobraría nada'}.` : ''}</p>
      <button type="button" class="btn small ghost" id="ysFijo" style="margin-top:12px">Apuntarlo en pagos fijos</button>`;
  }
  R.consejos = () => {
    if (!S.movs.length) return R.inicio();
    const L = consejos();
    const silenciados = Object.keys(S.consejos.no).length + Object.keys(S.consejos.tipoNo).length;
    const tarjeta = (k) => `<section class="rec ${k.aviso ? 'av' : ''}">
      <div class="rec-h"><span class="ic">${k.icon}</span><div class="t"><div class="pix lab">${k.etiqueta}</div><b>${k.titulo}</b><p class="small">${k.sub}</p></div></div>
      <div class="rec-b">${k.acciones.map(([a, t, p]) => a.charAt(0) === '#' ? `<a class="btn small ${p ? '' : 'ghost'}" href="${a}">${t}</a>` : `<button type="button" class="btn small ${p ? '' : 'ghost'}" data-rk="${esc(k.clave)}" data-ra="${a}">${t}</button>`).join('')}</div>
      ${k.nunca ? `<button type="button" class="rec-no" data-rk="${esc(k.clave)}" data-ra="nunca">No me lo vuelvas a decir</button>` : ''}
    </section>`;
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver a Inicio">${IC.back}</a><div style="flex-grow:1"><h1>Brisa te recomienda${SPARK}</h1><div class="small muted">Lo que veo en tu cuenta. Se calcula en tu móvil.</div></div></div>
    ${L.length ? L.map(tarjeta).join('') : `<section class="hero" style="text-align:center">${orn(18, '#fff', 'top:16px;right:22px', 'tw')}<div class="h1" style="font-size:22px">Todo en orden</div><p class="small" style="color:#4A2E3C;line-height:1.5;margin:6px 0 0">Ahora mismo no veo nada que mejorar. Si cambia algo, te aviso aquí.</p></section>`}
    <section class="rec ys">
      <div class="rec-h"><span class="ic">${IC.house}</span><div class="t"><div class="pix lab">¿Y SI…?</div><b>Prueba un gasto nuevo antes de decir que sí</b></div></div>
      <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px;margin-top:12px">
        <label class="field" style="margin:0">¿Qué es?<input id="ysN" value="${esc(YS.nombre)}" placeholder="Alquiler" autocomplete="off"></label>
        <label class="field" style="margin:0">Al mes (€)<input id="ysI" inputmode="decimal" value="${esc(YS.importe)}" placeholder="200" autocomplete="off"></label>
      </div>
      <div class="seg" role="group" aria-label="Cuándo empieza" style="margin:10px 0 4px">
        <button type="button" data-ysc="proximo" aria-pressed="${YS.cuando !== 'ahora'}">Con el próximo cobro</button>
        <button type="button" data-ysc="ahora" aria-pressed="${YS.cuando === 'ahora'}">Este mes</button>
      </div>
      <div id="ysRes">${resultadoYSi()}</div>
    </section>
    ${silenciados ? `<button type="button" class="btn ghost small" id="bRecReset" style="margin:6px auto 0">Volver a ver lo que silencié (${silenciados})</button>` : ''}`;
  };
  function accionConsejo(clave, a) {
    const k = consejos(true).find((x) => x.clave === clave); if (!k) return;
    const C = S.consejos;
    if (a === 'nunca') { C.tipoNo[k.tipo] = true; toast('Vale, no te lo vuelvo a decir'); }
    else if (a === 'cancel') {
      C.cancelados[k.grupo] = { fecha: hoyIso(), importe: k.importe, nombre: k.nombre };
      // Si estaba en tus pagos fijos, deja de contar desde el mes que viene
      const m = S.movs.find((x) => x.id === k.mov);
      const fx = m && (S.fijos || []).find((x) => !esCuotas(x) && !x.hasta && encajaFijo(x, m));
      if (fx) fx.hasta = hoyIso().slice(0, 7);
      toast(`¡Bien hecho! ${eur(k.importe * 12)} al año que se quedan contigo` + (fx ? '. Lo quito de tus pagos fijos' : ''));
    } else { C.no[clave] = hoyIso(); toast(a === 'quedo' ? 'Vale, no te lo vuelvo a decir' : 'Hecho'); }
    guardar(); render();
  }

  R.comprar = () => {
    if (!S.movs.length) return R.inicio();
    const c = ciclo();
    const chip = (attr, val, label, on) => `<button type="button" class="chip-b" ${attr}="${val}" aria-pressed="${on}">${label}</button>`;
    return `
    <div class="top"><a class="icon-btn" href="#inicio" aria-label="Volver a Inicio">${IC.back}</a><div style="flex-grow:1"><h1>¿Me lo compro?${SPARK}</h1><div class="small muted">Pregúntale a Brisa antes de pagar</div></div></div>
    <section class="card dash" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:10px">
        <label class="field" style="margin:0">¿Qué es?<input id="cqItem" value="${esc(CQ.item)}" placeholder="Unas zapatillas" autocomplete="off"></label>
        <label class="field" style="margin:0">¿Cuánto? (€)<input id="cqImp" inputmode="decimal" value="${esc(CQ.importe)}" placeholder="0" autocomplete="off"></label>
      </div>
      <div class="chips">${[25, 120, 300, 600].map((x) => chip('data-cqp', x, x + ' €', String(x) === String(CQ.importe))).join('')}</div>
      <div>
        <div class="field" style="margin-bottom:8px">¿Cómo lo pagarías?</div>
        <div class="seg" role="group" aria-label="Forma de pago" style="margin-bottom:${CQ.modo === 'plazos' ? '10px' : '0'}">
          <button type="button" data-cqm="once" aria-pressed="${CQ.modo !== 'plazos'}">De una vez</button>
          <button type="button" data-cqm="plazos" aria-pressed="${CQ.modo === 'plazos'}">A plazos</button>
        </div>
        ${CQ.modo === 'plazos' ? `<div class="chips" style="align-items:center"><span class="small muted">Cuotas</span>${[3, 4, 6].map((x) => chip('data-cqn', x, x + ' cuotas', CQ.n === x)).join('')}</div>
        <p class="xs muted" style="margin:8px 0 0;line-height:1.4">Klarna o Scalapay: la 1.ª cuota se paga hoy y el resto va a tus pagos fijos.</p>` : ''}
      </div>
    </section>
    <div id="cqRes">${resultadoCompra()}</div>
    ${c.reservas.length ? `<div class="card" style="padding:12px 16px;margin-top:12px">
      <b class="small" style="font-weight:800">Reservado, esperando al Excel</b>
      ${c.reservas.map((r) => `<div class="row small" style="min-height:40px"><span>${esc(r.nombre)} <span class="muted">· ${fmtF(r.fecha)}</span></span><span style="display:flex;align-items:center;gap:4px"><b>${eur(r.importe, true)}</b><button type="button" class="icon-btn sm" style="border:0" data-cqx="${esc(r.id)}" aria-label="Quitar la reserva de ${esc(r.nombre)}">${IC.close}</button></span></div>`).join('')}
    </div>` : ''}
    <div class="row" style="align-items:baseline;margin:20px 0 10px"><span class="h1" style="font-size:20px">Tu lista de deseos</span><span class="xs muted">Te aviso cuando quepa</span></div>
    ${S.deseos.length ? S.deseos.map((d) => { const e = estadoDeseo(c, d.importe); return `<div class="card" style="display:flex;align-items:center;gap:8px;padding:10px 6px 10px 14px;margin-bottom:8px">
      <div style="display:flex;flex-direction:column;gap:4px;flex-grow:1;min-width:0"><b style="font-size:14px">${esc(d.nombre)} · ${eur(d.importe)}</b><span class="chip" style="align-self:flex-start;font-size:11px;font-weight:800;background:${e.bg};color:${e.co}">${e.t}</span></div>
      <button type="button" class="btn ghost small" data-cqv="${esc(d.id)}" style="color:var(--berry-d)">Mirar</button>
      <button type="button" class="icon-btn sm" style="border:0" data-cqd="${esc(d.id)}" aria-label="Quitar ${esc(d.nombre)} de la lista">${IC.close}</button>
    </div>`; }).join('') : '<div class="card dash small" style="text-align:center;color:var(--muted)">Aún no hay nada guardado.</div>'}`;
  };

  /* ---------- Tu semana en 1 minuto ---------- */
  const SEM = { paso: 0 };
  const CONSEJOS = [
    ['Fijo y variable', 'Lo fijo (gimnasio, seguros, suscripciones) no lo decides cada semana. Lo variable (comer fuera, compras, el finde) sí. Ahí está tu margen para ahorrar.'],
    ['La regla de las 24 horas', 'Si algo no es urgente, guárdalo en tu lista de deseos y míralo mañana. La mitad de las veces ya no te apetece tanto.'],
    ['A plazos no es gratis', 'Pagar en cuotas no hace la compra más barata: solo reparte el golpe. Cada cuota es un pago fijo más que te come el número del día de los próximos meses.'],
    ['Págate primero', 'BBVA aparta tu ahorro nada más cobrar. Lo difícil no es apartarlo, es no rescatarlo: cada traspaso de vuelta deshace un poco el trabajo.'],
    ['El finde sale el lunes', 'Las compras del sábado aparecen en el Excel con fecha del lunes. Brisa usa la fecha valor, la del día en que compraste de verdad.'],
    ['Los gastos grandes', 'Un gasto de 200 € o más no es tu gasto normal: Brisa lo avisa aparte. Si se repiten, merece la pena tener una meta para ellos.']
  ];
  function datosSemana() {
    const c = ciclo();
    const fv = (m) => m.fechaValor || m.fecha;
    const fin = S.movs.reduce((a, m) => (fv(m) > a ? fv(m) : a), S.movs[0].fecha);
    const ini = masDias(fin, -6), ini0 = masDias(fin, -13), fin0 = masDias(fin, -7);
    let gasto = 0, gasto0 = 0, rescates = 0; const porCat = {}; const grandes = [];
    for (const m of S.movs) {
      const f = fv(m); if (f < ini0 || f > fin) continue;
      const k = cat(m); const v = variable(m, k);
      if (f >= ini) {
        if (k.categoria === 'Rescate del ahorro' && m.importe > 0) rescates += m.importe - (typeof m.saldo === 'number' ? Math.min(m.importe, Math.max(0, m.importe - m.saldo)) : 0);
        if (v <= 0) continue;
        if (esGrande(m, k)) { grandes.push(m); continue; }
        gasto += v;
        const partes = k.reparto ? k.reparto.filter((p) => !esFijo(m, k, p.categoria)) : [{ categoria: k.categoria, importe: -v }];
        for (const p of partes) porCat[p.categoria] = (porCat[p.categoria] || 0) - p.importe;
      } else if (f <= fin0 && v > 0 && !esGrande(m, k)) gasto0 += v;
    }
    delete porCat['Por revisar'];
    const top = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0] || null;
    const semanal = c.presupuesto * 7 / 30.4;
    const topes = (S.plan && S.plan.topes) || {};
    return { c, ini, fin, gasto, gasto0, rescates, grandes, top, semanal, topes };
  }
  function tarjetasSemana() {
    const d = datosSemana(); const c = d.c;
    const cards = [];
    const dif = d.gasto - d.gasto0;
    cards.push({ tag: 'ESTA SEMANA', bg: 'var(--rose)', tc: 'var(--berry-d)', t: 'Gastaste<br>' + eur(d.gasto),
      b: (d.gasto0 > 0 ? (Math.abs(dif) < 5 ? 'Casi lo mismo que la semana anterior.' : dif < 0 ? `Son ${eur(-dif)} menos que la semana anterior. Vas en buena dirección.` : `Son ${eur(dif)} más que la semana anterior. Sin drama: miramos dónde.`) : 'Del ' + fmtF(d.ini) + ' al ' + fmtF(d.fin) + ', con la fecha real de cada compra.')
        + (d.grandes.length ? ` Aparte, ${d.grandes.length === 1 ? 'un gasto grande' : d.grandes.length + ' gastos grandes'}: ${d.grandes.map((m) => esc(nombreMov(m)) + ' (' + eur(-m.importe) + ')').join(', ')}.` : ''),
      big: d.gasto0 > 0 ? ['La semana anterior', eur(d.gasto0)] : ['Tu ritmo semanal', eur(d.semanal)] });
    if (d.top) {
      const [k, v] = d.top;
      const tope = d.topes[k] ? d.topes[k] * 7 / 30.4 : null;
      const normal = (c.H.porCat[k] || 0) * 7 / 30.4;
      const ref = tope || normal;
      cards.push({ tag: 'DONDE MÁS', bg: 'var(--peach)', tc: 'var(--peach-d)', t: esc(k) + ':<br>' + eur(v),
        b: !(ref > 0) ? 'Es lo que más se ha llevado esta semana. Cuando tenga más meses tuyos, te diré si es mucho o poco para ti.' : v > ref * 1.1 ? 'Por encima de lo que sueles. Es lo más fácil de ajustar sin notarlo mucho: un poco menos aquí ya se nota.' : 'Dentro de lo normal para ti. Es tu categoría más alta, pero va bien.',
        big: ref > 0 ? [tope ? 'Tu límite semanal' : 'Tu semana normal', eur(ref)] : null });
    } else cards.push({ tag: 'DONDE MÁS', bg: 'var(--peach)', tc: 'var(--peach-d)', t: 'Semana<br>tranquila', b: 'No veo gastos del día a día en estos 7 días. ¿Has subido el Excel de la semana?', big: null });
    const sem = Math.floor((aDate(d.fin) - new Date(2026, 0, 5)) / (7 * 86400000));
    const [ct, cb] = CONSEJOS[((sem % CONSEJOS.length) + CONSEJOS.length) % CONSEJOS.length];
    cards.push({ tag: 'APRENDE EN 20 SEGUNDOS', bg: 'var(--butter)', tc: 'var(--butter-d)', t: ct, b: cb, big: null });
    const meta = ahorro().metas.find((x) => x.ahorrado < x.objetivo);
    const bigMeta = meta ? [esc(meta.nombre), `${eur(meta.ahorrado)} / ${eur(meta.objetivo)}`] : null;
    const sobra = d.semanal - d.gasto;
    if (d.rescates > 0) cards.push({ tag: 'TU SIGUIENTE PASO', bg: 'var(--mint)', tc: 'var(--mint-d)', t: 'Esta semana<br>rescataste ' + eur(d.rescates),
      b: 'La semana que viene, intenta dejar el ahorro quieto. Si algo te tienta, pregúntaselo antes a Brisa en «¿Me lo compro?».', big: ['Rescates del mes', `${eur(c.rescates - c.forzados)} / ${eur(S.limiteRescates)}`] });
    else if (sobra > 5) cards.push({ tag: 'TU SIGUIENTE PASO', bg: 'var(--mint)', tc: 'var(--mint-d)', t: 'Te sobraron<br>' + eur(sobra),
      b: 'Si los pasas a tu ahorro en la app de BBVA antes del finde, no se gastan solos. Brisa lo verá en tu próximo Excel.', big: bigMeta });
    else cards.push({ tag: 'TU SIGUIENTE PASO', bg: 'var(--mint)', tc: 'var(--mint-d)', t: 'Semana<br>movida',
      b: `Te pasaste ${eur(-sobra)} de tu ritmo. Ya lo he repartido entre los días que quedan hasta el ${aDate(c.fin).getDate()}.`, big: ['Hoy puedes gastar', eur(c.hoyPuedes)] });
    return cards;
  }
  R.semana = () => {
    if (!S.movs.length) return R.inicio();
    const cards = tarjetasSemana();
    const p = Math.min(SEM.paso, cards.length - 1); const k = cards[p]; const ult = p === cards.length - 1;
    return `
    <div class="row" style="margin-bottom:18px"><a class="icon-btn" href="#inicio" aria-label="Cerrar">${IC.close}</a><span class="small muted">Tu semana en 1 minuto</span><span style="width:44px"></span></div>
    <div style="display:flex;gap:6px;margin-bottom:18px">${cards.map((x, i) => `<i style="flex:1;height:4px;border-radius:2px;background:${i <= p ? 'var(--rose2)' : 'var(--line2)'}"></i>`).join('')}</div>
    <section class="hero sem-card pop" style="background:${k.bg}">
      ${orn(38, '#fff', 'top:26px;right:26px', 'tw')}${orn(16, '#fff', 'top:72px;right:70px', 'tw d2')}${heart(16, '#fff', 'bottom:104px;right:30px')}${orn(12, '#fff', 'bottom:130px;right:58px', 'tw d4')}
      <div class="pix" style="font-size:13px;color:${k.tc};letter-spacing:.5px">${k.tag}</div>
      <div class="h1" style="font-size:36px;line-height:1.12;letter-spacing:-.8px;padding-right:44px">${k.t}</div>
      <p style="margin:0;font-size:17px;line-height:1.5;color:#4A2E3C">${k.b}</p>
      <div style="flex-grow:1"></div>
      ${k.big ? `<div class="row" style="background:rgba(255,255,255,.72);border-radius:22px;padding:16px 18px"><span class="small" style="color:#4A2E3C">${k.big[0]}</span><span class="num" style="font-size:24px">${k.big[1]}</span></div>` : ''}
    </section>
    <div class="btns">${p > 0 ? '<button type="button" class="btn ghost" id="semAtras">Atrás</button>' : ''}<button type="button" class="btn" id="semSig">${ult ? 'Listo' : 'Siguiente'}</button></div>`;
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
        <span class="t"><span class="n">${esc(nombreMov(m))}</span><span class="xs muted"><span class="chip" style="background:${COLORES[c.categoria] || '#fff'}">${esc(c.categoria)}</span> ${fmtF(m.fecha)}${c.aplazado ? ' · aplazado' : ''}${c.devolucion ? ' · devolución' : ''}${devueltoDe(m.id) ? (-m.importe - devueltoDe(m.id) > 0.004 ? ' · tu parte ' + eur(-m.importe - devueltoDe(m.id), true) : ' · te salió gratis') : ''}</span></span>
        <span class="amt ${m.importe > 0 ? 'pos' : ''}">${m.importe > 0 ? '+' : ''}${eur(m.importe, true)}</span></button>`;
    };
    return `
    <div class="top"><div><h1>Movimientos${SPARK}</h1><div class="small muted">Del Excel que subiste. Tú solo confirmas lo dudoso.</div></div></div>
    ${S.movs.length ? `<div class="card" style="background:var(--mint);border:0;display:flex;gap:12px;align-items:center"><span style="color:var(--mint-d);width:22px;height:22px;display:inline-flex">${IC.spark}</span><span><b>${S.movs.length - rev.length} de ${S.movs.length}</b> ordenados solos${rev.length ? '<br><span class="small">' + rev.length + ' necesitan un vistazo</span>' : ''}</span></div>` : ''}
    ${tarjetaDevol()}
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
    ${NUBE ? `<div class="aj-lbl">Tu cuenta</div>
    <div class="aj-grp">
      ${nube.email ? filaAj({ t: 'Guardado en la nube', s: esc(nube.email) + ' · ' + (nube.error ? nube.error : nube.ultima ? 'al día' : 'conectando…') })
        + (S.banco && S.banco.conectado
          ? filaAj({ btn: S.banco.caducada ? 'bBanco' : 'bSyncBanco', t: S.banco.caducada ? 'Renovar permiso con BBVA' : 'BBVA conectado', s: S.banco.caducada ? 'El permiso ha caducado' : 'Permiso hasta el ' + (S.banco.hasta ? fmtF(S.banco.hasta.slice(0, 10)) : '—') + ' · ' + (S.banco.ultima ? 'al día ' + haceCuanto(S.banco.ultima) : 'sin traer aún') })
            + filaAj({ btn: 'bDesBanco', t: 'Desconectar BBVA', s: 'Vuelves a subir el Excel a mano' })
          : filaAj({ btn: 'bBanco', t: 'Conectar con BBVA', s: 'Tus movimientos llegan solos: adiós al Excel' }))
        + filaAj({ btn: 'bSalir', t: 'Cerrar sesión', s: 'Tus datos se quedan en este móvil y en la nube' })
        : filaAj({ href: '#cuenta', t: 'Guardar en la nube', s: 'Para no perder nada si cambias de móvil. También hace falta para conectar BBVA' })}
    </div>` : ''}
    <div class="aj-lbl">Privacidad</div>
    <div class="aj-grp">
      ${filaAj({ btn: 'bCandado', t: 'Entrar con huella', s: (leerC() && leerC().on) ? (leerC().cred ? 'Huella o PIN' : 'Con PIN') + ' si llevas más de 5 min sin usarla' : 'Nadie más ve tus cuentas', v: (leerC() && leerC().on) ? 'Activado' : 'No' })}
    </div>
    <div class="aj-lbl">Tus datos</div>
    <div class="aj-grp">
      ${filaAj({ t: 'Tu nombre', input: `<input class="aj-in" data-campo="nombre" value="${esc(p.nombre)}" aria-label="Tu nombre" style="width:120px;text-align:left">` })}
      ${filaAj({ btn: 'bExport', t: 'Descargar copia', s: `Todo vive solo en este móvil: ${S.movs.length} movimientos, ${nReglas} reglas y ${S.fijos.length} pagos fijos` })}
      ${filaAj({ btn: 'bImport', t: 'Restaurar copia o reglas', s: 'Desde un archivo .json' })}
      ${filaAj({ href: 'guia.html', t: 'Guía de uso', s: 'Cómo funciona cada pantalla y qué pasa con tus datos' })}
    </div>
    <button class="btn ghost" id="bBorrar" style="color:var(--berry);border:0;background:none">Borrar todos mis datos</button>
    <p class="xs muted" style="text-align:center;margin-top:8px">Brisa v${VERSION_APP}</p>`;
  };

  /* ---------- Hoja para cambiar la categoría ---------- */
  function abrirMov(id) {
    const m = S.movs.find((x) => x.id === id); if (!m) return;
    const c = cat(m);
    let elegida = c.categoria === 'Por revisar' ? null : c.categoria;
    const dev = devueltoDe(m.id);
    if (c.devolucion) {
      // Bizum ya enlazado: se ve de qué gasto es y se puede deshacer
      const g = S.movs.find((x) => x.id === c.devolucion);
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">${esc(nombreMov(m))}</div><div class="small muted">${fmtF(m.fecha)} · +${eur(m.importe, true)} · devolución</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
        <div class="card dash" style="margin:14px 0;padding:4px 16px">${filaDv(g, esc(cat(g).categoria))}
          <div class="row small" style="min-height:44px"><span>Te devolvieron ${eur(devueltoDe(g.id), true)}</span><span>${tuParte(g)}</span></div></div>
        <p class="small" style="line-height:1.5;margin:0 0 14px">No cuenta como ingreso: lo resto de ese gasto para que «${esc(cat(g).categoria)}» cuente solo lo que pagaste tú.</p>
        <button class="btn ghost" id="sElegir">Es de otro gasto</button>
        <p style="text-align:center;margin:14px 0 0" class="small"><a href="#movimientos" id="sDeshacer">No es una devolución</a></p>`;
      $sheet.onclick = (e) => {
        if (e.target.closest('#sCerrar') || e.target === $sheet) { $sheet.close(); return; }
        if (e.target.closest('#sElegir')) { elegirGasto(m); return; }
        if (e.target.closest('#sDeshacer')) { e.preventDefault(); delete S.devol[m.id]; S.devolNo[m.id] = true; guardar(); $sheet.close(); render(); toast('Vuelve a contar como ingreso'); }
      };
      $sheet.showModal(); return;
    }
    const dibujar = () => {
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">${esc(nombreMov(m))}</div><div class="small muted">${fmtF(m.fecha)} · ${eur(m.importe, true)}</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
        ${c.motivo ? `<p class="xs muted" style="margin:8px 0 0">${esc(c.motivo)}</p>` : ''}
        ${dev ? `<div class="card" style="background:var(--sky);border:0;margin:12px 0 0;padding:10px 16px;color:var(--sky-d)"><div class="row small"><span>Te devolvieron ${eur(dev, true)} por Bizum</span><span>${tuParte(m)}</span></div></div>` : ''}
        ${esBizumRecibido(m) ? `<button class="btn ghost" id="sEsDevol" style="margin-top:12px">${IC.split.replace('<svg', '<svg width="18" height="18" style="vertical-align:-4px;margin-right:6px;color:var(--sky-d)"')}Es una devolución de…</button>` : ''}
        <div class="cats">${ELEGIBLES.map((k) => `<button data-cat="${esc(k)}" aria-pressed="${elegida === k}"><span class="dot" style="background:${COLORES[k]};border:1px solid #E8D5DC"></span>${esc(k)}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="sRecordar" checked> Recordarlo para los parecidos</label>
        <button class="btn" id="sGuardar" ${elegida ? '' : 'disabled style="opacity:.5"'}>Guardar</button>`;
    };
    dibujar();
    $sheet.onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) { elegida = b.dataset.cat; const r = $sheet.querySelector('#sRecordar').checked; dibujar(); $sheet.querySelector('#sRecordar').checked = r; return; }
      if (e.target.closest('#sCerrar') || e.target === $sheet) { $sheet.close(); return; }
      if (e.target.closest('#sEsDevol')) { elegirGasto(m); return; }
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

  /* ---------- Hojas de devoluciones por Bizum ---------- */
  const filaDv = (m, extra) => `<div class="mov" style="cursor:default">
      <span class="av" style="background:${m.importe > 0 ? 'var(--sky)' : COLORES[cat(m).categoria] || '#fff'};color:${m.importe > 0 ? 'var(--sky-d)' : 'inherit'}">${m.importe > 0 ? IC.split.replace('<svg', '<svg width="20" height="20"') : esc(nombreMov(m).charAt(0).toUpperCase())}</span>
      <span class="t"><span class="n">${m.importe > 0 ? 'Bizum ' + (conceptoBizum(m) ? '«' + esc(conceptoBizum(m)) + '»' : 'sin concepto') : esc(nombreMov(m))}</span><span class="xs muted">${fmtF(m.fecha)}${extra ? ' · ' + extra : ''}</span></span>
      <span class="amt ${m.importe > 0 ? 'pos' : ''}">${m.importe > 0 ? '+' : ''}${eur(m.importe, true)}</span></div>`;
  function tuParte(g, b) {
    const queda = Math.round((variableBase(g, cat(g)) - devueltoDe(g.id) - (b ? b.importe : 0)) * 100) / 100;
    return queda <= 0 ? '<b>Te salió gratis</b>' : `Tu parte: <b>${eur(queda, true)}</b>`;
  }
  // Una sugerencia tras otra: sí / es de otro gasto / no es una devolución
  function abrirDevol() {
    let hechas = 0;
    const siguiente = () => {
      const s = sugerenciasDevol();
      if (!s.length) { $sheet.close(); render(); if (hechas) toast('Listo: tus gastos cuentan solo tu parte'); return; }
      const { b, g, c } = s[0];
      $sheet.innerHTML = `
        <div class="row" style="align-items:flex-start"><div><div class="pix" style="font-size:12px;color:var(--sky-d);letter-spacing:.5px">DEVOLUCIÓN${s.length > 1 ? ' · QUEDAN ' + s.length : ''}</div><div class="num" style="font-size:20px;margin-top:4px">¿Te devolvieron parte de esto?</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
        <div class="card dash" style="margin:14px 0;padding:4px 16px">
          ${filaDv(g, esc(c.categoria))}
          ${filaDv(b, 'te lo enviaron')}
          <div class="row small" style="min-height:44px;color:var(--ink)"><span>Si dices que sí</span><span>${tuParte(g, b)}</span></div>
        </div>
        <button class="btn" id="dvSi">Sí, es de esto</button>
        <div class="btns" style="margin-top:10px"><button class="btn ghost" id="dvOtro">Es de otro gasto</button></div>
        <p style="text-align:center;margin:14px 0 2px" class="small"><a href="#movimientos" id="dvNo">No es una devolución</a></p>
        <p class="xs muted" style="text-align:center;margin:0">Así «${esc(c.categoria)}» y tu gasto normal cuentan lo que pagaste tú.</p>`;
      $sheet.querySelector('#dvSi').onclick = () => { enlazarDevol(b, g); hechas++; siguiente(); };
      $sheet.querySelector('#dvOtro').onclick = () => elegirGasto(b, () => { hechas++; siguiente(); });
      $sheet.querySelector('#dvNo').onclick = (e) => { e.preventDefault(); S.devolNo[b.id] = true; guardar(); siguiente(); };
    };
    $sheet.onclick = (e) => { if (e.target.closest('#sCerrar') || e.target === $sheet) { $sheet.close(); render(); } };
    if (!sugerenciasDevol().length) return;
    siguiente();
    if (!$sheet.open) $sheet.showModal();
  }
  // Elegir a mano de qué gasto es un Bizum (los de los 10 días anteriores)
  function elegirGasto(b, alAcabar) {
    const lista = candidatosDevol(b, null, true).slice(0, 25);
    $sheet.innerHTML = `
      <div class="row" style="align-items:flex-start"><div><div class="num" style="font-size:20px">¿De qué gasto es?</div><div class="small muted">Bizum ${conceptoBizum(b) ? '«' + esc(conceptoBizum(b)) + '»' : 'sin concepto'} · +${eur(b.importe, true)} · ${fmtF(b.fecha)}</div></div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
      ${lista.length ? `<div class="card" style="padding:4px 16px;margin-top:14px">${lista.map(({ g, c }) => `<button class="mov" data-g="${esc(g.id)}">
        <span class="av" style="background:${COLORES[c.categoria] || '#fff'}">${esc(nombreMov(g).charAt(0).toUpperCase())}</span>
        <span class="t"><span class="n">${esc(nombreMov(g))}</span><span class="xs muted"><span class="chip" style="background:${COLORES[c.categoria] || '#fff'}">${esc(c.categoria)}</span> ${fmtF(g.fecha)}${devueltoDe(g.id) ? ' · ya te devolvieron ' + eur(devueltoDe(g.id), true) : ''}</span></span>
        <span class="amt">${eur(g.importe, true)}</span></button>`).join('')}</div>`
      : '<p class="small muted" style="margin:16px 0">No veo gastos tuyos en los 10 días anteriores.</p>'}
      <p class="xs muted" style="text-align:center;margin:10px 0 0">Del gasto que elijas resto ${eur(b.importe, true)}: cuenta solo tu parte.</p>`;
    $sheet.querySelectorAll('[data-g]').forEach((x) => x.onclick = () => {
      const g = S.movs.find((m) => m.id === x.dataset.g); if (!g) return;
      enlazarDevol(b, g); toast('Restado de ' + nombreMov(g));
      if (alAcabar) alAcabar(); else { $sheet.close(); render(); }
    });
    if (!$sheet.open) $sheet.showModal();
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
  function nuevoFijo(pre) {
    pre = pre || {};
    $sheet.innerHTML = `<div class="num" style="font-size:20px;margin-bottom:12px">Nuevo pago fijo</div>
      <form id="sForm"><label class="field">Nombre<input name="n" placeholder="Gimnasio" value="${esc(pre.nombre || '')}" required></label>
      <div class="tiles" style="margin-bottom:0"><label class="field">Importe (€)<input name="i" inputmode="decimal" value="${esc(pre.importe || '')}" required></label><label class="field">Día del cargo<input name="d" inputmode="numeric" value="${esc(pre.dia || 1)}"></label></div>
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

  /* ---------- Candado: huella o PIN tras 5 minutos sin usar Brisa ----------
     Todo vive solo en este móvil (no va a la nube): la huella la comprueba Android
     y Brisa solo guarda el identificador de la credencial y el PIN cifrado. */
  const CANDADO_KEY = 'brisa:candado', USO_KEY = 'brisa:uso', ESPERA = 5 * 60000;
  const leerC = () => { try { return JSON.parse(localStorage.getItem(CANDADO_KEY)) || null; } catch (e) { return null; } };
  const guardarC = (c) => { try { c ? localStorage.setItem(CANDADO_KEY, JSON.stringify(c)) : localStorage.removeItem(CANDADO_KEY); } catch (e) {} };
  const marcarUso = () => { try { localStorage.setItem(USO_KEY, String(Date.now())); } catch (e) {} };
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  async function hashPin(sal, pin) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sal + '|' + pin));
    return b64(h);
  }
  const hayHuella = async () => { try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; } };
  async function crearHuella() {
    const nombre = (S.perfil && S.perfil.nombre) || 'Brisa';
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Brisa', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: nombre, displayName: nombre },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
    return b64(cred.rawId);
  }
  async function pedirHuella(c) {
    await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: deB64(c.cred) }], userVerification: 'required', timeout: 60000 } });
    return true;
  }
  const IC_HUELLA = (sz) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="13" rx="6.5" ry="7.5" fill="currentColor" fill-opacity=".2" stroke="none"/><path d="M8 19c1-1.7 1.6-3.8 1.6-6.4a2.4 2.4 0 0 1 4.8 0c0 1.5-.1 2.9-.4 4.2"/><path d="M12 12.6c0 3-.6 5.6-2 7.6"/><path d="M5.3 15.8c.3-1 .5-2.1.5-3.2a6.2 6.2 0 0 1 11.2-3.7"/><path d="M18 11.4c.1.4.2.8.2 1.2 0 2.6-.3 4.8-1 6.8"/><path d="M6.2 6.8A8.5 8.5 0 0 1 17.8 6"/></svg>`;
  const IC_BORRAR = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 5.5h9.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2a2 2 0 0 1-1.5-.7L3.5 12l4.2-5.8a2 2 0 0 1 1.5-.7z" fill="currentColor" fill-opacity=".2" stroke="none"/><path d="M9.2 5.5h9.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2a2 2 0 0 1-1.5-.7L3.5 12l4.2-5.8a2 2 0 0 1 1.5-.7z"/><path d="M12.3 9.5l5 5M17.3 9.5l-5 5"/></svg>';
  // Teclado de PIN reutilizable: llama a alListo(pin) al llegar a 4 cifras
  function teclado(cont, titulo, alListo, conHuella) {
    let pin = '';
    const pintar = (msg, error) => {
      cont.innerHTML = `<div class="lk-msg ${error ? 'lk-err' : ''}">${msg || titulo}</div>
        <div class="lk-dots" role="img" aria-label="${pin.length} de 4 números">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="lk-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', conHuella ? 'h' : '', '0', 'del'].map((k) =>
          k === '' ? '<span></span>' : k === 'h' ? `<button type="button" class="lk-key lk-flat" data-k="h" aria-label="Usar huella">${IC_HUELLA(28)}</button>`
          : k === 'del' ? `<button type="button" class="lk-key lk-flat" data-k="del" aria-label="Borrar">${IC_BORRAR}</button>`
          : `<button type="button" class="lk-key" data-k="${k}">${k}</button>`).join('')}</div>`;
    };
    pintar();
    cont.onclick = async (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'h') { cont.dispatchEvent(new CustomEvent('huella')); return; }
      if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      pintar();
      if (pin.length === 4) {
        const r = await alListo(pin);
        if (r !== true) { pin = ''; pintar(r || 'No es ese PIN', true); cont.querySelector('.lk-dots').classList.add('shake'); }
      }
    };
    return { reset: (msg, err) => { pin = ''; pintar(msg, err); } };
  }
  let bloqueada = false;
  function bloquear() {
    const c = leerC(); if (!c || !c.on || bloqueada) return;
    bloqueada = true;
    const capa = document.createElement('div'); capa.className = 'lk'; capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); capa.setAttribute('aria-label', 'Desbloquear Brisa');
    let fallos = 0, hasta = 0;
    const abrir = () => { bloqueada = false; marcarUso(); capa.remove(); };
    const vistaHuella = () => {
      capa.innerHTML = `${orn(26, '#F5B8CF', 'top:80px;left:52px')}${orn(16, '#E27FA8', 'top:120px;right:56px')}
        <div class="small muted" style="font-size:15px">Hola de nuevo</div><div class="h1" style="font-size:36px;letter-spacing:-.8px;margin-bottom:40px">${esc((S.perfil && S.perfil.nombre) || '')}</div>
        <button type="button" class="lk-finger" id="lkH" aria-label="Entrar con huella"><span class="pulse"></span><span class="pulse2"></span>${IC_HUELLA(72)}</button>
        <b style="font-size:16px;margin-bottom:6px">Toca el sensor para entrar</b><span class="small muted" style="font-size:14px">Tu número de hoy te está esperando</span>
        <button type="button" class="lk-alt" id="lkP">Usar PIN</button>`;
      const go = async () => { try { await pedirHuella(leerC()); abrir(); } catch (e) { /* cancelada: sigue el candado */ } };
      capa.querySelector('#lkH').onclick = go; capa.querySelector('#lkP').onclick = vistaPin;
      go();
    };
    const vistaPin = () => {
      const cc = leerC();
      capa.innerHTML = `<div class="small muted" style="font-size:15px">Hola de nuevo</div><div class="h1" style="font-size:36px;letter-spacing:-.8px;margin-bottom:24px">${esc((S.perfil && S.perfil.nombre) || '')}</div><div id="lkT" style="width:100%;display:flex;flex-direction:column;align-items:center"></div>`;
      const cont = capa.querySelector('#lkT');
      teclado(cont, 'Escribe tu PIN', async (pin) => {
        if (Date.now() < hasta) return 'Espera unos segundos';
        if (await hashPin(cc.sal, pin) === cc.pin) { abrir(); return true; }
        fallos++; if (fallos >= 5) { hasta = Date.now() + 30000; fallos = 0; return 'Demasiados intentos: espera 30 s'; }
        return 'No es ese PIN';
      }, !!cc.cred);
      cont.addEventListener('huella', vistaHuella);
    };
    document.body.appendChild(capa);
    const c2 = leerC();
    if (c2.cred) vistaHuella(); else vistaPin();
  }
  function comprobarCandado() {
    const c = leerC(); if (!c || !c.on) return;
    let uso = 0; try { uso = Number(localStorage.getItem(USO_KEY)) || 0; } catch (e) {}
    if (Date.now() - uso > ESPERA) bloquear();
  }
  // Configurar desde Ajustes
  function abrirCandado() {
    const c = leerC();
    if (c && c.on) {
      $sheet.innerHTML = `<div class="row" style="align-items:flex-start"><div class="num" style="font-size:20px">Desbloqueo</div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
        <p class="small muted" style="line-height:1.5;margin:8px 0 14px">Brisa te pide ${c.cred ? 'la huella (o el PIN)' : 'el PIN'} si llevas más de 5 minutos sin usarla. Solo en este móvil.</p>
        <div class="btns" style="flex-direction:column"><button type="button" class="btn ghost" id="sCambiar">Cambiar el PIN</button>
        ${c.cred ? '' : '<button type="button" class="btn ghost" id="sHuella">Añadir la huella</button>'}
        <button type="button" class="btn ghost" id="sQuitar" style="color:var(--berry)">Quitar el desbloqueo</button></div>`;
      $sheet.onclick = (e) => { if (e.target.closest('#sCerrar') || e.target === $sheet) $sheet.close(); };
      const confirmarPin = (titulo, luego) => {
        $sheet.innerHTML = `<div class="row" style="align-items:flex-start"><div class="num" style="font-size:20px">${titulo}</div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div><div id="sT" class="lk-in-sheet"></div>`;
        teclado($sheet.querySelector('#sT'), 'Escribe tu PIN actual', async (pin) => { if (await hashPin(c.sal, pin) !== c.pin) return 'No es ese PIN'; luego(); return true; });
      };
      $sheet.querySelector('#sQuitar').onclick = () => confirmarPin('Quitar el desbloqueo', () => { guardarC(null); $sheet.close(); render(); toast('Desbloqueo quitado'); });
      $sheet.querySelector('#sCambiar').onclick = () => confirmarPin('Cambiar el PIN', () => nuevoPin(c.cred));
      if (q2('#sHuella')) q2('#sHuella').onclick = async () => { try { const cred = await crearHuella(); guardarC({ ...c, cred }); $sheet.close(); render(); toast('Huella añadida'); } catch (e) { toast('No he podido usar la huella en este móvil'); } };
      $sheet.showModal(); return;
    }
    nuevoPin(null);
  }
  const q2 = (s) => $sheet.querySelector(s);
  function nuevoPin(credPrevia) {
    let primero = null;
    $sheet.innerHTML = `<div class="row" style="align-items:flex-start"><div class="num" style="font-size:20px">Elige un PIN</div><button class="icon-btn" id="sCerrar" aria-label="Cerrar">${IC.close}</button></div>
      <p class="small muted" style="line-height:1.5;margin:8px 0 6px">4 números. Te servirá si la huella falla.</p><div id="sT" class="lk-in-sheet"></div>`;
    $sheet.onclick = (e) => { if (e.target.closest('#sCerrar') || e.target === $sheet) $sheet.close(); };
    const t = teclado(q2('#sT'), 'Escribe 4 números', async (pin) => {
      if (!primero) { primero = pin; setTimeout(() => t.reset('Repítelo para confirmar'), 150); return true; }
      if (pin !== primero) { primero = null; return 'No coinciden. Empieza otra vez'; }
      const sal = b64(crypto.getRandomValues(new Uint8Array(16)));
      const c = { on: true, sal, pin: await hashPin(sal, pin), cred: credPrevia || null };
      if (!credPrevia && await hayHuella()) { try { c.cred = await crearHuella(); } catch (e) { /* sin huella: solo PIN */ } }
      guardarC(c); marcarUso(); $sheet.close(); render();
      toast(c.cred ? 'Listo: huella y PIN activados' : 'Listo: PIN activado');
      return true;
    });
    if (!$sheet.open) $sheet.showModal();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (!bloqueada) marcarUso(); } else comprobarCandado(); });
  window.addEventListener('pagehide', () => { if (!bloqueada) marcarUso(); });
  document.addEventListener('pointerdown', () => { if (!bloqueada) marcarUso(); }, { passive: true });

  /* ---------- Router ---------- */
  function ruta() {
    let r = location.hash.slice(1) || 'inicio';
    if (!S.perfil && r !== 'bienvenida' && r !== 'cuenta') r = 'bienvenida';
    if (!R[r]) r = 'inicio';
    return r;
  }
  function render() {
    DEV = null;
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
    if (q('#bDevol')) q('#bDevol').onclick = () => abrirDevol();
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
    if (q('#bNuevoFijo')) q('#bNuevoFijo').onclick = () => nuevoFijo();
    if (r === 'consejos') {
      $app.querySelectorAll('[data-ra]').forEach((b) => b.onclick = () => accionConsejo(b.dataset.rk, b.dataset.ra));
      if (q('#bRecReset')) q('#bRecReset').onclick = () => { S.consejos.no = {}; S.consejos.tipoNo = {}; guardar(); render(); toast('Vuelves a ver todos los consejos'); };
      const res = q('#ysRes');
      const refrescar = () => { res.innerHTML = resultadoYSi(); };
      q('#ysN').oninput = (e) => { YS.nombre = e.target.value; };
      q('#ysI').oninput = (e) => { YS.importe = e.target.value; refrescar(); };
      $app.querySelectorAll('[data-ysc]').forEach((b) => b.onclick = () => {
        YS.cuando = b.dataset.ysc; $app.querySelectorAll('[data-ysc]').forEach((x) => x.setAttribute('aria-pressed', x === b)); refrescar();
      });
      res.onclick = (e) => { if (e.target.closest('#ysFijo')) nuevoFijo({ nombre: YS.nombre.trim(), importe: YS.importe, dia: YS.cuando === 'ahora' ? 1 : (S.perfil && S.perfil.diaCobro) || 30 }); };
    }
    if (q('#bCandado')) q('#bCandado').onclick = abrirCandado;
    if (q('#bBanco')) q('#bBanco').onclick = conectarBanco;
    if (q('#bSyncBanco')) q('#bSyncBanco').onclick = () => sincronizarBanco(true);
    if (q('#bDesBanco')) q('#bDesBanco').onclick = desconectarBanco;
    // ¿Me lo compro?
    const verDeseo = (id) => { const d = S.deseos.find((x) => x.id === id); if (!d) return; Object.assign(CQ, { item: d.nombre, importe: String(d.importe).replace('.', ','), modo: 'once', hecho: null }); };
    $app.querySelectorAll('[data-deseo]').forEach((b) => b.onclick = () => { verDeseo(b.dataset.deseo); location.hash = '#comprar'; });
    if (r === 'semana') {
      if (q('#semAtras')) q('#semAtras').onclick = () => { SEM.paso = Math.max(0, SEM.paso - 1); render(); };
      q('#semSig').onclick = () => { if (SEM.paso >= 3) { SEM.paso = 0; S.semanaVista = hoyIso(); guardar(); location.hash = '#inicio'; } else { SEM.paso++; render(); } };
    }
    if (r === 'comprar') {
      const res = q('#cqRes');
      const refrescar = () => { res.innerHTML = resultadoCompra(); };
      if (q('#cqItem')) q('#cqItem').oninput = (e) => { CQ.item = e.target.value; if (CQ.hecho) CQ.hecho = null; refrescar(); };
      if (q('#cqImp')) q('#cqImp').oninput = (e) => {
        CQ.importe = e.target.value; if (CQ.hecho) CQ.hecho = null; refrescar();
        $app.querySelectorAll('[data-cqp]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cqp === CQ.importe));
      };
      $app.querySelectorAll('[data-cqp]').forEach((b) => b.onclick = () => { CQ.importe = b.dataset.cqp; CQ.hecho = null; render(); });
      $app.querySelectorAll('[data-cqm]').forEach((b) => b.onclick = () => { CQ.modo = b.dataset.cqm; CQ.hecho = null; render(); });
      $app.querySelectorAll('[data-cqn]').forEach((b) => b.onclick = () => { CQ.n = Number(b.dataset.cqn); CQ.hecho = null; render(); });
      $app.querySelectorAll('[data-cqv]').forEach((b) => b.onclick = () => { verDeseo(b.dataset.cqv); render(); window.scrollTo(0, 0); });
      $app.querySelectorAll('[data-cqd]').forEach((b) => b.onclick = () => { S.deseos = S.deseos.filter((x) => x.id !== b.dataset.cqd); guardar(); render(); });
      $app.querySelectorAll('[data-cqx]').forEach((b) => b.onclick = () => { S.reservas = S.reservas.filter((x) => x.id !== b.dataset.cqx); if (CQ.hecho && CQ.hecho.resId === b.dataset.cqx) CQ.hecho = null; guardar(); render(); toast('Reserva quitada'); });
      res.onclick = (e) => {
        if (e.target.closest('#cqBuy')) comprar();
        else if (e.target.closest('#cqUndo')) deshacerCompra();
        else if (e.target.closest('#cqSave')) {
          const A = numero(CQ.importe); if (!(A > 0)) return;
          const nombre = CQ.item.trim() || 'Sin nombre';
          S.deseos.push({ id: 'd' + Date.now(), nombre, importe: Math.round(A * 100) / 100, creado: hoyIso() });
          guardar(); render(); toast(nombre + ' está en tu lista de deseos. Te aviso cuando quepa.');
        }
      };
    }
    if (q('#fCuenta')) q('#fCuenta').onsubmit = async (e) => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Enviando…';
      const { error } = await NUBE.auth.signInWithOtp({ email: e.target.email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
      b.disabled = false; b.textContent = 'Enviarme el enlace';
      if (error) toast(/rate|seconds/i.test(error.message) ? 'Espera un minuto y vuelve a probar' : 'No he podido enviarlo. ¿Está bien el correo?');
      else q('#cuentaOk').hidden = false;
    };
    if (q('#bSalir')) q('#bSalir').onclick = async () => { await subir(); await NUBE.auth.signOut(); toast('Sesión cerrada'); render(); };
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
        if (!confirm('¿Seguro? Se borran tus movimientos, reglas y metas de este móvil.' + (nube.email ? ' Tu copia en la nube no se toca y se cierra la sesión.' : ''))) return;
        const fin = () => { S = nuevoEstado(); guardar(); location.hash = '#bienvenida'; render(); };
        if (NUBE && nube.email) { clearTimeout(tSubir); nube.email = null; NUBE.auth.signOut().finally(fin); } else fin();
      };
    }
  }
  cargarDesdeEnlace();
  if (S.perfil) comprobarCandado();
  iniciarNube();
  window.addEventListener('hashchange', () => { if (cargarDesdeEnlace()) render(); window.scrollTo(0, 0); render(); });
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
})();
