// GET /api/prijs — welke prijs deze bezoeker betaalt (actieprijs voor de eerste LVBF of de normale prijs).
// Zet ook de klantcode-cookie, zodat de actie aan deze browser gekoppeld is.
import { json } from "../../lib/shared.mjs";
import { klant, buyerKeys, priceFor } from "../../lib/promo.mjs";

export default async (req, context) => {
  const k = klant(req);
  let prijs;
  try {
    prijs = await priceFor(await buyerKeys(context.ip, k.id), "");
  } catch (err) {
    console.error("prijs:", err);
    return json({ error: "Prijs ophalen is niet gelukt." }, 500);
  }
  const res = json(prijs);
  if (k.setCookie) res.headers.append("set-cookie", k.setCookie);
  return res;
};

export const config = { path: "/api/prijs" };
