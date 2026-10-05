// POST /api/pay — maakt een iDEAL-betaling aan bij Mollie en geeft de betaallink terug.
import { json, validId, store, mollie, baseUrl } from "../../lib/shared.mjs";
import { klant, buyerKeys, priceFor, reserve } from "../../lib/promo.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  const id = body && body.id;
  if (!validId(id)) return json({ error: "Onbekende LVBF." }, 400);

  const s = store();
  const rec = await s.get("lvbf/" + id, { type: "json" });
  if (!rec) return json({ error: "Deze LVBF bestaat niet (meer). Maak een nieuw voorbeeld." }, 404);
  if (rec.paid) return json({ paid: true });

  const k = klant(req);
  const keys = await buyerKeys(context.ip, k.id);
  const base = baseUrl();
  try {
    const prijs = await priceFor(keys, id);
    const titel = String((rec.data && rec.data.les_titel) || "lesvoorbereiding").slice(0, 120);
    const payment = await mollie("/payments", {
      method: "POST",
      body: {
        amount: { currency: "EUR", value: prijs.price },
        description: "LVBF Direct – " + titel + (prijs.promo ? " (actie eerste LVBF)" : ""),
        redirectUrl: base + "/?id=" + id,
        webhookUrl: base + "/api/mollie-webhook",
        method: "ideal",
        metadata: { id },
      },
    });
    rec.paymentId = payment.id;
    rec.paymentStatus = payment.status;
    rec.amount = prijs.price;
    rec.promo = prijs.promo;
    rec.buyer = keys;
    await s.setJSON("lvbf/" + id, rec);
    if (prijs.promo) await reserve(keys, id);
    const res = json({ checkoutUrl: payment._links && payment._links.checkout && payment._links.checkout.href });
    if (k.setCookie) res.headers.append("set-cookie", k.setCookie);
    return res;
  } catch (err) {
    console.error("pay:", err);
    return json({ error: "Betalen starten is niet gelukt. Probeer het zo nog eens." }, 502);
  }
};

export const config = { path: "/api/pay" };
