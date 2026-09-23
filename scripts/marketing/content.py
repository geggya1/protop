"""Editorial content for Weekplan. Product claims follow supplied captures and v3 copy."""
MODULES = []
def module(slug,name,group,title,lead,tablet,phone,art,benefits,story,steps,related):
    MODULES.append(dict(slug=slug,name=name,group=group,title=title,lead=lead,tablet=tablet,phone=phone,art=art,benefits=benefits,story=story,steps=steps,related=related))

module('min-dag','Min dag','Oversikt','En god dag begynner med litt oversikt.',
'Avtalene. Det som må ordnes. Menneskene du deler dagen med. Min dag samler inngangene til det du trenger, slik at du kan begynne med det som er viktig akkurat nå.',8,13,2,
[('Dagen foran deg','Se dagens registrerte avtaler og orienter deg før du går videre til detaljene i kalenderen.'),('Kort vei til det praktiske','Bruk snarveiene til verktøyene du trenger ofte. Handlelisten og familiens planer får en fast plass.'),('Familien i samme oversikt','Den voksne får et utgangspunkt for å følge både egne planer og familiens hverdag.')],
('Klokka er 16. Hva skjer nå?','Du er ferdig på jobb, noen skal på trening og middagen må på bordet. Begynn med dagens agenda. Se hva som allerede er planlagt, finn handlelisten og ta den avklaringen dere trenger. Det er enklere å hjelpe hverandre når planen er lett å finne.'),
['Åpne din egen hjemside og se dagens agenda.','Gå til kalenderen for tidspunkter og deltakere.','Bruk snarveiene til neste ting du vil ordne.'],['kalender','gjoremal','handleliste'])

module('kalender','Kalender','Oversikt','Én uke. Mange planer. En felles oversikt.',
'Hvem skal hvor, og når? Gi trening, avtaler og familiens planer en tydelig plass. Bytt mellom dag, uke og måned og se hvem avtalene gjelder.',3,16,1,
[('Se hele sammenhengen','Ukevisningen gjør det enklere å se planene ved siden av hverandre og oppdage hva dere trenger å avklare.'),('Finn detaljene','Tidspunkter og deltakere gir avtalen en konkret ramme. Se hvem som er med, og når det skjer.'),('Bytt perspektiv','Bruk dag for det nære, uke for rytmen og måned for det som ligger litt lenger frem.')],
('Før søndagskvelden blir en huskeliste.','Sett dere sammen og se på uken som kommer. Hvilke dager trenger litt ekstra planlegging? Når passer middagen? Hvilke avtaler må noen følge opp? Kalenderen gir samtalen et felles utgangspunkt, så færre detaljer bare blir liggende i ett hode.'),
['Velg dagen eller perioden dere vil planlegge.','Legg inn avtalen med tidspunkt og deltakere.','Bruk oversikten til å avklare praktiske detaljer sammen.'],['min-dag','mat','chat'])

module('gjoremal','Gjøremål og oppgaver','Barn og mestring','Fra «har du husket?» til «se hva jeg fikk til!»',
'Gjør ansvaret konkret og fremgangen synlig. Tildel oppgaver, la barnet markere det som er gjort og følg opp fra din egen oversikt.',18,7,3,
[('Tydelig ansvar','Gi familiemedlemmer konkrete oppgaver. «Pakk sekken» er lettere å forstå enn «gjør deg klar til i morgen».'),('Synlig gjennomføring','Barnet ser gjøremålene sine og markerer ferdig. Små handlinger får en synlig plass i dagen.'),('Oppfølging som henger sammen','Den voksne følger registrert fremgang og bekrefter det som venter på attestering i Progresjon.')],
('Små bidrag er også bidrag.','Rydde av bordet. Lese litt. Legge frem klær. Når oppgaven er forståelig og passe stor, blir det enklere å begynne. Bruk Weekplan til å avtale noen få gjøremål dere faktisk vil følge opp, og la barnet være med på å se hva som fungerer.'),
['Avtal en konkret oppgave og hvem den gjelder.','Barnet gjennomfører og markerer ferdig.','Følg opp innsatsen og eventuell avtalt belønning.'],['belonning','progresjon','tilpasning'])

module('belonning','Stjerner og ukelønn','Barn og mestring','En liten innsats. Noe stort å glede seg til.',
'Gi barnet et mål dere velger sammen. Samle stjerner til en avtalt opplevelse eller annen belønning, eller følg fremgangen mot ukelønn.',17,7,5,
[('Stjerner å spare på','Knytt avtalte gjøremål til stjerner og la barnet se fremgangen mot et mål over tid.'),('Dere velger belønningen','En kinotur, en aktivitet sammen eller noe annet som betyr noe for barnet. Familien fastsetter hva stjernene kan byttes inn i.'),('Ukelønn som alternativ','Gjør sammenhengen mellom avtalte gjøremål og registrert opptjening tydelig. Utbetaling avtaler og håndterer dere selv.')],
('Målet kan være tid sammen.','Belønningen trenger ikke være en ny ting. Kanskje barnet vil velge lørdagsaktiviteten eller spare til en tur dere har snakket om. Snakk om målet, gjør avtalen forståelig og bruk fremgangen som en anledning til å se innsatsen barnet har lagt ned.'),
['Velg stjerner eller en avtale om ukelønn.','Bestem sammen hva barnet skal gjøre og jobbe mot.','Følg fremgangen, bekreft gjennomføring og innfri avtalen.'],['gjoremal','progresjon','familiespill'])

module('progresjon','Barnas progresjon','Barn og mestring','Se innsatsen. Følg opp fra din egen plass.',
'Barnet markerer ferdig. Du får oversikt over det som er registrert og det som venter på bekreftelse, uten å bytte til barnets profil.',None,14,4,
[('Flere barn, ett utgangspunkt','Finn barnas registrerte fremgang fra den voksnes oversikt og se hvordan uken ligger an.'),('Se hva som er gjort','Gjøremål og registrert status gjør det lettere å følge opp konkrete handlinger.'),('Bekreft gjennomføringen','Attestering gir en tydelig overgang fra barnets ferdigmarkering til den voksnes oppfølging.')],
('En god anledning til å si «jeg så det».','Når du åpner oversikten, får du mer enn en liste å kontrollere. Du får et utgangspunkt for å snakke om det barnet har bidratt med, hjelpe der noe stoppet opp og justere forventningene sammen. Fremgangen skal gjøre hverdagen mer forståelig for dere begge.'),
['Åpne Progresjon i den voksnes visning.','Se registrerte gjøremål og det som venter på attestering.','Følg opp og bekreft gjennomføringen.'],['gjoremal','belonning','for-barn'])

module('tilpasning','Profiler og tilpasning','Barn og mestring','Barn vokser. Oversikten kan vokse med dem.',
'Gi hvert familiemedlem en relevant inngang. Tilpass etter alder og behov, og velg hvilke apper og funksjoner som skal være tilgjengelige.',4,'extra-IMG_6271.png',16,
[('Egne visninger','Voksne og barn møter ulike innganger til samme familiehverdag. Barnet får en egen plass å kjenne igjen.'),('Velg innholdet','Slå apper og funksjoner av eller på. La det som er relevant nå, få plass i oversikten.'),('Tilpass underveis','Behov endrer seg. Gjør justeringer etter alder, modenhet og hva familien faktisk bruker.')],
('Begynn med passe mye.','Et yngre barn kan ha glede av noen få tydelige gjøremål og lett gjenkjennelige appinnganger. Et eldre barn trenger kanskje mer av skoleområdet og en større rolle i planleggingen. Ta utgangspunkt i barnet foran deg og bygg videre når tiden er inne.'),
['Gjør deg kjent med den voksnes og barnets visning.','Velg apper og funksjoner som passer barnets hverdag.','Juster oppsettet når behovene endrer seg.'],['for-barn','gjoremal','ukeplan'])

module('ukeplan','Ukeplan for skolen','Skole','Gymtøy på torsdag? Gi skoleuken en fast plass.',
'Samle skoleinformasjonen så både barn og voksne finner den igjen. Legg inn planen manuelt, last opp bilde eller PDF, eller bruk AI-import som hjelp til registreringen.',1,9,7,
[('Fra papir til oversikt','Bruk et bilde eller en PDF av planen som utgangspunkt. AI-importen kan hjelpe med å få informasjonen inn.'),('Se dag og uke','Finn det som gjelder nå, eller se på hele skoleuken når dere forbereder dagene som kommer.'),('Kontroller innholdet','Se over fag, dager og detaljer etter import. Da får dere et bedre grunnlag for å bruke planen sammen.')],
('Forbered i kveld. Finn igjen i morgen.','Se gjennom neste skoledag sammen før sekken pakkes. Hva skal med? Hva skjer først? Hva er annerledes denne uken? Når informasjonen har en fast plass, slipper dere å lete etter det samme arket hver gang spørsmålet dukker opp.'),
['Velg perioden planen gjelder for.','Registrer manuelt eller importer fra bilde eller PDF.','Kontroller informasjonen og bruk planen i hverdagen.'],['lekser','leksehjelpen','kalender'])

module('lekser','Lekser','Skole','En tydeligere vei gjennom leksene.',
'Fag, oppgave, frist og fremgang får en samlet oversikt. AI-skann lekseplanen og bruk den som utgangspunkt for å planlegge arbeidet sammen.',20,'extra-IMG_6264.png',13,
[('Finn neste oppgave','Oppgaver etter fag gjør det lettere å orientere seg og velge hva barnet skal begynne med.'),('Se frister og status','Følg med på hva som skal gjøres, når det skal være ferdig og hva som allerede er markert gjennomført.'),('Mindre innskriving','AI-import kan hjelpe med registreringen av lekseplanen. Gå gjennom resultatet før dere legger planen til grunn.')],
('Én oppgave av gangen er et godt sted å starte.','En hel lekseuke kan føles stor. Se på oppgavene sammen og velg et overkommelig første steg. Når noe er ferdig, blir fremgangen synlig. Trenger barnet en forklaring underveis, ligger Leksehjelpen i samme skoleområde.'),
['Importer eller registrer lekseplanen.','Kontroller fag, oppgaver og frister.','Arbeid med oppgavene og marker gjennomføring.'],['ukeplan','leksehjelpen','bokhylla'])

module('leksehjelpen','Leksehjelpen','Skole','Når barnet står fast, er neste steg viktig.',
'Velg fag, start en øvingsoppgave eller vis leksebildet. Blyanttavlen tegner stegene — hint først, fasit styrt av foresatte.',19,'extra-IMG_6266.png',14,
[('Blyanttavle','Regnesteg tegnes ut som med blyant — potenser, deling i hundre/tiere/enere, ett steg om gangen.'),('Prøv før fasit','Barnet må øve og få hint først. Foresatte kan skru fasit helt av i innstillingene.'),('Alle fag, norsk skole','Matte, norsk, engelsk og mer — scaffolding og LK20-pedagogikk, ikke bare fasit-maskin.')],
('«Jeg skjønner ikke» kan bli et sted å begynne.','Noen ganger er det en formulering, et regnesteg eller selve starten som stopper arbeidet. Hjelp barnet å vise akkurat hvor det ble vanskelig. AI kan gi nyttige forklaringer, men svar kan være feil. Vurder dem sammen når noe virker uklart.'),
['Velg faget eller en ferdig øvingsoppgave.','Skriv spørsmålet eller legg ved et bilde av oppgaven.','Bruk veiledningen til å prøve neste steg selv.'],['lekser','ukeplan','for-barn'])

module('maltidsplanlegger','Måltidsplanlegger','Mat og hjem','Hva skal vi spise? Et spørsmål dere kan ta tidligere.',
'Velg middager som passer uken dere faktisk har. Planlegg på tvers av familiemedlemmer, og la ingrediensene gå videre til handlelisten automatisk.',5,4,8,
[('Maten inn i planen','Se dagene sammen og velg måltider som passer familiens avtaler og ønsker.'),('Fra rett til råvarer','Ingredienser fra valgte retter legges automatisk i handlelisten. Det gir kortere vei fra middagsidé til innkjøp.'),('Mengder i sammenheng','Behovet i de valgte måltidene samles og tilpasses på tvers av rettene, slik at listen kan brukes som et samlet utgangspunkt.')],
('Tirsdag er travel. Søndag har dere bedre tid.','En god matplan trenger ikke se lik ut hver dag. Ta utgangspunkt i kalenderen, velg rettene og la handlelisten samle det dere trenger. Da er flere av middagens små beslutninger allerede tatt når ettermiddagen begynner.'),
['Se på familiens planer og velg måltider.','La ingrediensene overføres til handlelisten.','Gå gjennom listen og handle til dagene foran dere.'],['handleliste','kalender','chat'])

module('handleliste','Handleliste og vareskanning','Mat og hjem','Fra «vi er tomme» til «det står på listen».',
'Samle innkjøpene mens dere husker dem. Handlelisten fylles fra måltidene dere velger, og en tom varepakke kan bli neste innkjøp med en strekkodeskanning.',6,8,11,
[('Listen fylles fra maten','Ingredienser og mengder fra de valgte rettene samles automatisk. Dere får et praktisk utgangspunkt for handleturen.'),('Ryddige kategorier','Varene grupperes så det er lettere å se hva som trengs. Produktbilder og detaljer hjelper dere å orientere dere.'),('Skann før du kaster','Skann strekkoden når en vare går tom. Varen legges til i handlelisten, mens dere fortsatt husker behovet.')],
('Den som handler, trenger å vite det samme.','Planlegg måltidene sammen, se over listen og avklar hvem som tar butikken. Når behovet er samlet, blir det mindre avhengig av at én person husker alt i riktig øyeblikk. Marker varer underveis og se hva som gjenstår.'),
['Velg måltider eller legg til det dere mangler.','Skann strekkoden på varer som går tomme.','Bruk kategoriene og marker varene under handleturen.'],['maltidsplanlegger','chat','min-dag'])

module('notater','Notater','Praktisk','Den tanken du ville ta vare på? Gi den en plass.',
'En idé til helgen. Noe du må huske. Et notat du vil finne igjen. Opprett et notat med tittel eller bruk mikrofonen når det passer bedre å snakke.',2,None,2,
[('Opprett mens du husker','Gi notatet en tittel som gjør det lett å kjenne igjen når du kommer tilbake.'),('Bruk stemmen','Velg opptak med mikrofon når det er enklere å si det enn å skrive det.'),('Finn tidligere notater','Notatområdet har også en inngang til arkiverte notater. Det gir et sted å lete tilbake.')],
('Ikke alle tanker er en kalenderavtale.','Noe trenger bare et sted å være: ideer til ferien, stikkord før en samtale eller en forklaring du vil beholde. Notater gir slikt innhold en egen plass ved siden av oppgaver og kalender. Bruk en beskrivende tittel, så blir det lettere å kjenne igjen sammenhengen.'),
['Åpne Notat og velg å opprette et nytt notat.','Skriv en tittel eller velg opptak med mikrofon.','Finn tilbake i notatområdet når du trenger innholdet.'],['dokumenter','kalender','min-dag'])

module('epost','E-post','Praktisk','Også e-posten kan få en fast plass.',
'Koble til jobb- eller privat e-post og få en egen inngang til meldingene. Innboks, mapper og vanlige e-posthandlinger er samlet i Weekplan.',7,None,18,
[('Kjente mapper','Finn innboks, utkast, sendte elementer og de øvrige mappene for kontoen som er koblet til.'),('Håndter meldingene','Skriv ny e-post, svar, svar alle eller videresend fra e-postområdet.'),('Finn det du leter etter','Bruk søk og visning for alle eller uleste meldinger for å orientere deg i innholdet.')],
('Når detaljene ligger i en e-post.','Praktiske opplysninger kommer fra mange steder. E-postområdet gir deg et sted å finne tilbake til meldingen mens du jobber med dagens planer. Kontotilkobling settes opp i innstillingene; tilgjengelig oppsett avhenger av e-postkontoen din.'),
['Gå til innstillingene for e-posttilkobling.','Koble til kontoen med det støttede oppsettet.','Bruk mapper, søk og e-posthandlinger for å håndtere meldingene.'],['min-dag','notater','kalender'])

module('dokumenter','Dokumenter','Praktisk','Når familien spør «hvor ligger den filen?»',
'Gi bilder og filer en ryddig plass i familiens dokumentområde. Opprett mapper og samle innholdet dere vil finne igjen.',9,None,16,
[('Samle filer','Velg filer for opplasting, eller dra dem inn i dokumentområdet fra enheten du bruker.'),('Lag en enkel struktur','Opprett mapper og undermapper med navn som forklarer hva de inneholder.'),('Et familieområde','Samle familiens filer i et felles område, slik at innholdet har en tydelig sammenheng.')],
('Sommerferien kan få sin egen mappe.','Bilder og underlag blir enklere å finne igjen når de har et sted å høre hjemme. Gi mappen et navn som «Sommer 2026» og legg til filene som hører til. Den samme enkle strukturen kan brukes rundt familiens aktiviteter og andre praktiske behov.'),
['Åpne det aktuelle dokumentområdet.','Lag en mappe med et beskrivende navn.','Last opp filene som hører sammen.'],['vare-reiser','notater','chat'])

module('chat','Familiechat','Sammen','Den lille beskjeden som får planen til å fungere.',
'Avklar med hele familien eller send en melding til ett familiemedlem. Chatten gir beskjedene en inngang i det samme miljøet som planene.',None,11,18,
[('Familien samlet','Velg familiechatten når beskjeden gjelder flere.'),('En direkte beskjed','Velg et bestemt familiemedlem når dere trenger å avklare noe mellom dere.'),('Nær det praktiske','Finn chatten i Weekplan når en avtale, et innkjøp eller dagens planer trenger en avklaring.')],
('«Jeg tar butikken. Trenger vi noe mer?»','En plan blir mer nyttig når dere kan snakke sammen om den. Se handlelisten, send en beskjed og avklar hvem som gjør hva. Bruk kalenderen for avtalen og chatten for samtalen rundt den, så får begge deler en naturlig plass.'),
['Velg familien eller personen du vil skrive til.','Send beskjeden eller spørsmålet.','Bruk avklaringen når dere følger opp planene.'],['kalender','handleliste','familiespill'])

module('familiespill','Familiespill','Sammen','Dere har en plan for uken. Hva med en liten pause?',
'En quiz, en tegning eller en kjapp runde tre på rad. Inviter familien til et spill og gi de små pausene litt mer fellesskap.',14,6,17,
[('Fem måter å spille på','Velg Familiequiz, Tre på rad, Stein–saks–papir, Gjette tallet eller Tegn og gjett.'),('Inviter hverandre','Én person starter spillet og inviterer. De andre godtar invitasjonen og blir med.'),('Plass til små øyeblikk','Et spill kan være en liten ting dere gjør sammen mellom de andre planene.')],
('Noen ganger er en runde nok.','Det trenger ikke være en stor aktivitet for å være hyggelig. Prøv et spill mens dere venter, la barnet velge neste runde eller bruk en quiz som starten på en samtale. Weekplan har også plass til det familien gjør fordi den har lyst.'),
['Velg spillet dere vil prøve.','Start en runde og inviter familiemedlemmer.','Godta invitasjonen og spill sammen.'],['aktiviteter','chat','belonning'])

module('bokhylla','Bokhylla','Sammen','Gi historiene dere leser en egen plass.',
'Registrer bøker, skann ISBN-nummer og følg lesingen underveis. Bokhylla viser hva som leses nå og hva som er lest ferdig.',16,None,7,
[('Legg til boken','Registrer boken i bokhylla. ISBN-skanning gir en praktisk inngang når du har boken foran deg.'),('Se hva som leses','Bøker under lesing får en tydelig plass med tittel, forfatter og bokomslag der dette er registrert.'),('Følg fremgangen','Lesefremgang gjør det synlig hvor langt barnet har kommet, ved siden av oversikten over ferdigleste bøker.')],
('«Hvor langt har du kommet?» blir en samtale.','Bruk bokhylla til å snakke om historien, personene og hva barnet tror skjer videre. En synlig fremgang kan gjøre lesestunden lettere å følge over tid. Det viktigste er at boken får plass i hverdagen og at barnet har noen å dele opplevelsen med.'),
['Legg til boken, gjerne ved å skanne ISBN.','Følg boken som leses og oppdater fremgangen.','Se tilbake på det som er lest ferdig.'],['gjoremal','gaveonsker','lekser'])

module('gaveonsker','Gaveønsker','Sammen','Riktige ønsker. En overraskelse som fortsatt er hemmelig.',
'Samle ønskene når de dukker opp, og la familien reservere gaver uten at mottakeren ser hvem som kjøper hva.',15,None,20,
[('En liste å finne igjen','Legg til ønsker og samle dem rundt personen de gjelder. Registrerte bilder og priser gjør ønskene mer konkrete.'),('Koordiner gavene','Familiemedlemmer kan reservere ønsker. Det gir et felles utgangspunkt for gaveplanleggingen.'),('Behold overraskelsen','Reservasjoner er skjult for den som ønsker seg gavene, slik at planleggingen ikke røper alt.')],
('Det gode ønsket dukker sjelden opp på bestilling.','Kanskje barnet nevner neste bok i en serie lenge før bursdagen. Legg ønsket inn mens dere husker det. Når anledningen nærmer seg, har familien et bedre utgangspunkt enn å spørre om alt på nytt. Selve kjøpet ordner dere der dere ønsker.'),
['Legg til ønsker i personens ønskeliste.','La familien se listen når en anledning nærmer seg.','Reserver et ønske uten å røpe gaven for mottakeren.'],['husk-dato','bokhylla','familietreet'])

module('husk-dato','Husk dato','Sammen','Noe fint er på vei. Se hvor lenge det er igjen.',
'Bursdager, merkedager og egne anledninger får en samlet oversikt med nedtelling. Gi både forventningene og forberedelsene litt mer plass.',11,5,20,
[('Se det som nærmer seg','Finn kommende merkedager og orienter deg i hva som står for tur.'),('Gjør ventetiden synlig','Nedtelling gir barnet en konkret måte å se at den store dagen kommer nærmere.'),('Forbered i god tid','Bruk oversikten som utgangspunkt for å snakke om gaver, feiring og praktiske avklaringer.')],
('For barnet: glede. For deg: litt bedre tid.','En bursdag er både noe å glede seg til og noe som skal planlegges. Med datoen i sikte kan dere snakke om ønskene, se på kalenderen og gjøre forberedelsene litt etter litt. Små påminnelser i hverdagen kan begynne med å åpne oversikten sammen.'),
['Legg inn anledningen og datoen den gjelder.','Se hva som nærmer seg i oversikten.','Bruk nedtellingen til å glede dere og forberede sammen.'],['gaveonsker','kalender','familiespill'])

module('aktiviteter','Aktiviteter','Sammen','Fra «vi burde finne på noe» til noe å glede seg til.',
'Utforsk tur, trening og bevegelse. Finn kategorier og programforslag som kan bli et utgangspunkt for familiens neste aktivitet.',10,15,22,
[('Flere innganger','Utforsk blant annet gåtur, fjelltur, løping, sykling, styrketrening, fotball og svømming.'),('Forslag å begynne med','Åpne kategorier og se programforslag. Bruk dem som støtte når dere vil lage en konkret plan.'),('Plass til deres valg','Velg aktivitet ut fra interesser, tid og hva dere har lyst til å gjøre. Det finnes også en inngang til fri plan.')],
('Det kan begynne med en tur rundt kvartalet.','Aktiviteter trenger ikke være store prosjekter. Kanskje dere vil velge én ting å gjøre sammen denne uken. Finn en idé, snakk om hva som passer og gi den plass i kalenderen. En konkret plan gjør det lettere å komme i gang.'),
['Utforsk en kategori dere er nysgjerrige på.','Se forslagene eller ta utgangspunkt i en fri plan.','Avklar når aktiviteten passer for dere.'],['kalender','familiespill','vare-reiser'])

module('vare-reiser','Våre reiser','Sammen','Et kart over stedene. En samling av minnene.',
'Marker land dere har besøkt og knytt reisen til familiemedlemmer, bilder og periode. Se familiens reisehistorie vokse frem på kartet.',13,10,19,
[('Reisene på kartet','Se besøkte land i en samlet visning og finn frem til steder dere har vært.'),('Hvem var med?','Knytt reisen til deltakere og se historien fra familiens eller ett familiemedlems perspektiv.'),('Ta vare på sammenhengen','Bilde, år og periode gjør det enklere å kjenne igjen turen og hente frem minnene.')],
('«Husker du da vi var der?»','Et kart kan starte mange samtaler. Se på stedene dere har besøkt, finn frem et bilde og la barna fortelle hva de husker. Våre reiser er et sted for reisehistorien deres; bestilling og praktisk reiseplanlegging håndterer dere der dere vanligvis gjør det.'),
['Finn landet dere har besøkt.','Legg til deltakere, periode og et bilde.','Utforsk familiens reisehistorie sammen.'],['dokumenter','familietreet','husk-dato'])

module('familietreet','Familietreet','Sammen','Alle menneskene dere hører sammen med.',
'Se relasjonene på tvers av generasjoner. Familietreet gir navnene og forbindelsene en synlig form som dere kan utforske sammen.',12,12,21,
[('Se forbindelsene','Et visuelt tre viser hvordan familiemedlemmene er knyttet til hverandre.'),('Finn en person','Bruk søket og oversikten til å orientere dere blant navnene i familien.'),('Flere generasjoner','Også personer uten egen brukerkonto kan være registrert i treet. Historien kan strekke seg lenger enn de som bruker appen.')],
('Hvem er egentlig mammas fetter?','Familierelasjoner kan være vanskelige å forklare bare med ord. Se på treet sammen og følg forbindelsene. Det gir barna et utgangspunkt for spørsmål og de voksne en anledning til å fortelle historiene bak navnene.'),
['Registrer familiemedlemmer og forbindelser.','Utforsk relasjonene i treet.','Finn frem til en person og del historien bak navnet.'],['husk-dato','vare-reiser','gaveonsker'])

module('familieposisjon','Familieposisjon','Oversikt','En ekstra oversikt, når dere velger å dele.',
'Se tilgjengelig posisjon fra familiemedlemmer som har slått på deling. Familien velger selv å bruke funksjonen.',None,1,21,
[('Deling er et valg','Posisjonsdeling aktiveres i innstillingene. Snakk sammen om når og hvordan dere ønsker å bruke den.'),('Se tilgjengelig posisjon','Velg en person i oversikten og se posisjonsinformasjonen som er tilgjengelig.'),('Tydelig når noe mangler','Visningen viser når en live posisjon ikke er tilgjengelig. Bruk chatten eller ring når dere trenger en avklaring.')],
('Et supplement til å snakke sammen.','På en ettermiddag med flere planer kan tilgjengelig posisjon gi litt ekstra orientering. Bruk funksjonen med en felles forståelse i familien. Den gir informasjon der deling er aktivert og posisjon er tilgjengelig, og erstatter ikke en beskjed når noe endrer seg.'),
['Avtal hvordan dere vil bruke posisjonsdeling.','Aktiver deling i innstillingene der det er ønsket.','Se tilgjengelig informasjon for familiemedlemmet.'],['chat','kalender','tilpasning'])

FAQ = [
('Hva er Weekplan?','Weekplan samler verktøy for familiens avtaler, gjøremål, skole, mat og felles opplevelser. Voksne og barn har egne visninger, slik at det blir lettere å finne den delen av hverdagen som gjelder dem.'),
('Må vi ta i bruk alle modulene?','Nei. Begynn med noe som er nyttig for dere nå, som kalenderen, handlelisten eller et par gjøremål. Dere kan velge apper og funksjoner og utforske mer etter hvert.'),
('Kan jeg følge opp barna fra min egen profil?','Ja. Progresjon viser barnas registrerte gjøremål, fremgang og det som venter på attestering, uten at du trenger å bytte til barnets profil.'),
('Hvordan fungerer stjerner og ukelønn?','Dere avtaler gjøremål og hvordan innsatsen skal belønnes. Stjerner kan spares og byttes inn i en opplevelse eller annen belønning familien fastsetter. Ukelønn er et alternativ. Selve belønningen og eventuell utbetaling håndterer dere.'),
('Hva kan AI hjelpe med?','AI kan hjelpe med å lese inn ukeplaner og lekseplaner fra underlag. Leksehjelpen gir barnet veiledning ut fra fag, tekst eller bilde. Kontroller importert innhold og vurder svarene; AI kan gjøre feil.'),
('Henger måltidsplanen og handlelisten sammen?','Ja. Ingredienser fra de valgte rettene overføres automatisk. Mengder samles og tilpasses behovet på tvers av rettene, og varene grupperes i handlelisten. Strekkodeskanning kan legge til varer som går tomme.'),
('Kan vi tilpasse barnets visning?','Ja. Velg apper og funksjoner etter alder og behov. Barnet og den voksne har egne visninger, og oppsettet kan justeres når behovene endrer seg.'),
('Hvordan brukes nettbrett og mobil i bildene?','Produktbildene viser faktiske visninger fra Weekplan på nettbrett og iPhone. Åpne et bilde for å se hele skjermen. Innholdet varierer med profil, valgte funksjoner og registrerte planer.'),
('Må familien dele posisjon?','Nei. Posisjonsdeling er frivillig og aktiveres i innstillingene. Funksjonen viser tilgjengelig informasjon fra dem som har valgt å dele.'),
('Hvor begynner vi?','Velg ett behov dere vil gjøre enklere. Registrer noen avtaler eller konkrete gjøremål, gjør dere kjent med barnets og den voksnes visning, og bygg videre derfra.')]
