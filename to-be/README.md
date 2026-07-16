# Creaties verzamelen · Procesflow TO-BE (v2) · validatiepagina

**Live pagina:** https://timwalter-global.github.io/creaties-verzamelen-validatie/to-be/

## Doel

Interactieve validatiepagina voor het toekomstige procesontwerp (to-be) van
"Creaties verzamelen" (Fase 2 van de AI Challenge, concept v2 met feedback­ronde 1
verwerkt). Collega's lopen de BPM-flow door, klikken op stappen en pijlen voor
detailinformatie, stemmen per onderdeel **Klopt / Klopt niet** en plaatsen
reacties.

De as-is validatiepagina (Fase 1) staat op de hoofdpagina van deze repository:
https://timwalter-global.github.io/creaties-verzamelen-validatie/

## Opslag

Alle feedback wordt opgeslagen in het bestaande Supabase-project, in eigen
tabellen zodat to-be-feedback gescheiden blijft van de as-is-feedback:

| Tabel            | Inhoud                                   |
|------------------|------------------------------------------|
| `to_be_comments` | Reacties per proceselement of verbinding |
| `to_be_votes`    | Stemmen (klopt / klopt_niet), één per persoon per element |

De pagina gebruikt de *publishable* (anon) key; Row Level Security staat aan
met alleen select-, insert- en update-rechten (geen delete).

## Let op

**Reacties en namen zijn zichtbaar voor iedereen met de link.**
