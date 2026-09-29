// GET /api/result?id=… — geeft de volledige LVBF terug als er betaald is,
// anders opnieuw het onleesbare voorbeeld plus de betaalstatus.
import { json, validId, store, scramble, refreshPaid } from "../../lib/shared.mjs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!validId(id)) return json({ error: "Onbekende LVBF." }, 400);

  let rec = await store().get("lvbf/" + id, { type: "json" });
  if (!rec) return json({ error: "Deze LVBF bestaat niet (meer). Maak een nieuw voorbeeld." }, 404);

  try { rec = await refreshPaid(id, rec); } catch (err) { console.error("result:", err); }

  if (rec.paid) return json({ paid: true, id, meta: rec.meta, data: rec.data });
  return json({ paid: false, id, status: rec.paymentStatus || null, meta: rec.meta, preview: scramble(rec.data) });
};

export const config = { path: "/api/result" };
