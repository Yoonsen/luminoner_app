# PWA Migration Plan for Luminoner

Dette dokumentet skisserer veien fra en Python/Streamlit-applikasjon til en fullverdig, serverløs Progressive Web App (PWA). Målet er å ha en uavhengig, superrask og stabil versjon klar til workshopen på DHKO.

## Hvorfor PWA?
- **Uavhengighet:** Vi blir ikke påvirket av at Streamlit Cloud restarter apper, sover, eller endrer plattformen sin.
- **Lokal ytelse:** All databehandling (parsing av Excel, JSONL, filtrering) skjer direkte i brukerens nettleser. Ingen opplasting til server!
- **Installasjon:** Kan installeres rett fra nettleseren som et skrivebordsprogram.

## Arkitektur
- **Frontend-rammeverk:** Next.js (React) eller Vite + React. 
- **Styling:** TailwindCSS for lynrask, moderne styling (gir mye mer kontroll enn Streamlit).
- **Hosting & Backend:** Vercel. Vi bruker Vercel sine serverløse "API Routes" kun som en proxy for LLM-kall (for å omgå CORS-restriksjoner fra Anthropic/OpenAI), mens selve appen kjører i nettleseren.
- **Datalagring:** Nettleserens IndexedDB / LocalStorage for midlertidig lagring av rader under kjøring (forhindrer datatap hvis fanen lukkes).

## Oppgaveliste (Roadmap)

### Fase 1: Grunnlag og Design
- [ ] Sette opp nytt Next.js-prosjekt (eller tilsvarende).
- [ ] Implementere PWA `manifest.json` og en basic Service Worker.
- [ ] Oversette Streamlit-layouten til et rent React-design (hovedseksjoner for oppsett, inndata og kjøring).
- [ ] Sette opp støtte for opplasting av `.csv`, `.tsv`, og `.xlsx` i nettleseren.

### Fase 2: LLM-integrasjon og Proxy
- [ ] Sette opp en API-rute (f.eks. `/api/analyze`) på Vercel som tar imot tekst + brukerens API-nøkkel, sender det til valgt tilbyder (OpenAI, Anthropic, Gemini), og returnerer JSON.
- [ ] Bygge en felles adapter i frontend som bygger promptene (slik Python-koden gjør i dag).

### Fase 3: Batch-motoren
- [ ] Bygge et kø-system (Event Loop / Web Workers) i JavaScript som mater rader én og én til API-en, uten å fryse grensesnittet.
- [ ] Implementere feilhåndtering ("Worker-feil") og automatisk retries i JavaScript.
- [ ] Vise en progress-bar som oppdateres i sanntid etter hver returnerte JSON-blob.

### Fase 4: Resultater og Eksport
- [ ] Bygge interaktive tabeller og grafer for fordelingen av kategorier.
- [ ] Skrive logikk for å generere nedlastbare `.csv` og `.jsonl` filer direkte fra JavaScript (ved bruk av `Blob`-objekter).
