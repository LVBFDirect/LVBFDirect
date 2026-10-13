// POST /api/login — stuurt een inloglink naar het opgegeven e-mailadres.
// We zeggen nooit of een adres al een account heeft; het antwoord is altijd hetzelfde.
import { json } from "../../lib/shared.mjs";
import { cleanEmail, createLoginToken, sendLoginMail, underLimit, hash } from "../../lib/account.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  const email = cleanEmail(body && body.email);
  if (!email) return json({ error: "Vul een geldig e-mailadres in." }, 400);

  const okIp = await underLimit("login-ip/" + encodeURIComponent(context.ip || "onbekend"), 10, 3600000);
  const okMail = okIp && (await underLimit("login-mail/" + hash(email).slice(0, 32), 3, 900000));
  if (!okIp || !okMail) {
    return json({ error: "Je hebt al een paar inloglinks aangevraagd. Kijk in je mail (ook bij spam) of probeer het later opnieuw." }, 429);
  }

  try {
    const token = await createLoginToken(email, body.next);
    await sendLoginMail(email, token);
  } catch (err) {
    console.error("login:", err);
    return json({ error: "De inlogmail kon niet worden verstuurd. Probeer het zo nog eens.", detail: reason(err) }, 502);
  }
  return json({ ok: true });
};

// Korte, veilige uitleg van de fout, zodat je zonder logboek ziet wat er misgaat.
// Bevat nooit sleutels: alleen onze eigen melding of de foutmelding van Resend.
function reason(err) {
  const m = String((err && err.message) || "");
  if (m.includes("RESEND_API_KEY ontbreekt")) return "RESEND_API_KEY ontbreekt in Netlify.";
  const r = m.match(/^Resend (\d+): (.*)$/s);
  if (r) {
    let msg = r[2];
    try { msg = JSON.parse(r[2]).message || msg; } catch {}
    return "Resend " + r[1] + ": " + String(msg).replace(/re_[\w-]+/g, "re_…").slice(0, 200);
  }
  return "Opslag of netwerk: " + m.replace(/re_[\w-]+/g, "re_…").slice(0, 120);
}

export const config = { path: "/api/login" };
