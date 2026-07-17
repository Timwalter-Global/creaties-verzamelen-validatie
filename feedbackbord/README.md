# Feedbackbord · interne testsessie

Licht digitaal feedbackbord: deelnemers plakken anonieme post-its op een gedeeld bord (6 tabbladen × 5 categorieën), daarna stickerfase om te stemmen. Geen database — alles staat in `data/cards.json`.

## Starten

```
npm install
npm start
```

De server print de deelbare URL plus een QR-code in de terminal.

## Deelnemers verbinden

Zelfde wifi-netwerk als de laptop van de facilitator, dan de geprinte URL openen of de QR-code scannen (staat ook op de `/join`-pagina en op het bord).

- Bord (beamer/desktop): `http://<ip>:3000/`
- Kaartje toevoegen (mobiel): `http://<ip>:3000/join`
- Facilitator: `http://<ip>:3000/?facilitator=1` — kaartjes verslepen/verwijderen, stickerfase aan/uit, bord bevriezen, export CSV/JSON (gesorteerd op stickers).

## Oefenronde resetten

```
npm run reset
```

Maakt `data/cards.json` leeg (herstart daarna de server als die al draait). Een serverherstart verliest verder geen data.
