// GET /api/account — wie is er ingelogd, hoeveel credits, welke LVBF's.
// Controleert ook openstaande creditbestellingen bij Mollie, voor als de webhook nog niet kwam.
import { json } from "../../lib/shared.mjs";
import { sessionAccountId, getAccount, settlePending, BUNDLES } from "../../lib/account.mjs";

const bundles = Object.entries(BUNDLES).map(([key, b]) => ({ key, credits: b.credits, price: b.price }));

export default async (req) => {
  const accountId = sessionAccountId(req);
  if (!accountId) return json({ loggedIn: false, bundles });
  let acc = await getAccount(accountId);
  if (!acc) return json({ loggedIn: false, bundles });
  if ((acc.pending || []).length) {
    await settlePending(acc);
    acc = (await getAccount(accountId)) || acc;
  }
  return json({
    loggedIn: true,
    email: acc.email,
    credits: acc.credits || 0,
    pending: (acc.pending || []).length,
    lvbfs: (acc.lvbfs || []).slice(0, 50),
    bundles,
  });
};

export const config = { path: "/api/account" };
