// POST /api/credits — start een iDEAL-betaling voor een creditbundel. Alleen voor ingelogde bezoekers.
import { json } from "../../lib/shared.mjs";
import { sessionAccountId, getAccount, createCreditPayment, BUNDLES } from "../../lib/account.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);
  const accountId = sessionAccountId(req);
  if (!accountId || !(await getAccount(accountId))) return json({ error: "Log eerst in om credits te kopen." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  const bundle = String(body && body.bundle);
  if (!BUNDLES[bundle]) return json({ error: "Kies een bundel." }, 400);
  try {
    const checkoutUrl = await createCreditPayment(accountId, bundle, body.id);
    return json({ checkoutUrl });
  } catch (err) {
    console.error("credits:", err);
    return json({ error: "Betalen starten is niet gelukt. Probeer het zo nog eens." }, 502);
  }
};

export const config = { path: "/api/credits" };
