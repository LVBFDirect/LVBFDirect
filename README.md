# LVBF Direct — zo zet je de site live op lvbfdirect.nl

Deze map is de complete website plus een klein serverdeel:

| Map / bestand | Wat het doet |
|---|---|
| `public/index.html` | De website zelf |
| `netlify/functions/generate.mjs` | Laat Claude de LVBF maken en stuurt een onleesbaar voorbeeld terug |
| `netlify/functions/pay.mjs` | Maakt een iDEAL-betaling aan bij Mollie |
| `netlify/functions/mollie-webhook.mjs` | Mollie meldt hier dat er betaald is |
| `netlify/functions/result.mjs` | Geeft na betaling de volledige LVBF vrij |
| `lib/shared.mjs` | Gedeelde code (opdracht aan Claude, opslag, Mollie) |

De volledige tekst van een LVBF blijft op de server tot er betaald is. In het voorbeeld zijn alle zinnen vervangen door willekeurige letters, dus ook met trucjes in de browser kan niemand hem gratis lezen.

Hosting gebeurt bij **Netlify**. Hun gratis plan mag je ook gebruiken voor een site waarmee je geld verdient, en de opslag (Netlify Blobs) zit er al bij.

---

## Stap 1 — Code op GitHub zetten

1. Maak een gratis account op github.com.
2. Klik op **New repository**, noem hem `lvbfdirect`, kies **Private** en maak hem aan.
3. Klik op **uploading an existing file** en sleep de **inhoud** van deze map erin (dus `public`, `netlify`, `lib`, `netlify.toml`, `package.json`, `.gitignore`, `README.md`).
4. Klik op **Commit changes**.

## Stap 2 — Site aanmaken op Netlify

1. Maak een gratis account op netlify.com (inloggen met GitHub is het makkelijkst).
2. **Add new project → Import an existing project → GitHub** en kies `lvbfdirect`.
3. Laat de instellingen staan zoals ze zijn en klik op **Deploy**.

Je site staat nu op een adres als `iets-willekeurigs.netlify.app`. Genereren werkt nog niet: daarvoor zijn eerst de sleutels uit stap 3 en 4 nodig.

## Stap 3 — Claude API-sleutel

1. Ga naar console.anthropic.com en maak een account.
2. Zet er een klein tegoed op (bijvoorbeeld €10) onder **Billing**. Stel ook een maandlimiet in, zodat je nooit voor verrassingen komt te staan.
3. Ga naar **API Keys → Create Key** en kopieer de sleutel (begint met `sk-ant-`).

Deel deze sleutel met niemand en zet hem nooit in de website zelf. Hij hoort alleen in Netlify (stap 5).

## Stap 4 — Mollie (iDEAL)

1. Maak een account op mollie.com. Mollie vraagt om bedrijfsgegevens; meestal is een KvK-inschrijving nodig.
2. Ga in het dashboard naar **Developers → API keys**.
3. Begin met de **test**-sleutel (begint met `test_`). Daarmee kun je betalingen nadoen zonder echt geld.
4. Pas als alles werkt en Mollie je account heeft goedgekeurd, wissel je naar de **live**-sleutel (begint met `live_`).

## Stap 5 — Sleutels invullen in Netlify

In Netlify: **Project configuration → Environment variables → Add a variable**. Voeg toe:

| Naam | Waarde |
|---|---|
| `ANTHROPIC_API_KEY` | je sleutel uit stap 3 |
| `MOLLIE_API_KEY` | je Mollie-sleutel uit stap 4 |
| `PUBLIC_URL` | `https://lvbfdirect.nl` (pas invullen na stap 6; tot die tijd je `.netlify.app`-adres) |

Optioneel:

| Naam | Standaard | Waarvoor |
|---|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-5` | Welk Claude-model de LVBF schrijft |
| `PRICE_EUR` | `1.99` | De prijs per LVBF |
| `RATE_LIMIT_PER_HOUR` | `10` | Max. aantal voorbeelden per bezoeker per uur (beschermt je Claude-tegoed) |

Daarna: **Deploys → Trigger deploy → Deploy project**, zodat de sleutels actief worden.

## Stap 6 — lvbfdirect.nl koppelen (TransIP)

1. In Netlify: **Domain management → Add a domain** en vul `lvbfdirect.nl` in.
2. Netlify laat zien welke DNS-records nodig zijn. Meestal zijn dat:
   - een **A-record** voor `@` naar `75.2.60.5`
   - een **CNAME-record** voor `www` naar jouw `….netlify.app`-adres
3. Log in bij TransIP → **Domein & Hosting → lvbfdirect.nl → DNS** en zet daar precies de records die Netlify noemt. Verwijder bestaande A-records voor `@` en `www` die ergens anders heen wijzen.
4. Het kan tot een paar uur duren voordat het werkt. Netlify regelt daarna vanzelf het slotje (HTTPS).
5. Zet `PUBLIC_URL` in Netlify op `https://lvbfdirect.nl` en deploy opnieuw.

Let op: laat de **MX-records** bij TransIP staan als je daar ook je mail (info@lvbfdirect.nl) hebt.

## Stap 7 — Testen

1. Open lvbfdirect.nl en maak een voorbeeld.
2. Klik op **Betaal met iDEAL**. Met de test-sleutel kom je op een testpagina van Mollie waar je zelf kiest of de betaling lukt.
3. Kies **Paid**: je komt terug op de site en de LVBF is leesbaar.
4. Probeer ook **Canceled**: de site moet dan zeggen dat de betaling niet gelukt is.

Werkt alles, dan wissel je in stap 5 naar de live-sleutel van Mollie.

---

## Voordat je live gaat

- Zet een **privacyverklaring** en **algemene voorwaarden** op de site. Je bewaart namen, scholen en lesbeschrijvingen, dus dat is nodig onder de AVG.
- Check of je je bij de **KvK** moet inschrijven zodra je gaat verkopen.
- Houd in de gaten wat een LVBF je kost aan Claude-tegoed (console.anthropic.com → Usage), zodat de €1,99 ruim genoeg blijft.

## Problemen?

- **"Het maken is niet gelukt"**: kijk in Netlify bij **Logs → Functions → generate**. Meestal ontbreekt `ANTHROPIC_API_KEY` of is het tegoed op.
- **Betalen start niet**: kijk bij de logs van `pay`. Meestal ontbreekt `MOLLIE_API_KEY` of `PUBLIC_URL`.
- **Na betalen blijft hij "gecontroleerd"**: vernieuw de pagina. De site vraagt de status dan opnieuw aan Mollie.
