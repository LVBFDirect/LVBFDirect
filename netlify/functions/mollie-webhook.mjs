// POST /api/mollie-webhook — Mollie meldt hier dat een betaling is veranderd.
// We vertrouwen de melding niet blind: we halen de status altijd zelf op bij Mollie.
import { store, mollie } from "../../lib/shared.mjs";
import { markPaid } from "../../lib/promo.mjs";

export default async (req) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  try {
    const params = new URLSearchParams(await req.text());
    const paymentId = params.get("id");
    if (!paymentId || !/^tr_\w+$/.test(paymentId)) return new Response("", { status: 200 });

    const p = await mollie("/payments/" + encodeURIComponent(paymentId));
    const id = p.metadata && p.metadata.id;
    if (!id) return new Response("", { status: 200 });

    const s = store();
    const rec = await s.get("lvbf/" + id, { type: "json" });
    if (rec && rec.paymentId === paymentId) {
      rec.paymentStatus = p.status;
      if (p.status === "paid") rec.paid = true;
      if (rec.paid) await markPaid(id, rec);
      await s.setJSON("lvbf/" + id, rec);
    }
  } catch (err) {
    console.error("webhook:", err);
    return new Response("", { status: 500 }); // Mollie probeert het later opnieuw
  }
  return new Response("", { status: 200 });
};

export const config = { path: "/api/mollie-webhook" };
