/**
 * Utstyrskalenderen: samme visning som Kalender, men bare med firmautstyret.
 * Ingen private eller tilkoblede kalendere vises her.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import OutlookCalendar from '../OutlookCalendar';
import { addDays, dateKey, getISOWeek, monthGrid, startOfWeekMonday } from '../../src/utils/dates';
import { eventOccursOnDate } from '../../src/utils/events';
import {
  equipmentCalendarGroup,
  equipmentEventsFromBookings,
  equipmentGroupLayerId,
  withEquipmentChecks,
} from '../../src/equipment/calendars';

const VIEWS = [
  { id: 'day', label: 'Dag' },
  { id: 'week', label: 'Uke' },
  { id: 'month', label: 'Måned' },
];

export default function EquipmentCalendar({
  familyId,
  state,
  employees,
  viewer,
  manage = false,
  canBook = false,
  employeeId = '',
}) {
  const nav = useNavigation();
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(() => new Date());
  // Alt utstyr er huket av fra start. Her er det bare utstyr å se på.
  const [hidden, setHidden] = useState(() => new Set());

  const group = useMemo(() => equipmentCalendarGroup({
    equipment: state?.equipment,
    employees,
    viewer,
    manage,
  }), [state, employees, viewer, manage]);

  const shownIds = useMemo(
    () => new Set((group?.children || []).map((child) => child.id).filter((id) => !hidden.has(id))),
    [group, hidden],
  );
  const calendars = useMemo(() => {
    const gear = withEquipmentChecks(group, shownIds);
    return gear ? [gear] : [];
  }, [group, shownIds]);

  const toggleCal = useCallback((id) => {
    const ids = (group?.children || []).map((child) => child.id);
    setHidden((prev) => {
      const next = new Set(prev);
      if (id === equipmentGroupLayerId()) {
        const allOn = ids.every((layerId) => !next.has(layerId));
        ids.forEach((layerId) => (allOn ? next.add(layerId) : next.delete(layerId)));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [group]);

  const events = useMemo(() => {
    const layerById = new Map((group?.children || []).map((child) => [child.equipmentId, child.id]));
    return equipmentEventsFromBookings(state?.equipmentBookings, state?.equipment)
      .filter((e) => shownIds.has(layerById.get(e.equipmentId)));
  }, [state, group, shownIds]);

  const itemsForDay = useCallback((d) => {
    const k = dateKey(d);
    const ev = events
      .filter((e) => eventOccursOnDate(e, d))
      .map((e) => ({ ...e, occurrenceDateKey: k }))
      .sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
    return { ev };
  }, [events]);

  const weekDays = useMemo(() => {
    const mon = startOfWeekMonday(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [anchor]);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);

  // Med bare ett utstyr huket av, er det forhåndsvalgt i bookingen.
  const presetEquipmentIds = useMemo(() => {
    const shown = (group?.children || []).filter((child) => shownIds.has(child.id));
    return shown.length === 1 ? [shown[0].equipmentId] : [];
  }, [group, shownIds]);

  const openEventForm = useCallback((e) => {
    nav.navigate('EventForm', {
      familyId,
      equipmentBookingId: e.equipmentBookingId,
      equipmentIds: e.equipmentId ? [e.equipmentId] : [],
      event: {
        source: 'equipment',
        equipmentBookingId: e.equipmentBookingId,
        equipmentIds: e.equipmentId ? [e.equipmentId] : [],
        title: e.bookingPurpose || e.title,
        dateKey: e.dateKey,
        endDateKey: e.endDateKey || e.dateKey,
        startTime: e.startTime,
        endTime: e.endTime,
        place: e.place,
        recurring: e.recurring,
        recurrenceType: e.recurrenceType,
        recurrenceInterval: e.recurrenceInterval,
        recurrenceByDays: e.recurrenceByDays,
        recurrenceUntilKey: e.recurrenceUntilKey,
        readOnly: !(manage || (e.employeeId && employeeId && e.employeeId === employeeId)),
      },
    });
  }, [nav, familyId, manage, employeeId]);

  const canBookHere = canBook && !!group;

  return (
    <OutlookCalendar
      mode={mode}
      setMode={setMode}
      anchor={anchor}
      setAnchor={setAnchor}
      weekDays={weekDays}
      grid={grid}
      iso={getISOWeek(anchor)}
      itemsForDay={itemsForDay}
      canManageEvent={() => false}
      canOpenEvent={() => true}
      openEventForm={openEventForm}
      onCreateEvent={canBookHere ? (k, opts = {}) => nav.navigate('EventForm', {
        familyId,
        dateKey: k,
        startTime: opts.startTime,
        endTime: opts.endTime,
        allDay: opts.allDay,
        equipmentIds: presetEquipmentIds,
      }) : undefined}
      isParent={false}
      canCreateCalendarEvent={canBookHere}
      showCalendarSettings={false}
      calendars={calendars}
      hiddenCals={new Set()}
      onToggleCal={toggleCal}
      paneTitle="Bedriftens utstyr"
      views={VIEWS}
      showTaskPane={false}
    />
  );
}
