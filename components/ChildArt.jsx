import React, { useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';

export const CHILD_ART = {
  heroDay: require('../assets/child-home/hero-day.webp'),
  heroKindergarten: require('../assets/child-home/hero-kindergarten.webp'),
  heroSchoolLavender: require('../assets/child-home/hero-school-lavender.webp'),
  heroSchoolNavy: require('../assets/child-home/hero-school-navy.webp'),
  heroPlay: require('../assets/child-home/hero-play.webp'),
  heroSport: require('../assets/child-home/hero-sport.webp'),
  heroHobbies: require('../assets/child-home/hero-hobbies.webp'),
  heroHome: require('../assets/child-home/hero-home.webp'),
  heroBedtime: require('../assets/child-home/hero-bedtime.webp'),
  heroSchool: require('../assets/child-home/hero-school.webp'),
  heroLekser: require('../assets/child-home/hero-lekser.webp'),
  heroLeksehjelp: require('../assets/child-home/hero-leksehjelp.webp'),
  heroMattehjelp: require('../assets/child-home/hero-mattehjelp.webp'),
  heroWeekPlan: require('../assets/child-home/hero-week-plan.png'),
  school: require('../assets/child-home/school.webp'),
  schoolAfter: require('../assets/child-home/school-after.webp'),
  sport: require('../assets/child-home/sport.webp'),
  bottle: require('../assets/child-home/bottle.webp'),
  homework: require('../assets/child-home/homework.webp'),
  book: require('../assets/child-home/book.webp'),
  books: require('../assets/child-home/books.webp'),
  wishes: require('../assets/child-home/wishes.webp'),
  backpack: require('../assets/child-home/backpack.webp'),
  apps: require('../assets/child-home/apps.webp'),
  star: require('../assets/child-home/star.webp'),
  appActivities: require('../assets/child-home/app-activities.webp'),
  appFamilyTree: require('../assets/child-home/app-family-tree.webp'),
  appLocation: require('../assets/child-home/app-location.webp'),
  appChores: require('../assets/child-home/app-chores.webp'),
  appNotes: require('../assets/child-home/app-notes.webp'),
  appTravel: require('../assets/child-home/app-travel.webp'),
  appTasks: require('../assets/child-home/app-calendar.webp'),
  appPiggyBank: require('../assets/child-home/app-stars.webp'),
  appProgress: require('../assets/child-home/app-progress.webp'),
  appBedtime: require('../assets/child-home/app-chat.webp'),
  appWishes: require('../assets/child-home/app-wishes.webp'),
  appPlan: require('../assets/child-home/app-plan.webp'),
  appDocuments: require('../assets/child-home/app-documents.webp'),
  appChat: require('../assets/child-home/app-chat-bubbles.webp'),
  appGames: require('../assets/child-home/app-games.webp'),
  appLekser: require('../assets/child-home/app-lekser.webp'),
  appLeksehjelp: require('../assets/child-home/app-leksehjelp.webp'),
  appMattehjelp: require('../assets/child-home/app-mattehjelp.webp'),
  appWeekPlan: require('../assets/child-home/app-week-plan.webp'),
  appRememberDates: require('../assets/child-home/app-remember-dates.webp'),
};

const WEB_FALLBACK = {
  heroDay: '/child-home/hero-day.webp',
  heroKindergarten: '/child-home/hero-kindergarten.webp',
  heroSchoolLavender: '/child-home/hero-school-lavender.webp',
  heroSchoolNavy: '/child-home/hero-school-navy.webp',
  heroPlay: '/child-home/hero-play.webp',
  heroSport: '/child-home/hero-sport.webp',
  heroHobbies: '/child-home/hero-hobbies.webp',
  heroHome: '/child-home/hero-home.webp',
  heroBedtime: '/child-home/hero-bedtime.webp',
  heroSchool: '/child-home/hero-school.webp',
  heroLekser: '/child-home/hero-lekser.webp',
  heroLeksehjelp: '/child-home/hero-leksehjelp.webp',
  heroMattehjelp: '/child-home/hero-mattehjelp.webp',
  heroWeekPlan: '/child-home/hero-week-plan.png',
  school: '/child-home/school.webp',
  schoolAfter: '/child-home/school-after.webp',
  sport: '/child-home/sport.webp',
  bottle: '/child-home/bottle.webp',
  homework: '/child-home/homework.webp',
  book: '/child-home/book.webp',
  books: '/child-home/books.webp',
  wishes: '/child-home/wishes.webp',
  backpack: '/child-home/backpack.webp',
  apps: '/child-home/apps.webp',
  star: '/child-home/star.webp',
  appActivities: '/child-home/app-activities.webp',
  appFamilyTree: '/child-home/app-family-tree.webp',
  appLocation: '/child-home/app-location.webp',
  appChores: '/child-home/app-chores.webp',
  appNotes: '/child-home/app-notes.webp',
  appTravel: '/child-home/app-travel.webp',
  appTasks: '/child-home/app-calendar.webp',
  appPiggyBank: '/child-home/app-stars.webp',
  appProgress: '/child-home/app-progress.webp',
  appBedtime: '/child-home/app-chat.webp',
  appWishes: '/child-home/app-wishes.webp',
  appPlan: '/child-home/app-plan.webp',
  appDocuments: '/child-home/app-documents.webp',
  appChat: '/child-home/app-chat-bubbles.webp',
  appGames: '/child-home/app-games.webp',
  appLekser: '/child-home/app-lekser.webp',
  appLeksehjelp: '/child-home/app-leksehjelp.webp',
  appMattehjelp: '/child-home/app-mattehjelp.webp',
  appWeekPlan: '/child-home/app-week-plan.webp',
  appRememberDates: '/child-home/app-remember-dates.webp',
};

export default function ChildArt({
  name,
  style,
  resizeMode = 'contain',
  ...rest
}) {
  const bundled = CHILD_ART[name];
  const [failed, setFailed] = useState(false);
  if (!bundled && !WEB_FALLBACK[name]) return null;
  const source = failed && Platform.OS === 'web' && WEB_FALLBACK[name]
    ? { uri: WEB_FALLBACK[name] }
    : bundled;
  return (
    <Image
      source={source}
      style={[styles.img, style]}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: 'transparent' },
});
