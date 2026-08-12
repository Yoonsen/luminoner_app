export type CategoryField = {
  id: string;
  key: string;
  values: string; // Comma separated for now
  prompt_note?: string;
};

export function buildSystemPrompt(
  targetConcept: string,
  categories: CategoryField[]
): string {
  const targetMarkerLeft = "<b>";
  const targetMarkerRight = "</b>";
  const CATCH_ALL_VALUE = "0";

  const fieldNamesDisplay = categories.map((c) => `"${c.key}"`).join(", ");

  let fieldRulesText = "";
  let jsonFieldLines = "";
  const fieldPromptLines: string[] = [];

  categories.forEach((c) => {
    const vals = c.values.split(",").map((v) => v.trim()).filter((v) => v);
    fieldRulesText += `    - For feltet "${c.key}", velg KUN én av: ${vals.join(", ")} eller "${CATCH_ALL_VALUE}".\n`;
    jsonFieldLines += `        "${c.key}": "<verdi>",\n`;
    
    if (c.prompt_note) {
      fieldPromptLines.push(`- Ekstra føring for "${c.key}": ${c.prompt_note}`);
    }
  });

  const fieldPromptText = fieldPromptLines.length > 0 
    ? fieldPromptLines.join("\n") 
    : "- Ingen ekstra feltkommentarer lagt inn.";

  const TASK_PROMPT = `
Du annoterer hvert tekstfragment uavhengig.

Fragmentene har formen A${targetMarkerLeft}X${targetMarkerRight}B der X (mellom
markørene) er målordet du skal beskrive. Bruk konteksten før/etter som støtte,
men alle kategorier skal gjelde selve X.

Bruk kategorifeltene ${fieldNamesDisplay || 'som angitt'} til å fordele koder per felt.

Hvis ingen kode passer i et felt, bruk verdien "${CATCH_ALL_VALUE}".

Bruk feltet "karakteristikker" til 0–3 korte stikkord som sier noe om fenomenet
du undersøker (f.eks. «personlig», «offentlig», «historisk», «ironisk», osv.).

Ekstra feltkommentarer:
${fieldPromptText}
`.trim();

  const TECH_PROMPT = `
Formatkrav (viktig):

- Du får linjer på formen "<id> | <fragment>".
- Du skal behandle hvert fragment uavhengig.
- Fragmentene følger mønsteret A${targetMarkerLeft}X${targetMarkerRight}B – X
  (mellom markørene) er målfragmentet du klassifiserer.
- Bruk konteksten utenfor markørene som støtte, men feltverdiene skal beskrive X.
${fieldRulesText}
- Du skal alltid svare med KUN ÉN gyldig JSON-struktur med nøkkelen "items".
- "items" skal være en liste med objekter på denne formen:

  {
    "id": <int>,                         // samme id som i input
${jsonFieldLines}
    "karakteristikker": ["...", "..."],  // 0–3 korte stikkord
    "begrunnelse": "<maks 15 ord>"
  }

- Ikke legg til annen tekst, forklaringer eller markdown utenfor dette ene JSON-objektet.
- Behold alle id-er du får, og ikke oppfinn nye.
`.trim();

  return TASK_PROMPT + "\n\n" + TECH_PROMPT;
}

export function buildUserMessage(batch: any[]): string {
  return batch.map(r => `${r.id} | ${r.fragment || r.text || r.context || JSON.stringify(r)}`).join("\n");
}
