# Hvorfor bygge en app for Luminon-analyse?

Et betimelig spørsmål i en tid der "alle" har tilgang til ChatGPT er: **Kan jeg ikke bare lime inn konkordansene mine og *vibekode* en analyse direkte i prate-vinduet?**

Svaret er teknisk sett ja. For tre-fire tekstsnutter er ChatGPT strålende. Men for systematisk forskning, og spesielt når datasettene vokser, bryter den ustrukturerte tilnærmingen raskt sammen. Her er hvorfor vi bygger Luminoner-appen.

## 1. Appen som et metodisk stillas
LLM-er er kreative ordgjettemaskiner, noe som gjør at de ofte sporer av, glemmer kategoriene dine, eller begynner å endre på dataene. Luminoner-appen fungerer som et strengt, metodisk stillas som tvinger modellen inn i et bestemt mønster (JSON) for hver eneste rad. Modellen får ikke lov til å "prate", den får bare lov til å klassifisere. Dette gjør at 500 tekstfragmenter faktisk kan analyseres systematisk over natten uten at prompten sporer av underveis.

## 2. Topp-ned, bunn-opp og sideveis tolkning i ett
Appen strukturerer analysen på tre nivåer samtidig, noe som er veldig vanskelig å opprettholde i en vanlig chat-dialog:

- **Topp-ned (Strukturert):** Forskeren definerer strenge, forhåndsbestemte kategorier med lukkede verdier. Modellen tvinges til å velge innenfor disse rammene, noe som gir kvantifiserbare tall.
- **Bunn-opp (Eksplorativt):** Samtidig har modellen i oppgave å hente ut fritekst-karakteristikker. Dette lar appen fange opp uventede mønstre og nyanser i dataene induktivt.
- **Sideveis tolkning (Aggregering og disambiguering):** Appen muliggjør en sideveis tolkning gjennom å aggregere data som skiller individ-statistikk fra populasjons-statistikk. For eksempel kan vi se på egenskapene til "alle personer som heter Bjørn" (populasjon), men vi kan også bruke luminonene til å dykke ned og tolke *en spesifikk* "Bjørn" (individ). Dette skiller også homonymer eller overførte betydninger fra hverandre – for eksempel at vi kun ser på konseptet "klima" når det brukes i sin faktiske betydning, og rydder bort støy. Dette er et poeng som ofte forblir implisitt i mye digital humaniora, men som et system for luminon-analyse adresserer direkte.

## 3. Frigjør humanisten fra kode og engineering
Når man vibekoder, ender man ofte opp med å bruke uforholdsmessig mye tid på *prompt engineering*, filformater (som CSV og Excel), og det å få maskinen til å sortere dataene pent. 

Luminoner-appen abstraherer bort all denne kodingen og tekniske friksjonen. Alt det "mekaniske" i midten automatiseres.

**Resultatet?** Humanisten kan fokusere på det de er best på:
1. **Target:** Å designe og raffinere presise, analytiske kategorier i starten av prosessen.
2. **Kontekst:** Å lese og fortolke de kvantifiserte resultatene og modellens begrunnelser i den andre enden.

Appen fjerner ikke den humanistiske fortolkningen – den skalerer den.
