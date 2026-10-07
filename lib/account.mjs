// Accounts en credits: inloggen met een link per e-mail, saldo in Netlify Blobs.
//
// Opslag (in dezelfde store als de LVBF's):
//   account/<accountId>        { email, credits, created, lvbfs: [{ id, titel, created }], pending: [paymentId] }
//   login/<sha256(token)>      { email, next, exp }           inloglink, 20 minuten geldig
//   order/<paymentId>          { accountId, credits, credited } eenmaal bijschrijven per betaling
//   ledger/<accountId>/<tijd>  { delta, reden, ref, saldo }     elke mutatie, voor controle achteraf
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env, store, mollie, baseUrl, validId } from "./shared.mjs";

// ---------- bundels ----------
// Eén credit is één LVBF. Bedragen als string, zoals Mollie ze wil.
export const BUNDLES = {
  "5": { credits: 5, price: "8.95" },
  "10": { credits: 10, price: "15.95" },
  "25": { credits: 25, price: "34.95" },
};

// ---------- e-mail ----------
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
export function cleanEmail(v) {
  const e = String(v == null ? "" : v).trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : "";
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const accountIdFor = (email) => sha256("account:" + email).slice(0, 32);
const ACCOUNT_RE = /^[0-9a-f]{32}$/;

// ---------- sessie-cookie ----------
// Inhoud: <accountId>.<verloopt (seconden)>.<handtekening>. Ondertekend met SESSION_SECRET,
// zodat niemand zelf een cookie voor een ander account kan maken.
const COOKIE = "lvbf_sessie";
const SESSION_DAYS = 90;

function secret() {
  const s = env("SESSION_SECRET");
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ontbreekt of is te kort");
  return s;
}
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function sessionCookie(accountId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = accountId + "." + exp;
  return COOKIE + "=" + payload + "." + sign(payload) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_DAYS * 86400;
}
export const clearCookie = () => COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

export function sessionAccountId(req) {
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [id, exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!ACCOUNT_RE.test(id || "") || !/^\d+$/.test(exp || "") || !sig) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  let good;
  try { good = sign(id + "." + exp); } catch { return null; }
  const a = Buffer.from(sig), b = Buffer.from(good);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

// ---------- accounts ----------
export async function getAccount(accountId) {
  return store().get("account/" + accountId, { type: "json" });
}

export async function ensureAccount(email) {
  const id = accountIdFor(email);
  const fresh = { email, credits: 0, created: new Date().toISOString(), lvbfs: [], pending: [] };
  await store().setJSON("account/" + id, fresh, { onlyIfNew: true });
  return id;
}

// Wijzig een account veilig, ook als er tegelijk iets anders gebeurt (bijv. de Mollie-webhook
// en de bezoeker die terugkomt van iDEAL). We schrijven alleen als het account sinds het lezen
// niet veranderd is, en proberen anders opnieuw.
// `fn` past het account aan en geeft false terug als er niets hoeft te gebeuren.
export async function updateAccount(accountId, fn) {
  const s = store();
  for (let i = 0; i < 8; i++) {
    const got = await s.getWithMetadata("account/" + accountId, { type: "json" });
    if (!got || !got.data) return null;
    const acc = got.data;
    const res = fn(acc);
    if (res === false) return { acc, changed: false };
    const { modified } = await s.setJSON("account/" + accountId, acc, { onlyIfMatch: got.etag });
    if (modified) return { acc, changed: true };
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }
  throw new Error("Account kon niet worden bijgewerkt (te druk)");
}

export async function addLedger(accountId, entry) {
  const key = "ledger/" + accountId + "/" + new Date().toISOString() + "-" + randomBytes(3).toString("hex");
  await store().setJSON(key, entry).catch((err) => console.error("ledger:", err));
}

export function linkLvbf(acc, id, rec) {
  acc.lvbfs = acc.lvbfs || [];
  if (acc.lvbfs.some((x) => x.id === id)) return false;
  const titel = String((rec && rec.data && rec.data.les_titel) || "LVBF").slice(0, 120);
  acc.lvbfs.unshift({ id, titel, created: (rec && rec.created) || new Date().toISOString() });
  acc.lvbfs = acc.lvbfs.slice(0, 200);
  return true;
}

// ---------- credits kopen ----------
// Schrijf de credits van een betaalde bestelling precies één keer bij.
export async function settleOrder(paymentId, payment) {
  const s = store();
  const got = await s.getWithMetadata("order/" + paymentId, { type: "json" });
  if (!got || !got.data) return false;
  const order = got.data;
  const p = payment || (await mollie("/payments/" + encodeURIComponent(paymentId)));
  const done = p.status !== "open" && p.status !== "pending" && p.status !== "authorized";

  if (p.status === "paid" && !order.credited) {
    // Eerst de bestelling claimen; alleen wie dat lukt, schrijft bij.
    order.credited = true;
    order.status = p.status;
    const { modified } = await s.setJSON("order/" + paymentId, order, { onlyIfMatch: got.etag });
    if (!modified) return settleOrder(paymentId, p);
    const r = await updateAccount(order.accountId, (acc) => {
      acc.credits = (acc.credits || 0) + order.credits;
      acc.pending = (acc.pending || []).filter((x) => x !== paymentId);
    });
    if (r) await addLedger(order.accountId, { delta: order.credits, reden: "gekocht", ref: paymentId, saldo: r.acc.credits });
    return true;
  }
  if (done) {
    await updateAccount(order.accountId, (acc) => {
      const before = (acc.pending || []).length;
      acc.pending = (acc.pending || []).filter((x) => x !== paymentId);
      return acc.pending.length !== before;
    });
  }
  return false;
}

// Controleer openstaande bestellingen van dit account bij Mollie (voor als de webhook nog niet kwam).
export async function settlePending(acc) {
  for (const pid of (acc.pending || []).slice(0, 5)) {
    try { await settleOrder(pid); } catch (err) { console.error("settle:", err); }
  }
}

export async function createCreditPayment(accountId, bundleKey, lvbfId) {
  const b = BUNDLES[bundleKey];
  if (!b) throw new Error("Onbekende bundel");
  const base = baseUrl();
  const back = base + "/?" + (validId(lvbfId) ? "id=" + lvbfId + "&" : "") + "tegoed=1";
  const payment = await mollie("/payments", {
    method: "POST",
    body: {
      amount: { currency: "EUR", value: b.price },
      description: "LVBF Direct – " + b.credits + " credits",
      redirectUrl: back,
      webhookUrl: base + "/api/mollie-webhook",
      method: "ideal",
      metadata: { kind: "credits", accountId, credits: b.credits },
    },
  });
  await store().setJSON("order/" + payment.id, {
    accountId, credits: b.credits, price: b.price, created: new Date().toISOString(), credited: false,
  });
  await updateAccount(accountId, (acc) => {
    acc.pending = [payment.id, ...(acc.pending || [])].slice(0, 10);
  });
  return payment._links && payment._links.checkout && payment._links.checkout.href;
}

// ---------- inloglink ----------
export async function createLoginToken(email, next) {
  const token = randomBytes(32).toString("base64url");
  await store().setJSON("login/" + sha256(token), {
    email, next: validId(next) ? next : "", exp: Date.now() + 20 * 60 * 1000,
  });
  return token;
}

// Een link blijft 20 minuten bruikbaar en mag binnen die tijd vaker worden geopend:
// virusscanners van mailprogramma's openen links vaak al voordat de gebruiker klikt.
export async function readLoginToken(token) {
  if (typeof token !== "string" || !/^[\w-]{40,50}$/.test(token)) return null;
  const rec = await store().get("login/" + sha256(token), { type: "json" });
  if (!rec || rec.exp < Date.now()) return null;
  return rec;
}

export async function sendLoginMail(email, token) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY ontbreekt");
  const link = baseUrl() + "/api/inloggen?token=" + token;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      from: env("MAIL_FROM", "LVBF Direct <inloggen@lvbfdirect.nl>"),
      to: [email],
      subject: "Je inloglink voor LVBF Direct",
      text: "Klik op deze link om in te loggen bij LVBF Direct:\n\n" + link +
        "\n\nDe link werkt 20 minuten. Heb je niet geprobeerd in te loggen? Dan kun je deze mail negeren.",
      html:
        '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">' +
        "<p>Klik op de knop om in te loggen bij LVBF Direct.</p>" +
        '<p><a href="' + link + '" style="display:inline-block;background:#0B7A57;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Inloggen</a></p>' +
        '<p style="font-size:14px;color:#555">De link werkt 20 minuten. Heb je niet geprobeerd in te loggen? Dan kun je deze mail negeren.</p>' +
        "</div>",
    }),
  });
  if (!res.ok) throw new Error("Resend " + res.status + ": " + (await res.text()).slice(0, 300));
}

// Eenvoudige teller per sleutel per tijdvak, tegen misbruik van het inlogformulier.
export async function underLimit(key, limit, windowMs) {
  const slot = Math.floor(Date.now() / windowMs);
  const k = "ratelimit/" + key + "/" + slot;
  const s = store();
  const n = (await s.get(k, { type: "json" })) || 0;
  if (n >= limit) return false;
  await s.setJSON(k, n + 1);
  return true;
}

export const hash = sha256;
