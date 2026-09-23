/**
 * Modulkatalog for klasserom — Google Classroom-inspirert struktur
 * (Strøm, Klassearbeid, Karakterer, Å gjøre) + skolemoduler.
 */
export function buildClassroomModules({ t, isAdmin, isStaff }) {
  const tr = typeof t === 'function' ? t : (k) => k;
  const main = [
    { id: 'home', icon: 'home', label: tr('classroom.home'), tab: 'home' },
    { id: 'stream', icon: 'chatbubbles', label: tr('classroom.stream'), tab: 'stream' },
    { id: 'classwork', icon: 'documents', label: tr('classroom.classwork'), tab: 'classwork' },
    { id: 'todo', icon: 'checkbox', label: tr('classroom.todo'), tab: 'todo' },
    { id: 'grades', icon: 'school', label: tr('classroom.grades'), tab: 'grades' },
  ];

  const schedule = [
    { id: 'timetable', icon: 'calendar', label: tr('classroom.timetable'), tab: 'timetable' },
    { id: 'lessonPlans', icon: 'clipboard', label: tr('classroom.lessonPlans'), tab: 'lessonPlans' },
  ];

  const apps = [
    { id: 'subjects', icon: 'book', label: tr('classroom.subjects'), tab: 'subjects' },
    { id: 'groups', icon: 'people', label: tr('classroom.groups'), tab: 'groups' },
    { id: 'seating', icon: 'grid', label: tr('classroom.seating'), tab: 'seating' },
    { id: 'offers', icon: 'school', label: tr('classroom.offers'), tab: 'offers' },
    { id: 'books', icon: 'library', label: tr('classroom.books'), tab: 'books' },
  ];

  const sensitive = isStaff ? [
    { id: 'maps', icon: 'folder', label: tr('classroom.studentFolders'), tab: 'maps' },
  ] : [];

  const manage = [
    { id: 'members', icon: 'people-circle', label: tr('classroom.teachersStudents'), tab: 'members' },
    ...(isAdmin ? [
      { id: 'approvals', icon: 'shield-checkmark', label: tr('classroom.approvals'), tab: 'approvals' },
      { id: 'invite', icon: 'key', label: tr('classroom.classCode'), tab: 'invite' },
      {
        id: 'addStaff',
        icon: 'person-add',
        label: tr('classroom.inviteStaff'),
        action: { type: 'nav', screen: 'ClassroomAddStaff', params: {} },
      },
      {
        id: 'addStudents',
        icon: 'person-add',
        label: tr('classroom.addStudents'),
        action: { type: 'nav', screen: 'ClassroomAddStudents', params: {} },
      },
    ] : []),
    { id: 'classrooms', icon: 'grid', label: tr('classroom.myClasses'), tab: 'classrooms' },
    ...(isAdmin ? [{
      id: 'settings',
      icon: 'settings',
      label: tr('classroom.classSettings'),
      action: { type: 'nav', screen: 'GroupSettings', params: {} },
    }] : []),
  ];

  const switchers = [
    { id: 'familyMode', icon: 'swap-horizontal', label: tr('classroom.switchPlatform'), action: { type: 'platformOverview' } },
  ];

  return [
    { id: 'main', title: tr('classroom.sectionClassroom'), items: main },
    { id: 'schedule', title: tr('classroom.sectionPlan'), items: schedule },
    { id: 'apps', title: tr('classroom.sectionApps'), items: apps },
    ...(sensitive.length ? [{ id: 'sensitive', title: tr('classroom.sectionSensitive'), items: sensitive }] : []),
    { id: 'manage', title: tr('classroom.sectionAdmin'), items: manage },
    { id: 'switch', title: tr('classroom.sectionSwitch'), items: switchers },
  ];
}

export function buildClassroomTabs(t) {
  const tr = typeof t === 'function' ? t : (k) => k;
  return [
    { id: 'stream', icon: 'chatbubbles', label: tr('classroom.tabStream') },
    { id: 'classwork', icon: 'documents', label: tr('classroom.tabWork') },
    { id: 'todo', icon: 'checkbox', label: tr('classroom.tabTodo') },
    { id: 'grades', icon: 'school', label: tr('classroom.tabGrade') },
    { id: 'classrooms', icon: 'grid', label: tr('classroom.tabClass') },
  ];
}

/** Bunnnavigasjon — speiler Google Classroom. Prefer buildClassroomTabs(t). */
export const CLASSROOM_TABS = [
  { id: 'stream', icon: 'chatbubbles', label: 'Strøm' },
  { id: 'classwork', icon: 'documents', label: 'Arbeid' },
  { id: 'todo', icon: 'checkbox', label: 'Å gjøre' },
  { id: 'grades', icon: 'school', label: 'Karakter' },
  { id: 'classrooms', icon: 'grid', label: 'Klasse' },
];
