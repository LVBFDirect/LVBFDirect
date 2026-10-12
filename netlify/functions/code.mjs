// POST /api/code — verzilvert een actiecode (bijv. van de QR-sticker) voor het ingelogde account.
import { json } from "../../lib/shared.mjs";
import { sessionAccountId, redeemCode, underLimit } from "../../lib/account.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);
  const accountId = sessionAccountId(req);
  if (!accountId) return json({ error: "Log eerst in om je code te gebruiken." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  if (!(await underLimit("code/" + accountId, 10, 3600000))) {
    return json({ error: "Te veel pogingen. Probeer het later opnieuw." }, 429);
  }
  try {
    const res = await redeemCode(accountId, body && body.code);
    return json(res, res.ok ? 200 : 400);
  } catch (err) {
    console.error("code:", err);
    return json({ error: "Code verzilveren is niet gelukt. Probeer het zo nog eens." }, 502);
  }
};

export const config = { path: "/api/code" };
