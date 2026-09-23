// scripts/populateTemplateTasks.js

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import serviceAccount from './path/to/serviceAccountKey.json'; // Endre sti til din fil!

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function seedTemplates() {
  const tasks = [
    {
      title: 'Rydd rommet',
      description: 'Plukk opp leker',
      rewardValue: 5,
      days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    },
    {
      title: 'Les 20 minutter',
      description: 'Les bok',
      rewardValue: 3,
      days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
    },
    // Legg til flere tasks om du vil
  ];

  const batch = db.batch();
  const templatesRef = db.collection('templates'); // NY: egen collection

  tasks.forEach((task, i) => {
    const docRef = templatesRef.doc(); // auto-ID
    batch.set(docRef, {
      ...task,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  console.log('Templates seeded!');
}

seedTemplates().catch(console.error);
