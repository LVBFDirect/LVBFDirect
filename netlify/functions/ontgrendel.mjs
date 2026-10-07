// POST /api/ontgrendel — ontgrendelt een LVBF met één credit van het ingelogde account.
import { json, validId, store } from "../../lib/shared.mjs";
import { sessionAccountId, updateAccount, addLedger, linkLvbf } from "../../lib/account.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);
  const accountId = sessionAccountId(req);
  if (!accountId) return json({ error: "Log eerst in om je credits te gebruiken." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  const id = body && body.id;
  if (!validId(id)) return json({ error: "Onbekende LVBF." }, 400);

  const s = store();
  const rec = await s.get("lvbf/" + id, { type: "json" });
  if (!rec) return json({ error: "Deze LVBF bestaat niet (meer). Maak een nieuw voorbeeld." }, 404);

  if (rec.paid) {
    await updateAccount(accountId, (acc) => linkLvbf(acc, id, rec));
    return json({ paid: true, id, meta: rec.meta, data: rec.data });
  }

  // Eerst de credit afschrijven (veilig bij gelijktijdige klikken), daarna pas vrijgeven.
  // Staat hij al in de lijst van dit account, dan is er al een credit voor gebruikt (dubbelklik).
  let noCredit = false, charged = false;
  const r = await updateAccount(accountId, (acc) => {
    noCredit = charged = false;
    if ((acc.lvbfs || []).some((x) => x.id === id)) return false;
    if ((acc.credits || 0) < 1) { noCredit = true; return false; }
    acc.credits -= 1;
    linkLvbf(acc, id, rec);
    charged = true;
  });
  if (!r) return json({ error: "Log opnieuw in." }, 401);
  if (noCredit) return json({ error: "Je hebt geen credits meer. Koop een bundel of betaal deze LVBF los." }, 402);

  try {
    rec.paid = true;
    rec.paidWith = "credit";
    rec.accountId = accountId;
    await s.setJSON("lvbf/" + id, rec);
  } catch (err) {
    console.error("ontgrendel:", err);
    if (charged) {
      await updateAccount(accountId, (acc) => {
        acc.credits = (acc.credits || 0) + 1;
        acc.lvbfs = (acc.lvbfs || []).filter((x) => x.id !== id);
      });
    }
    return json({ error: "Ontgrendelen is niet gelukt. Je credit is niet gebruikt; probeer het opnieuw." }, 502);
  }
  if (charged) await addLedger(accountId, { delta: -1, reden: "lvbf", ref: id, saldo: r.acc.credits });
  return json({ paid: true, id, meta: rec.meta, data: rec.data, credits: r.acc.credits });
};

export const config = { path: "/api/ontgrendel" };
