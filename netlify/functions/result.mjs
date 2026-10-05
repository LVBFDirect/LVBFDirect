// GET /api/result?id=… — geeft de volledige LVBF terug als er betaald is,
// anders opnieuw het onleesbare voorbeeld plus de betaalstatus.
import { json, validId, store, scramble, refreshPaid } from "../../lib/shared.mjs";
import { klant, buyerKeys, priceFor, markPaid } from "../../lib/promo.mjs";

export default async (req, context) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!validId(id)) return json({ error: "Onbekende LVBF." }, 400);

  let rec = await store().get("lvbf/" + id, { type: "json" });
  if (!rec) return json({ error: "Deze LVBF bestaat niet (meer). Maak een nieuw voorbeeld." }, 404);

  try { rec = await refreshPaid(id, rec); } catch (err) { console.error("result:", err); }
  if (rec.paid && rec.buyer && !rec.buyerMarked) {
    try { await markPaid(id, rec); await store().setJSON("lvbf/" + id, rec); } catch (err) { console.error("result:", err); }
  }

  if (rec.paid) return json({ paid: true, id, meta: rec.meta, data: rec.data });
  const k = klant(req);
  const prijs = await priceFor(await buyerKeys(context.ip, k.id), id).catch((err) => { console.error("result prijs:", err); return {}; });
  const res = json({ paid: false, id, status: rec.paymentStatus || null, meta: rec.meta, preview: scramble(rec.data), ...prijs });
  if (k.setCookie) res.headers.append("set-cookie", k.setCookie);
  return res;
};

export const config = { path: "/api/result" };
