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
      ultimaImportacion: null
    };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || nuevoEstado(); } catch (e) { S = nuevoEstado(); }
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
  const IC = {
    gear: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 17v-6M9.5 13.5L12 11l2.5 2.5"/></svg>',
    uturn: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
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
    let gastado = 0, rescates = 0, porCat = {};
    for (const m of enCiclo) {
      const c = cat(m);
      const v = variable(m, c);
      gastado += v;
      if (v > 0) porCat[c.categoria] = (porCat[c.categoria] || 0) + v;
      if (c.categoria === 'Rescate del ahorro') rescates += m.importe;
    }
    const p = S.perfil || { ingresos: 0, fijos: 0, ritmo: 'equilibrado' };
    const ahorro = RITMOS[p.ritmo || 'equilibrado'].importe;
    const presupuesto = Math.max(0, Number(p.ingresos) - Number(p.fijos) - ahorro);
    const queda = presupuesto - gastado;
    return { inicio, fin, restantes, gastado, rescates, porCat, presupuesto, ahorro, queda, hoyPuedes: Math.max(0, queda / restantes) };
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
        m.id = [m.fecha, m.fechaValor, m.importe, m.concepto, m.tipo, m.saldo].join('|');
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
    let resc = 0;
    for (const [m, c] of cs) {
      if (c.categoria === 'Rescate del ahorro') resc += m.importe;
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
    ${top.length ? `<div class="h2">En qué se fue</div>
    ${top.map(([k, v], i) => `<div style="margin-bottom:10px"><div class="row" style="font-size:14px;margin-bottom:5px"><span>${esc(k)}</span><span class="num">${eur(v)}</span></div><div class="bar l" style="height:6px"><i style="width:${Math.round(v / max * 100)}%;background:${BARRAS[i % BARRAS.length]}"></i></div></div>`).join('')}` : ''}
    ${resc > 0 ? `<div class="card dash row" style="justify-content:flex-start;gap:10px;color:#4A2E3C;margin-top:14px"><span style="color:var(--berry);width:18px;height:18px;display:inline-flex">${IC.uturn}</span><span class="small">Han vuelto <b>${eur(resc)}</b> de tu ahorro en este Excel.</span></div>` : ''}
    <div class="btns">${rev ? '<a class="btn ghost" href="#movimientos">Revisar ' + rev + '</a>' : ''}<a class="btn" href="#inicio">Ir a Inicio</a></div>`;
  };

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
      ${orn(30, '#fff', 'top:18px;right:22px')}${orn(14, '#E27FA8', 'top:56px;right:60px')}${heart(14, '#fff', 'top:64px;right:22px')}
      <div style="font-size:15px;color:#6A3A50">Hoy puedes gastar</div>
      <div class="big" style="margin:8px 0 10px">${eur(c.hoyPuedes)}</div>
      <div style="font-size:14px;line-height:1.45;color:#4A2E3C;margin-bottom:12px">${c.queda >= 0 ? `Sin pasarte hasta el ${finTxt} y apartando ${eur(c.ahorro)} para ti.` : `Te has pasado ${eur(-c.queda)} este mes. Mañana lo vemos con calma.`}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row small" style="color:#6A3A50;margin-top:8px"><span>${eur(c.gastado)} de ${eur(c.presupuesto)}</span><span>Quedan ${c.restantes} días</span></div>
    </section>
    <button class="link-card" id="bSubirHome" style="background:${viejo ? 'var(--sky)' : '#fff'};${viejo ? '' : 'border:1px solid var(--line)'}">
      <span class="ic" style="${viejo ? '' : 'background:var(--sky);'}color:var(--sky-d)">${IC.file}</span>
      <span class="t"><b>${viejo ? 'Toca subir el Excel' : 'Subir el Excel de la semana'}</b><span class="small muted">Datos hasta el ${fmtF(ultimo)}</span></span>${IC.chev}
    </button>
    <a class="link-card" href="#metas" style="background:#fff;border:1.5px dashed #F0C3D5">
      <span class="ic" style="background:var(--rose);color:var(--berry)">${IC.uturn}</span>
      <span class="t"><b>Rescates: ${eur(c.rescates)} de ${eur(S.limiteRescates)}</b><span class="small muted">Lo que ha vuelto de tu ahorro este mes</span></span>${IC.chev}
    </a>
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
    const m = S.metas.find((x) => x.ahorrado < x.objetivo);
    if (!m || !S.perfil) return '';
    const faltan = m.objetivo - m.ahorrado;
    const meses = Math.ceil(faltan / RITMOS[S.perfil.ritmo].importe);
    const d = new Date(); d.setMonth(d.getMonth() + meses);
    return `«${esc(m.nombre)}» lista en ${MESES_L[d.getMonth()]} de ${d.getFullYear()}.`;
  }

  R.metas = () => {
    const c = ciclo();
    const aporte = RITMOS[S.perfil.ritmo].importe;
    const activa = S.metas.find((x) => x.ahorrado < x.objetivo);
    const pr = Math.min(100, Math.round(c.rescates / Math.max(1, S.limiteRescates) * 100));
    return `
    <div class="top"><div><h1>Tus metas${SPARK}</h1><div class="small muted">Primero un colchón. Luego, lo que tú quieras.</div></div></div>
    ${S.metas.map((m) => {
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
          <span class="xs">${pc >= 100 ? '¡Conseguida!' : es ? aporte + ' €/mes · ' + metaEta().replace(/^«.*?» /, '') : 'Empieza al terminar la anterior'}</span>
          <button class="btn small ghost" data-aportar="${esc(m.id)}" style="align-self:flex-start;margin-top:4px">Actualizar lo ahorrado</button>
        </div>
      </section>`;
    }).join('')}
    <section class="card dash">
      <div class="row" style="margin-bottom:8px"><span style="display:flex;gap:10px;align-items:center"><span style="width:36px;height:36px;border-radius:18px;background:var(--rose);color:var(--berry);display:flex;align-items:center;justify-content:center">${IC.uturn.replace('viewBox', 'width="18" height="18" viewBox')}</span><b>Rescates del ahorro</b></span><span class="num" style="white-space:nowrap">${eur(c.rescates)} <span class="xs muted">de ${eur(S.limiteRescates)}</span></span></div>
      <div class="bar l"><i style="width:${pr}%"></i></div>
      <p class="xs muted" style="margin:8px 0 0;line-height:1.45">Dinero que ha vuelto de tu ahorro este mes. Sacar no está prohibido: solo queremos que se vea.</p>
    </section>
    <button class="link-card" id="bNuevaMeta" style="background:rgba(255,255,255,.6);border:1.5px dashed var(--rose3)"><span class="ic" style="background:var(--peach);color:var(--peach-d)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span class="t"><b>Crear otra meta</b><span class="small muted">Empieza al completar la anterior</span></span></button>`;
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
    <p class="xs muted" style="text-align:center;margin-top:16px">Brisa v0.1</p>`;
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
    $app.querySelectorAll('[data-aportar]').forEach((b) => b.onclick = () => {
      const m = S.metas.find((x) => x.id === b.dataset.aportar);
      pedirNumero('¿Cuánto llevas ahorrado para «' + m.nombre + '»?', m.ahorrado, (v) => { m.ahorrado = v; guardar(); });
    });
    if (q('#bNuevaMeta')) q('#bNuevaMeta').onclick = nuevaMeta;
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
            else if (d.reglasUsuario || d.palabras || d.importes) {
              Object.assign(S.reglas.reglasUsuario, d.reglasUsuario || {});
              S.reglas.palabras = S.reglas.palabras.concat(d.palabras || []);
              S.reglas.importes = S.reglas.importes.concat(d.importes || []);
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
