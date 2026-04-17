## PWA løft (videre arbeid)

- Bygg en dedikert PWA-frontend (React/Vite/Next) med manifest, service worker og samme funksjoner som Streamlit-siden: input for tekst/CSV, batchkontroller, fremdrift og tabeller/nedlasting.
- Flytt Python-logikken fra `app.py` (normalisering, batching, OpenAI-kall, parsing) inn i et API-lag (FastAPI/Flask) slik at frontenden kun kaller JSON-endepunkter.
- Implementer `POST /annotate` som tar linjer + innstillinger, instansierer `OpenAI(api_key=user_key)` per request og returnerer output-listen.
- La brukeren legge inn egen OpenAI-nøkkel i frontenden; lagre den kun i sessionStorage/IndexedDB og send den over HTTPS i hver request (aldri logge eller lagre på server).
- Skille feiltyper: 401/429 fra OpenAI, valideringsfeil fra brukerinput, generelle serverfeil – gi tydelige tilbakemeldinger i UI.
- Valgfritt: legg til et lett `/validate-key`-endepunkt som setter opp en minimal testkall slik at brukerne kan sjekke nøkkelen før de kjører store jobber.

## App-familie og produksjonsløp

- Definer en app-familie med tydelige roller:
  - `luminoner-setup` (enkel oppsett/app for felt, prompt og mindre kjøringer)
  - `luminoner-runner-local` (lokalt produksjonsdashboard for lange kjøringer, robust start/stopp, monitorering)
  - `luminoner-cli` (scriptbar batchkjøring og automatisering)
- Beskriv felles kjernebibliotek (`luminoner-core`) som alle appene bruker for:
  - parsing av input
  - promptbygging
  - batching/kø
  - JSON-validering
  - eksport (JSONL/CSV/Excel)
- Lag provider-abstraksjon slik at flere modelltilbydere støttes via OpenAI-kompatibelt API:
  - OpenAI
  - Anthropic (der OpenAI-kompatibelt endpoint finnes)
  - Google/Gemini (der OpenAI-kompatibelt endpoint finnes)
  - andre OpenAI-kompatible gateways
- Innfør modellkonfig per provider:
  - `base_url`
  - `api_key`
  - `model_name`
  - opsjoner for temperatur, timeout, retry-policy
- Bygg UI for "egne nøkler" per kjøring/bruker:
  - unngå at alt går på én konto
  - lagre nøkler kun lokalt/session (ikke i repo/serverlogg)
  - tydelig markering av hvilken nøkkel/provider som brukes i hver jobb
- For lokal produksjonsapp:
  - jobbkø med vedvarende state
  - eksplisitt `start`, `pause`, `resume`, `stop`
  - gjenoppretting etter app-crash/restart
  - progresjonsvisning med batch-/kost-estimat
- Lag "batch policy"-profiler:
  - rask kvalitetssjekk (små sample)
  - standard fullkjøring (opp til ca. 1000 konkordanser)
  - robust langkjøring (store datasett, hyppige checkpoints)
- Legg inn enkel kostkontroll:
  - estimat før kjøring
  - løpende token-/kostlogg per jobb
  - varsel ved terskler
- Dokumenter driftsscenarioer:
  - "enkel skyapp for oppsett"
  - "lokal runner for lange jobber"
  - "hybrid: oppsett i sky, kjøring lokalt"
- Vurdér en "repo-generator"-tjeneste (MCP-lignende) som lager et kjørbart Python-repo per jobb med:
  - datasett-input (CSV/JSONL)
  - generert prompt + feltspec
  - konfig for valgt provider/modell
  - enkel runner-script for reproducerbar batchkjøring

## Faseplan (prioritert)

### Fase 1 – Stabil grunnmur

- Definer app-familien (`luminoner-setup`, `luminoner-runner-local`, `luminoner-cli`) og avklar ansvarsområder.
- Beskriv og start `luminoner-core` med felles logikk for parsing, promptbygging, batching, validering og eksport.
- Innfør provider-konfig (`base_url`, `api_key`, `model_name`, temperatur/timeout/retry) med OpenAI først.
- Lag sikker håndtering av egne API-nøkler per kjøring (lokal/session, ingen serverlagring).
- Dokumenter minimum driftsscenario: oppsett i enkel app, kjøring lokalt ved lange jobber.

### Fase 2 – Produksjonsdashboard lokalt

- Bygg lokal runner med jobbkø, vedvarende state og eksplisitt `start/pause/resume/stop`.
- Legg til krasjgjenoppretting, checkpointing og tydelig progresjonsvisning per batch.
- Implementer batch-profiler (rask sjekk / standard / langkjøring).
- Legg inn kostkontroll med estimat før start og løpende token-/kostlogg underveis.
- Utvid provider-støtte til flere OpenAI-kompatible endpoints (Anthropic/Gemini/gateways der mulig).

### Fase 3 – PWA/hybrid og teamflyt

- Bygg PWA-frontend med samme brukerflyt som setup-appen, koblet til API-lag.
- Eksponer API-endepunkter (`/annotate`, valgfri `/validate-key`) med tydelig feilklassifisering.
- Etabler hybridflyt: oppsett i sky/PWA, eksport av jobbdefinisjon, kjøring i lokal runner.
- Legg til dokumentasjon for teambruk (modeller, nøkler, kostgrenser, drift) og anbefalte arbeidsrutiner.

