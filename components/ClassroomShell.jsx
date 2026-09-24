import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { isClassroomType } from '../src/utils/groupTypes';
import { isClassroomAdmin } from '../src/utils/classroom';
import { openPlatformHome } from '../src/utils/platformNav';
import { classroomColors as c } from '../src/classroomTheme';
import { buildClassroomTabs } from '../src/navigation/classroomModules';
import { useI18n } from '../src/i18n';
import ClassroomHeader from './classroom/ClassroomHeader';
import ClassroomDrawer from './classroom/ClassroomDrawer';
import ClassroomHomeScreen from '../screens/classroom/ClassroomHomeScreen';
import ClassroomClassroomsScreen from '../screens/classroom/ClassroomClassroomsScreen';
import ClassroomSubjectsScreen from '../screens/classroom/ClassroomSubjectsScreen';
import ClassroomTimetableScreen from '../screens/classroom/ClassroomTimetableScreen';
import ClassroomLessonPlanScreen from '../screens/classroom/ClassroomLessonPlanScreen';
import ClassroomGroupsScreen from '../screens/classroom/ClassroomGroupsScreen';
import ClassroomSeatingScreen from '../screens/classroom/ClassroomSeatingScreen';
import ClassroomOffersScreen from '../screens/classroom/ClassroomOffersScreen';
import ClassroomBooksScreen from '../screens/classroom/ClassroomBooksScreen';
import ClassroomStreamScreen from '../screens/classroom/ClassroomStreamScreen';
import ClassroomClassworkScreen from '../screens/classroom/ClassroomClassworkScreen';
import ClassroomGradesScreen from '../screens/classroom/ClassroomGradesScreen';
import ClassroomTodoScreen from '../screens/classroom/ClassroomTodoScreen';
import ClassroomStudentMapsScreen from '../screens/classroom/ClassroomStudentMapsScreen';
import ClassroomMembersScreen from '../screens/classroom/ClassroomMembersScreen';
import ClassroomInviteScreen from '../screens/classroom/ClassroomInviteScreen';
import ClassroomApprovalsScreen from '../screens/classroom/ClassroomApprovalsScreen';
import ModuleIntroHost from './ModuleIntroHost';
import HelpTarget from './HelpTarget';

const TITLES = {
  home: 'Hjem',
  stream: 'Strøm',
  messages: 'Beskjeder',
  classwork: 'Klassearbeid',
  todo: 'Å gjøre',
  grades: 'Karakterer',
  timetable: 'Timeplan',
  lessonPlans: 'Undervisningsplan',
  subjects: 'Fag',
  groups: 'Grupper',
  seating: 'Sitteplan',
  offers: 'Undervisningstilbud',
  books: 'Pensum og bøker',
  maps: 'Elevmapper',
  members: 'Lærere og elever',
  approvals: 'Godkjenninger',
  invite: 'Klassekode',
  classrooms: 'Klasser',
};

function classroomTitle(t, tab) {
  const map = {
    home: t('classroom.home'),
    stream: t('classroom.stream'),
    messages: t('classroom.stream'),
    classwork: t('classroom.classwork'),
    todo: t('classroom.todo'),
    grades: t('classroom.grades'),
    timetable: t('classroom.timetable'),
    lessonPlans: t('classroom.lessonPlans'),
    subjects: t('classroom.subjects'),
    groups: t('classroom.groups'),
    seating: t('classroom.seating'),
    offers: t('classroom.offers'),
    books: t('classroom.books'),
    maps: t('classroom.studentFolders'),
    members: t('classroom.teachersStudents'),
    approvals: t('classroom.approvals'),
    invite: t('classroom.classCode'),
    classrooms: t('classroom.myClasses'),
  };
  return map[tab] || t('classroom.sectionClassroom');
}

export default function ClassroomShell() {
  const nav = useNavigation();
  const route = useRoute();
  const { t } = useI18n();
  const tabs = useMemo(() => buildClassroomTabs(t), [t]);
  const { familyId, family, uid, selectFamily } = useApp();
  const initial = route.params?.module === 'messages' ? 'stream' : (route.params?.module || 'stream');
  const [tab, setTab] = useState(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roomDoc, setRoomDoc] = useState(family);
  const [staff, setStaff] = useState([]);

  const classroom = roomDoc || family;
  const isAdmin = isClassroomAdmin(classroom, uid, staff);

  useEffect(() => {
    if (!route.params?.module) return;
    setTab(route.params.module === 'messages' ? 'stream' : route.params.module);
  }, [route.params?.module]);

  useEffect(() => {
    if (!familyId) return undefined;
    return onSnapshot(doc(db, 'families', familyId), (snap) => {
      if (snap.exists()) setRoomDoc({ id: snap.id, ...snap.data() });
    });
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return onSnapshot(collection(db, 'families', familyId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setTab('classrooms');
      return;
    }
    if (family?.type && !isClassroomType(family.type)) {
      openPlatformHome(nav, family);
    }
  }, [familyId, family?.id, family?.type, nav]);

  const openRoom = (id) => {
    selectFamily(id);
    setTab('stream');
  };

  const body = useMemo(() => {
    if (!familyId || tab === 'classrooms') {
      return <ClassroomClassroomsScreen embedded onOpenClassroom={openRoom} />;
    }
    if (tab === 'stream' || tab === 'messages') {
      return <ClassroomStreamScreen classroomId={familyId} classroom={classroom} />;
    }
    if (tab === 'classwork') return <ClassroomClassworkScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'todo') return <ClassroomTodoScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'grades') return <ClassroomGradesScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'timetable') return <ClassroomTimetableScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'lessonPlans') return <ClassroomLessonPlanScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'subjects') return <ClassroomSubjectsScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'groups') return <ClassroomGroupsScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'seating') return <ClassroomSeatingScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'offers') return <ClassroomOffersScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'books') return <ClassroomBooksScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'maps') return <ClassroomStudentMapsScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'members') return <ClassroomMembersScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'approvals') return <ClassroomApprovalsScreen classroomId={familyId} classroom={classroom} />;
    if (tab === 'invite') return <ClassroomInviteScreen classroomId={familyId} classroom={classroom} />;
    return <ClassroomHomeScreen classroomId={familyId} classroom={classroom} onSelectTab={setTab} />;
  }, [tab, familyId, classroom?.id, classroom?.name, classroom?.joinCode, classroom?.school, classroom?.grade]);

  const addPress = () => {
    if (tab === 'classrooms') {
      return () => nav.navigate('ClassroomCreate');
    }
    if (!familyId || !isAdmin) return undefined;
    if (tab === 'home' || tab === 'members' || tab === 'invite') {
      return () => nav.navigate('ClassroomAddStudents', { classroomId: familyId, classroom });
    }
    if (tab === 'stream' || tab === 'messages') {
      return () => nav.navigate('ClassroomComposeMessage', { classroomId: familyId, classroom });
    }
    if (tab === 'classwork') {
      return () => nav.navigate('ClassroomClassworkEditor', {
        classroomId: familyId, classroom, type: 'assignment',
      });
    }
    if (tab === 'timetable' || tab === 'lessonPlans' || tab === 'subjects' || tab === 'groups' || tab === 'seating' || tab === 'offers' || tab === 'books') {
      return 'module';
    }
    return undefined;
  };

  const addHandler = addPress();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <ClassroomHeader
        title={classroomTitle(t, tab)}
        classroomName={tab === 'classrooms' ? undefined : classroom?.name}
        onMenuPress={() => setDrawerOpen(true)}
        rightLabel={tab === 'members' && isAdmin ? 'Inviter' : (tab === 'home' ? 'Strøm' : 'Hjem')}
        rightIcon={tab === 'members' && isAdmin ? 'person-add-outline' : (tab === 'home' ? 'chatbubbles-outline' : 'home-outline')}
        onRightPress={
          tab === 'members' && familyId && isAdmin
            ? () => nav.navigate('ClassroomAddStaff', { classroomId: familyId, classroom })
            : () => setTab(tab === 'home' ? 'stream' : 'home')
        }
        addIcon={tab === 'stream' || tab === 'messages' ? 'megaphone' : 'add'}
        addLabel={tab === 'stream' || tab === 'messages' ? 'Ny kunngjøring' : 'Legg til'}
        onAddPress={
          addHandler === 'module'
            ? undefined
            : addHandler
        }
      />

      <View style={styles.body}>
        {body}
        <ModuleIntroHost scope="classroom" moduleId={tab} />
      </View>

      <HelpTarget id="tabs">
        <View style={styles.tabBar}>
          {tabs.map((item) => {
            const on = tab === item.id || (item.id === 'stream' && tab === 'messages');
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.tabItem, on && styles.tabItemOn]}
                onPress={() => setTab(item.id)}
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={on ? item.icon : `${item.icon}-outline`}
                  size={22}
                  color={on ? c.brand : c.muted}
                />
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </HelpTarget>

      <ClassroomDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeTab={tab === 'messages' ? 'stream' : tab}
        onSelectTab={setTab}
        classroom={classroom}
        staff={staff}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, minHeight: 0, position: 'relative' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.tabBar,
    paddingTop: 6,
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, borderRadius: 14, marginHorizontal: 2,
  },
  tabItemOn: { backgroundColor: c.brandSoft },
  tabLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: c.muted },
  tabLabelOn: { color: c.brand },
});
