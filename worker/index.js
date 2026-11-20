/* Tongki Calistung · server lisensi + hosting (Cloudflare Workers, paket gratis cukup)
 *
 * Tugas:
 *  1. Menyajikan aplikasi (folder public/) dan menyuntikkan kunci publik ke index.html.
 *  2. POST /api/aktivasi  {kode, perangkat}  -> cek kode ke Mayar, batasi jumlah perangkat,
 *     lalu kembalikan token bertanda tangan (ECDSA P-256) yang dicek aplikasi secara offline.
 *  3. Endpoint admin (butuh ADMIN_TOKEN): buat kode manual (sekolah/hadiah), reset perangkat, cek kode.
 *
 * Pengaturan (Cloudflare dashboard > Worker > Settings > Variables):
 *  - MAYAR_API_KEY     (secret)  API key Mayar
 *  - MAYAR_PRODUCT_ID  (variable) ID produk Software License di Mayar
 *  - ADMIN_TOKEN       (secret)  kata sandi panjang untuk endpoint admin
 *  - MAX_PERANGKAT     (variable, opsional, bawaan 3)
 *  - MAYAR_BASE        (variable, opsional) https://api.mayar.id (produksi) atau https://api.mayar.io (sandbox)
 *  KV namespace dengan binding LISENSI.
 */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = s => b64u(enc.encode(s));
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
async function sha(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 32); }

/* ---------- kunci tanda tangan: dibuat otomatis sekali, disimpan di KV ---------- */
let KEYCACHE = null;
async function keys(env) {
  if (KEYCACHE) return KEYCACHE;
  let rec = await env.LISENSI.get("sys:kunci", "json");
  if (!rec) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const priv = await crypto.subtle.exportKey("jwk", kp.privateKey), pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
    await env.LISENSI.put("sys:kunci", JSON.stringify({ priv, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } }));
    rec = await env.LISENSI.get("sys:kunci", "json");   // baca ulang: kalau dua permintaan bersamaan, pakai yang tersimpan
  }
  const priv = await crypto.subtle.importKey("jwk", rec.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  KEYCACHE = { priv, pubB64: b64uStr(JSON.stringify(rec.pub)) };
  return KEYCACHE;
}
async function signToken(env, payload) {
  const k = await keys(env), p = b64uStr(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.priv, enc.encode(p));
  return p + "." + b64u(sig);
}

/* ---------- cek kode ke Mayar ---------- */
async function cekMayar(env, kode) {
  if (!env.MAYAR_API_KEY || !env.MAYAR_PRODUCT_ID) return { ok: false, err: "config" };
  let res;
  try {
    res = await fetch((env.MAYAR_BASE || "https://api.mayar.id") + "/software/v2/license/verify", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.MAYAR_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ licenseCode: kode, productId: env.MAYAR_PRODUCT_ID })
    });
  } catch (e) { return { ok: false, err: "net" }; }
  if (res.status === 404) return { ok: false, err: "tidakada" };
  if (res.status === 401) return { ok: false, err: "config" };
  let j = null; try { j = await res.json(); } catch (e) { }
  if (!res.ok || !j) return { ok: false, err: res.status >= 500 ? "net" : "tidakada" };
  const L = j.licenseCode || {};
  const aktif = j.isLicenseActive === true || L.status === "ACTIVE";
  const kedaluwarsa = L.expiredAt && Date.parse(L.expiredAt) < Date.now();
  if (!aktif || kedaluwarsa) return { ok: false, err: "nonaktif" };
  return { ok: true, email: L.customerEmail || "", nama: L.customerName || "", trx: L.transactionId || "" };
}

/* ---------- batas percobaan sederhana per IP ---------- */
async function rateOK(env, ip) {
  const k = "rl:" + ip + ":" + Math.floor(Date.now() / 3600e3);
  const n = +(await env.LISENSI.get(k) || 0);
  if (n >= 20) return false;
  await env.LISENSI.put(k, String(n + 1), { expirationTtl: 3700 });
  return true;
}

const PESAN = {
  tidakada: "Kode lisensi tidak ditemukan. Periksa lagi kode di email dari Mayar (huruf dan angkanya).",
  nonaktif: "Kode lisensi ini sudah tidak aktif. Hubungi bantuan kalau menurutmu ini keliru.",
  penuh: n => `Kode ini sudah dipakai di ${n} perangkat (batas maksimal). Hubungi bantuan untuk memindahkan lisensi.`,
  config: "Server lisensi belum selesai diatur. Hubungi bantuan.",
  net: "Server pembayaran sedang sibuk. Coba lagi beberapa menit lagi.",
  batas: "Terlalu banyak percobaan. Coba lagi satu jam lagi.",
  format: "Kode atau data perangkat tidak valid."
};

async function aktivasi(req, env) {
  let body = null; try { body = await req.json(); } catch (e) { }
  let kode = String(body && body.kode || "").replace(/\s+/g, "");
  if (/^tongki-/i.test(kode)) kode = kode.toUpperCase();   // kode manual selalu huruf besar
  const dev = String(body && body.perangkat || "");
  if (kode.length < 4 || kode.length > 64 || !/^[A-Za-z0-9-]{8,64}$/.test(dev)) return json({ ok: false, pesan: PESAN.format }, 400);
  const ip = req.headers.get("cf-connecting-ip") || "lokal";
  if (!(await rateOK(env, ip))) return json({ ok: false, pesan: PESAN.batas }, 429);

  const max = Math.max(1, parseInt(env.MAX_PERANGKAT || "3", 10) || 3);
  const id = "lis:" + await sha(kode);
  let rec = await env.LISENSI.get(id, "json");

  if (!rec || rec.src === "mayar") {
    const m = await cekMayar(env, kode);
    if (!m.ok) {
      // Mayar tidak bisa dihubungi tapi perangkat ini sudah pernah aktif: tetap izinkan
      if (m.err === "net" && rec && rec.dev.includes(dev)) { /* lanjut */ }
      else return json({ ok: false, pesan: PESAN[m.err] || PESAN.tidakada }, m.err === "net" ? 503 : 403);
    }
    if (!rec) rec = { src: "mayar", dev: [], dibuat: Date.now(), email: m.email || "", trx: m.trx || "" };
  }
  if (rec.nonaktif) return json({ ok: false, pesan: PESAN.nonaktif }, 403);
  const batas = rec.max || max;
  if (!rec.dev.includes(dev)) {
    if (rec.dev.length >= batas) return json({ ok: false, pesan: PESAN.penuh(batas) }, 403);
    rec.dev.push(dev);
  }
  rec.terakhir = Date.now();
  await env.LISENSI.put(id, JSON.stringify(rec));
  const token = await signToken(env, { v: 1, d: dev, c: kode.slice(0, 4).toUpperCase() + "…", t: Date.now() });
  return json({ ok: true, token, perangkat: rec.dev.length, batas });
}

/* ---------- admin ---------- */
function acak(n) { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => A[x % A.length]).join(""); }
async function admin(req, env, aksi) {
  let body = null; try { body = await req.json(); } catch (e) { }
  if (!env.ADMIN_TOKEN || !body || body.token !== env.ADMIN_TOKEN) return json({ ok: false, pesan: "Tidak diizinkan" }, 401);
  if (aksi === "buat-kode") {
    const n = Math.min(200, Math.max(1, parseInt(body.jumlah || "1", 10))), out = [];
    for (let i = 0; i < n; i++) {
      const kode = "TONGKI-" + acak(4) + "-" + acak(4);
      await env.LISENSI.put("lis:" + await sha(kode), JSON.stringify({ src: "manual", dev: [], dibuat: Date.now(), catatan: String(body.catatan || "").slice(0, 120), max: body.maxPerangkat ? +body.maxPerangkat : undefined }));
      out.push(kode);
    }
    return json({ ok: true, kode: out });
  }
  let kode = String(body.kode || "").replace(/\s+/g, "");
  if (/^tongki-/i.test(kode)) kode = kode.toUpperCase();
  const id = "lis:" + await sha(kode);
  const rec = await env.LISENSI.get(id, "json");
  if (!rec) return json({ ok: false, pesan: "Kode belum pernah diaktifkan / tidak ada" }, 404);
  if (aksi === "cek") return json({ ok: true, data: rec });
  if (aksi === "reset") { rec.dev = []; await env.LISENSI.put(id, JSON.stringify(rec)); return json({ ok: true, pesan: "Daftar perangkat dikosongkan" }); }
  if (aksi === "nonaktifkan") { rec.nonaktif = true; await env.LISENSI.put(id, JSON.stringify(rec)); return json({ ok: true, pesan: "Kode dinonaktifkan" }); }
  return json({ ok: false, pesan: "Aksi tidak dikenal" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    if (path.startsWith("/api/")) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204 });
      if (path === "/api/sehat") return json({ ok: true, kv: !!env.LISENSI, mayar: !!(env.MAYAR_API_KEY && env.MAYAR_PRODUCT_ID), admin: !!env.ADMIN_TOKEN });
      if (req.method !== "POST") return json({ ok: false, pesan: "Gunakan POST" }, 405);
      try {
        if (path === "/api/aktivasi") return await aktivasi(req, env);
        const m = path.match(/^\/api\/admin\/(buat-kode|cek|reset|nonaktifkan)$/);
        if (m) return await admin(req, env, m[1]);
      } catch (e) { return json({ ok: false, pesan: "Terjadi kesalahan di server lisensi." }, 500); }
      return json({ ok: false, pesan: "Tidak ditemukan" }, 404);
    }
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      const res = await env.ASSETS.fetch(new Request(new URL("/index.html", url), req));
      if (!res.ok) return res;
      const k = await keys(env), html = (await res.text()).replace("__TONGKI_PUBKEY__", k.pubB64);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    return env.ASSETS.fetch(req);
  }
};
