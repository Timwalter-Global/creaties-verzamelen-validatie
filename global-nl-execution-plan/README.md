# Global NL Execution Plan — July 2026

Wachtwoordbeveiligde statische pagina, gehost via GitHub Pages.

## Beveiliging

De pagina (`index.html`) is versleuteld met [StatiCrypt](https://github.com/robinmoisson/staticrypt)
(AES-256, WebCrypto). De inhoud is zonder het juiste wachtwoord niet leesbaar — ook niet in de
broncode van deze repository. Het wachtwoord wordt apart gedeeld en staat bewust **niet** in deze repo.

## Hosting

Bij elke push naar `main` publiceert de workflow in `.github/workflows/deploy-pages.yml`
de pagina automatisch naar GitHub Pages (de workflow schakelt Pages zelf in bij de eerste run).

## Wachtwoord wijzigen

Versleutel het originele (onversleutelde) HTML-bestand opnieuw:

```bash
npx staticrypt origineel.html -p "NIEUW_WACHTWOORD" -d . --short
```

en vervang `index.html` door het nieuwe versleutelde bestand.
