/** Compact translation table: every leaf is { nb, en, da, sv, fi, pl, es, fr, de }. */
const L = (nb, en, da, sv, fi, pl, es, fr, de) => ({ nb, en, da, sv, fi, pl, es, fr, de });

/**
 * App / shell / team / classroom labels — short menu names and section titles.
 * Kept separate from strings.js until wired into the i18n merge.
 */
export const APPS_TABLE = {
  apps: {
    matcoach: L('AI Matcoach', 'AI Food coach', 'AI Madcoach', 'AI Matcoach', 'AI Ruokavalmentaja', 'AI Trener żywieniowy', 'AI Coach de comida', 'AI Coach cuisine', 'AI Essens-Coach'),
    meals: L('Måltidsplanlegger', 'Meal planner', 'Måltidsplanlægger', 'Måltidsplanerare', 'Ateriasuunnittelija', 'Planer posiłków', 'Planificador de comidas', 'Planificateur de repas', 'Mahlzeitenplaner'),
    recipes: L('Oppskrift', 'Recipes', 'Opskrift', 'Recept', 'Resepti', 'Przepisy', 'Recetas', 'Recettes', 'Rezepte'),
    pantry: L('Lager', 'Pantry', 'Lager', 'Skafferi', 'Ruokakomero', 'Spiżarnia', 'Despensa', 'Garde-manger', 'Vorrat'),
    games: L('FamilieSpill', 'Family Games', 'FamilieSpil', 'FamiljeSpel', 'PerhePelit', 'Gry rodzinne', 'Juegos familiares', 'Jeux en famille', 'Familienspiele'),
    scratchMap: L('Våre reiser', 'Our travels', 'Vores rejser', 'Våra resor', 'Matkamme', 'Nasze podróże', 'Nuestros viajes', 'Nos voyages', 'Unsere Reisen'),
    reiseplanlegger: L('Reiseplanlegger', 'Trip planner', 'Rejseplanlægger', 'Reseplanerare', 'Matkasuunnittelija', 'Planer podróży', 'Planificador de viajes', 'Planificateur de voyage', 'Reiseplaner'),
    familyTree: L('Familietreet', 'Family tree', 'Familietræet', 'Släktträdet', 'Sukupuu', 'Drzewo genealogiczne', 'Árbol familiar', 'Arbre généalogique', 'Stammbaum'),
    rememberDates: L('Husk dato', 'Remember dates', 'Husk dato', 'Kom ihåg datum', 'Muista päivä', 'Pamiętaj datę', 'Recordar fechas', 'Dates à retenir', 'Termine merken'),
    location: L('Familieposisjon', 'Family location', 'Familieposition', 'Familjeposition', 'Perheen sijainti', 'Lokalizacja rodziny', 'Ubicación familiar', 'Position familiale', 'Familienstandort'),
    documents: L('Dokumenter', 'Documents', 'Dokumenter', 'Dokument', 'Asiakirjat', 'Dokumenty', 'Documentos', 'Documents', 'Dokumente'),
    albums: L('Familiealbum', 'Family albums', 'Familiealbum', 'Familjealbum', 'Perhealbumi', 'Album rodzinny', 'Álbumes familiares', 'Albums de famille', 'Familienalbum'),
    wall: L('Familievegg', 'Family wall', 'Familievæg', 'Familjevägg', 'Perheseinä', 'Tablica rodzinna', 'Muro familiar', 'Mur familial', 'Familienwand'),
    childDrawings: L('Barnetegninger', 'Kids’ drawings', 'Børnetegninger', 'Barnteckningar', 'Lasten piirustukset', 'Rysunki dzieci', 'Dibujos de niños', 'Dessins d’enfants', 'Kinderzeichnungen'),
    holdings: L('Kjøretøy', 'Vehicles', 'Køretøjer', 'Fordon', 'Ajoneuvot', 'Pojazdy', 'Vehículos', 'Véhicules', 'Fahrzeuge'),
    boligmappa: L('Boligen', 'Home folder', 'Boligen', 'Bostaden', 'Koti', 'Dom', 'La vivienda', 'Le logement', 'Die Wohnung'),
    hospitality: L('Utleie', 'Rentals', 'Udlejning', 'Uthyrning', 'Vuokraus', 'Wynajem', 'Alquiler', 'Location', 'Vermietung'),
    progress: L('Barnas progresjon', 'Kids’ progress', 'Børnenes fremgang', 'Barnens framsteg', 'Lasten edistyminen', 'Postępy dzieci', 'Progreso de los niños', 'Progrès des enfants', 'Fortschritt der Kinder'),
    members: L('Medlemmer', 'Members', 'Medlemmer', 'Medlemmar', 'Jäsenet', 'Członkowie', 'Miembros', 'Membres', 'Mitglieder'),
    friends: L('Venner', 'Friends', 'Venner', 'Vänner', 'Kaverit', 'Przyjaciele', 'Amigos', 'Amis', 'Freunde'),
    addMember: L('Legg til person', 'Add person', 'Tilføj person', 'Lägg till person', 'Lisää henkilö', 'Dodaj osobę', 'Añadir persona', 'Ajouter une personne', 'Person hinzufügen'),
    groupSettings: L('Familieinnstillinger', 'Family settings', 'Familieindstillinger', 'Familjeinställningar', 'Perheen asetukset', 'Ustawienia rodziny', 'Ajustes familiares', 'Réglages famille', 'Familieneinstellungen'),
    childApps: L('Barnas apper', 'Kids’ apps', 'Børnenes apps', 'Barnens appar', 'Lasten sovellukset', 'Aplikacje dzieci', 'Apps de los niños', 'Applis des enfants', 'Kinder-Apps'),
    moduleAccess: L('Aktiverte moduler', 'Enabled modules', 'Aktiverede moduler', 'Aktiverade moduler', 'Käytössä olevat moduulit', 'Włączone moduły', 'Módulos activados', 'Modules activés', 'Aktivierte Module'),
    privacy: L('Personvern', 'Privacy', 'Privatliv', 'Integritet', 'Tietosuoja', 'Prywatność', 'Privacidad', 'Confidentialité', 'Datenschutz'),
    quiz: L('Familiequiz', 'Family quiz', 'Familiequiz', 'Familjequiz', 'Perhevisailu', 'Quiz rodzinny', 'Quiz familiar', 'Quiz familial', 'Familienquiz'),
    school: L('Skole', 'School', 'Skole', 'Skola', 'Koulu', 'Szkoła', 'Escuela', 'École', 'Schule'),
    otherApps: L('Øvrige apper', 'Other apps', 'Øvrige apps', 'Övriga appar', 'Muut sovellukset', 'Inne aplikacje', 'Otras apps', 'Autres applis', 'Weitere Apps'),
  },

  shell: {
    main: L('Hoved', 'Main', 'Hoved', 'Huvud', 'Pää', 'Główne', 'Principal', 'Principal', 'Haupt'),
    apps: L('Apper', 'Apps', 'Apps', 'Appar', 'Sovellukset', 'Aplikacje', 'Apps', 'Applis', 'Apps'),
    account: L('Konto', 'Account', 'Konto', 'Konto', 'Tili', 'Konto', 'Cuenta', 'Compte', 'Konto'),
    school: L('Skole', 'School', 'Skole', 'Skola', 'Koulu', 'Szkoła', 'Escuela', 'École', 'Schule'),
    food: L('Mat & innkjøp', 'Food & shopping', 'Mad & indkøb', 'Mat & inköp', 'Ruoka & ostokset', 'Jedzenie i zakupy', 'Comida y compras', 'Nourriture et courses', 'Essen & Einkauf'),
    memories: L('Minner', 'Memories', 'Minder', 'Minnen', 'Muistot', 'Wspomnienia', 'Recuerdos', 'Souvenirs', 'Erinnerungen'),
    family: L('Familien', 'The family', 'Familien', 'Familjen', 'Perhe', 'Rodzina', 'La familia', 'La famille', 'Die Familie'),
    vehicles: L('Kjøretøy', 'Vehicles', 'Køretøjer', 'Fordon', 'Ajoneuvot', 'Pojazdy', 'Vehículos', 'Véhicules', 'Fahrzeuge'),
    house: L('Hus & papir', 'Home & papers', 'Hus & papir', 'Hus & papper', 'Koti & paperit', 'Dom i dokumenty', 'Casa y papeles', 'Maison et papiers', 'Haus & Papier'),
  },

  shellSub: {
    overview: L('Oversikt', 'Overview', 'Oversigt', 'Översikt', 'Yleiskuva', 'Przegląd', 'Resumen', 'Aperçu', 'Übersicht'),
    weekHomework: L('Ukelekser', 'Week’s homework', 'Ugelektier', 'Veckoläxor', 'Viikon läksyt', 'Prace domowe tygodnia', 'Deberes de la semana', 'Devoirs de la semaine', 'Wochenhausaufgaben'),
    stepByStep: L('Steg for steg', 'Step by step', 'Trin for trin', 'Steg för steg', 'Vaihe vaiheelta', 'Krok po kroku', 'Paso a paso', 'Étape par étape', 'Schritt für Schritt'),
    learningPlay: L('Øv med spill og oppdrag', 'Practice with games and missions', 'Øv med spil og opgaver', 'Öva med spel och uppdrag', 'Harjoittele peleillä', 'Ćwicz z grami', 'Practica con juegos', 'S’entraîner en jouant', 'Üben mit Spielen'),
    classInfo: L('Klasseinfo', 'Class info', 'Klasseinfo', 'Klassinfo', 'Luokkatiedot', 'Info o klasie', 'Info de clase', 'Infos classe', 'Klasseninfo'),
    deadline: L('Frist', 'Deadline', 'Frist', 'Deadline', 'Määräaika', 'Termin', 'Plazo', 'Échéance', 'Frist'),
    today: L('I dag', 'Today', 'I dag', 'I dag', 'Tänään', 'Dziś', 'Hoy', 'Aujourd’hui', 'Heute'),
    schoolApps: L('Skoleapper', 'School apps', 'Skoleapps', 'Skolappar', 'Koulusovellukset', 'Aplikacje szkolne', 'Apps escolares', 'Applis scolaires', 'Schul-Apps'),
    countdown: L('Nedtelling', 'Countdown', 'Nedtælling', 'Nedräkning', 'Laskenta', 'Odliczanie', 'Cuenta atrás', 'Compte à rebours', 'Countdown'),
    writeRecordAi: L('Skriv, ta opp, AI', 'Write, record, AI', 'Skriv, optag, AI', 'Skriv, spela in, AI', 'Kirjoita, nauhoita, AI', 'Pisz, nagraj, AI', 'Escribe, graba, IA', 'Écrire, enregistrer, IA', 'Schreiben, aufnehmen, KI'),
    books: L('Bøker', 'Books', 'Bøger', 'Böcker', 'Kirjat', 'Książki', 'Libros', 'Livres', 'Bücher'),
    gifts: L('Gaver', 'Gifts', 'Gaver', 'Presenter', 'Lahjat', 'Prezenty', 'Regalos', 'Cadeaux', 'Geschenke'),
    playTogether: L('Spill sammen', 'Play together', 'Spil sammen', 'Spela tillsammans', 'Pelaa yhdessä', 'Grajcie razem', 'Jugar juntos', 'Jouer ensemble', 'Zusammen spielen'),
    messages: L('Meldinger', 'Messages', 'Beskeder', 'Meddelanden', 'Viestit', 'Wiadomości', 'Mensajes', 'Messages', 'Nachrichten'),
    nToday: L('{n} i dag', '{n} today', '{n} i dag', '{n} i dag', '{n} tänään', '{n} dziś', '{n} hoy', '{n} aujourd’hui', '{n} heute'),
    travels: L('Reiser', 'Travels', 'Rejser', 'Resor', 'Matkat', 'Podróże', 'Viajes', 'Voyages', 'Reisen'),
    holidays: L('Ferier', 'Holidays', 'Ferie', 'Semestrar', 'Lomat', 'Wakacje', 'Vacaciones', 'Vacances', 'Urlaub'),
    relatives: L('Slekt', 'Relatives', 'Slægt', 'Släkt', 'Suku', 'Krewni', 'Familiares', 'Famille', 'Verwandte'),
    training: L('Trening', 'Training', 'Træning', 'Träning', 'Treeni', 'Trening', 'Entrenamiento', 'Entraînement', 'Training'),
    position: L('Posisjon', 'Location', 'Position', 'Position', 'Sijainti', 'Pozycja', 'Ubicación', 'Position', 'Standort'),
    family: L('Familie', 'Family', 'Familie', 'Familj', 'Perhe', 'Rodzina', 'Familia', 'Famille', 'Familie'),
    files: L('Filer', 'Files', 'Filer', 'Filer', 'Tiedostot', 'Pliki', 'Archivos', 'Fichiers', 'Dateien'),
    outlook: L('Outlook', 'Outlook', 'Outlook', 'Outlook', 'Outlook', 'Outlook', 'Outlook', 'Outlook', 'Outlook'),
    shopping: L('Innkjøp', 'Shopping', 'Indkøb', 'Inköp', 'Ostokset', 'Zakupy', 'Compras', 'Courses', 'Einkauf'),
    weekPlanAi: L('Ukeplan med AI', 'Week plan with AI', 'Ugeplan med AI', 'Veckoplan med AI', 'Viikkosuunnitelma tekoälyllä', 'Plan tygodnia z AI', 'Plan semanal con IA', 'Planning avec IA', 'Wochenplan mit KI'),
    weekPlan: L('Ukeplan', 'Week plan', 'Ugeplan', 'Veckoplan', 'Viikkosuunnitelma', 'Plan tygodnia', 'Plan semanal', 'Planning hebdo', 'Wochenplan'),
    dishes: L('Matretter', 'Dishes', 'Retter', 'Rätter', 'Ruokalajit', 'Dania', 'Platos', 'Plats', 'Gerichte'),
    pantry: L('Kjøl & skap', 'Fridge & cupboard', 'Køl & skab', 'Kyl & skafferi', 'Kaappi & jääkaappi', 'Lodówka i spiżarnia', 'Nevera y despensa', 'Frigo et placard', 'Kühlschrank & Schrank'),
    progressShort: L('Progresjon', 'Progress', 'Fremgang', 'Framsteg', 'Edistyminen', 'Postępy', 'Progreso', 'Progrès', 'Fortschritt'),
    theKids: L('Barna', 'The kids', 'Børnene', 'Barnen', 'Lapset', 'Dzieci', 'Los niños', 'Les enfants', 'Die Kinder'),
  },

  moreHub: {
    searchTools: L('Søk i verktøy…', 'Search tools…', 'Søg i værktøjer…', 'Sök i verktyg…', 'Hae työkaluista…', 'Szukaj narzędzi…', 'Buscar herramientas…', 'Rechercher des outils…', 'Tools durchsuchen…'),
    clearSearch: L('Tøm søk', 'Clear search', 'Ryd søgning', 'Rensa sökning', 'Tyhjennä haku', 'Wyczyść wyszukiwanie', 'Borrar búsqueda', 'Effacer la recherche', 'Suche leeren'),
    childAppsIntro: L('Dine apper er gruppert i mapper — foresatte kan slå flere på i innstillinger.', 'Your apps are grouped in folders — parents can enable more in settings.', 'Dine apps er grupperet i mapper — forældre kan slå flere til under indstillinger.', 'Dina appar är grupperade i mappar — vårdnadshavare kan slå på fler i inställningar.', 'Sovelluksesi on ryhmitelty kansioihin — huoltajat voivat ottaa lisää käyttöön asetuksissa.', 'Twoje aplikacje są pogrupowane w foldery — opiekunowie mogą włączyć więcej w ustawieniach.', 'Tus apps están agrupadas en carpetas — los padres pueden activar más en ajustes.', 'Tes applis sont regroupées en dossiers — les parents peuvent en activer plus dans les réglages.', 'Deine Apps sind in Ordnern gruppiert — Eltern können weitere in den Einstellungen aktivieren.'),
    railIntro: L('Alle moduler — samme liste som i sidemenyen.', 'All modules — the same list as in the side menu.', 'Alle moduler — samme liste som i sidemenuen.', 'Alla moduler — samma lista som i sidomenyn.', 'Kaikki moduulit — sama lista kuin sivupalkissa.', 'Wszystkie moduły — ta sama lista co w menu bocznym.', 'Todos los módulos — la misma lista que en el menú lateral.', 'Tous les modules — la même liste que dans le menu latéral.', 'Alle Module — dieselbe Liste wie im Seitenmenü.'),
    phoneIntro: L('Alle moduler — samme liste som i menyen øverst til venstre.', 'All modules — the same list as in the top-left menu.', 'Alle moduler — samme liste som i menuen øverst til venstre.', 'Alla moduler — samma lista som i menyn uppe till vänster.', 'Kaikki moduulit — sama lista kuin vasemman yläkulman valikossa.', 'Wszystkie moduły — ta sama lista co w menu u góry po lewej.', 'Todos los módulos — la misma lista que en el menú superior izquierdo.', 'Tous les modules — la même liste que dans le menu en haut à gauche.', 'Alle Module — dieselbe Liste wie im Menü oben links.'),
    modulesTitle: L('Moduler', 'Modules', 'Moduler', 'Moduler', 'Moduulit', 'Moduły', 'Módulos', 'Modules', 'Module'),
    modulesSub: L('Alle familieapper', 'All family apps', 'Alle familieapps', 'Alla familjeappar', 'Kaikki perhesovellukset', 'Wszystkie aplikacje rodziny', 'Todas las apps familiares', 'Toutes les applis famille', 'Alle Familien-Apps'),
    familyOnly: L('Kun familien.', 'Family only.', 'Kun familien.', 'Bara familjen.', 'Vain perhe.', 'Tylko rodzina.', 'Solo la familia.', 'Famille uniquement.', 'Nur die Familie.'),
    viewingProfile: L('Viser {name}s profil', 'Showing {name}’s profile', 'Viser {name}s profil', 'Visar {name}s profil', 'Näytetään profiili: {name}', 'Profil użytkownika {name}', 'Mostrando el perfil de {name}', 'Profil de {name}', 'Profil von {name}'),
    appDisabledTitle: L('Appen er skrudd av', 'App is turned off', 'Appen er slået fra', 'Appen är avstängd', 'Sovellus on poissa käytöstä', 'Aplikacja jest wyłączona', 'La app está desactivada', 'L’appli est désactivée', 'App ist deaktiviert'),
    appDisabledBody: L('Foresatte har slått av denne appen for denne profilen.', 'Parents have turned off this app for this profile.', 'Forældre har slået denne app fra for denne profil.', 'Vårdnadshavare har stängt av den här appen för den här profilen.', 'Huoltajat ovat poistaneet tämän sovelluksen käytöstä tältä profiililta.', 'Opiekunowie wyłączyli tę aplikację dla tego profilu.', 'Los padres han desactivado esta app para este perfil.', 'Les parents ont désactivé cette appli pour ce profil.', 'Eltern haben diese App für dieses Profil deaktiviert.'),
  },

  team: {
    home: L('Hjem', 'Home', 'Hjem', 'Hem', 'Koti', 'Start', 'Inicio', 'Accueil', 'Start'),
    wall: L('Vegg', 'Wall', 'Væg', 'Vägg', 'Seinä', 'Tablica', 'Muro', 'Mur', 'Wand'),
    calendar: L('Kalender', 'Calendar', 'Kalender', 'Kalender', 'Kalenteri', 'Kalendarz', 'Calendario', 'Calendrier', 'Kalender'),
    messages: L('Meldinger', 'Messages', 'Beskeder', 'Meddelanden', 'Viestit', 'Wiadomości', 'Mensajes', 'Messages', 'Nachrichten'),
    alerts: L('Varsler', 'Alerts', 'Varsler', 'Aviseringar', 'Ilmoitukset', 'Powiadomienia', 'Avisos', 'Alertes', 'Meldungen'),
    members: L('Medlemmer', 'Members', 'Medlemmer', 'Medlemmar', 'Jäsenet', 'Członkowie', 'Miembros', 'Membres', 'Mitglieder'),
    approvals: L('Godkjenninger', 'Approvals', 'Godkendelser', 'Godkännanden', 'Hyväksynnät', 'Zatwierdzenia', 'Aprobaciones', 'Approbations', 'Freigaben'),
    inviteCode: L('Lagkode / inviter', 'Team code / invite', 'Holdkode / inviter', 'Lagkod / bjud in', 'Joukkuekoodi / kutsu', 'Kod drużyny / zaproś', 'Código de equipo / invitar', 'Code équipe / inviter', 'Teamcode / einladen'),
    inviteParticipant: L('Inviter deltaker', 'Invite participant', 'Inviter deltager', 'Bjud in deltagare', 'Kutsu osallistuja', 'Zaproś uczestnika', 'Invitar participante', 'Inviter un participant', 'Teilnehmer einladen'),
    myTeams: L('Mine lag', 'My teams', 'Mine hold', 'Mina lag', 'Omat joukkueet', 'Moje drużyny', 'Mis equipos', 'Mes équipes', 'Meine Teams'),
    switchPlatform: L('Skift plattform', 'Switch platform', 'Skift platform', 'Byt plattform', 'Vaihda alustaa', 'Zmień platformę', 'Cambiar plataforma', 'Changer de plateforme', 'Plattform wechseln'),
    sectionTeam: L('Laget', 'The team', 'Holdet', 'Laget', 'Joukkue', 'Drużyna', 'El equipo', 'L’équipe', 'Das Team'),
    sectionAdmin: L('Administrasjon', 'Administration', 'Administration', 'Administration', 'Hallinta', 'Administracja', 'Administración', 'Administration', 'Verwaltung'),
    sectionSwitch: L('Bytt modus', 'Switch mode', 'Skift tilstand', 'Byt läge', 'Vaihda tilaa', 'Zmień tryb', 'Cambiar modo', 'Changer de mode', 'Modus wechseln'),
    teams: L('Lag', 'Teams', 'Hold', 'Lag', 'Joukkueet', 'Drużyny', 'Equipos', 'Équipes', 'Teams'),
  },

  classroom: {
    home: L('Hjem', 'Home', 'Hjem', 'Hem', 'Koti', 'Start', 'Inicio', 'Accueil', 'Start'),
    stream: L('Strøm', 'Stream', 'Strøm', 'Flöde', 'Virta', 'Strumień', 'Novedades', 'Flux', 'Stream'),
    classwork: L('Klassearbeid', 'Classwork', 'Klassearbejde', 'Klassarbete', 'Luokkatyöt', 'Praca klasowa', 'Trabajo de clase', 'Travail de classe', 'Klassenarbeit'),
    todo: L('Å gjøre', 'To-do', 'At gøre', 'Att göra', 'Tehtävät', 'Do zrobienia', 'Por hacer', 'À faire', 'Aufgaben'),
    grades: L('Karakterer', 'Grades', 'Karakterer', 'Betyg', 'Arvosanat', 'Oceny', 'Notas', 'Notes', 'Noten'),
    timetable: L('Timeplan', 'Timetable', 'Skema', 'Schema', 'Lukujärjestys', 'Plan lekcji', 'Horario', 'Emploi du temps', 'Stundenplan'),
    lessonPlans: L('Undervisningsplan', 'Lesson plans', 'Undervisningsplan', 'Lektionsplan', 'Opetussuunnitelma', 'Plany lekcji', 'Planes de clase', 'Plans de cours', 'Unterrichtsplan'),
    subjects: L('Fag', 'Subjects', 'Fag', 'Ämnen', 'Oppiaineet', 'Przedmioty', 'Asignaturas', 'Matières', 'Fächer'),
    groups: L('Grupper', 'Groups', 'Grupper', 'Grupper', 'Ryhmät', 'Grupy', 'Grupos', 'Groupes', 'Gruppen'),
    seating: L('Sitteplan', 'Seating plan', 'Siddplan', 'Bordsplacering', 'Istumajärjestys', 'Plan miejsc', 'Plano de asientos', 'Plan de places', 'Sitzplan'),
    offers: L('Undervisningstilbud', 'Course offerings', 'Undervisningstilbud', 'Undervisningsutbud', 'Opetustarjonta', 'Oferta zajęć', 'Oferta educativa', 'Offre pédagogique', 'Unterrichtsangebot'),
    books: L('Pensum og bøker', 'Curriculum and books', 'Pensum og bøger', 'Kurslitteratur och böcker', 'Oppimateriaali ja kirjat', 'Program i książki', 'Temario y libros', 'Programme et livres', 'Lehrplan und Bücher'),
    studentFolders: L('Elevmapper', 'Student folders', 'Elevmapper', 'Elevmappar', 'Oppilaskansiot', 'Foldery uczniów', 'Carpetas de alumnos', 'Dossiers élèves', 'Schülermappen'),
    teachersStudents: L('Lærere og elever', 'Teachers and students', 'Lærere og elever', 'Lärare och elever', 'Opettajat ja oppilaat', 'Nauczyciele i uczniowie', 'Profesores y alumnos', 'Enseignants et élèves', 'Lehrkräfte und Schüler'),
    approvals: L('Godkjenninger', 'Approvals', 'Godkendelser', 'Godkännanden', 'Hyväksynnät', 'Zatwierdzenia', 'Aprobaciones', 'Approbations', 'Freigaben'),
    classCode: L('Klassekode / inviter', 'Class code / invite', 'Klassekode / inviter', 'Klasskod / bjud in', 'Luokkakoodi / kutsu', 'Kod klasy / zaproś', 'Código de clase / invitar', 'Code classe / inviter', 'Klassencode / einladen'),
    inviteStaff: L('Inviter ansatt', 'Invite staff', 'Inviter medarbejder', 'Bjud in personal', 'Kutsu henkilökunta', 'Zaproś pracownika', 'Invitar personal', 'Inviter un membre du personnel', 'Mitarbeiter einladen'),
    addStudents: L('Legg til elever', 'Add students', 'Tilføj elever', 'Lägg till elever', 'Lisää oppilaat', 'Dodaj uczniów', 'Añadir alumnos', 'Ajouter des élèves', 'Schüler hinzufügen'),
    myClasses: L('Mine klasser', 'My classes', 'Mine klasser', 'Mina klasser', 'Omat luokat', 'Moje klasy', 'Mis clases', 'Mes classes', 'Meine Klassen'),
    classSettings: L('Klasseinnstillinger', 'Class settings', 'Klasseindstillinger', 'Klassinställningar', 'Luokan asetukset', 'Ustawienia klasy', 'Ajustes de clase', 'Réglages de classe', 'Klasseneinstellungen'),
    switchPlatform: L('Skift plattform', 'Switch platform', 'Skift platform', 'Byt plattform', 'Vaihda alustaa', 'Zmień platformę', 'Cambiar plataforma', 'Changer de plateforme', 'Plattform wechseln'),
    sectionClassroom: L('Classroom', 'Classroom', 'Classroom', 'Classroom', 'Classroom', 'Classroom', 'Classroom', 'Classroom', 'Classroom'),
    sectionPlan: L('Plan', 'Plan', 'Plan', 'Plan', 'Suunnitelma', 'Plan', 'Plan', 'Planning', 'Plan'),
    sectionApps: L('Apper', 'Apps', 'Apps', 'Appar', 'Sovellukset', 'Aplikacje', 'Apps', 'Applis', 'Apps'),
    sectionSensitive: L('Sensitive mapper', 'Sensitive folders', 'Sensitive mapper', 'Känsliga mappar', 'Arkaluonteiset kansiot', 'Wrażliwe foldery', 'Carpetas sensibles', 'Dossiers sensibles', 'Sensible Ordner'),
    sectionAdmin: L('Administrasjon', 'Administration', 'Administration', 'Administration', 'Hallinta', 'Administracja', 'Administración', 'Administration', 'Verwaltung'),
    sectionSwitch: L('Bytt modus', 'Switch mode', 'Skift tilstand', 'Byt läge', 'Vaihda tilaa', 'Zmień tryb', 'Cambiar modo', 'Changer de mode', 'Modus wechseln'),
    tabStream: L('Strøm', 'Stream', 'Strøm', 'Flöde', 'Virta', 'Strumień', 'Novedades', 'Flux', 'Stream'),
    tabWork: L('Arbeid', 'Work', 'Arbejde', 'Arbete', 'Työ', 'Praca', 'Trabajo', 'Travail', 'Arbeit'),
    tabTodo: L('Å gjøre', 'To-do', 'At gøre', 'Att göra', 'Tehtävät', 'Do zrobienia', 'Por hacer', 'À faire', 'Aufgaben'),
    tabGrade: L('Karakter', 'Grade', 'Karakter', 'Betyg', 'Arvosana', 'Ocena', 'Nota', 'Note', 'Note'),
    tabClass: L('Klasse', 'Class', 'Klasse', 'Klass', 'Luokka', 'Klasa', 'Clase', 'Classe', 'Klasse'),
  },

  nav: {
    family: L('Familie', 'Family', 'Familie', 'Familj', 'Perhe', 'Rodzina', 'Familia', 'Famille', 'Familie'),
    planShort: L('Plan', 'Plan', 'Plan', 'Plan', 'Suunnitelma', 'Plan', 'Plan', 'Planning', 'Plan'),
  },
};

/** Flatten nested APPS_TABLE leaves to dotted keys, e.g. `apps.matcoach`. */
export function flattenAppsTable(table = APPS_TABLE) {
  const out = {};
  const walk = (node, prefix) => {
    Object.entries(node).forEach(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && 'nb' in v && 'en' in v) out[key] = v;
      else if (v && typeof v === 'object') walk(v, key);
    });
  };
  walk(table, '');
  return out;
}
