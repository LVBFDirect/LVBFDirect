// GET /api/inloggen?token=… — de link uit de inlogmail. Zet het sessie-cookie en stuurt door naar de site.
import { baseUrl } from "../../lib/shared.mjs";
import { readLoginToken, ensureAccount, sessionCookie } from "../../lib/account.mjs";

const redirect = (to, cookie) => {
  const headers = { Location: to, "cache-control": "no-store" };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(null, { status: 302, headers });
};

export default async (req) => {
  const base = baseUrl() || new URL(req.url).origin;
  try {
    const rec = await readLoginToken(new URL(req.url).searchParams.get("token"));
    if (!rec) return redirect(base + "/?login=verlopen");
    const accountId = await ensureAccount(rec.email);
    const to = base + "/?" + (rec.next ? "id=" + rec.next + "&" : "") + "login=ok";
    return redirect(to, sessionCookie(accountId));
  } catch (err) {
    console.error("inloggen:", err);
    return redirect(base + "/?login=fout");
  }
};

export const config = { path: "/api/inloggen" };
