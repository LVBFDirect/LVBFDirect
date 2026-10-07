// POST /api/uitloggen — verwijdert het sessie-cookie.
import { json } from "../../lib/shared.mjs";
import { clearCookie } from "../../lib/account.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);
  const res = json({ ok: true });
  res.headers.set("set-cookie", clearCookie());
  return res;
};

export const config = { path: "/api/uitloggen" };
