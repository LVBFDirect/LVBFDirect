// Actie: de eerste LVBF die iemand koopt kost minder (standaard €0,50 in plaats van €1,99).
//
// Er zijn geen accounts, dus "eerste" bepalen we aan de serverkant met twee kenmerken:
//  - een vaste, willekeurige klantcode in een cookie (HttpOnly, dus niet via de browser te lezen);
//    per klantcode is de actie precies één keer te gebruiken;
//  - het IP-adres (alleen als hash opgeslagen). Op een schoolnetwerk delen veel studenten één
//    IP-adres, daarom mag een IP-adres de actie een paar keer per 30 dagen gebruiken.
// Elke betaalde LVBF telt mee, ook een LVBF die voor de volle prijs is gekocht.
//
// Instellingen (Netlify, Environment variables):
//  PROMO_PRICE_EUR  standaard 0.50; zet op "uit" om de actie te stoppen
//  PROMO_PER_IP     standaard 3; zoveel actie-aankopen per IP-adres per 30 dagen
import { env, store } from "./shared.mjs";

const COOKIE = "lvbf_klant";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = 24 * 3600 * 1000;
const OPEN_HOLD = 30 * 60 * 1000; // een open actiebetaling houdt de actie zo lang vast

export function normalPrice() {
  return env("PRICE_EUR", "1.99");
}

export function promoPrice() {
  const p = env("PROMO_PRICE_EUR", "0.50");
  return /^\d+\.\d{2}$/.test(p) ? p : null; // "uit" of iets ongeldigs: geen actie
}

// Leest de klantcode uit de cookie, of maakt een nieuwe. setCookie is dan de header om mee te sturen.
export function klant(req) {
  const m = /(?:^|;\s*)lvbf_klant=([^;]+)/.exec(req.headers.get("cookie") || "");
  if (m && UUID_RE.test(m[1])) return { id: m[1], setCookie: null };
  const id = crypto.randomUUID();
  return {
    id,
    setCookie: COOKIE + "=" + id + "; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax",
  };
}

async function hashIp(ip) {
  const data = new TextEncoder().encode("lvbf-actie|" + (ip || "onbekend"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// De sleutels in de opslag die bij deze koper horen.
export async function buyerKeys(ip, klantId) {
  return ["promo/klant/" + klantId, "promo/ip/" + (await hashIp(ip))];
}

function limitFor(key) {
  if (key.startsWith("promo/klant/")) return 1;
  const n = parseInt(env("PROMO_PER_IP", "3"), 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

// Mag deze koper de actieprijs krijgen voor LVBF `lvbfId`? (lvbfId mag leeg zijn: alleen tonen.)
export async function eligible(keys, lvbfId) {
  if (!promoPrice()) return false;
  const s = store();
  for (const key of keys) {
    const e = (await s.get(key, { type: "json" })) || {};
    const since = key.startsWith("promo/ip/") ? Date.now() - 30 * DAY : 0;
    let used = (e.used || []).filter((u) => u.at >= since && u.id !== lvbfId).length;
    if (e.open && e.open.id !== lvbfId) {
      const ref = await s.get("lvbf/" + e.open.id, { type: "json" });
      if (ref && ref.paid) used++;
      else if (ref && Date.now() - e.open.at < OPEN_HOLD && ["open", "pending", "authorized"].includes(ref.paymentStatus)) {
        return false; // er staat al een actiebetaling open voor een andere LVBF
      }
    }
    if (used >= limitFor(key)) return false;
  }
  return true;
}

// Prijs voor deze koper: { price: "0.50", normal: "1.99", promo: true }
export async function priceFor(keys, lvbfId) {
  const normal = normalPrice();
  const promo = await eligible(keys, lvbfId);
  return { price: promo ? promoPrice() : normal, normal, promo };
}

// Een actiebetaling is aangemaakt: houd de actie vast voor deze LVBF.
export async function reserve(keys, lvbfId) {
  const s = store();
  for (const key of keys) {
    const e = (await s.get(key, { type: "json" })) || {};
    e.open = { id: lvbfId, at: Date.now() };
    await s.setJSON(key, e);
  }
}

// Een LVBF is betaald: telt mee als aankoop, zodat de actie daarna niet meer geldt.
export async function markPaid(lvbfId, rec) {
  if (!rec.buyer || rec.buyerMarked) return;
  const s = store();
  for (const key of rec.buyer) {
    const e = (await s.get(key, { type: "json" })) || {};
    e.used = (e.used || []).filter((u) => u.id !== lvbfId).concat({ id: lvbfId, at: Date.now() });
    if (e.open && e.open.id === lvbfId) e.open = null;
    await s.setJSON(key, e);
  }
  rec.buyerMarked = true;
}
