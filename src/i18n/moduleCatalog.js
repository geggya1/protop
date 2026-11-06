/** Module activation catalog copy: every leaf is { nb, en, da, sv, fi, pl, es, fr, de }. */
const L = (nb, en, da, sv, fi, pl, es, fr, de) => ({ nb, en, da, sv, fi, pl, es, fr, de });

import { makeLocalizers } from './moduleCatalogLocalize.js';

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
        'Din kalender, én plan',
        'Your calendar, one plan',
        'Din kalender, én plan',
        'Din kalender, en plan',
        'Oma kalenteri, yksi suunnitelma',
        'Twój kalendarz, jeden plan',
        'Tu calendario, un solo plan',
        'Ton calendrier, un seul plan',
        'Dein Kalender, ein Plan'
      ),
      pitch: L(
        'Samle egne avtaler, aktiviteter og påminnelser, så du vet hva som skjer – og når.',
        'Gather your own appointments, activities and reminders so you know what’s happening – and when.',
        'Saml dine aftaler, aktiviteter og påmindelser, så du ved, hvad der sker – og hvornår.',
        'Samla dina möten, aktiviteter och påminnelser så du vet vad som händer – och när.',
        'Kerää omat tapaamiset, aktiviteetit ja muistutukset, jotta tiedät mitä tapahtuu – ja milloin.',
        'Zbierz własne spotkania, aktywności i przypomnienia, byś wiedział, co się dzieje – i kiedy.',
        'Reúne tus citas, actividades y recordatorios para que sepas qué pasa – y cuándo.',
        'Rassemble tes rendez-vous, activités et rappels pour que tu saches ce qui se passe – et quand.',
        'Sammle eigene Termine, Aktivitäten und Erinnerungen, damit du weißt, was passiert – und wann.'
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
          'Se dagen og uken i din egen kalender',
          'See the day and week in your own calendar',
          'Se dagen og ugen i din egen kalender',
          'Se dagen och veckan i din egen kalender',
          'Näe päivä ja viikko omassa kalenterissasi',
          'Zobacz dzień i tydzień we własnym kalendarzu',
          'Ve el día y la semana en tu propio calendario',
          'Vois le jour et la semaine dans ton calendrier',
          'Sieh Tag und Woche in deinem eigenen Kalender'
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


  },
};

// Appen bruker moduleCatalogActive.js (bare nb og en, generert fra denne filen).
export const { localizeModuleFields, localizeCatalogDefaults } = makeLocalizers(MODULE_CATALOG_I18N);
