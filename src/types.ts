// src/types.ts

import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  role: 'parent' | 'child';
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface Child {
  id: string;
  parentIds: string[];       // UID-er til foresatte
  name: string;
  birthday: Timestamp;       // bruker Firestore Timestamp
  createdAt: Timestamp;
  custody?: CustodySchedule;
}

export type CustodyMode = 'alternating_weeks' | 'weekly' | 'two_week_cycle';
export type CustodyParentSlot = 'parentA' | 'parentB';

export interface CustodyRule {
  id: string;
  parentSlot: CustodyParentSlot;
  label?: string;
  dateKey: string;
  recurring: boolean;
  recurrenceType?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrenceInterval?: number;
  recurrenceByDays?: number[];
  recurrenceUntilKey?: string | null;
}

export interface CustodySchedule {
  enabled: boolean;
  parentAUid?: string | null;
  parentBUid?: string | null;
  parentALabel?: string | null;
  parentBLabel?: string | null;
  myParentSlot?: CustodyParentSlot;
  rules?: CustodyRule[];
}

export interface WeekPlan {
  id: string;
  childId: string;
  weekNumber: number;
  year: number;
  templateId?: string;
  createdAt: Timestamp;
}

export interface Task {
  id: string;
  planId: string;
  label: string;
  iconUrl?: string;
  rewardValue: number;
  repeatPattern: string;     // f.eks. "Man-Fre" eller cron‐lignende streng
}

export interface Progress {
  id: string;
  taskId: string;
  date: Timestamp;
  done: boolean;
}
