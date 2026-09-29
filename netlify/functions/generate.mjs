// POST /api/generate — maakt een LVBF met Claude en geeft een onleesbaar voorbeeld terug.
// De volledige tekst blijft op de server tot er betaald is.
// Het antwoord wordt gestreamd (met spaties als "hartslag"), zodat de functie
// tot 60 seconden mag draaien in plaats van de normale 10 seconden.
import { json, cleanMeta, allowRequest, callClaude, scramble, store } from "../../lib/shared.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  const meta = cleanMeta(body);
  if (!meta.beschrijving) return json({ error: "Beschrijf eerst kort je les, of kies een voorbeeld." }, 400);

  if (!(await allowRequest(context.ip))) {
    return json({ error: "Je hebt het maximum aantal voorbeelden voor dit uur bereikt. Probeer het later opnieuw." }, 429);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const ping = setInterval(() => controller.enqueue(enc.encode(" ")), 5000);
      let out;
      try {
        const data = await callClaude(meta);
        const id = crypto.randomUUID();
        await store().setJSON("lvbf/" + id, { meta, data, created: new Date().toISOString(), paid: false });
        out = { id, meta, preview: scramble(data) };
      } catch (err) {
        console.error("generate:", err);
        out = { error: "Het maken is niet gelukt. Probeer het nog een keer." };
      }
      clearInterval(ping);
      controller.enqueue(enc.encode(JSON.stringify(out)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/generate" };
