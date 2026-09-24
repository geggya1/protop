/** Module activation catalog copy: every leaf is { nb, en, da, sv, fi, pl, es, fr, de }. */
const L = (nb, en, da, sv, fi, pl, es, fr, de) => ({ nb, en, da, sv, fi, pl, es, fr, de });

function pick(entry, lang) {
  if (!entry || typeof entry !== 'object') return entry;
  return entry[lang] || entry.en || entry.nb || '';
}

export const MODULE_CATALOG_I18N = {
  defaults: {
    backLabel: L(
      'Tilbake',
      'Back',
      'Tilbage',
      'Tillbaka',
      'Takaisin',
      'Wstecz',
      'Atrás',
      'Retour',
      'Zurück'
    ),
    reassuranceText: L(
      'Aktivering er gratis nå. Du kan deaktivere modulen senere.',
      'Activation is free for now. You can deactivate the module later.',
      'Aktivering er gratis nu. Du kan deaktivere modulet senere.',
      'Aktivering är gratis nu. Du kan inaktivera modulen senare.',
      'Aktivointi on nyt ilmainen. Voit poistaa moduulin käytöstä myöhemmin.',
      'Aktywacja jest teraz darmowa. Możesz wyłączyć moduł później.',
      'La activación es gratis por ahora. Puedes desactivar el módulo más tarde.',
      'L’activation est gratuite pour l’instant. Tu pourras désactiver le module plus tard.',
      'Die Aktivierung ist jetzt kostenlos. Du kannst das Modul später deaktivieren.'
    ),
    mobileReassuranceText: L(
      'Gratis nå · Kan deaktiveres senere',
      'Free for now · Can be deactivated later',
      'Gratis nu · Kan deaktiveres senere',
      'Gratis nu · Kan inaktiveras senare',
      'Ilmainen nyt · Voi poistaa myöhemmin',
      'Darmowe teraz · Można wyłączyć później',
      'Gratis ahora · Se puede desactivar después',
      'Gratuit pour l’instant · Désactivable plus tard',
      'Jetzt kostenlos · Später deaktivierbar'
    ),
    reassuranceTextCompact: L(
      'Gratis nå · Kan deaktiveres senere',
      'Free for now · Can be deactivated later',
      'Gratis nu · Kan deaktiveres senere',
      'Gratis nu · Kan inaktiveras senare',
      'Ilmainen nyt · Voi poistaa myöhemmin',
      'Darmowe teraz · Można wyłączyć później',
      'Gratis ahora · Se puede desactivar después',
      'Gratuit pour l’instant · Désactivable plus tard',
      'Jetzt kostenlos · Später deaktivierbar'
    ),
    childReassuranceText: L(
      'Du kan åpne modulen når du vil. En voksen kan slå den av senere.',
      'You can open the module whenever you want. An adult can turn it off later.',
      'Du kan åbne modulet, når du vil. En voksen kan slå det fra senere.',
      'Du kan öppna modulen när du vill. En vuxen kan stänga av den senare.',
      'Voit avata moduulin milloin tahansa. Aikuinen voi sulkea sen myöhemmin.',
      'Możesz otworzyć moduł kiedy chcesz. Dorosły może go wyłączyć później.',
      'Puedes abrir el módulo cuando quieras. Un adulto puede apagarlo más tarde.',
      'Tu peux ouvrir le module quand tu veux. Un adulte pourra le désactiver plus tard.',
      'Du kannst das Modul öffnen, wann du willst. Ein Erwachsener kann es später ausschalten.'
    ),
  },

  modules: {
    plan: {
      name: L('Kalender', 'Calendar', 'Kalender', 'Kalender', 'Kalenteri', 'Kalendarz', 'Calendario', 'Calendrier', 'Kalender'),
      eyebrow: L(
        'Plan. Oversikt. Ro.',
        'Plan. Overview. Calm.',
        'Plan. Oversigt. Ro.',
        'Plan. Översikt. Ro.',
        'Suunnitelma. Yhteenveto. Rauha.',
        'Plan. Przegląd. Spokój.',
        'Plan. Vista. Calma.',
        'Plan. Vue d’ensemble. Calme.',
        'Plan. Überblick. Ruhe.'
      ),
      headline: L(
        'Hele familien, én plan',
        'The whole family, one plan',
        'Hele familien, én plan',
        'Hela familjen, en plan',
        'Koko perhe, yksi suunnitelma',
        'Cała rodzina, jeden plan',
        'Toda la familia, un solo plan',
        'Toute la famille, un seul plan',
        'Die ganze Familie, ein Plan'
      ),
      pitch: L(
        'Samle avtaler, aktiviteter og påminnelser, så alle vet hva som skjer – og når.',
        'Gather appointments, activities and reminders so everyone knows what’s happening – and when.',
        'Saml aftaler, aktiviteter og påmindelser, så alle ved, hvad der sker – og hvornår.',
        'Samla möten, aktiviteter och påminnelser så alla vet vad som händer – och när.',
        'Kerää tapaamiset, aktiviteetit ja muistutukset, jotta kaikki tietävät mitä tapahtuu – ja milloin.',
        'Zbierz spotkania, aktywności i przypomnienia, by wszyscy wiedzieli, co się dzieje – i kiedy.',
        'Reúne citas, actividades y recordatorios para que todos sepan qué pasa – y cuándo.',
        'Rassemble rendez-vous, activités et rappels pour que tout le monde sache ce qui se passe – et quand.',
        'Sammle Termine, Aktivitäten und Erinnerungen, damit alle wissen, was passiert – und wann.'
      ),
      activationLabel: L(
        'Aktiver Kalender',
        'Activate Calendar',
        'Aktiver Kalender',
        'Aktivera Kalender',
        'Aktivoi Kalenteri',
        'Aktywuj Kalendarz',
        'Activar Calendario',
        'Activer Calendrier',
        'Kalender aktivieren'
      ),
      benefits: [
        L(
          'Se dagen og uken på tvers av familien',
          'See the day and week across the family',
          'Se dagen og ugen på tværs af familien',
          'Se dagen och veckan över familjen',
          'Näe päivä ja viikko koko perheen kesken',
          'Zobacz dzień i tydzień w całej rodzinie',
          'Ve el día y la semana de toda la familia',
          'Vois le jour et la semaine de toute la famille',
          'Sieh Tag und Woche der ganzen Familie'
        ),
        L(
          'Fordel avtaler og få varsler i tide',
          'Share appointments and get reminders in time',
          'Fordel aftaler og få varsler i tide',
          'Fördela möten och få påminnelser i tid',
          'Jaa tapaamiset ja saa muistutukset ajoissa',
          'Przydzielaj spotkania i dostawaj przypomnienia na czas',
          'Reparte citas y recibe avisos a tiempo',
          'Répartis les rendez-vous et reçois des rappels à temps',
          'Verteile Termine und erhalte Erinnerungen rechtzeitig'
        ),
        L(
          'Unngå dobbeltbookinger og glemte aktiviteter',
          'Avoid double bookings and forgotten activities',
          'Undgå dobbeltbookinger og glemte aktiviteter',
          'Undvik dubbelbokningar och glömda aktiviteter',
          'Vältä päällekkäiset varaukset ja unohtuneet aktiviteetit',
          'Unikaj podwójnych rezerwacji i zapomnianych aktywności',
          'Evita dobles reservas y actividades olvidadas',
          'Évite les doubles réservations et les activités oubliées',
          'Vermeide Doppelbuchungen und vergessene Aktivitäten'
        ),
      ],
    },

    mail: {
      name: L('E-post', 'Mail', 'E-mail', 'E-post', 'Sähköposti', 'E-mail', 'Correo', 'E-mail', 'E-Mail'),
      eyebrow: L(
        'Innboks. Jobb. Privat.',
        'Inbox. Work. Personal.',
        'Indbakke. Arbejde. Privat.',
        'Inkorg. Jobb. Privat.',
        'Saapuneet. Työ. Yksityinen.',
        'Skrzynka. Praca. Prywatne.',
        'Bandeja. Trabajo. Privado.',
        'Boîte. Travail. Perso.',
        'Posteingang. Beruf. Privat.'
      ),
      headline: L(
        'Viktige meldinger, samlet',
        'Important messages, in one place',
        'Vigtige beskeder, samlet',
        'Viktiga meddelanden, samlade',
        'Tärkeät viestit yhdessä',
        'Ważne wiadomości w jednym miejscu',
        'Mensajes importantes, reunidos',
        'Messages importants, réunis',
        'Wichtige Nachrichten, gebündelt'
      ),
      pitch: L(
        'Koble jobb- og privatkontoer og finn det som krever oppmerksomhet, uten å hoppe mellom apper.',
        'Connect work and personal accounts and find what needs attention without jumping between apps.',
        'Tilslut arbejds- og privatkonti, og find det, der kræver opmærksomhed, uden at hoppe mellem apps.',
        'Koppla jobb- och privatkonton och hitta det som kräver uppmärksamhet utan att hoppa mellan appar.',
        'Yhdistä työ- ja yksityistilit ja löydä huomion arvoiset asiat ilman sovellusten välillä hyppimistä.',
        'Połącz konta służbowe i prywatne i znajdź to, co wymaga uwagi, bez skakania między aplikacjami.',
        'Conecta cuentas de trabajo y personales y encuentra lo que necesita atención sin saltar entre apps.',
        'Connecte comptes pro et perso et trouve ce qui demande attention sans sauter d’appli en appli.',
        'Verbinde Berufs- und Privatkonten und finde, was Aufmerksamkeit braucht – ohne App-Hopping.'
      ),
      activationLabel: L(
        'Aktiver E-post',
        'Activate Mail',
        'Aktiver E-mail',
        'Aktivera E-post',
        'Aktivoi Sähköposti',
        'Aktywuj E-mail',
        'Activar Correo',
        'Activer E-mail',
        'E-Mail aktivieren'
      ),
      benefits: [
        L(
          'Se flere innbokser på ett sted',
          'See multiple inboxes in one place',
          'Se flere indbakker ét sted',
          'Se flera inkorgar på ett ställe',
          'Näe useita postilaatikoita yhdessä paikassa',
          'Zobacz kilka skrzynek w jednym miejscu',
          'Ve varias bandejas en un solo lugar',
          'Vois plusieurs boîtes au même endroit',
          'Sieh mehrere Posteingänge an einem Ort'
        ),
        L(
          'Marker det som må følges opp',
          'Flag what needs follow-up',
          'Markér det, der skal følges op',
          'Markera det som måste följas upp',
          'Merkitse seurattavat asiat',
          'Oznacz to, co wymaga kontynuacji',
          'Marca lo que hay que seguir',
          'Repère ce qui doit être suivi',
          'Markiere, was nachverfolgt werden muss'
        ),
        L(
          'Gjør meldinger om til oppgaver eller avtaler',
          'Turn messages into tasks or appointments',
          'Gør beskeder til opgaver eller aftaler',
          'Gör meddelanden till uppgifter eller möten',
          'Muuta viestit tehtäviksi tai tapaamisiksi',
          'Zamień wiadomości w zadania lub spotkania',
          'Convierte mensajes en tareas o citas',
          'Transforme les messages en tâches ou rendez-vous',
          'Mache aus Nachrichten Aufgaben oder Termine'
        ),
      ],
    },

    stars: {
      name: L('Oppgaver', 'Tasks', 'Opgaver', 'Uppgifter', 'Tehtävät', 'Zadania', 'Tareas', 'Tâches', 'Aufgaben'),
      eyebrow: L(
        'Fokus. Fremgang. Ferdig.',
        'Focus. Progress. Done.',
        'Fokus. Fremgang. Færdig.',
        'Fokus. Framsteg. Klart.',
        'Fokus. Edistyminen. Valmis.',
        'Fokus. Postęp. Gotowe.',
        'Foco. Avance. Hecho.',
        'Focus. Avancée. Terminé.',
        'Fokus. Fortschritt. Fertig.'
      ),
      headline: L(
        'Få det ut av hodet',
        'Get it out of your head',
        'Få det ud af hovedet',
        'Få det ur huvudet',
        'Saa se pois päästä',
        'Wyrzuć to z głowy',
        'Sácalo de la cabeza',
        'Sors-le de ta tête',
        'Hol es aus dem Kopf'
      ),
      pitch: L(
        'Samle egne oppgaver, frister og oppfølging på ett oversiktlig sted.',
        'Gather your tasks, deadlines and follow-ups in one clear place.',
        'Saml dine opgaver, frister og opfølgning ét overskueligt sted.',
        'Samla dina uppgifter, deadlines och uppföljning på ett överskådligt ställe.',
        'Kerää omat tehtävät, määräajat ja seuranta yhteen selkeään paikkaan.',
        'Zbierz swoje zadania, terminy i follow-upy w jednym przejrzystym miejscu.',
        'Reúne tus tareas, plazos y seguimientos en un solo lugar claro.',
        'Rassemble tes tâches, échéances et suivis en un seul endroit clair.',
        'Sammle eigene Aufgaben, Fristen und Follow-ups an einem klaren Ort.'
      ),
      activationLabel: L(
        'Aktiver Oppgaver',
        'Activate Tasks',
        'Aktiver Opgaver',
        'Aktivera Uppgifter',
        'Aktivoi Tehtävät',
        'Aktywuj Zadania',
        'Activar Tareas',
        'Activer Tâches',
        'Aufgaben aktivieren'
      ),
      benefits: [
        L(
          'Velg hva som er viktigst i dag',
          'Choose what matters most today',
          'Vælg, hvad der er vigtigst i dag',
          'Välj vad som är viktigast i dag',
          'Valitse, mikä on tärkeintä tänään',
          'Wybierz, co jest dziś najważniejsze',
          'Elige lo más importante hoy',
          'Choisis ce qui compte le plus aujourd’hui',
          'Wähle, was heute am wichtigsten ist'
        ),
        L(
          'Bruk frister og påminnelser',
          'Use deadlines and reminders',
          'Brug frister og påmindelser',
          'Använd deadlines och påminnelser',
          'Käytä määräaikoja ja muistutuksia',
          'Używaj terminów i przypomnień',
          'Usa plazos y recordatorios',
          'Utilise échéances et rappels',
          'Nutze Fristen und Erinnerungen'
        ),
        L(
          'Del eller tildel oppgaver ved behov',
          'Share or assign tasks when needed',
          'Del eller tildel opgaver ved behov',
          'Dela eller tilldela uppgifter vid behov',
          'Jaa tai määritä tehtäviä tarvittaessa',
          'Udostępniaj lub przydzielaj zadania w razie potrzeby',
          'Comparte o asigna tareas cuando haga falta',
          'Partage ou assigne des tâches si besoin',
          'Teile oder weise Aufgaben bei Bedarf zu'
        ),
      ],
    },

    notes: {
      name: L('Notat', 'Notes', 'Noter', 'Anteckningar', 'Muistiinpanot', 'Notatki', 'Notas', 'Notes', 'Notizen'),
      eyebrow: L(
        'Tanker. Stemme. Struktur.',
        'Thoughts. Voice. Structure.',
        'Tanker. Stemme. Struktur.',
        'Tankar. Röst. Struktur.',
        'Ajatukset. Ääni. Rakenne.',
        'Myśli. Głos. Struktura.',
        'Pensamientos. Voz. Estructura.',
        'Pensées. Voix. Structure.',
        'Gedanken. Stimme. Struktur.'
      ),
      headline: L(
        'Fang det før du glemmer det',
        'Catch it before you forget',
        'Fang det, før du glemmer det',
        'Fånga det innan du glömmer det',
        'Ota kiinni ennen kuin unohdat',
        'Złap to, zanim zapomnisz',
        'Captúralo antes de olvidarlo',
        'Attrape-le avant de l’oublier',
        'Fang es, bevor du es vergisst'
      ),
      pitch: L(
        'Skriv eller snakk inn et notat. ProTop hjelper deg å bevare, rydde og finne det igjen.',
        'Write or speak a note. ProTop helps you keep, tidy and find it again.',
        'Skriv eller tal et notat ind. ProTop hjælper dig med at bevare, rydde op og finde det igen.',
        'Skriv eller tala in en anteckning. ProTop hjälper dig att spara, städa och hitta den igen.',
        'Kirjoita tai puhu muistiinpano. ProTop auttaa säilyttämään, järjestämään ja löytämään sen uudelleen.',
        'Napisz lub nagraj notatkę. ProTop pomoże ją zachować, uporządkować i znaleźć ponownie.',
        'Escribe o dicta una nota. ProTop te ayuda a guardarla, ordenarla y encontrarla de nuevo.',
        'Écris ou dicte une note. ProTop t’aide à la garder, la ranger et la retrouver.',
        'Schreibe oder diktiere eine Notiz. ProTop hilft dir, sie zu bewahren, zu ordnen und wiederzufinden.'
      ),
      activationLabel: L(
        'Aktiver Notat',
        'Activate Notes',
        'Aktiver Noter',
        'Aktivera Anteckningar',
        'Aktivoi Muistiinpanot',
        'Aktywuj Notatki',
        'Activar Notas',
        'Activer Notes',
        'Notizen aktivieren'
      ),
      benefits: [
        L(
          'Skriv eller bruk stemmen',
          'Write or use your voice',
          'Skriv eller brug stemmen',
          'Skriv eller använd rösten',
          'Kirjoita tai käytä ääntä',
          'Pisz lub używaj głosu',
          'Escribe o usa la voz',
          'Écris ou utilise la voix',
          'Schreibe oder nutze die Stimme'
        ),
        L(
          'Samle og arkiver notater ryddig',
          'Collect and archive notes neatly',
          'Saml og arkivér noter ryddigt',
          'Samla och arkivera anteckningar prydligt',
          'Kerää ja arkistoi muistiinpanot siististi',
          'Zbieraj i archiwizuj notatki w porządku',
          'Reúne y archiva notas con orden',
          'Rassemble et archive tes notes proprement',
          'Sammle und archiviere Notizen übersichtlich'
        ),
        L(
          'Gjør et notat om til en oppgave',
          'Turn a note into a task',
          'Gør et notat til en opgave',
          'Gör en anteckning till en uppgift',
          'Muuta muistiinpano tehtäväksi',
          'Zamień notatkę w zadanie',
          'Convierte una nota en una tarea',
          'Transforme une note en tâche',
          'Mache aus einer Notiz eine Aufgabe'
        ),
      ],
    },

    chat: {
      name: L('Chat', 'Chat', 'Chat', 'Chatt', 'Chat', 'Czat', 'Chat', 'Chat', 'Chat'),
      eyebrow: L(
        'Familie. Beskjeder. Sammen.',
        'Family. Messages. Together.',
        'Familie. Beskeder. Sammen.',
        'Familj. Meddelanden. Tillsammans.',
        'Perhe. Viestit. Yhdessä.',
        'Rodzina. Wiadomości. Razem.',
        'Familia. Mensajes. Juntos.',
        'Famille. Messages. Ensemble.',
        'Familie. Nachrichten. Zusammen.'
      ),
      headline: L(
        'Snakk sammen uten støy',
        'Talk together without the noise',
        'Snak sammen uden støj',
        'Prata tillsammans utan brus',
        'Keskustelkaa ilman hälyä',
        'Rozmawiajcie bez szumu',
        'Hablad sin ruido',
        'Parlez sans le bruit',
        'Sprecht zusammen ohne Lärm'
      ),
      pitch: L(
        'Hold familiepraten samlet med tydelige samtaler for familien, grupper og direkte meldinger.',
        'Keep family talk together with clear threads for the family, groups and direct messages.',
        'Hold familiesnakket samlet med tydelige samtaler til familien, grupper og direkte beskeder.',
        'Håll familjesnacket samlat med tydliga trådar för familjen, grupper och direktmeddelanden.',
        'Pidä perhekeskustelu yhdessä selkeillä keskusteluilla perheelle, ryhmille ja suorille viesteille.',
        'Trzymajcie rodzinne rozmowy razem dzięki wyraźnym wątkom dla rodziny, grup i wiadomości prywatnych.',
        'Mantened la charla familiar reunida con hilos claros para la familia, grupos y mensajes directos.',
        'Gardez les échanges familiaux réunis avec des fils clairs pour la famille, les groupes et les messages directs.',
        'Haltet den Familienchat zusammen – mit klaren Gesprächen für Familie, Gruppen und Direktnachrichten.'
      ),
      activationLabel: L(
        'Aktiver Chat',
        'Activate Chat',
        'Aktiver Chat',
        'Aktivera Chatt',
        'Aktivoi Chat',
        'Aktywuj Czat',
        'Activar Chat',
        'Activer Chat',
        'Chat aktivieren'
      ),
      benefits: [
        L(
          'Én rolig kanal for hele familien',
          'One calm channel for the whole family',
          'Én rolig kanal til hele familien',
          'En lugn kanal för hela familjen',
          'Yksi rauhallinen kanava koko perheelle',
          'Jeden spokojny kanał dla całej rodziny',
          'Un canal tranquilo para toda la familia',
          'Un canal calme pour toute la famille',
          'Ein ruhiger Kanal für die ganze Familie'
        ),
        L(
          'Egne samtaler og direkte meldinger',
          'Separate threads and direct messages',
          'Egne samtaler og direkte beskeder',
          'Egna trådar och direktmeddelanden',
          'Omat keskustelut ja suorat viestit',
          'Osobne wątki i wiadomości prywatne',
          'Hilos propios y mensajes directos',
          'Fils dédiés et messages directs',
          'Eigene Gespräche und Direktnachrichten'
        ),
        L(
          'Finn viktige beskjeder igjen',
          'Find important messages again',
          'Find vigtige beskeder igen',
          'Hitta viktiga meddelanden igen',
          'Löydä tärkeät viestit uudelleen',
          'Znajdź ważne wiadomości ponownie',
          'Vuelve a encontrar mensajes importantes',
          'Retrouve les messages importants',
          'Finde wichtige Nachrichten wieder'
        ),
      ],
    },

    chores: {
      name: L('Gjøremål', 'Chores', 'Gøremål', 'Sysslor', 'Askareet', 'Obowiązki', 'Quehaceres', 'Corvées', 'Hausarbeiten'),
      eyebrow: L(
        'Små steg. Gode vaner.',
        'Small steps. Good habits.',
        'Små skridt. Gode vaner.',
        'Små steg. Goda vanor.',
        'Pienet askeleet. Hyvät tavat.',
        'Małe kroki. Dobre nawyki.',
        'Pasos pequeños. Buenos hábitos.',
        'Petits pas. Bonnes habitudes.',
        'Kleine Schritte. Gute Gewohnheiten.'
      ),
      headline: L(
        'Gjør innsats synlig',
        'Make effort visible',
        'Gør indsats synlig',
        'Gör insatser synliga',
        'Tee panostus näkyväksi',
        'Uczyń wysiłek widocznym',
        'Haz visible el esfuerzo',
        'Rends l’effort visible',
        'Mach Einsatz sichtbar'
      ),
      pitch: L(
        'Gi barna tydelige oppgaver, passende ansvar og oppmuntring til å fullføre.',
        'Give kids clear chores, age-fitting responsibility and encouragement to finish.',
        'Giv børnene tydelige opgaver, passende ansvar og opmuntring til at blive færdige.',
        'Ge barnen tydliga sysslor, lagom ansvar och uppmuntran att bli klara.',
        'Anna lapsille selkeät askareet, sopiva vastuu ja kannustus loppuun saattamiseen.',
        'Daj dzieciom jasne obowiązki, odpowiednią odpowiedzialność i zachętę do dokończenia.',
        'Da a los niños tareas claras, responsabilidad adecuada y ánimo para terminar.',
        'Donne aux enfants des corvées claires, une responsabilité adaptée et l’envie de finir.',
        'Gib Kindern klare Aufgaben, passendes Verantwortung und Ermutigung zum Fertigstellen.'
      ),
      activationLabel: L(
        'Aktiver Gjøremål',
        'Activate Chores',
        'Aktiver Gøremål',
        'Aktivera Sysslor',
        'Aktivoi Askareet',
        'Aktywuj Obowiązki',
        'Activar Quehaceres',
        'Activer Corvées',
        'Hausarbeiten aktivieren'
      ),
      benefits: [
        L(
          'Tilpass oppgavene etter alder',
          'Adapt chores to age',
          'Tilpas opgaverne efter alder',
          'Anpassa sysslorna efter ålder',
          'Sovita askareet iän mukaan',
          'Dopasuj obowiązki do wieku',
          'Adapta las tareas a la edad',
          'Adapte les corvées à l’âge',
          'Passe Aufgaben dem Alter an'
        ),
        L(
          'Gjør neste steg lett å forstå',
          'Make the next step easy to understand',
          'Gør næste skridt nemt at forstå',
          'Gör nästa steg lätt att förstå',
          'Tee seuraava askel helpoksi ymmärtää',
          'Uczyń kolejny krok łatwym do zrozumienia',
          'Haz el siguiente paso fácil de entender',
          'Rends la prochaine étape facile à comprendre',
          'Mach den nächsten Schritt leicht verständlich'
        ),
        L(
          'Følg fremgang og ukepenger uten mas',
          'Track progress and pocket money without nagging',
          'Følg fremskridt og lommepenge uden mas',
          'Följ framsteg och veckopeng utan tjat',
          'Seuraa edistymistä ja viikkorahaa ilman naggaamista',
          'Śledź postępy i kieszonkowe bez nękania',
          'Sigue el avance y la paga sin regañar',
          'Suis les progrès et l’argent de poche sans harceler',
          'Verfolge Fortschritt und Taschengeld ohne Nörgeln'
        ),
      ],
    },

    shop: {
      name: L('Handleliste', 'Shopping list', 'Indkøbsliste', 'Inköpslista', 'Ostoslista', 'Lista zakupów', 'Lista de la compra', 'Liste de courses', 'Einkaufsliste'),
      eyebrow: L(
        'Handle sammen. Husk mindre.',
        'Shop together. Remember less.',
        'Handl sammen. Husk mindre.',
        'Handla tillsammans. Kom ihåg mindre.',
        'Ostakaa yhdessä. Muistakaa vähemmän.',
        'Kupujcie razem. Pamiętajcie mniej.',
        'Comprad juntos. Recordad menos.',
        'Faites les courses ensemble. Mémorisez moins.',
        'Gemeinsam einkaufen. Weniger merken.'
      ),
      headline: L(
        'Listen som følger familien',
        'The list that follows the family',
        'Listen, der følger familien',
        'Listan som följer familjen',
        'Lista, joka kulkee perheen mukana',
        'Lista, która idzie z rodziną',
        'La lista que sigue a la familia',
        'La liste qui suit la famille',
        'Die Liste, die der Familie folgt'
      ),
      pitch: L(
        'Del handlelisten i sanntid, legg til fra måltidsplanen og se hva som allerede er kjøpt.',
        'Share the shopping list in real time, add from the meal plan and see what’s already bought.',
        'Del indkøbslisten i realtid, tilføj fra måltidsplanen, og se, hvad der allerede er købt.',
        'Dela inköpslistan i realtid, lägg till från måltidsplanen och se vad som redan är köpt.',
        'Jaa ostoslista reaaliajassa, lisää ateriastasuunnitelmasta ja näe, mitä on jo ostettu.',
        'Udostępniaj listę zakupów na żywo, dodawaj z planu posiłków i zobacz, co już kupiono.',
        'Comparte la lista en tiempo real, añade desde el plan de comidas y ve qué ya se ha comprado.',
        'Partagez la liste en temps réel, ajoutez depuis le plan de repas et voyez ce qui est déjà acheté.',
        'Teilt die Einkaufsliste in Echtzeit, fügt aus dem Essensplan hinzu und seht, was schon gekauft ist.'
      ),
      activationLabel: L(
        'Aktiver Handleliste',
        'Activate Shopping list',
        'Aktiver Indkøbsliste',
        'Aktivera Inköpslista',
        'Aktivoi Ostoslista',
        'Aktywuj Listę zakupów',
        'Activar Lista de la compra',
        'Activer Liste de courses',
        'Einkaufsliste aktivieren'
      ),
      benefits: [
        L(
          'Alle handler fra samme oppdaterte liste',
          'Everyone shops from the same up-to-date list',
          'Alle handler fra samme opdaterede liste',
          'Alla handlar från samma uppdaterade lista',
          'Kaikki ostavat samasta ajan tasalla olevasta listasta',
          'Wszyscy kupują z tej samej aktualnej listy',
          'Todos compran desde la misma lista actualizada',
          'Tout le monde fait les courses sur la même liste à jour',
          'Alle kaufen von derselben aktualisierten Liste'
        ),
        L(
          'Varene sorteres så turen går raskere',
          'Items are sorted so the trip goes faster',
          'Varerne sorteres, så turen går hurtigere',
          'Varorna sorteras så turen går snabbare',
          'Tuotteet lajitellaan, jotta kauppareissu sujuu nopeammin',
          'Produkty są sortowane, by zakupy szły szybciej',
          'Los artículos se ordenan para que la compra vaya más rápido',
          'Les articles sont triés pour accélérer le parcours',
          'Artikel werden sortiert, damit der Einkauf schneller geht'
        ),
        L(
          'Legg til med strekkode eller fra en oppskrift',
          'Add with a barcode or from a recipe',
          'Tilføj med stregkode eller fra en opskrift',
          'Lägg till med streckkod eller från ett recept',
          'Lisää viivakoodilla tai reseptistä',
          'Dodawaj kodem kreskowym lub z przepisu',
          'Añade con código de barras o desde una receta',
          'Ajoute par code-barres ou depuis une recette',
          'Hinzufügen per Barcode oder aus einem Rezept'
        ),
      ],
    },

    meals: {
      name: L('Måltidsplanlegger', 'Meal planner', 'Måltidsplanlægger', 'Måltidsplanerare', 'Ateriasuunnittelija', 'Planer posiłków', 'Planificador de comidas', 'Planificateur de repas', 'Essensplaner'),
      eyebrow: L(
        'Middag. Mengder. Flyt.',
        'Dinner. Portions. Flow.',
        'Aftensmad. Mængder. Flow.',
        'Middag. Mängder. Flöde.',
        'Illallinen. Määrät. Flow.',
        'Obiad. Ilości. Przepływ.',
        'Cena. Cantidades. Flujo.',
        'Dîner. Quantités. Flux.',
        'Abendessen. Mengen. Flow.'
      ),
      headline: L(
        'Planlegg maten – resten følger',
        'Plan the food – the rest follows',
        'Planlæg maden – resten følger',
        'Planera maten – resten följer',
        'Suunnittele ruoka – loput seuraavat',
        'Zaplanuj jedzenie – reszta pójdzie za tym',
        'Planifica la comida – el resto sigue',
        'Planifie les repas – le reste suit',
        'Plane das Essen – der Rest folgt'
      ),
      pitch: L(
        'Velg måltider og porsjoner. Ingredienser og riktige mengder kan sendes rett til handlelisten.',
        'Choose meals and portions. Ingredients and the right amounts can go straight to the shopping list.',
        'Vælg måltider og portioner. Ingredienser og de rigtige mængder kan sendes direkte til indkøbslisten.',
        'Välj måltider och portioner. Ingredienser och rätt mängder kan skickas rakt till inköpslistan.',
        'Valitse ateriat ja annokset. Ainekset ja oikeat määrät voi lähettää suoraan ostoslistalle.',
        'Wybierz posiłki i porcje. Składniki i właściwe ilości mogą trafić prosto na listę zakupów.',
        'Elige comidas y raciones. Los ingredientes y las cantidades correctas pueden ir a la lista de la compra.',
        'Choisis repas et portions. Ingrédients et quantités juste peuvent aller droit dans la liste de courses.',
        'Wähle Mahlzeiten und Portionen. Zutaten und die richtigen Mengen können direkt auf die Einkaufsliste.'
      ),
      activationLabel: L(
        'Aktiver Måltidsplanlegger',
        'Activate Meal planner',
        'Aktiver Måltidsplanlægger',
        'Aktivera Måltidsplanerare',
        'Aktivoi Ateriasuunnittelija',
        'Aktywuj Planer posiłków',
        'Activar Planificador de comidas',
        'Activer Planificateur de repas',
        'Essensplaner aktivieren'
      ),
      benefits: [
        L(
          'Se hele familiens matuke',
          'See the family’s whole food week',
          'Se hele familiens maduge',
          'Se hela familjens matvecka',
          'Näe koko perheen ruokaviikko',
          'Zobacz cały tydzień jedzenia rodziny',
          'Ve toda la semana de comidas de la familia',
          'Vois toute la semaine de repas de la famille',
          'Sieh die ganze Essenswoche der Familie'
        ),
        L(
          'Beregn mengder etter antall personer',
          'Calculate amounts by number of people',
          'Beregn mængder efter antal personer',
          'Beräkna mängder efter antal personer',
          'Laske määrät henkilömäärän mukaan',
          'Oblicz ilości według liczby osób',
          'Calcula cantidades según el número de personas',
          'Calcule les quantités selon le nombre de personnes',
          'Berechne Mengen nach Personenanzahl'
        ),
        L(
          'Bruk det dere har og reduser matsvinn',
          'Use what you have and cut food waste',
          'Brug det, I har, og reducer madspild',
          'Använd det ni har och minska matsvinn',
          'Käytä mitä teillä on ja vähennä ruokahävikkiä',
          'Wykorzystajcie to, co macie, i ograniczcie marnowanie jedzenia',
          'Usad lo que ya tenéis y reducid el desperdicio',
          'Utilisez ce que vous avez et réduisez le gaspillage',
          'Nutzt, was ihr habt, und reduziert Lebensmittelverschwendung'
        ),
      ],
    },

    recipes: {
      name: L('Oppskrift', 'Recipes', 'Opskrift', 'Recept', 'Reseptit', 'Przepisy', 'Recetas', 'Recettes', 'Rezepte'),
      eyebrow: L(
        'Matretter. Fremgangsmåte. Favoritter.',
        'Dishes. Steps. Favourites.',
        'Retter. Fremgangsmåde. Favoritter.',
        'Rätter. Tillvägagångssätt. Favoriter.',
        'Ruokalajit. Valmistusohje. Suosikit.',
        'Dania. Sposób przygotowania. Ulubione.',
        'Platos. Pasos. Favoritos.',
        'Plats. Étapes. Favoris.',
        'Gerichte. Zubereitung. Favoriten.'
      ),
      headline: L(
        'Familiens egne oppskrifter',
        'The family’s own recipes',
        'Familiens egne opskrifter',
        'Familjens egna recept',
        'Perheen omat reseptit',
        'Własne przepisy rodziny',
        'Las recetas propias de la familia',
        'Les recettes de la famille',
        'Die eigenen Rezepte der Familie'
      ),
      pitch: L(
        'Lagre matretter med bilde, ingredienser og fremgangsmåte. Importer fra bilde eller lenke med AI, og vurder favorittene.',
        'Save dishes with photo, ingredients and steps. Import from a photo or link with AI, and rate your favourites.',
        'Gem retter med billede, ingredienser og fremgangsmåde. Importér fra billede eller link med AI, og vurder favoritterne.',
        'Spara rätter med bild, ingredienser och tillvägagångssätt. Importera från bild eller länk med AI, och betygsätt favoriterna.',
        'Tallenna ruokalajeja kuvalla, aineksilla ja ohjeella. Tuo kuvasta tai linkistä tekoälyllä ja arvioi suosikit.',
        'Zapisuj dania ze zdjęciem, składnikami i sposobem przygotowania. Importuj ze zdjęcia lub linku z AI i oceniaj ulubione.',
        'Guarda platos con foto, ingredientes y pasos. Importa desde foto o enlace con IA y valora los favoritos.',
        'Enregistre des plats avec photo, ingrédients et étapes. Importe depuis une photo ou un lien avec l’IA, et note les favoris.',
        'Speichere Gerichte mit Foto, Zutaten und Zubereitung. Importiere per Foto oder Link mit KI und bewerte Favoriten.'
      ),
      activationLabel: L(
        'Aktiver Oppskrift',
        'Activate Recipes',
        'Aktiver Opskrift',
        'Aktivera Recept',
        'Aktivoi Reseptit',
        'Aktywuj Przepisy',
        'Activar Recetas',
        'Activer Recettes',
        'Rezepte aktivieren'
      ),
      benefits: [
        L(
          'Samle egne og foreslåtte matretter på ett sted',
          'Collect your own and suggested dishes in one place',
          'Saml egne og foreslåede retter ét sted',
          'Samla egna och föreslagna rätter på ett ställe',
          'Kerää omat ja ehdotetut ruokalajit yhteen paikkaan',
          'Zbieraj własne i proponowane dania w jednym miejscu',
          'Reúne platos propios y sugeridos en un solo lugar',
          'Rassemble tes plats et des suggestions au même endroit',
          'Sammle eigene und vorgeschlagene Gerichte an einem Ort'
        ),
        L(
          'Importer oppskrift fra bilde eller nettside med AI',
          'Import a recipe from a photo or webpage with AI',
          'Importér opskrift fra billede eller webside med AI',
          'Importera recept från bild eller webbplats med AI',
          'Tuo resepti kuvasta tai verkkosivulta tekoälyllä',
          'Importuj przepis ze zdjęcia lub strony z AI',
          'Importa una receta desde foto o web con IA',
          'Importe une recette depuis une photo ou une page avec l’IA',
          'Importiere ein Rezept aus Foto oder Webseite mit KI'
        ),
        L(
          'Vurder med stjerner – favoritter løftes i måltidsplanen',
          'Rate with stars – favourites rise in the meal plan',
          'Vurder med stjerner – favoritter løftes i måltidsplanen',
          'Betygsätt med stjärnor – favoriter lyfts i måltidsplanen',
          'Arvioi tähdillä – suosikit nousevat ateriasuunnitelmassa',
          'Oceń gwiazdkami – ulubione awansują w planie posiłków',
          'Valora con estrellas – los favoritos suben en el plan de comidas',
          'Note avec des étoiles – les favoris montent dans le plan de repas',
          'Bewerte mit Sternen – Favoriten steigen im Essensplan'
        ),
      ],
    },

    pantry: {
      name: L('Lager', 'Pantry', 'Lager', 'Skafferi', 'Varasto', 'Spiżarnia', 'Despensa', 'Garde-manger', 'Vorrat'),
      eyebrow: L(
        'Kjøleskap. Fryser. Oversikt.',
        'Fridge. Freezer. Overview.',
        'Køleskab. Fryser. Oversigt.',
        'Kylskåp. Frys. Översikt.',
        'Jääkaappi. Pakastin. Yhteenveto.',
        'Lodówka. Zamrażarka. Przegląd.',
        'Nevera. Congelador. Vista.',
        'Frigo. Congélateur. Vue d’ensemble.',
        'Kühlschrank. Gefrierfach. Überblick.'
      ),
      headline: L(
        'Se hva dere har før dere handler',
        'See what you have before you shop',
        'Se, hvad I har, før I handler',
        'Se vad ni har innan ni handlar',
        'Näe mitä teillä on ennen ostoksia',
        'Zobaczcie, co macie, zanim zrobicie zakupy',
        'Ved qué tenéis antes de comprar',
        'Voyez ce que vous avez avant d’acheter',
        'Seht, was ihr habt, bevor ihr einkauft'
      ),
      pitch: L(
        'Ta bilde — AI lager innholdslisten. Registrer kjøleskap, fryser og tørrvarer, så ProTop bruker det som allerede finnes hjemme.',
        'Snap a photo — AI builds the stock list. Track fridge, freezer and dry goods so ProTop uses what’s already at home.',
        'Tag et billede — AI laver indholdslisten. Registrér køleskab, fryser og tørvarer, så ProTop bruger det, der allerede er hjemme.',
        'Ta en bild — AI skapar innehållslistan. Registrera kyl, frys och torvaror så ProTop använder det som redan finns hemma.',
        'Ota kuva — tekoäly tekee listan. Kirjaa jääkaappi, pakastin ja kuivatuotteet, niin ProTop käyttää sitä, mitä kotona jo on.',
        'Zrób zdjęcie — AI stworzy listę. Rejestruj lodówkę, zamrażarkę i produkty suche, a ProTop użyje tego, co już jest w domu.',
        'Haz una foto — la IA crea la lista. Registra nevera, congelador y secos para que ProTop use lo que ya hay en casa.',
        'Prenez une photo — l’IA dresse la liste. Enregistre frigo, congélateur et secs pour que ProTop utilise ce qui est déjà à la maison.',
        'Foto machen — KI erstellt die Liste. Erfasse Kühlschrank, Gefrierfach und Trockenware, damit ProTop nutzt, was schon zu Hause ist.'
      ),
      activationLabel: L(
        'Aktiver Lager',
        'Activate Pantry',
        'Aktiver Lager',
        'Aktivera Skafferi',
        'Aktivoi Varasto',
        'Aktywuj Spiżarnię',
        'Activar Despensa',
        'Activer Garde-manger',
        'Vorrat aktivieren'
      ),
      benefits: [
        L(
          'Ta bilde — AI lager innholdslisten',
          'Snap a photo — AI builds the stock list',
          'Tag et billede — AI laver indholdslisten',
          'Ta en bild — AI skapar innehållslistan',
          'Ota kuva — tekoäly tekee listan',
          'Zrób zdjęcie — AI stworzy listę',
          'Haz una foto — la IA crea la lista',
          'Prenez une photo — l’IA dresse la liste',
          'Foto machen — KI erstellt die Liste'
        ),
        L(
          'Unngå å kjøpe det samme to ganger',
          'Avoid buying the same thing twice',
          'Undgå at købe det samme to gange',
          'Undvik att köpa samma sak två gånger',
          'Vältä ostamasta samaa kahdesti',
          'Unikaj kupowania tego samego dwa razy',
          'Evita comprar lo mismo dos veces',
          'Évite d’acheter la même chose deux fois',
          'Vermeide, dasselbe zweimal zu kaufen'
        ),
        L(
          'Skann strekkoder for rask registrering',
          'Scan barcodes for quick logging',
          'Scan stregkoder for hurtig registrering',
          'Skanna streckkoder för snabb registrering',
          'Skannaa viivakoodeja nopeaan kirjaamiseen',
          'Skanuj kody kreskowe do szybkiego dodawania',
          'Escanea códigos de barras para registrar rápido',
          'Scanne des codes-barres pour un enregistrement rapide',
          'Scanne Barcodes für schnelle Erfassung'
        ),
        L(
          'Trekk lageret fra handlelisten automatisk',
          'Subtract pantry stock from the shopping list automatically',
          'Træk lageret fra indkøbslisten automatisk',
          'Dra av skafferiet från inköpslistan automatiskt',
          'Vähennä varasto ostoslistasta automaattisesti',
          'Odejmij zapasy od listy zakupów automatycznie',
          'Resta el stock de la despensa de la lista automáticamente',
          'Soustrais le stock de la liste de courses automatiquement',
          'Zieh den Vorrat automatisch von der Einkaufsliste ab'
        ),
      ],
    },

    albums: {
      name: L('Familiealbum', 'Family album', 'Familiealbum', 'Familjealbum', 'Perhealbumi', 'Album rodzinny', 'Álbum familiar', 'Album familial', 'Familienalbum'),
      eyebrow: L(
        'Bilder. Øyeblikk. Minner.',
        'Photos. Moments. Memories.',
        'Billeder. Øjeblikke. Minder.',
        'Bilder. Ögonblick. Minnen.',
        'Kuvat. Hetket. Muistot.',
        'Zdjęcia. Chwile. Wspomnienia.',
        'Fotos. Momentos. Recuerdos.',
        'Photos. Instants. Souvenirs.',
        'Fotos. Momente. Erinnerungen.'
      ),
      headline: L(
        'Familiens øyeblikk, samlet',
        'The family’s moments, gathered',
        'Familiens øjeblikke, samlet',
        'Familjens ögonblick, samlade',
        'Perheen hetket yhdessä',
        'Chwile rodziny zebrane',
        'Los momentos de la familia, reunidos',
        'Les instants de la famille, réunis',
        'Die Momente der Familie, gesammelt'
      ),
      pitch: L(
        'Lag private album for ferier, bursdager og helt vanlige dager – uten at minnene drukner i chat.',
        'Create private albums for holidays, birthdays and ordinary days – without memories drowning in chat.',
        'Lav private album til ferier, fødselsdage og helt almindelige dage – uden at minderne drukner i chat.',
        'Skapa privata album för semestrar, födelsedagar och helt vanliga dagar – utan att minnena drunknar i chatten.',
        'Luo yksityisiä albumeita lomille, syntymäpäiville ja aivan tavallisille päiville – ilman että muistot hukkuivat chattiin.',
        'Twórz prywatne albumy na wakacje, urodziny i zwykłe dni – bez tonięcia wspomnień w czacie.',
        'Crea álbumes privados para vacaciones, cumpleaños y días normales – sin que los recuerdos se pierdan en el chat.',
        'Crée des albums privés pour vacances, anniversaires et jours ordinaires – sans que les souvenirs se noient dans le chat.',
        'Lege private Alben für Ferien, Geburtstage und ganz normale Tage an – ohne dass Erinnerungen im Chat untergehen.'
      ),
      activationLabel: L(
        'Aktiver Familiealbum',
        'Activate Family album',
        'Aktiver Familiealbum',
        'Aktivera Familjealbum',
        'Aktivoi Perhealbumi',
        'Aktywuj Album rodzinny',
        'Activar Álbum familiar',
        'Activer Album familial',
        'Familienalbum aktivieren'
      ),
      benefits: [
        L(
          'Sorter bilder etter album og anledning',
          'Sort photos by album and occasion',
          'Sortér billeder efter album og anledning',
          'Sortera bilder efter album och tillfälle',
          'Lajittele kuvat albumin ja tilaisuuden mukaan',
          'Sortuj zdjęcia według albumu i okazji',
          'Ordena fotos por álbum y ocasión',
          'Classe les photos par album et occasion',
          'Sortiere Fotos nach Album und Anlass'
        ),
        L(
          'La familien bidra på samme sted',
          'Let the family contribute in one place',
          'Lad familien bidrage samme sted',
          'Låt familjen bidra på samma ställe',
          'Anna perheen osallistua samassa paikassa',
          'Pozwól rodzinie dodawać w jednym miejscu',
          'Deja que la familia aporte en el mismo sitio',
          'Laisse la famille contribuer au même endroit',
          'Lass die Familie am selben Ort beitragen'
        ),
        L(
          'Bevar minnene privat og oversiktlig',
          'Keep memories private and organised',
          'Bevar minderne private og overskuelige',
          'Bevara minnena privata och överskådliga',
          'Säilytä muistot yksityisinä ja selkeinä',
          'Zachowaj wspomnienia prywatne i przejrzyste',
          'Conserva los recuerdos privados y ordenados',
          'Garde les souvenirs privés et clairs',
          'Bewahre Erinnerungen privat und übersichtlich'
        ),
      ],
    },

    wall: {
      name: L('Familievegg', 'Family wall', 'Familievæg', 'Familjevägg', 'Perheseinä', 'Ściana rodzinna', 'Muro familiar', 'Mur familial', 'Familienwand'),
      eyebrow: L(
        'Små glimt. Felles hverdag.',
        'Small glimpses. Shared everyday.',
        'Små glimt. Fælles hverdag.',
        'Små glimtar. Delad vardag.',
        'Pienet vilaukset. Yhteinen arki.',
        'Małe migawki. Wspólna codzienność.',
        'Pequeños destellos. Día a día compartido.',
        'Petits aperçus. Quotidien partagé.',
        'Kleine Einblicke. Geteilter Alltag.'
      ),
      headline: L(
        'Del det som er verdt å huske',
        'Share what’s worth remembering',
        'Del det, der er værd at huske',
        'Dela det som är värt att minnas',
        'Jaa se, mikä kannattaa muistaa',
        'Udostępniaj to, co warto zapamiętać',
        'Comparte lo que merece recordarse',
        'Partage ce qui mérite d’être retenu',
        'Teile, was es wert ist, erinnert zu werden'
      ),
      pitch: L(
        'En rolig familievegg for små oppdateringer, bilder og beskjeder fra hverdagen.',
        'A calm family wall for small updates, photos and notes from everyday life.',
        'En rolig familievæg til små opdateringer, billeder og beskeder fra hverdagen.',
        'En lugn familjevägg för små uppdateringar, bilder och meddelanden från vardagen.',
        'Rauhallinen perheseinä pienille päivityksille, kuville ja arjen viesteille.',
        'Spokojna ściana rodzinna na małe aktualizacje, zdjęcia i wiadomości z codzienności.',
        'Un muro familiar tranquilo para pequeñas actualizaciones, fotos y notas del día a día.',
        'Un mur familial calme pour petites mises à jour, photos et messages du quotidien.',
        'Eine ruhige Familienwand für kleine Updates, Fotos und Notizen aus dem Alltag.'
      ),
      activationLabel: L(
        'Aktiver Familievegg',
        'Activate Family wall',
        'Aktiver Familievæg',
        'Aktivera Familjevägg',
        'Aktivoi Perheseinä',
        'Aktywuj Ścianę rodzinną',
        'Activar Muro familiar',
        'Activer Mur familial',
        'Familienwand aktivieren'
      ),
      benefits: [
        L(
          'Del korte oppdateringer med alle',
          'Share short updates with everyone',
          'Del korte opdateringer med alle',
          'Dela korta uppdateringar med alla',
          'Jaa lyhyitä päivityksiä kaikille',
          'Udostępniaj krótkie aktualizacje wszystkim',
          'Comparte actualizaciones cortas con todos',
          'Partage de brèves mises à jour avec tous',
          'Teile kurze Updates mit allen'
        ),
        L(
          'Legg ved bilder fra dagen',
          'Attach photos from the day',
          'Vedhæft billeder fra dagen',
          'Bifoga bilder från dagen',
          'Liitä kuvia päivästä',
          'Dołącz zdjęcia z dnia',
          'Adjunta fotos del día',
          'Joins des photos de la journée',
          'Hänge Fotos vom Tag an'
        ),
        L(
          'Finn høydepunktene igjen senere',
          'Find the highlights again later',
          'Find højdepunkterne igen senere',
          'Hitta höjdpunkterna igen senare',
          'Löydä kohokohdat myöhemmin uudelleen',
          'Znajdź najważniejsze momenty później',
          'Vuelve a encontrar los momentos destacados',
          'Retrouve les moments forts plus tard',
          'Finde die Highlights später wieder'
        ),
      ],
    },

    childDrawings: {
      name: L('Barnetegninger', 'Kids’ drawings', 'Børnetegninger', 'Barnteckningar', 'Lasten piirustukset', 'Rysunki dzieci', 'Dibujos infantiles', 'Dessins d’enfants', 'Kinderzeichnungen'),
      eyebrow: L(
        'Tegninger. Rammer. Minner.',
        'Drawings. Frames. Memories.',
        'Tegninger. Rammer. Minder.',
        'Teckningar. Ramar. Minnen.',
        'Piirustukset. Kehykset. Muistot.',
        'Rysunki. Ramki. Wspomnienia.',
        'Dibujos. Marcos. Recuerdos.',
        'Dessins. Cadres. Souvenirs.',
        'Zeichnungen. Rahmen. Erinnerungen.'
      ),
      headline: L(
        'Heng barnas mesterverk på veggen',
        'Hang the kids’ masterpieces on the wall',
        'Hæng børnenes mesterværker på væggen',
        'Häng barnens mästerverk på väggen',
        'Ripusta lasten mestariteokset seinälle',
        'Powieś arcydzieła dzieci na ścianie',
        'Cuelga las obras maestras de los niños en la pared',
        'Accroche les chefs-d’œuvre des enfants au mur',
        'Hänge die Meisterwerke der Kinder an die Wand'
      ),
      pitch: L(
        'Ta bilde av tegningen – ProTop cropper, skalerer og setter den i en ramme over sofaen i stua.',
        'Photograph the drawing – ProTop crops, scales and places it in a frame above the sofa in the living room.',
        'Tag et billede af tegningen – ProTop cropper, skalerer og sætter den i en ramme over sofaen i stuen.',
        'Ta en bild på teckningen – ProTop beskär, skalar och sätter den i en ram ovanför soffan i vardagsrummet.',
        'Ota kuva piirustuksesta – ProTop rajaa, skaalaa ja asettaa sen kehykseen sohvan yläpuolelle olohuoneessa.',
        'Zrób zdjęcie rysunku – ProTop przycina, skaluje i umieszcza go w ramce nad sofą w salonie.',
        'Haz una foto del dibujo – ProTop lo recorta, escala y lo pone en un marco encima del sofá del salón.',
        'Prends en photo le dessin – ProTop recadre, met à l’échelle et le place dans un cadre au-dessus du canapé.',
        'Fotografiere die Zeichnung – ProTop beschneidet, skaliert und setzt sie in einen Rahmen über dem Sofa im Wohnzimmer.'
      ),
      activationLabel: L(
        'Aktiver Barnetegninger',
        'Activate Kids’ drawings',
        'Aktiver Børnetegninger',
        'Aktivera Barnteckningar',
        'Aktivoi Lasten piirustukset',
        'Aktywuj Rysunki dzieci',
        'Activar Dibujos infantiles',
        'Activer Dessins d’enfants',
        'Kinderzeichnungen aktivieren'
      ),
      benefits: [
        L(
          'Auto-crop og høy oppløsning av tegningen',
          'Auto-crop and high resolution of the drawing',
          'Auto-crop og høj opløsning af tegningen',
          'Auto-beskärning och hög upplösning av teckningen',
          'Automaattinen rajaus ja korkea resoluutio piirustuksesta',
          'Auto-kadrowanie i wysoka rozdzielczość rysunku',
          'Recorte automático y alta resolución del dibujo',
          'Recadrage auto et haute résolution du dessin',
          'Auto-Zuschnitt und hohe Auflösung der Zeichnung'
        ),
        L(
          'Velg rammeform, farge og plassering i rommet',
          'Choose frame shape, colour and placement in the room',
          'Vælg rammeform, farve og placering i rummet',
          'Välj ramform, färg och placering i rummet',
          'Valitse kehyksen muoto, väri ja sijoitus huoneessa',
          'Wybierz kształt ramki, kolor i miejsce w pokoju',
          'Elige forma, color y ubicación del marco en la habitación',
          'Choisis forme, couleur et placement du cadre dans la pièce',
          'Wähle Rahmenform, Farbe und Platzierung im Raum'
        ),
        L(
          'Lagre barn, alder, sted og dato – og endre når som helst',
          'Save child, age, place and date – and edit anytime',
          'Gem barn, alder, sted og dato – og ændr når som helst',
          'Spara barn, ålder, plats och datum – och ändra när som helst',
          'Tallenna lapsi, ikä, paikka ja päivä – ja muuta milloin tahansa',
          'Zapisz dziecko, wiek, miejsce i datę – i edytuj kiedy chcesz',
          'Guarda niño, edad, lugar y fecha – y edita cuando quieras',
          'Enregistre enfant, âge, lieu et date – et modifie à tout moment',
          'Speichere Kind, Alter, Ort und Datum – und ändere jederzeit'
        ),
      ],
    },

    familyTree: {
      name: L('Familietreet', 'Family tree', 'Familietræet', 'Släktträdet', 'Sukupuu', 'Drzewo rodzinne', 'Árbol familiar', 'Arbre généalogique', 'Stammbaum'),
      eyebrow: L(
        'Røtter. Navn. Historier.',
        'Roots. Names. Stories.',
        'Rødder. Navne. Historier.',
        'Rötter. Namn. Historier.',
        'Juuret. Nimet. Tarinat.',
        'Korzenie. Imiona. Historie.',
        'Raíces. Nombres. Historias.',
        'Racines. Noms. Histoires.',
        'Wurzeln. Namen. Geschichten.'
      ),
      headline: L(
        'Gjør slekten forståelig',
        'Make the family tree easy to grasp',
        'Gør slægten forståelig',
        'Gör släkten begriplig',
        'Tee suku ymmärrettäväksi',
        'Uczyń ród zrozumiałym',
        'Haz comprensible el linaje',
        'Rends la famille compréhensible',
        'Mach die Verwandtschaft verständlich'
      ),
      pitch: L(
        'Bygg et visuelt familietre som gjør navn, relasjoner og historier lette å utforske.',
        'Build a visual family tree that makes names, relationships and stories easy to explore.',
        'Byg et visuelt familietræ, der gør navne, relationer og historier lette at udforske.',
        'Bygg ett visuellt släktträd som gör namn, relationer och historier lätta att utforska.',
        'Rakenna visuaalinen sukupuu, joka tekee nimistä, suhteista ja tarinoista helppoja tutkia.',
        'Zbuduj wizualne drzewo rodzinne, które ułatwia odkrywanie imion, relacji i historii.',
        'Construye un árbol familiar visual que hace fáciles de explorar nombres, relaciones e historias.',
        'Construis un arbre visuel qui rend noms, liens et histoires faciles à explorer.',
        'Baue einen visuellen Stammbaum, der Namen, Beziehungen und Geschichten leicht erkundbar macht.'
      ),
      activationLabel: L(
        'Aktiver Familietreet',
        'Activate Family tree',
        'Aktiver Familietræet',
        'Aktivera Släktträdet',
        'Aktivoi Sukupuu',
        'Aktywuj Drzewo rodzinne',
        'Activar Árbol familiar',
        'Activer Arbre généalogique',
        'Stammbaum aktivieren'
      ),
      benefits: [
        L(
          'Se hvordan familien henger sammen',
          'See how the family connects',
          'Se, hvordan familien hænger sammen',
          'Se hur familjen hänger ihop',
          'Näe, miten perhe liittyy yhteen',
          'Zobacz, jak rodzina się łączy',
          'Ve cómo encaja la familia',
          'Vois comment la famille s’articule',
          'Sieh, wie die Familie zusammenhängt'
        ),
        L(
          'Inviter slektninger til å bidra',
          'Invite relatives to contribute',
          'Invitér slægtninge til at bidrage',
          'Bjud in släktingar att bidra',
          'Kutsu sukulaisia osallistumaan',
          'Zaproś krewnych do udziału',
          'Invita a parientes a aportar',
          'Invite des proches à contribuer',
          'Lade Verwandte zum Mitwirken ein'
        ),
        L(
          'Ta vare på bilder og små historier',
          'Preserve photos and small stories',
          'Pas på billeder og små historier',
          'Ta vara på bilder och små historier',
          'Säilytä kuvia ja pieniä tarinoita',
          'Dbaj o zdjęcia i małe historie',
          'Cuida fotos e historias pequeñas',
          'Préserve photos et petites histoires',
          'Bewahre Fotos und kleine Geschichten'
        ),
      ],
    },

    scratchMap: {
      name: L('Våre reiser', 'Our trips', 'Vores rejser', 'Våra resor', 'Matkamme', 'Nasze podróże', 'Nuestros viajes', 'Nos voyages', 'Unsere Reisen'),
      eyebrow: L(
        'Reiser. Planer. Minner.',
        'Trips. Plans. Memories.',
        'Rejser. Planer. Minder.',
        'Resor. Planer. Minnen.',
        'Matkat. Suunnitelmat. Muistot.',
        'Podróże. Plany. Wspomnienia.',
        'Viajes. Planes. Recuerdos.',
        'Voyages. Plans. Souvenirs.',
        'Reisen. Pläne. Erinnerungen.'
      ),
      headline: L(
        'Hele reisen på ett sted',
        'The whole trip in one place',
        'Hele rejsen ét sted',
        'Hela resan på ett ställe',
        'Koko matka yhdessä paikassa',
        'Cała podróż w jednym miejscu',
        'Todo el viaje en un solo lugar',
        'Tout le voyage au même endroit',
        'Die ganze Reise an einem Ort'
      ),
      pitch: L(
        'Samle reisemål, planer, bestillinger og minner før, under og etter turen.',
        'Gather destinations, plans, bookings and memories before, during and after the trip.',
        'Saml rejsemål, planer, bestillinger og minder før, under og efter turen.',
        'Samla resmål, planer, bokningar och minnen före, under och efter resan.',
        'Kerää kohteet, suunnitelmat, varaukset ja muistot ennen matkaa, sen aikana ja sen jälkeen.',
        'Zbieraj cele, plany, rezerwacje i wspomnienia przed, w trakcie i po podróży.',
        'Reúne destinos, planes, reservas y recuerdos antes, durante y después del viaje.',
        'Rassemble destinations, plans, réservations et souvenirs avant, pendant et après le voyage.',
        'Sammle Ziele, Pläne, Buchungen und Erinnerungen vor, während und nach der Reise.'
      ),
      activationLabel: L(
        'Aktiver Våre reiser',
        'Activate Our trips',
        'Aktiver Vores rejser',
        'Aktivera Våra resor',
        'Aktivoi Matkamme',
        'Aktywuj Nasze podróże',
        'Activar Nuestros viajes',
        'Activer Nos voyages',
        'Unsere Reisen aktivieren'
      ),
      benefits: [
        L(
          'Planlegg reisen sammen',
          'Plan the trip together',
          'Planlæg rejsen sammen',
          'Planera resan tillsammans',
          'Suunnitelkaa matka yhdessä',
          'Planujcie podróż razem',
          'Planificad el viaje juntos',
          'Planifiez le voyage ensemble',
          'Plant die Reise gemeinsam'
        ),
        L(
          'Hold billetter og informasjon samlet',
          'Keep tickets and information together',
          'Hold billetter og information samlet',
          'Håll biljetter och information samlade',
          'Pidä liput ja tiedot yhdessä',
          'Trzymaj bilety i informacje razem',
          'Mantén billetes e información juntos',
          'Garde billets et infos réunis',
          'Halte Tickets und Infos zusammen'
        ),
        L(
          'Bevar bilder og opplevelser etterpå',
          'Preserve photos and experiences afterwards',
          'Bevar billeder og oplevelser bagefter',
          'Bevara bilder och upplevelser efteråt',
          'Säilytä kuvat ja kokemukset jälkeenpäin',
          'Zachowaj zdjęcia i wrażenia później',
          'Conserva fotos y experiencias después',
          'Préserve photos et expériences après coup',
          'Bewahre Fotos und Erlebnisse danach'
        ),
      ],
    },

    reiseplanlegger: {
      name: L('Reiseplanlegger', 'Trip planner', 'Rejseplanlægger', 'Reseplanerare', 'Matkasuunnittelija', 'Planer podróży', 'Planificador de viajes', 'Planificateur de voyage', 'Reiseplaner'),
      eyebrow: L(
        'Rute. Reisefølge. Øyeblikk.',
        'Route. Companions. Moments.',
        'Rute. Rejsefølge. Øjeblikke.',
        'Rutt. Resesällskap. Ögonblick.',
        'Reitti. Matkaseura. Hetket.',
        'Trasa. Towarzysze. Chwile.',
        'Ruta. Compañeros. Momentos.',
        'Itinéraire. Compagnons. Instants.',
        'Route. Reisegruppe. Momente.'
      ),
      headline: L(
        'Ferien, tegnet som en reise',
        'The holiday, drawn as a journey',
        'Ferie, tegnet som en rejse',
        'Semestern, ritad som en resa',
        'Loma piirrettynä matkaksi',
        'Wakacje narysowane jako podróż',
        'Las vacaciones, dibujadas como un viaje',
        'Les vacances, tracées comme un voyage',
        'Der Urlaub, gezeichnet als Reise'
      ),
      pitch: L(
        'Planlegg A→B→C med kart, billetter, aktiviteter og minner. Når dagen kommer, skyves det passererte ned — mens det neste lyser frem.',
        'Plan A→B→C with maps, tickets, activities and memories. When the day arrives, what’s past slides down — while what’s next lights up.',
        'Planlæg A→B→C med kort, billetter, aktiviteter og minder. Når dagen kommer, skubbes det passerede ned — mens det næste lyser frem.',
        'Planera A→B→C med karta, biljetter, aktiviteter och minnen. När dagen kommer skjuts det passerade ner — medan det nästa lyser fram.',
        'Suunnittele A→B→C kartalla, lipuilla, aktiviteeteilla ja muistoilla. Kun päivä koittaa, mennyt siirtyy alas — seuraava syttyy esiin.',
        'Zaplanuj A→B→C z mapą, biletami, aktywnościami i wspomnieniami. Gdy nadejdzie dzień, minione zsuwa się w dół — a następne się rozświetla.',
        'Planifica A→B→C con mapa, billetes, actividades y recuerdos. Cuando llega el día, lo pasado baja — y lo siguiente se ilumina.',
        'Planifie A→B→C avec carte, billets, activités et souvenirs. Quand le jour arrive, le passé glisse vers le bas — tandis que la suite s’allume.',
        'Plane A→B→C mit Karte, Tickets, Aktivitäten und Erinnerungen. Wenn der Tag kommt, rutscht Vergangenes nach unten — während das Nächste aufleuchtet.'
      ),
      activationLabel: L(
        'Aktiver Reiseplanlegger',
        'Activate Trip planner',
        'Aktiver Rejseplanlægger',
        'Aktivera Reseplanerare',
        'Aktivoi Matkasuunnittelija',
        'Aktywuj Planer podróży',
        'Activar Planificador de viajes',
        'Activer Planificateur de voyage',
        'Reiseplaner aktivieren'
      ),
      benefits: [
        L(
          'Bygg ruten mellom destinasjoner på kartet',
          'Build the route between destinations on the map',
          'Byg ruten mellem destinationer på kortet',
          'Bygg rutten mellan destinationer på kartan',
          'Rakenna reitti kohteiden välillä kartalla',
          'Zbuduj trasę między destynacjami na mapie',
          'Construye la ruta entre destinos en el mapa',
          'Construis l’itinéraire entre destinations sur la carte',
          'Baue die Route zwischen Zielen auf der Karte'
        ),
        L(
          'Inviter reisefølge som planlegger eller leser',
          'Invite travel companions as planners or readers',
          'Invitér rejsefølge som planlægger eller læser',
          'Bjud in resesällskap som planerare eller läsare',
          'Kutsu matkaseuraa suunnittelijoiksi tai lukijoiksi',
          'Zaproś towarzyszy jako planujących lub czytelników',
          'Invita a compañeros como planificadores o lectores',
          'Invite des compagnons en planificateurs ou lecteurs',
          'Lade Mitreisende als Planer oder Leser ein'
        ),
        L(
          'Sjekk inn, lagre minner og følg tidslinjen underveis',
          'Check in, save memories and follow the timeline along the way',
          'Check ind, gem minder og følg tidslinjen undervejs',
          'Checka in, spara minnen och följ tidslinjen längs vägen',
          'Kirjaudu sisään, tallenna muistoja ja seuraa aikajanaa matkan varrella',
          'Zamelduj się, zapisuj wspomnienia i śledź oś czasu po drodze',
          'Haz check-in, guarda recuerdos y sigue la línea de tiempo',
          'Checke-in, enregistre des souvenirs et suis la frise en route',
          'Checke ein, speichere Erinnerungen und folge der Zeitleiste unterwegs'
        ),
      ],
    },

    wishes: {
      name: L('Gaveønsker', 'Gift wishes', 'Gaveønsker', 'Presentönskemål', 'Lahjatoiveet', 'Życzenia prezentów', 'Deseos de regalo', 'Envies de cadeaux', 'Wunschzettel'),
      eyebrow: L(
        'Ønsker. Deling. Oversikt.',
        'Wishes. Sharing. Overview.',
        'Ønsker. Deling. Oversigt.',
        'Önskemål. Delning. Översikt.',
        'Toiveet. Jakaminen. Yhteenveto.',
        'Życzenia. Udostępnianie. Przegląd.',
        'Deseos. Compartir. Vista.',
        'Envies. Partage. Vue d’ensemble.',
        'Wünsche. Teilen. Überblick.'
      ),
      headline: L(
        'Gaver som faktisk treffer',
        'Gifts that actually hit the mark',
        'Gaver, der faktisk rammer',
        'Presenter som faktiskt träffar',
        'Lahjat, jotka osuvat oikeasti',
        'Prezenty, które naprawdę trafiają',
        'Regalos que realmente aciertan',
        'Des cadeaux qui font vraiment mouche',
        'Geschenke, die wirklich treffen'
      ),
      pitch: L(
        'Lag egne ønskelister, en felles familieliste og oversiktlige lister for barna.',
        'Create personal wish lists, a shared family list and clear lists for the kids.',
        'Lav egne ønskelister, en fælles familieliste og overskuelige lister til børnene.',
        'Skapa egna önskelistor, en gemensam familjelista och överskådliga listor för barnen.',
        'Luo omat toivelistat, yhteinen perhelista ja selkeät listat lapsille.',
        'Twórz własne listy życzeń, wspólną listę rodzinną i przejrzyste listy dla dzieci.',
        'Crea listas propias, una lista familiar compartida y listas claras para los niños.',
        'Crée des listes perso, une liste familiale partagée et des listes claires pour les enfants.',
        'Erstelle eigene Wunschlisten, eine gemeinsame Familienliste und klare Listen für die Kinder.'
      ),
      activationLabel: L(
        'Aktiver Gaveønsker',
        'Activate Gift wishes',
        'Aktiver Gaveønsker',
        'Aktivera Presentönskemål',
        'Aktivoi Lahjatoiveet',
        'Aktywuj Życzenia prezentów',
        'Activar Deseos de regalo',
        'Activer Envies de cadeaux',
        'Wunschzettel aktivieren'
      ),
      benefits: [
        L(
          'Samle ideer når de dukker opp',
          'Collect ideas as they come up',
          'Saml idéer, når de dukker op',
          'Samla idéer när de dyker upp',
          'Kerää ideat kun ne ilmaantuvat',
          'Zbieraj pomysły, gdy się pojawiają',
          'Reúne ideas cuando surgen',
          'Rassemble les idées dès qu’elles apparaissent',
          'Sammle Ideen, sobald sie auftauchen'
        ),
        L(
          'Del riktig liste med riktig person',
          'Share the right list with the right person',
          'Del den rigtige liste med den rigtige person',
          'Dela rätt lista med rätt person',
          'Jaa oikea lista oikealle henkilölle',
          'Udostępnij właściwą listę właściwej osobie',
          'Comparte la lista correcta con la persona correcta',
          'Partage la bonne liste avec la bonne personne',
          'Teile die richtige Liste mit der richtigen Person'
        ),
        L(
          'Unngå dobbeltkjøp med anonym reservasjon',
          'Avoid double buying with anonymous reservation',
          'Undgå dobbeltkøb med anonym reservation',
          'Undvik dubbelköp med anonym reservation',
          'Vältä tuplaostokset anonyymillä varauksella',
          'Unikaj podwójnych zakupów dzięki anonimowej rezerwacji',
          'Evita compras duplicadas con reserva anónima',
          'Évite les doubles achats avec une réservation anonyme',
          'Vermeide Doppelkäufe mit anonymer Reservierung'
        ),
      ],
    },

    location: {
      name: L('Familieposisjon', 'Family location', 'Familieposition', 'Familjeposition', 'Perhesijainti', 'Lokalizacja rodziny', 'Ubicación familiar', 'Position familiale', 'Familienstandort'),
      eyebrow: L(
        'Nærhet. Trygghet. Frivillig.',
        'Closeness. Safety. Optional.',
        'Nærhed. Tryghed. Frivillig.',
        'Närhet. Trygghet. Frivilligt.',
        'Läheisyys. Turvallisuus. Vapaaehtoinen.',
        'Bliskość. Bezpieczeństwo. Dobrowolne.',
        'Cercanía. Seguridad. Voluntario.',
        'Proximité. Sécurité. Volontaire.',
        'Nähe. Sicherheit. Freiwillig.'
      ),
      headline: L(
        'Se at familien er fremme',
        'See that the family has arrived',
        'Se, at familien er fremme',
        'Se att familjen är framme',
        'Näe, että perhe on perillä',
        'Zobacz, że rodzina dotarła',
        'Ve que la familia ha llegado',
        'Vois que la famille est arrivée',
        'Sieh, dass die Familie angekommen ist'
      ),
      pitch: L(
        'Frivillig posisjonsdeling gjør det enklere å koordinere henting, aktiviteter og hjemkomst.',
        'Optional location sharing makes it easier to coordinate pickups, activities and getting home.',
        'Frivillig positionsdeling gør det nemmere at koordinere afhentning, aktiviteter og hjemkomst.',
        'Frivillig positionsdelning gör det enklare att koordinera hämtning, aktiviteter och hemkomst.',
        'Vapaaehtoinen sijainnin jakaminen helpottaa hakujen, aktiviteettien ja kotiinpaluun koordinointia.',
        'Dobrowolne udostępnianie lokalizacji ułatwia koordynację odbiorów, aktywności i powrotu do domu.',
        'La ubicación voluntaria facilita coordinar recogidas, actividades y la vuelta a casa.',
        'Le partage volontaire de position facilite les récupérations, activités et retours à la maison.',
        'Freiwilliges Teilen des Standorts erleichtert Abholen, Aktivitäten und Heimkehr.'
      ),
      activationLabel: L(
        'Aktiver Familieposisjon',
        'Activate Family location',
        'Aktiver Familieposition',
        'Aktivera Familjeposition',
        'Aktivoi Perhesijainti',
        'Aktywuj Lokalizację rodziny',
        'Activar Ubicación familiar',
        'Activer Position familiale',
        'Familienstandort aktivieren'
      ),
      benefits: [
        L(
          'Hver person velger om posisjon deles',
          'Each person chooses whether to share location',
          'Hver person vælger, om position deles',
          'Varje person väljer om position delas',
          'Jokainen valitsee, jaetaanko sijainti',
          'Każda osoba decyduje, czy udostępnia lokalizację',
          'Cada persona elige si comparte la ubicación',
          'Chacun choisit de partager ou non sa position',
          'Jede Person entscheidet, ob der Standort geteilt wird'
        ),
        L(
          'Del midlertidig når det faktisk trengs',
          'Share temporarily when it’s actually needed',
          'Del midlertidigt, når det faktisk behøves',
          'Dela tillfälligt när det verkligen behövs',
          'Jaa tilapäisesti kun sitä todella tarvitaan',
          'Udostępniaj tymczasowo, gdy naprawdę trzeba',
          'Comparte temporalmente cuando realmente haga falta',
          'Partage temporairement quand c’est vraiment nécessaire',
          'Teile vorübergehend, wenn es wirklich nötig ist'
        ),
        L(
          'Få beskjed ved avtalte ankomster',
          'Get notified at agreed arrivals',
          'Få besked ved aftalte ankomster',
          'Få meddelande vid avtalade ankomster',
          'Saa ilmoitus sovituista saapumisista',
          'Otrzymuj powiadomienia o umówionych przyjazdach',
          'Recibe avisos en llegadas acordadas',
          'Reçois une alerte aux arrivées convenues',
          'Erhalte eine Nachricht bei vereinbarten Ankünften'
        ),
      ],
    },

    rememberDates: {
      name: L('Husk dato', 'Remember dates', 'Husk dato', 'Kom ihåg datum', 'Muista päivämäärä', 'Pamiętaj daty', 'Recordar fechas', 'Dates à retenir', 'Daten merken'),
      eyebrow: L(
        'Bursdag. Merkedag. Nedtelling.',
        'Birthday. Milestone. Countdown.',
        'Fødselsdag. Mærkedag. Nedtælling.',
        'Födelsedag. Märkesdag. Nedräkning.',
        'Syntymäpäivä. Merkkipäivä. Lähtölaskenta.',
        'Urodziny. Rocznica. Odliczanie.',
        'Cumpleaños. Fecha señalada. Cuenta atrás.',
        'Anniversaire. Date clé. Compte à rebours.',
        'Geburtstag. Gedenktag. Countdown.'
      ),
      headline: L(
        'Aldri glem det som betyr noe',
        'Never forget what matters',
        'Glem aldrig det, der betyder noget',
        'Glöm aldrig det som betyder något',
        'Älä koskaan unohda tärkeätä',
        'Nigdy nie zapomnij tego, co ważne',
        'Nunca olvides lo que importa',
        'N’oublie jamais ce qui compte',
        'Vergiss nie, was wichtig ist'
      ),
      pitch: L(
        'Samle bursdager, merkedager og egne nedtellinger, så familien kan glede seg i forkant.',
        'Gather birthdays, milestones and your own countdowns so the family can look forward in advance.',
        'Saml fødselsdage, mærkedage og egne nedtællinger, så familien kan glæde sig i forvejen.',
        'Samla födelsedagar, märkesdagar och egna nedräkningar så familjen kan glädjas i förväg.',
        'Kerää syntymäpäivät, merkkipäivät ja omat lähtölaskennat, jotta perhe voi odottaa etukäteen.',
        'Zbieraj urodziny, rocznice i własne odliczania, by rodzina mogła cieszyć się z wyprzedzeniem.',
        'Reúne cumpleaños, fechas señaladas y cuentas atrás propias para que la familia se ilusione antes.',
        'Rassemble anniversaires, dates clés et comptes à rebours perso pour que la famille se réjouisse à l’avance.',
        'Sammle Geburtstage, Gedenktage und eigene Countdowns, damit sich die Familie im Voraus freuen kann.'
      ),
      activationLabel: L(
        'Aktiver Husk dato',
        'Activate Remember dates',
        'Aktiver Husk dato',
        'Aktivera Kom ihåg datum',
        'Aktivoi Muista päivämäärä',
        'Aktywuj Pamiętaj daty',
        'Activar Recordar fechas',
        'Activer Dates à retenir',
        'Daten merken aktivieren'
      ),
      benefits: [
        L(
          'Se hvem som har bursdag snart',
          'See whose birthday is coming soon',
          'Se, hvem der har fødselsdag snart',
          'Se vem som har födelsedag snart',
          'Näe, kenellä on pian syntymäpäivä',
          'Zobacz, kto ma wkrótce urodziny',
          'Ve quién cumple años pronto',
          'Vois qui a bientôt un anniversaire',
          'Sieh, wer bald Geburtstag hat'
        ),
        L(
          'Gjenta viktige datoer automatisk',
          'Repeat important dates automatically',
          'Gentag vigtige datoer automatisk',
          'Upprepa viktiga datum automatiskt',
          'Toista tärkeät päivämäärät automaattisesti',
          'Powtarzaj ważne daty automatycznie',
          'Repite fechas importantes automáticamente',
          'Répète les dates importantes automatiquement',
          'Wiederhole wichtige Daten automatisch'
        ),
        L(
          'Lag nedtelling til ferie og store dager',
          'Create countdowns to holidays and big days',
          'Lav nedtælling til ferie og store dage',
          'Skapa nedräkning till semester och stora dagar',
          'Luo lähtölaskenta lomaan ja suuriin päiviin',
          'Twórz odliczanie do wakacji i ważnych dni',
          'Crea cuentas atrás a vacaciones y días grandes',
          'Crée des comptes à rebours vers vacances et grands jours',
          'Erstelle Countdowns zu Ferien und großen Tagen'
        ),
      ],
    },

    activities: {
      name: L('Aktiviteter', 'Activities', 'Aktiviteter', 'Aktiviteter', 'Aktiviteetit', 'Aktywności', 'Actividades', 'Activités', 'Aktivitäten'),
      eyebrow: L(
        'Bevegelse. Plan. Fremgang.',
        'Movement. Plan. Progress.',
        'Bevægelse. Plan. Fremgang.',
        'Rörelse. Plan. Framsteg.',
        'Liike. Suunnitelma. Edistyminen.',
        'Ruch. Plan. Postęp.',
        'Movimiento. Plan. Avance.',
        'Mouvement. Plan. Progrès.',
        'Bewegung. Plan. Fortschritt.'
      ),
      headline: L(
        'Gjør aktivitet lettere å følge',
        'Make activity easier to follow',
        'Gør aktivitet lettere at følge',
        'Gör aktivitet lättare att följa',
        'Tee aktiivisuudesta helpompi seurata',
        'Ułatwij śledzenie aktywności',
        'Haz más fácil seguir la actividad',
        'Rends l’activité plus facile à suivre',
        'Mach Aktivität leichter zu verfolgen'
      ),
      pitch: L(
        'Planlegg trening og turer for hele familien, med økter som passer nivå og hverdag.',
        'Plan training and outings for the whole family, with sessions that fit level and everyday life.',
        'Planlæg træning og ture for hele familien, med sessioner der passer til niveau og hverdag.',
        'Planera träning och utflykter för hela familjen, med pass som passar nivå och vardag.',
        'Suunnittele treeniä ja retkiä koko perheelle tasoon ja arkeen sopivilla sessioilla.',
        'Planuj treningi i wycieczki dla całej rodziny, z sesjami dopasowanymi do poziomu i codzienności.',
        'Planifica entrenamiento y salidas para toda la familia, con sesiones que encajan en nivel y día a día.',
        'Planifie entraînements et sorties pour toute la famille, avec des séances adaptées au niveau et au quotidien.',
        'Plane Training und Ausflüge für die ganze Familie – mit Einheiten, die zu Niveau und Alltag passen.'
      ),
      activationLabel: L(
        'Aktiver Aktiviteter',
        'Activate Activities',
        'Aktiver Aktiviteter',
        'Aktivera Aktiviteter',
        'Aktivoi Aktiviteetit',
        'Aktywuj Aktywności',
        'Activar Actividades',
        'Activer Activités',
        'Aktivitäten aktivieren'
      ),
      benefits: [
        L(
          'Velg aktivitet og få et enkelt opplegg',
          'Choose an activity and get a simple plan',
          'Vælg aktivitet og få et enkelt oplæg',
          'Välj aktivitet och få ett enkelt upplägg',
          'Valitse aktiviteetti ja saat yksinkertaisen ohjelman',
          'Wybierz aktywność i otrzymaj prosty plan',
          'Elige actividad y obtén un plan sencillo',
          'Choisis une activité et obtiens un plan simple',
          'Wähle eine Aktivität und erhalte ein einfaches Programm'
        ),
        L(
          'Følg tid, distanse og fremgang',
          'Track time, distance and progress',
          'Følg tid, distance og fremskridt',
          'Följ tid, distans och framsteg',
          'Seuraa aikaa, matkaa ja edistymistä',
          'Śledź czas, dystans i postęp',
          'Sigue tiempo, distancia y avance',
          'Suis temps, distance et progrès',
          'Verfolge Zeit, Distanz und Fortschritt'
        ),
        L(
          'Koble Strava hvis du ønsker det',
          'Connect Strava if you want',
          'Tilslut Strava, hvis du ønsker det',
          'Koppla Strava om du vill',
          'Yhdistä Strava halutessasi',
          'Połącz Stravę, jeśli chcesz',
          'Conecta Strava si quieres',
          'Connecte Strava si tu veux',
          'Verbinde Strava, wenn du möchtest'
        ),
      ],
    },

    books: {
      name: L('Bokhylla', 'Bookshelf', 'Bogreol', 'Bokhylla', 'Kirjahylly', 'Półka z książkami', 'Estantería', 'Bibliothèque', 'Bücherregal'),
      eyebrow: L(
        'Sider. Historier. Leselyst.',
        'Pages. Stories. Reading joy.',
        'Sider. Historier. Læselyst.',
        'Sidor. Historier. Läslust.',
        'Sivut. Tarinat. Lukuinto.',
        'Strony. Historie. Chęć czytania.',
        'Páginas. Historias. Ganas de leer.',
        'Pages. Histoires. Envies de lire.',
        'Seiten. Geschichten. Leselust.'
      ),
      headline: L(
        'Gjør lesingen synlig',
        'Make reading visible',
        'Gør læsningen synlig',
        'Gör läsningen synlig',
        'Tee lukeminen näkyväksi',
        'Uczyń czytanie widocznym',
        'Haz visible la lectura',
        'Rends la lecture visible',
        'Mach das Lesen sichtbar'
      ),
      pitch: L(
        'Lag en bokhylle for hvert familiemedlem og følg lesingen side for side.',
        'Create a bookshelf for each family member and follow reading page by page.',
        'Lav en bogreol til hvert familiemedlem, og følg læsningen side for side.',
        'Skapa en bokhylla för varje familjemedlem och följ läsningen sida för sida.',
        'Luo kirjahylly jokaiselle perheenjäsenelle ja seuraa lukemista sivu sivulta.',
        'Stwórz półkę dla każdego członka rodziny i śledź czytanie strona po stronie.',
        'Crea una estantería para cada miembro y sigue la lectura página a página.',
        'Crée une bibliothèque pour chaque membre et suis la lecture page par page.',
        'Lege ein Bücherregal für jedes Familienmitglied an und verfolge das Lesen Seite für Seite.'
      ),
      activationLabel: L(
        'Aktiver Bokhylla',
        'Activate Bookshelf',
        'Aktiver Bogreol',
        'Aktivera Bokhylla',
        'Aktivoi Kirjahylly',
        'Aktywuj Półkę z książkami',
        'Activar Estantería',
        'Activer Bibliothèque',
        'Bücherregal aktivieren'
      ),
      benefits: [
        L(
          'Hver person får sin egen bokhylle',
          'Each person gets their own bookshelf',
          'Hver person får sin egen bogreol',
          'Varje person får sin egen bokhylla',
          'Jokainen saa oman kirjahyllyn',
          'Każda osoba ma własną półkę',
          'Cada persona tiene su propia estantería',
          'Chacun a sa propre bibliothèque',
          'Jede Person bekommt ein eigenes Bücherregal'
        ),
        L(
          'Logg sider og se fremgang',
          'Log pages and see progress',
          'Log sider og se fremskridt',
          'Logga sidor och se framsteg',
          'Kirjaa sivut ja näe edistyminen',
          'Zapisuj strony i zobacz postęp',
          'Registra páginas y ve el avance',
          'Enregistre les pages et vois les progrès',
          'Protokolliere Seiten und sieh den Fortschritt'
        ),
        L(
          'Gi terningkast når boka er ferdig',
          'Give a dice rating when the book is done',
          'Giv terningkast, når bogen er færdig',
          'Ge tärningskast när boken är klar',
          'Anna noppa-arvio kun kirja on valmis',
          'Daj ocenę kostką, gdy książka jest skończona',
          'Da una nota de dados cuando el libro esté terminado',
          'Donne une note en dés quand le livre est fini',
          'Vergib einen Würfelwurf, wenn das Buch fertig ist'
        ),
      ],
    },

    games: {
      name: L('FamilieSpill', 'Family Games', 'FamilieSpil', 'FamiljeSpel', 'PerhePelit', 'Gry rodzinne', 'Juegos familiares', 'Jeux familiaux', 'Familienspiele'),
      eyebrow: L(
        'Spill. Sammen. Nå.',
        'Play. Together. Now.',
        'Spil. Sammen. Nu.',
        'Spela. Tillsammans. Nu.',
        'Pelaa. Yhdessä. Nyt.',
        'Graj. Razem. Teraz.',
        'Jugar. Juntos. Ahora.',
        'Jouer. Ensemble. Maintenant.',
        'Spielen. Zusammen. Jetzt.'
      ),
      headline: L(
        'Fem minutter som samler familien',
        'Five minutes that bring the family together',
        'Fem minutter, der samler familien',
        'Fem minuter som samlar familjen',
        'Viisi minuuttia, jotka kokoavat perheen',
        'Pięć minut, które łączą rodzinę',
        'Cinco minutos que reúnen a la familia',
        'Cinq minutes qui rassemblent la famille',
        'Fünf Minuten, die die Familie zusammenbringen'
      ),
      pitch: L(
        'Start en rask quiz, et brettspill eller kortspill – sammen på samme skjerm eller i sanntid.',
        'Start a quick quiz, a board game or card game – together on the same screen or in real time.',
        'Start en hurtig quiz, et brætspil eller kortspil – sammen på samme skærm eller i realtid.',
        'Starta en snabb quiz, ett brädspel eller kortspel – tillsammans på samma skärm eller i realtid.',
        'Aloita nopea tietovisa, lautapeli tai korttipeli – yhdessä samalla näytöllä tai reaaliajassa.',
        'Uruchom szybki quiz, grę planszową lub karcianą – razem na tym samym ekranie lub na żywo.',
        'Empieza un quiz rápido, un juego de mesa o de cartas – juntos en la misma pantalla o en tiempo real.',
        'Lance un quiz rapide, un jeu de plateau ou de cartes – ensemble sur le même écran ou en temps réel.',
        'Starte ein schnelles Quiz, Brett- oder Kartenspiel – gemeinsam auf demselben Bildschirm oder in Echtzeit.'
      ),
      activationLabel: L(
        'Aktiver FamilieSpill',
        'Activate Family Games',
        'Aktiver FamilieSpil',
        'Aktivera FamiljeSpel',
        'Aktivoi PerhePelit',
        'Aktywuj Gry rodzinne',
        'Activar Juegos familiares',
        'Activer Jeux familiaux',
        'Familienspiele aktivieren'
      ),
      benefits: [
        L(
          'Velg mellom raske familiespill',
          'Choose from quick family games',
          'Vælg mellem hurtige familiespil',
          'Välj bland snabba familjespel',
          'Valitse nopeista perhepeleistä',
          'Wybieraj spośród szybkich gier rodzinnych',
          'Elige entre juegos familiares rápidos',
          'Choisis parmi des jeux familiaux rapides',
          'Wähle aus schnellen Familienspielen'
        ),
        L(
          'Inviter familien før start',
          'Invite the family before starting',
          'Invitér familien før start',
          'Bjud in familjen innan start',
          'Kutsu perhe ennen aloitusta',
          'Zaproś rodzinę przed startem',
          'Invita a la familia antes de empezar',
          'Invite la famille avant de commencer',
          'Lade die Familie vor dem Start ein'
        ),
        L(
          'Spill sammen uten komplisert oppsett',
          'Play together without complicated setup',
          'Spil sammen uden kompliceret opsætning',
          'Spela tillsammans utan krånglig uppsättning',
          'Pelaa yhdessä ilman monimutkaista asetusta',
          'Grajcie razem bez skomplikowanej konfiguracji',
          'Jugad juntos sin una configuración complicada',
          'Jouez ensemble sans configuration compliquée',
          'Spielt zusammen ohne kompliziertes Setup'
        ),
      ],
    },

    progress: {
      name: L('Barnas progresjon', 'Kids’ progress', 'Børnenes progression', 'Barnens progression', 'Lasten edistyminen', 'Postępy dzieci', 'Progreso de los niños', 'Progression des enfants', 'Fortschritt der Kinder'),
      eyebrow: L(
        'Innsats. Uke for uke.',
        'Effort. Week by week.',
        'Indsats. Uge for uge.',
        'Insats. Vecka för vecka.',
        'Panostus. Viikko viikolta.',
        'Wysiłek. Tydzień po tygodniu.',
        'Esfuerzo. Semana a semana.',
        'Effort. Semaine après semaine.',
        'Einsatz. Woche für Woche.'
      ),
      headline: L(
        'Se hva barna faktisk får til',
        'See what the kids actually achieve',
        'Se, hvad børnene faktisk får til',
        'Se vad barnen faktiskt klarar',
        'Näe, mitä lapset oikeasti saavat aikaan',
        'Zobacz, co dzieci naprawdę osiągają',
        'Ve lo que los niños realmente consiguen',
        'Vois ce que les enfants réussissent vraiment',
        'Sieh, was die Kinder wirklich schaffen'
      ),
      pitch: L(
        'Få en rolig foreldreoversikt over gjøremål, oppgaver, fremgang og ukepenger.',
        'Get a calm parent overview of chores, tasks, progress and pocket money.',
        'Få en rolig forældreoversigt over gøremål, opgaver, fremskridt og lommepenge.',
        'Få en lugn föräldraöversikt över sysslor, uppgifter, framsteg och veckopeng.',
        'Saa rauhallinen vanhempien yhteenveto askareista, tehtävistä, edistymisestä ja viikkorahasta.',
        'Zyskaj spokojny przegląd rodzica: obowiązki, zadania, postępy i kieszonkowe.',
        'Obtén una vista tranquila de padres sobre quehaceres, tareas, avance y paga.',
        'Obtiens une vue calme pour parents sur corvées, tâches, progrès et argent de poche.',
        'Erhalte einen ruhigen Eltern-Überblick über Hausarbeiten, Aufgaben, Fortschritt und Taschengeld.'
      ),
      activationLabel: L(
        'Aktiver Barnas progresjon',
        'Activate Kids’ progress',
        'Aktiver Børnenes progression',
        'Aktivera Barnens progression',
        'Aktivoi Lasten edistyminen',
        'Aktywuj Postępy dzieci',
        'Activar Progreso de los niños',
        'Activer Progression des enfants',
        'Fortschritt der Kinder aktivieren'
      ),
      benefits: [
        L(
          'Se hvert barns egen utvikling',
          'See each child’s own development',
          'Se hvert barns egen udvikling',
          'Se varje barns egen utveckling',
          'Näe kunkin lapsen oma kehitys',
          'Zobacz rozwój każdego dziecka osobno',
          'Ve el desarrollo propio de cada niño',
          'Vois le développement de chaque enfant',
          'Sieh die eigene Entwicklung jedes Kindes'
        ),
        L(
          'Følg uken uten å bytte profil',
          'Follow the week without switching profiles',
          'Følg ugen uden at skifte profil',
          'Följ veckan utan att byta profil',
          'Seuraa viikkoa vaihtamatta profiilia',
          'Śledź tydzień bez zmiany profilu',
          'Sigue la semana sin cambiar de perfil',
          'Suis la semaine sans changer de profil',
          'Verfolge die Woche ohne Profilwechsel'
        ),
        L(
          'Fremhev innsats fremfor sammenligning',
          'Highlight effort over comparison',
          'Fremhæv indsats frem for sammenligning',
          'Framhäv insats framför jämförelse',
          'Korosta panostusta vertailun sijaan',
          'Podkreślaj wysiłek zamiast porównań',
          'Destaca el esfuerzo frente a la comparación',
          'Mets l’effort en avant plutôt que la comparaison',
          'Heb Einsatz hervor statt Vergleich'
        ),
      ],
    },

    skole: {
      name: L('Skole', 'School', 'Skole', 'Skola', 'Koulu', 'Szkoła', 'Colegio', 'École', 'Schule'),
      eyebrow: L(
        'Skole. Lekser. Ukeplan.',
        'School. Homework. Week plan.',
        'Skole. Lektier. Ugeplan.',
        'Skola. Läxor. Veckoplan.',
        'Koulu. Läksyt. Viikkosuunnitelma.',
        'Szkoła. Zadania. Plan tygodnia.',
        'Colegio. Deberes. Plan semanal.',
        'École. Devoirs. Planning.',
        'Schule. Hausaufgaben. Wochenplan.'
      ),
      headline: L(
        'Skolehverdagen, gjort enklere',
        'School life, made simpler',
        'Skolehverdagen, gjort enklere',
        'Skolvardagen, gjord enklare',
        'Kouluarki tehty helpommaksi',
        'Szkolna codzienność, uproszczona',
        'El día a día escolar, más sencillo',
        'Le quotidien scolaire, simplifié',
        'Der Schulalltag, einfacher gemacht'
      ),
      pitch: L(
        'Én inngang til lekser, stegvis leksehjelp og ukeplan – tilpasset barnet og familien.',
        'One entry point to homework, step-by-step help and the week plan – tailored to the child and family.',
        'Én indgang til lektier, trinvis lektiehjælp og ugeplan – tilpasset barnet og familien.',
        'En ingång till läxor, stegvis läxhjälp och veckoplan – anpassad till barnet och familjen.',
        'Yksi sisäänkäynti läksyihin, askelittaiseen läksyapuun ja viikkosuunnitelmaan – lapselle ja perheelle sopivaksi.',
        'Jedno wejście do zadań, pomocy krok po kroku i planu tygodnia – dopasowane do dziecka i rodziny.',
        'Una entrada a deberes, ayuda paso a paso y plan semanal – adaptada al niño y la familia.',
        'Une entrée vers devoirs, aide pas à pas et planning – adaptée à l’enfant et à la famille.',
        'Ein Einstieg zu Hausaufgaben, schrittweiser Hilfe und Wochenplan – passend zu Kind und Familie.'
      ),
      activationLabel: L(
        'Aktiver Skole',
        'Activate School',
        'Aktiver Skole',
        'Aktivera Skola',
        'Aktivoi Koulu',
        'Aktywuj Szkołę',
        'Activar Colegio',
        'Activer École',
        'Schule aktivieren'
      ),
      benefits: [
        L(
          'Samle alt som gjelder skolen',
          'Gather everything about school',
          'Saml alt, der gælder skolen',
          'Samla allt som gäller skolan',
          'Kerää kaikki kouluun liittyvä',
          'Zbierz wszystko, co dotyczy szkoły',
          'Reúne todo lo del colegio',
          'Rassemble tout ce qui concerne l’école',
          'Sammle alles, was die Schule betrifft'
        ),
        L(
          'Importer planer fra bilde eller PDF',
          'Import plans from a photo or PDF',
          'Importér planer fra billede eller PDF',
          'Importera planer från bild eller PDF',
          'Tuo suunnitelmia kuvasta tai PDF:stä',
          'Importuj plany ze zdjęcia lub PDF',
          'Importa planes desde foto o PDF',
          'Importe des plans depuis une photo ou un PDF',
          'Importiere Pläne aus Foto oder PDF'
        ),
        L(
          'Gi barnet oversikt uten informasjonsstøy',
          'Give the child overview without information noise',
          'Giv barnet overblik uden informationsstøj',
          'Ge barnet överblick utan informationsbrus',
          'Anna lapselle yhteenveto ilman tietotulvaa',
          'Daj dziecku przegląd bez szumu informacyjnego',
          'Da al niño una vista clara sin ruido de información',
          'Donne à l’enfant une vue claire sans bruit d’infos',
          'Gib dem Kind Überblick ohne Informationslärm'
        ),
      ],
    },

    lekser: {
      name: L('Lekser', 'Homework', 'Lektier', 'Läxor', 'Läksyt', 'Praca domowa', 'Deberes', 'Devoirs', 'Hausaufgaben'),
      eyebrow: L(
        'Fag. Frister. Fremgang.',
        'Subjects. Deadlines. Progress.',
        'Fag. Frister. Fremskridt.',
        'Ämnen. Deadlines. Framsteg.',
        'Aineet. Määräajat. Edistyminen.',
        'Przedmioty. Terminy. Postęp.',
        'Asignaturas. Plazos. Avance.',
        'Matières. Échéances. Progrès.',
        'Fächer. Fristen. Fortschritt.'
      ),
      headline: L(
        'Ukeleksene uten løse lapper',
        'The week’s homework without loose scraps',
        'Ugelektierne uden løse sedler',
        'Veckans läxor utan lösa lappar',
        'Viikon läksyt ilman irtolappuja',
        'Tygodniowe zadania bez luźnych karteczek',
        'Los deberes de la semana sin papeles sueltos',
        'Les devoirs de la semaine sans bouts de papier',
        'Die Wochenhausaufgaben ohne lose Zettel'
      ),
      pitch: L(
        'Last opp lekseplanen. ProTop leser fag og frister, og en foresatt godkjenner før det lagres.',
        'Upload the homework plan. ProTop reads subjects and deadlines, and a parent approves before it’s saved.',
        'Upload lektieplanen. ProTop læser fag og frister, og en voksen godkender, før det gemmes.',
        'Ladda upp läxplanen. ProTop läser ämnen och deadlines, och en vårdnadshavare godkänner innan det sparas.',
        'Lataa läksysuunnitelma. ProTop lukee aineet ja määräajat, ja huoltaja hyväksyy ennen tallennusta.',
        'Prześlij plan zadań. ProTop odczyta przedmioty i terminy, a opiekun zatwierdzi przed zapisaniem.',
        'Sube el plan de deberes. ProTop lee asignaturas y plazos, y un adulto aprueba antes de guardar.',
        'Téléverse le plan de devoirs. ProTop lit matières et échéances, et un parent valide avant l’enregistrement.',
        'Lade den Hausaufgabenplan hoch. ProTop liest Fächer und Fristen, und ein Erwachsener genehmigt vor dem Speichern.'
      ),
      activationLabel: L(
        'Aktiver Lekser',
        'Activate Homework',
        'Aktiver Lektier',
        'Aktivera Läxor',
        'Aktivoi Läksyt',
        'Aktywuj Pracę domową',
        'Activar Deberes',
        'Activer Devoirs',
        'Hausaufgaben aktivieren'
      ),
      benefits: [
        L(
          'Samle lekser fra alle fag',
          'Gather homework from all subjects',
          'Saml lektier fra alle fag',
          'Samla läxor från alla ämnen',
          'Kerää läksyt kaikista aineista',
          'Zbieraj zadania ze wszystkich przedmiotów',
          'Reúne deberes de todas las asignaturas',
          'Rassemble les devoirs de toutes les matières',
          'Sammle Hausaufgaben aus allen Fächern'
        ),
        L(
          'Kryss av etter hvert som de blir gjort',
          'Check them off as they get done',
          'Sæt kryds, efterhånden som de bliver gjort',
          'Bocka av efter hand som de blir klara',
          'Rastita sitä mukaa kun ne tulevat tehdyiksi',
          'Odhaczaj w miarę jak są zrobione',
          'Márcalas conforme se van haciendo',
          'Coche au fur et à mesure qu’elles sont faites',
          'Hake ab, sobald sie erledigt sind'
        ),
        L(
          'Se hva som haster og hva som kan vente',
          'See what is urgent and what can wait',
          'Se, hvad der haster, og hvad der kan vente',
          'Se vad som brådskar och vad som kan vänta',
          'Näe, mikä kiirehtii ja mikä voi odottaa',
          'Zobacz, co pilne, a co może poczekać',
          'Ve qué urge y qué puede esperar',
          'Vois ce qui presse et ce qui peut attendre',
          'Sieh, was eilt und was warten kann'
        ),
      ],
    },

    leksehjelp: {
      name: L('Leksehjelp', 'Homework help', 'Lektiehjælp', 'Läxhjälp', 'Läksyapu', 'Pomoc w zadaniach', 'Ayuda con deberes', 'Aide aux devoirs', 'Hausaufgabenhilfe'),
      eyebrow: L(
        'Blyanttavle. Hint. Mestring.',
        'Pencil board. Hints. Mastery.',
        'Blyanttavle. Tip. Mestring.',
        'Pennbräda. Tips. Behärskning.',
        'Kynätaulu. Vihjeet. Osaaminen.',
        'Tablica ołówkowa. Wskazówki. Opanowanie.',
        'Pizarra de lápiz. Pistas. Dominio.',
        'Tableau crayon. Indices. Maîtrise.',
        'Bleistift-Tafel. Hinweise. Können.'
      ),
      headline: L(
        'Tegn stegene – lær metoden',
        'Draw the steps – learn the method',
        'Tegn trinnene – lær metoden',
        'Rita stegen – lär dig metoden',
        'Piirrä askeleet – opi menetelmä',
        'Narysuj kroki – naucz się metody',
        'Dibuja los pasos – aprende el método',
        'Dessine les étapes – apprends la méthode',
        'Zeichne die Schritte – lerne die Methode'
      ),
      pitch: L(
        'Blyanttavle viser potenser og regnesteg. Barnet prøver selv; foresatte styrer om fasit finnes.',
        'The pencil board shows powers and calculation steps. The child tries alone; parents control whether the answer key is available.',
        'Blyanttavlen viser potenser og regnesteg. Barnet prøver selv; voksne styrer, om facit findes.',
        'Pennbrädan visar potenser och räknesteg. Barnet provar själv; vårdnadshavare styr om facit finns.',
        'Kynätaulu näyttää potenssit ja laskuvaiheet. Lapsi yrittää itse; huoltajat päättävät, onko vastaus näkyvissä.',
        'Tablica ołówkowa pokazuje potęgi i kroki obliczeń. Dziecko próbuje samo; opiekunowie decydują, czy jest klucz.',
        'La pizarra de lápiz muestra potencias y pasos de cálculo. El niño prueba solo; los adultos controlan si hay solución.',
        'Le tableau crayon montre puissances et étapes de calcul. L’enfant essaie seul ; les parents décident si le corrigé est disponible.',
        'Die Bleistift-Tafel zeigt Potenzen und Rechenschritte. Das Kind versucht selbst; Erwachsene steuern, ob die Lösung freigegeben ist.'
      ),
      activationLabel: L(
        'Aktiver Leksehjelp',
        'Activate Homework help',
        'Aktiver Lektiehjælp',
        'Aktivera Läxhjälp',
        'Aktivoi Läksyapu',
        'Aktywuj Pomoc w zadaniach',
        'Activar Ayuda con deberes',
        'Activer Aide aux devoirs',
        'Hausaufgabenhilfe aktivieren'
      ),
      benefits: [
        L(
          'Velg åpen lekse, fag eller bilde av oppgaven',
          'Choose open homework, a subject or a photo of the task',
          'Vælg åben lektie, fag eller billede af opgaven',
          'Välj öppen läxa, ämne eller bild på uppgiften',
          'Valitse avoin läksy, aine tai kuva tehtävästä',
          'Wybierz otwarte zadanie, przedmiot lub zdjęcie zadania',
          'Elige deber abierto, asignatura o foto de la tarea',
          'Choisis devoir libre, matière ou photo de l’exercice',
          'Wähle offene Aufgabe, Fach oder Foto der Aufgabe'
        ),
        L(
          'Se stegene tegnet ut – som 5² og 324 × 9',
          'See the steps drawn out – like 5² and 324 × 9',
          'Se trinnene tegnet ud – som 5² og 324 × 9',
          'Se stegen utritade – som 5² och 324 × 9',
          'Näe askeleet piirrettyinä – kuten 5² ja 324 × 9',
          'Zobacz narysowane kroki – jak 5² i 324 × 9',
          'Ve los pasos dibujados – como 5² y 324 × 9',
          'Vois les étapes dessinées – comme 5² et 324 × 9',
          'Sieh die Schritte gezeichnet – wie 5² und 324 × 9'
        ),
        L(
          'Ros for innsats; fasit låst til forsøk er gjort',
          'Praise for effort; answer key locked until an attempt is made',
          'Ros for indsats; facit låst, til forsøg er gjort',
          'Beröm för insats; facit låst tills försök är gjort',
          'Kehu panostuksesta; vastaus lukittu kunnes yritys on tehty',
          'Pochwała za wysiłek; klucz zablokowany do próby',
          'Elogio al esfuerzo; solución bloqueada hasta intentar',
          'Éloge de l’effort ; corrigé verrouillé tant qu’un essai n’est pas fait',
          'Lob für Einsatz; Lösung gesperrt, bis ein Versuch gemacht wurde'
        ),
      ],
    },

    'week-plan': {
      name: L('Ukeplan', 'Week plan', 'Ugeplan', 'Veckoplan', 'Viikkosuunnitelma', 'Plan tygodnia', 'Plan semanal', 'Planning hebdo', 'Wochenplan'),
      eyebrow: L(
        'Timer. Fag. Oversikt.',
        'Periods. Subjects. Overview.',
        'Timer. Fag. Oversigt.',
        'Timmar. Ämnen. Översikt.',
        'Tunnit. Aineet. Yhteenveto.',
        'Lekcje. Przedmioty. Przegląd.',
        'Horas. Asignaturas. Vista.',
        'Heures. Matières. Vue d’ensemble.',
        'Stunden. Fächer. Überblick.'
      ),
      headline: L(
        'Skoleuken på ett blikk',
        'The school week at a glance',
        'Skoleugen på ét blik',
        'Skolveckan i ett ögonkast',
        'Kouliviikko yhdellä silmäyksellä',
        'Tydzień szkolny na jeden rzut oka',
        'La semana escolar de un vistazo',
        'La semaine scolaire d’un coup d’œil',
        'Die Schulwoche auf einen Blick'
      ),
      pitch: L(
        'Last opp skolens ukeplan eller timeplan. ProTop leser innholdet, og en foresatt godkjenner.',
        'Upload the school’s week plan or timetable. ProTop reads the content, and a parent approves.',
        'Upload skolens ugeplan eller timeplan. ProTop læser indholdet, og en voksen godkender.',
        'Ladda upp skolans veckoplan eller schema. ProTop läser innehållet, och en vårdnadshavare godkänner.',
        'Lataa koulun viikkosuunnitelma tai lukujärjestys. ProTop lukee sisällön, ja huoltaja hyväksyy.',
        'Prześlij plan tygodnia lub plan lekcji szkoły. ProTop odczyta treść, a opiekun zatwierdzi.',
        'Sube el plan semanal o el horario del colegio. ProTop lee el contenido y un adulto aprueba.',
        'Téléverse le planning ou l’emploi du temps. ProTop lit le contenu, et un parent valide.',
        'Lade den Wochenplan oder Stundenplan der Schule hoch. ProTop liest den Inhalt, und ein Erwachsener genehmigt.'
      ),
      activationLabel: L(
        'Aktiver Ukeplan',
        'Activate Week plan',
        'Aktiver Ugeplan',
        'Aktivera Veckoplan',
        'Aktivoi Viikkosuunnitelma',
        'Aktywuj Plan tygodnia',
        'Activar Plan semanal',
        'Activer Planning hebdo',
        'Wochenplan aktivieren'
      ),
      benefits: [
        L(
          'Se fag og tider samlet',
          'See subjects and times together',
          'Se fag og tider samlet',
          'Se ämnen och tider samlade',
          'Näe aineet ja ajat yhdessä',
          'Zobacz przedmioty i godziny razem',
          'Ve asignaturas y horarios juntos',
          'Vois matières et horaires réunis',
          'Sieh Fächer und Zeiten zusammen'
        ),
        L(
          'Fang opp endringer i skoleuken',
          'Catch changes in the school week',
          'Fang ændringer i skoleugen',
          'Fånga ändringar i skolveckan',
          'Huomaa muutokset kouluviikossa',
          'Wychwytuj zmiany w tygodniu szkolnym',
          'Detecta cambios en la semana escolar',
          'Repère les changements dans la semaine scolaire',
          'Erfasse Änderungen in der Schulwoche'
        ),
        L(
          'Gi barnet en enkel plan for hver dag',
          'Give the child a simple plan for each day',
          'Giv barnet en enkel plan for hver dag',
          'Ge barnet en enkel plan för varje dag',
          'Anna lapselle yksinkertainen suunnitelma joka päivälle',
          'Daj dziecku prosty plan na każdy dzień',
          'Da al niño un plan sencillo para cada día',
          'Donne à l’enfant un plan simple pour chaque jour',
          'Gib dem Kind einen einfachen Plan für jeden Tag'
        ),
      ],
    },

    holdings: {
      name: L('Kjøretøy', 'Vehicles', 'Køretøj', 'Fordon', 'Ajoneuvot', 'Pojazdy', 'Vehículos', 'Véhicules', 'Fahrzeuge'),
      eyebrow: L(
        'Service. Frister. Kostnader.',
        'Service. Deadlines. Costs.',
        'Service. Frister. Omkostninger.',
        'Service. Deadlines. Kostnader.',
        'Huolto. Määräajat. Kustannukset.',
        'Serwis. Terminy. Koszty.',
        'Servicio. Plazos. Costes.',
        'Entretien. Échéances. Coûts.',
        'Service. Fristen. Kosten.'
      ),
      headline: L(
        'Bilhold uten løse lapper',
        'Car ownership without loose scraps',
        'Bilhold uden løse sedler',
        'Bilägande utan lösa lappar',
        'Autonpito ilman irtolappuja',
        'Utrzymanie auta bez luźnych karteczek',
        'Coche sin papeles sueltos',
        'Voiture sans bouts de papier',
        'Autohaltung ohne lose Zettel'
      ),
      pitch: L(
        'Samle EU-kontroll, forsikring, service, drivstoff og kilometerstand for familiens kjøretøy.',
        'Gather inspection, insurance, service, fuel and mileage for the family’s vehicles.',
        'Saml syn, forsikring, service, brændstof og kilometertal for familiens køretøjer.',
        'Samla besiktning, försäkring, service, bränsle och mätarställning för familjens fordon.',
        'Kerää katsastus, vakuutus, huolto, polttoaine ja mittarilukema perheen ajoneuvoille.',
        'Zbieraj przegląd, ubezpieczenie, serwis, paliwo i przebieg pojazdów rodziny.',
        'Reúne ITV, seguro, servicio, combustible y kilometraje de los vehículos de la familia.',
        'Rassemble contrôle technique, assurance, entretien, carburant et kilométrage des véhicules familiaux.',
        'Sammle TÜV, Versicherung, Service, Kraftstoff und Kilometerstand der Familienfahrzeuge.'
      ),
      activationLabel: L(
        'Aktiver Kjøretøy',
        'Activate Vehicles',
        'Aktiver Køretøj',
        'Aktivera Fordon',
        'Aktivoi Ajoneuvot',
        'Aktywuj Pojazdy',
        'Activar Vehículos',
        'Activer Véhicules',
        'Fahrzeuge aktivieren'
      ),
      benefits: [
        L(
          'Få oversikt over viktige frister',
          'Get an overview of important deadlines',
          'Få overblik over vigtige frister',
          'Få överblick över viktiga deadlines',
          'Saa yhteenveto tärkeistä määräajoista',
          'Zyskaj przegląd ważnych terminów',
          'Obtén una vista de plazos importantes',
          'Obtiens une vue des échéances importantes',
          'Erhalte Überblick über wichtige Fristen'
        ),
        L(
          'Samle historikk og dokumenter',
          'Collect history and documents',
          'Saml historik og dokumenter',
          'Samla historik och dokument',
          'Kerää historia ja asiakirjat',
          'Zbieraj historię i dokumenty',
          'Reúne historial y documentos',
          'Rassemble historique et documents',
          'Sammle Historie und Dokumente'
        ),
        L(
          'Håndter flere biler og andre kjøretøy',
          'Manage several cars and other vehicles',
          'Håndter flere biler og andre køretøjer',
          'Hantera flera bilar och andra fordon',
          'Hallitse useita autoja ja muita ajoneuvoja',
          'Obsługuj kilka aut i inne pojazdy',
          'Gestiona varios coches y otros vehículos',
          'Gère plusieurs voitures et d’autres véhicules',
          'Verwalte mehrere Autos und andere Fahrzeuge'
        ),
      ],
    },

    documents: {
      name: L('Dokumenter', 'Documents', 'Dokumenter', 'Dokument', 'Asiakirjat', 'Dokumenty', 'Documentos', 'Documents', 'Dokumente'),
      eyebrow: L(
        'Mapper. Filer. Ferdig søkt.',
        'Folders. Files. Already found.',
        'Mapper. Filer. Færdig søgt.',
        'Mappar. Filer. Redan hittat.',
        'Kansiot. Tiedostot. Valmiiksi haettu.',
        'Foldery. Pliki. Już znalezione.',
        'Carpetas. Archivos. Ya encontrados.',
        'Dossiers. Fichiers. Déjà trouvés.',
        'Ordner. Dateien. Schon gefunden.'
      ),
      headline: L(
        'Papirene som alltid er «ett sted»',
        'The papers that are always “in one place”',
        'Papirerne, der altid er »ét sted«',
        'Pappren som alltid är »på ett ställe«',
        'Paperit, jotka ovat aina »yhdessä paikassa«',
        'Papiery, które zawsze są „w jednym miejscu”',
        'Los papeles que siempre están «en un sitio»',
        'Les papiers qui sont toujours « au même endroit »',
        'Die Papiere, die immer „an einem Ort“ sind'
      ),
      pitch: L(
        'Samle familiens viktige dokumenter i tydelige områder for familien, deg selv og barna.',
        'Gather the family’s important documents in clear areas for the family, yourself and the kids.',
        'Saml familiens vigtige dokumenter i tydelige områder til familien, dig selv og børnene.',
        'Samla familjens viktiga dokument i tydliga områden för familjen, dig själv och barnen.',
        'Kerää perheen tärkeät asiakirjat selkeisiin alueisiin perheelle, itsellesi ja lapsille.',
        'Zbieraj ważne dokumenty rodziny w jasnych obszarach dla rodziny, siebie i dzieci.',
        'Reúne los documentos importantes en áreas claras para la familia, para ti y para los niños.',
        'Rassemble les documents importants dans des zones claires pour la famille, toi et les enfants.',
        'Sammle die wichtigen Dokumente der Familie in klaren Bereichen für Familie, dich und die Kinder.'
      ),
      activationLabel: L(
        'Aktiver Dokumenter',
        'Activate Documents',
        'Aktiver Dokumenter',
        'Aktivera Dokument',
        'Aktivoi Asiakirjat',
        'Aktywuj Dokumenty',
        'Activar Documentos',
        'Activer Documents',
        'Dokumente aktivieren'
      ),
      benefits: [
        L(
          'Lag mapper som passer familien',
          'Create folders that fit the family',
          'Lav mapper, der passer familien',
          'Skapa mappar som passar familjen',
          'Luo kansioita, jotka sopivat perheelle',
          'Twórz foldery dopasowane do rodziny',
          'Crea carpetas que encajen con la familia',
          'Crée des dossiers adaptés à la famille',
          'Lege Ordner an, die zur Familie passen'
        ),
        L(
          'Last opp bilder, PDF-er og andre filer',
          'Upload photos, PDFs and other files',
          'Upload billeder, PDF’er og andre filer',
          'Ladda upp bilder, PDF:er och andra filer',
          'Lataa kuvia, PDF-tiedostoja ja muita tiedostoja',
          'Przesyłaj zdjęcia, PDF-y i inne pliki',
          'Sube fotos, PDF y otros archivos',
          'Téléverse photos, PDF et autres fichiers',
          'Lade Fotos, PDFs und andere Dateien hoch'
        ),
        L(
          'Styr hvem som kan se personlige dokumenter',
          'Control who can see personal documents',
          'Styr, hvem der kan se personlige dokumenter',
          'Styr vem som kan se personliga dokument',
          'Hallitse, kuka näkee henkilökohtaiset asiakirjat',
          'Kontroluj, kto widzi dokumenty osobiste',
          'Controla quién puede ver documentos personales',
          'Contrôle qui peut voir les documents personnels',
          'Steuere, wer persönliche Dokumente sehen kann'
        ),
      ],
    },

    boligmappa: {
      name: L('Boligen', 'Home', 'Boligen', 'Bostaden', 'Koti', 'Dom', 'La vivienda', 'Le logement', 'Die Wohnung'),
      eyebrow: L(
        'Vedlikehold. Garanti. Papirer.',
        'Maintenance. Warranty. Papers.',
        'Vedligehold. Garanti. Papirer.',
        'Underhåll. Garanti. Papper.',
        'Huolto. Takuu. Paperit.',
        'Konserwacja. Gwarancja. Papiery.',
        'Mantenimiento. Garantía. Papeles.',
        'Entretien. Garantie. Papiers.',
        'Wartung. Garantie. Papiere.'
      ),
      headline: L(
        'Ikke glem vedlikehold og garanti',
        'Don\'t forget maintenance and warranties',
        'Glem ikke vedligehold og garanti',
        'Glöm inte underhåll och garanti',
        'Älä unohda huoltoa ja takuuta',
        'Nie zapomnij o konserwacji i gwarancji',
        'No olvides el mantenimiento ni la garantía',
        'N\'oublie pas l\'entretien ni la garantie',
        'Wartung und Garantie nicht vergessen'
      ),
      pitch: L(
        'Få påminnelse før garanti og service går ut, kryss av vedlikehold, og samle papirer og håndverkere på boligen.',
        'Get a reminder before warranties and service expire, check off maintenance, and keep papers and tradespeople on the home.',
        'Få påmindelse før garanti og service udløber, kryds vedligehold af, og saml papirer og håndværkere på boligen.',
        'Få påminnelse innan garanti och service går ut, bocka av underhåll och samla papper och hantverkare på bostaden.',
        'Saat muistutuksen ennen kuin takuu tai huolto päättyy, ruksaa huolto ja kokoa paperit sekä tekijät kotiin.',
        'Dostaniesz przypomnienie zanim skończy się gwarancja lub serwis, odhacz konserwację i zbierz papiery oraz fachowców.',
        'Recibe un aviso antes de que venza la garantía o el servicio, marca el mantenimiento y reúne papeles y profesionales.',
        'Un rappel avant la fin de garantie ou d\'entretien, coche les tâches, et garde papiers et artisans sur le logement.',
        'Erinnerung bevor Garantie oder Service endet, Wartung abhaken, Papiere und Handwerker am Zuhause sammeln.'
      ),
      activationLabel: L(
        'Aktiver Boligen',
        'Activate Home',
        'Aktiver Boligen',
        'Aktivera Bostaden',
        'Aktivoi Koti',
        'Aktywuj Dom',
        'Activar La vivienda',
        'Activer Le logement',
        'Die Wohnung aktivieren'
      ),
      benefits: [
        L(
          'Påminnelse når garanti eller service nærmer seg',
          'A reminder when a warranty or service is due',
          'Påmindelse når garanti eller service nærmer sig',
          'Påminnelse när garanti eller service närmar sig',
          'Muistutus kun takuu tai huolto lähestyy',
          'Przypomnienie gdy zbliża się gwarancja lub serwis',
          'Un aviso cuando se acerca la garantía o el servicio',
          'Un rappel quand la garantie ou l\'entretien approche',
          'Erinnerung wenn Garantie oder Service näher rückt'
        ),
        L(
          'Vedlikehold du kan krysse av, med historikk',
          'Maintenance you can check off, with a history',
          'Vedligehold du kan krydse af, med historik',
          'Underhåll du kan bocka av, med historik',
          'Huolto jonka voit ruksa, historialla',
          'Konserwacja do odhaczenia, z historią',
          'Mantenimiento que puedes marcar, con historial',
          'Entretien à cocher, avec historique',
          'Wartung zum Abhaken, mit Verlauf'
        ),
        L(
          'Adresse, papirer og håndverkere samlet',
          'Address, papers and tradespeople in one place',
          'Adresse, papirer og håndværkere samlet',
          'Adress, papper och hantverkare samlat',
          'Osoite, paperit ja tekijät yhdessä',
          'Adres, papiery i fachowcy w jednym miejscu',
          'Dirección, papeles y profesionales juntos',
          'Adresse, papiers et artisans au même endroit',
          'Adresse, Papiere und Handwerker an einem Ort'
        ),
      ],
    },

    hospitality: {
      name: L('Utleie', 'Rentals', 'Udlejning', 'Uthyrning', 'Vuokraus', 'Wynajem', 'Alquiler', 'Location', 'Vermietung'),
      eyebrow: L(
        'Bookinger. Låser. Meldinger.',
        'Bookings. Locks. Messages.',
        'Bookinger. Låse. Beskeder.',
        'Bokningar. Lås. Meddelanden.',
        'Varaukset. Lukot. Viestit.',
        'Rezerwacje. Zamki. Wiadomości.',
        'Reservas. Cerraduras. Mensajes.',
        'Réservations. Serrures. Messages.',
        'Buchungen. Schlösser. Nachrichten.'
      ),
      headline: L(
        'Utleie som føles som et lite hotell',
        'Rentals that feel like a small hotel',
        'Udlejning, der føles som et lille hotel',
        'Uthyrning som känns som ett litet hotell',
        'Vuokraus, joka tuntuu pieneltä hotellilta',
        'Wynajem, który czuje się jak mały hotel',
        'Alquiler que se siente como un pequeño hotel',
        'Une location qui a l’air d’un petit hôtel',
        'Vermietung, die sich wie ein kleines Hotel anfühlt'
      ),
      pitch: L(
        'Samle bookinger, smarte låser, automatiske gjestemeldinger og vurderinger.',
        'Gather bookings, smart locks, automatic guest messages and reviews.',
        'Saml bookinger, smarte låse, automatiske gæstebeskeder og anmeldelser.',
        'Samla bokningar, smarta lås, automatiska gästmeddelanden och omdömen.',
        'Kerää varaukset, älylukot, automaattiset vierasviestit ja arviot.',
        'Zbieraj rezerwacje, inteligentne zamki, automatyczne wiadomości dla gości i oceny.',
        'Reúne reservas, cerraduras inteligentes, mensajes automáticos a huéspedes y reseñas.',
        'Rassemble réservations, serrures intelligentes, messages automatiques aux hôtes et avis.',
        'Sammle Buchungen, smarte Schlösser, automatische Gastnachrichten und Bewertungen.'
      ),
      activationLabel: L(
        'Aktiver Utleie',
        'Activate Rentals',
        'Aktiver Udlejning',
        'Aktivera Uthyrning',
        'Aktivoi Vuokraus',
        'Aktywuj Wynajem',
        'Activar Alquiler',
        'Activer Location',
        'Vermietung aktivieren'
      ),
      benefits: [
        L(
          'Synkroniser Airbnb og Booking.com',
          'Sync Airbnb and Booking.com',
          'Synkroniser Airbnb og Booking.com',
          'Synka Airbnb och Booking.com',
          'Synkronoi Airbnb ja Booking.com',
          'Synchronizuj Airbnb i Booking.com',
          'Sincroniza Airbnb y Booking.com',
          'Synchronise Airbnb et Booking.com',
          'Synchronisiere Airbnb und Booking.com'
        ),
        L(
          'Koble låser og håndter adgang',
          'Connect locks and manage access',
          'Tilslut låse og håndter adgang',
          'Koppla lås och hantera åtkomst',
          'Yhdistä lukot ja hallitse pääsyä',
          'Podłącz zamki i zarządzaj dostępem',
          'Conecta cerraduras y gestiona el acceso',
          'Connecte les serrures et gère l’accès',
          'Verbinde Schlösser und verwalte Zugang'
        ),
        L(
          'Send automatiske meldinger gjennom reisen',
          'Send automatic messages through the stay',
          'Send automatiske beskeder gennem rejsen',
          'Skicka automatiska meddelanden genom vistelsen',
          'Lähetä automaattisia viestejä vierailun aikana',
          'Wysyłaj automatyczne wiadomości w trakcie pobytu',
          'Envía mensajes automáticos durante la estancia',
          'Envoie des messages automatiques pendant le séjour',
          'Sende automatische Nachrichten während des Aufenthalts'
        ),
      ],
    },
  },
};

export function localizeModuleFields(module, lang) {
  if (!module || !module.id) return module;
  const entry = MODULE_CATALOG_I18N.modules[module.id];
  if (!entry) return module;
  return {
    ...module,
    name: pick(entry.name, lang),
    eyebrow: pick(entry.eyebrow, lang),
    headline: pick(entry.headline, lang),
    pitch: pick(entry.pitch, lang),
    activationLabel: pick(entry.activationLabel, lang),
    benefits: Array.isArray(entry.benefits)
      ? entry.benefits.map((b) => pick(b, lang))
      : module.benefits,
  };
}

export function localizeCatalogDefaults(defaults, lang) {
  const i18nDefaults = MODULE_CATALOG_I18N.defaults;
  if (!defaults && !i18nDefaults) return defaults;
  const source = defaults || {};
  return {
    ...source,
    backLabel: pick(i18nDefaults.backLabel, lang) || source.backLabel,
    reassuranceText: pick(i18nDefaults.reassuranceText, lang) || source.reassuranceText,
    mobileReassuranceText: pick(i18nDefaults.mobileReassuranceText, lang) || source.mobileReassuranceText,
    reassuranceTextCompact: pick(i18nDefaults.reassuranceTextCompact, lang) || source.reassuranceTextCompact,
    childReassuranceText: pick(i18nDefaults.childReassuranceText, lang) || source.childReassuranceText,
  };
}
