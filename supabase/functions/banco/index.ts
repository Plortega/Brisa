// Brisa · función «banco»: conexión con BBVA a través de Enable Banking (modo restringido, solo cuentas propias).
// Acciones (POST JSON { accion, ... }) con la sesión de Supabase del usuario:
//   estado       → ¿hay conexión?, hasta cuándo vale el permiso, última sincronización
//   empezar      → devuelve la URL para autorizar en BBVA
//   codigo       → { code, state } al volver de BBVA: crea la sesión y sincroniza
//   sincronizar  → trae los movimientos nuevos y devuelve los de los últimos días ya adaptados a Brisa
//   desconectar  → borra la sesión guardada
// La clave privada vive en el secreto ENABLE_BANKING_KEY y nunca sale de aquí.
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_ID = "d5674c27-ff4c-4ca3-a96e-b34f75ca86c0";
const API = "https://api.enablebanking.com";
const REDIRECT_DEF = "https://plortega.github.io/Brisa/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- JWT firmado con la clave de la aplicación ----------
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s: string) => b64u(new TextEncoder().encode(s));
let claveCache: CryptoKey | null = null;
async function clave(): Promise<CryptoKey> {
  if (claveCache) return claveCache;
  let pem = Deno.env.get("ENABLE_BANKING_KEY") || "";
  if (!pem) throw new Error("Falta el secreto ENABLE_BANKING_KEY");
  pem = pem.replace(/\\n/g, "\n");
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) throw new Error("La clave está en formato PKCS#1; hace falta PKCS#8 (BEGIN PRIVATE KEY)");
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  claveCache = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return claveCache;
}
async function jwt(): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const h = b64uStr(JSON.stringify({ typ: "JWT", alg: "RS256", kid: APP_ID }));
  const p = b64uStr(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: ahora, exp: ahora + 3600 }));
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await clave(), new TextEncoder().encode(h + "." + p));
  return h + "." + p + "." + b64u(firma);
}
// Llamada a Enable Banking. psu: cabeceras de la persona presente (evita el límite de accesos en segundo plano)
async function eb(metodo: string, ruta: string, cuerpo?: unknown, psu?: Record<string, string>) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: "Bearer " + (await jwt()), "Content-Type": "application/json", ...(psu || {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  let d: any = null; try { d = txt ? JSON.parse(txt) : null; } catch { d = { raw: txt }; }
  if (!r.ok) { const e: any = new Error(`Enable Banking ${r.status}: ${txt.slice(0, 300)}`); e.status = r.status; e.datos = d; throw e; }
  return d;
}

// ---------- Utilidades ----------
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const masDias = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDia(d); };
async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const tapar = (s: unknown) => String(s ?? "").replace(/\d{12,}/g, (n) => "*" + n.slice(-4));
const firmar = (t: any) => (t.credit_debit_indicator === "DBIT" ? -1 : 1) * Number(t.transaction_amount?.amount || 0);

// Movimiento del banco → la misma forma que una fila del Excel de BBVA
function aBrisa(t: any) {
  const rem = (Array.isArray(t.remittance_information) ? t.remittance_information : [t.remittance_information]).filter(Boolean).join(" ").trim();
  const contra = t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name;
  const desc = t.bank_transaction_code?.description || "";
  const saldo = t.balance_after_transaction?.balance_amount?.amount;
  return {
    ref: t._id,
    fecha: t.booking_date || t.value_date || t.transaction_date,
    fechaValor: t.value_date || t.transaction_date || t.booking_date,
    concepto: tapar(rem || contra || desc),
    tipo: tapar(desc && desc !== rem ? desc : (contra && contra !== rem ? contra : "")),
    importe: Math.round(firmar(t) * 100) / 100,
    saldo: saldo !== undefined && saldo !== null ? Number(saldo) : (t._saldo ?? null),
    observaciones: tapar(t.note || ""),
    origen: "banco",
    cuenta: t._fin || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authH = req.headers.get("Authorization") || "";
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await db.auth.getUser(authH.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ error: "Sin sesión" }, 401);
    const uid = u.user.id;
    const body = await req.json().catch(() => ({}));
    const psu = {
      "Psu-Ip-Address": (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "127.0.0.1",
      "Psu-User-Agent": req.headers.get("user-agent") || "Brisa",
    };
    const { data: con } = await db.from("banco_conexion").select("*").eq("user_id", uid).maybeSingle();

    if (body.accion === "estado") {
      return json({ conectado: !!con?.session_id, valid_until: con?.valid_until || null, ultima_sync: con?.ultima_sync || null,
        error: con?.error || null, cuentas: (con?.cuentas || []).map((c: any) => ({ nombre: c.nombre, fin: c.fin, saldo: c.saldo, principal: !!c.principal })) });
    }

    if (body.accion === "empezar") {
      const state = crypto.randomUUID();
      await db.from("banco_conexion").upsert({ user_id: uid, pendiente: state, actualizado: new Date().toISOString() });
      let r; let err;
      // Pedimos el permiso más largo que acepte el banco
      for (const d of [180, 90]) {
        try {
          const hasta = new Date(Date.now() + d * 86400000).toISOString();
          r = await eb("POST", "/auth", { access: { valid_until: hasta }, aspsp: { name: "BBVA", country: "ES" }, state,
            redirect_url: body.redirect || REDIRECT_DEF, psu_type: "personal", language: "es" }, psu);
          break;
        } catch (e) { err = e; }
      }
      if (!r) throw err;
      return json({ url: r.url });
    }

    if (body.accion === "codigo") {
      if (!con?.pendiente || body.state !== con.pendiente) return json({ error: "La autorización no coincide. Vuelve a empezar." }, 400);
      const s = await eb("POST", "/sessions", { code: body.code }, psu);
      const cuentas = (s.accounts || []).map((a: any) => ({ uid: a.uid, nombre: a.name || a.product || "Cuenta",
        fin: String(a.account_id?.iban || a.account_id?.other?.identification || "").slice(-4) }));
      await db.from("banco_conexion").upsert({ user_id: uid, session_id: s.session_id, valid_until: s.access?.valid_until,
        cuentas, pendiente: null, error: null, actualizado: new Date().toISOString() });
      body.accion = "sincronizar"; body.primera = true;
      const { data: con2 } = await db.from("banco_conexion").select("*").eq("user_id", uid).maybeSingle();
      return json(await sincronizar(db, uid, con2, body, psu));
    }

    if (body.accion === "sincronizar") {
      if (!con?.session_id) return json({ error: "No hay conexión con el banco" }, 400);
      return json(await sincronizar(db, uid, con, body, psu));
    }

    if (body.accion === "desconectar") {
      if (con?.session_id) { try { await eb("DELETE", "/sessions/" + con.session_id); } catch (_) { /* ya caducada */ } }
      await db.from("banco_conexion").delete().eq("user_id", uid);
      return json({ ok: true });
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: String(e?.message || e), status: e?.status || null }, 500);
  }
});

async function sincronizar(db: any, uid: string, con: any, body: any, psu: Record<string, string>) {
  const hoy = isoDia(new Date());
  const cuentas = con.cuentas || [];
  let nuevos = 0; let retenido = 0; let caducada = false;
  for (const c of cuentas) {
    // Desde 10 días antes del último movimiento guardado (o 89 días atrás la primera vez)
    const { data: ult } = await db.from("banco_movs").select("fecha").eq("user_id", uid).eq("cuenta", c.uid).order("fecha", { ascending: false }).limit(1);
    const desde = ult?.[0]?.fecha && !body.primera ? masDias(ult[0].fecha, -10) : masDias(hoy, -89);
    let ck: string | null = null; const lista: any[] = [];
    try {
      do {
        const q = new URLSearchParams({ date_from: desde, date_to: hoy });
        if (ck) q.set("continuation_key", ck);
        const r = await eb("GET", `/accounts/${c.uid}/transactions?${q}`, undefined, psu);
        lista.push(...(r.transactions || []));
        ck = r.continuation_key || null;
      } while (ck);
    } catch (e: any) {
      if (e.status === 401 || e.status === 403 || /expired|EXPIRED|revoked/i.test(String(e.message))) { caducada = true; break; }
      throw e;
    }
    // Saldo actual para reconstruir el saldo tras cada movimiento si el banco no lo da
    let saldo: number | null = null;
    try {
      const b = await eb("GET", `/accounts/${c.uid}/balances`, undefined, psu);
      const pref = ["CLBD", "ITBD", "XPCD", "ITAV", "CLAV"];
      const bs = (b.balances || []).sort((x: any, y: any) => pref.indexOf(x.balance_type) - pref.indexOf(y.balance_type));
      if (bs[0]) saldo = Number(bs[0].balance_amount?.amount);
      c.saldo = saldo; c.saldo_fecha = new Date().toISOString();
    } catch (_) { /* sin saldo */ }
    const book = lista.filter((t) => (t.status || "BOOK") === "BOOK");
    c._ret = lista.filter((t) => t.status === "PDNG" && t.credit_debit_indicator === "DBIT").reduce((a, t) => a + Number(t.transaction_amount?.amount || 0), 0);
    for (const [i, t] of book.entries()) {
      t._n = i;
      t._id = t.entry_reference || t.transaction_id ||
        (await sha([c.uid, t.booking_date, t.value_date, t.transaction_amount?.amount, t.credit_debit_indicator, JSON.stringify(t.remittance_information), i].join("|")));
    }
    if (book.length) {
      const filas = book.map((t) => ({ user_id: uid, id: String(t._id), cuenta: c.uid, fecha: t.booking_date || t.value_date, raw: t }));
      const { data: ya } = await db.from("banco_movs").select("id").eq("user_id", uid).in("id", filas.map((f) => f.id));
      const vistos = new Set((ya || []).map((x: any) => x.id));
      nuevos += filas.filter((f) => !vistos.has(f.id)).length;
      const { error } = await db.from("banco_movs").upsert(filas);
      if (error) throw error;
    }
  }
  // La cuenta principal (la del día a día) es la que más movimientos tiene; se fija una vez.
  // Las demás (p. ej. la de ahorro) no se mezclan con los gastos: solo se devuelve su saldo.
  if (!cuentas.some((c: any) => c.principal) && cuentas.length) {
    let mejor = cuentas[0], max = -1;
    for (const c of cuentas) {
      const { count } = await db.from("banco_movs").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("cuenta", c.uid);
      if ((count || 0) > max) { max = count || 0; mejor = c; }
    }
    mejor.principal = true;
  }
  // Lo retenido con tarjeta, solo de la cuenta principal
  retenido = cuentas.filter((c: any) => c.principal).reduce((a: number, c: any) => a + (c._ret || 0), 0);
  for (const c of cuentas) delete c._ret;
  await db.from("banco_conexion").update({ cuentas, ultima_sync: new Date().toISOString(), error: caducada ? "caducada" : null,
    actualizado: new Date().toISOString() }).eq("user_id", uid);
  if (caducada) return { caducada: true, movimientos: [] };

  // Devolvemos los movimientos de los últimos días, con el saldo tras cada uno
  const desdeApp = body.desde || masDias(hoy, -120);
  const { data: filas } = await db.from("banco_movs").select("raw, cuenta, fecha").eq("user_id", uid).gte("fecha", desdeApp);
  const movimientos: any[] = [];
  for (const c of cuentas.filter((x: any) => x.principal)) {
    const suyos = (filas || []).filter((f: any) => f.cuenta === c.uid).map((f: any) => { f.raw._fin = c.fin; return f.raw; })
      // Más reciente primero; dentro del día, el orden en que los da el banco
      .sort((a: any, b: any) => (b.booking_date || "").localeCompare(a.booking_date || "") || (a._n ?? 0) - (b._n ?? 0));
    let s = typeof c.saldo === "number" ? c.saldo : null;
    for (const t of suyos) {
      const dado = t.balance_after_transaction?.balance_amount?.amount;
      if (dado !== undefined && dado !== null) s = Number(dado);
      t._saldo = s !== null ? Math.round(s * 100) / 100 : null;
      if (s !== null) s = s - firmar(t);
      movimientos.push(aBrisa(t));
    }
  }
  return { nuevos, retenido: Math.round(retenido * 100) / 100, movimientos, cuentas: cuentas.map((c: any) => ({ nombre: c.nombre, fin: c.fin, saldo: c.saldo, principal: !!c.principal })) };
}
