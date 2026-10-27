/**
 * Utstyr: en liste for bedriften, en for det du eier privat, og registrering for seg.
 * Kjøretøy slås opp hos Vegvesenet. Bedriftens enheter reserveres i kalenderen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useShellWide } from '../../components/ModuleAside';
import OptionPicker from '../../components/OptionPicker';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { showSaveToast } from '../../src/ui/saveToast';
import { emptyProjectState } from '../../src/project/engine';
import {
  loadProjectState,
  patchProjectOperations,
  putProjectState,
  saveProjectState,
} from '../../src/project/storage';
import { watchEmployees } from '../../src/employees/storage';
import { displayName, ownEmployee } from '../../src/employees/model';
import { EQUIPMENT_GROUPS, EQUIPMENT_STATUSES, equipmentGroup } from '../../src/equipment/catalog';
import { employeeMayBook, employeeMaySeeGear } from '../../src/equipment/calendars';
import { pickableProjects } from '../../src/project/myProjects';
import {
  bookingsOnDate,
  normalizeEquipment,
  vehicleTitle,
} from '../../src/equipment/model';
import {
  cancelBooking,
  patchRowsById,
  removeEquipment,
  removePersonalVehicle,
  setEquipmentBookingPolicy,
  upsertBooking,
  upsertEquipment,
  upsertPersonalVehicle,
} from '../../src/equipment/state';
import EquipmentBookingAccess from '../../components/equipment/EquipmentBookingAccess';
import EquipmentCalendar from '../../components/equipment/EquipmentCalendar';
import { useLayout } from '../../src/theme';
import { mileageProjectOptions, vehicleOdometer } from '../../src/mileage/flow';
import { lookupVehicleByReg } from '../../src/utils/vegvesenLookupClient';
import { feeClassFromSignals, feeClassLabel, VEHICLE_FEE_CLASSES } from '../../src/mileage/vehicleFee';

const WEEKDAYS = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function Field({ label, value, onChange, colors, placeholder, keyboardType }) {
  return (
    <View style={{ minWidth: 140, flexGrow: 1, flexBasis: 160 }}>
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType || 'default'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function CarOdometer({ car, trips, colors, onSave }) {
  const reading = vehicleOdometer(car, trips);
  const [on, setOn] = useState(!!car.trackOdometer);
  const [start, setStart] = useState(car.odometerStart ? String(car.odometerStart) : '');
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      <Text style={{ color: colors.ink, fontSize: 13 }}>
        {reading ? `Kilometerstand ${reading.current} km` : 'Kilometertelling er av'}
      </Text>
      <TouchableOpacity
        onPress={() => setOn((value) => !value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
      >
        <Text style={{ color: colors.ink }}>{on ? 'Tell kilometer er på' : 'Tell kilometer'}</Text>
      </TouchableOpacity>
      {on ? (
        <Field
          label="Start kilometerstand"
          value={start}
          onChange={setStart}
          colors={colors}
          placeholder="0"
          keyboardType="decimal-pad"
        />
      ) : null}
      <TouchableOpacity
        onPress={() => onSave({
          trackOdometer: on,
          odometerStart: start,
          odometerSince: on && !car.odometerSince ? todayKey() : (car.odometerSince || ''),
        })}
        style={[styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]}
      >
        <Text style={{ color: colors.ink }}>Lagre kilometerstand</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chip({ label, active, onPress, colors, nativeID }) {
  return (
    <TouchableOpacity onPress={onPress} nativeID={nativeID} style={[styles.chip, { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? `${colors.brand}18` : colors.card }]}>
      <Text style={{ color: colors.ink, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function monthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const pad = (first.getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array(pad).fill(null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function dateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const EMPTY_GEAR = {
  name: '', group: 'utstyr', category: 'annet', scope: 'company', plate: '', serial: '',
  make: '', model: '', year: '', fuel: '', electric: false, feeClass: 'lett', feeSource: 'manual', location: '',
  status: 'available', purchasedAt: '', warrantyUntil: '', warrantyVendor: '', warrantyNote: '', warrantyUri: '', notes: '',
  vegvesenSummary: '', ownerEmployeeId: '', ownerName: '',
  trackOdometer: false, odometerStart: '', odometerSince: '',
};

function categoryForGroup(group) {
  if (group === 'kjoretoy') return 'poolbil';
  if (group === 'rom') return 'rom';
  return 'annet';
}

export default function EquipmentScreen() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, user, uid, activeProfile } = useApp();
  const access = useCompanyAccess();
  const { isDesktop } = useLayout();
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [tab, setTab] = useState('bedrift');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [gear, setGear] = useState(EMPTY_GEAR);
  const [formOpen, setFormOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState('');
  const [bookingGearId, setBookingGearId] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [purpose, setPurpose] = useState('Prosjekt');
  const [projectQuery, setProjectQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lookupNote, setLookupNote] = useState('');
  const loadedRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      loadedRef.current = loaded;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (!ready) return;
    // Nettopp lastet: ikke skriv tilbake, da kan en eldre kopi overskrive nyere endringer.
    if (state === loadedRef.current) return;
    // Minnet oppdateres med en gang, så en ny visning (f.eks. «Vis som») ser endringen.
    putProjectState(state, familyId);
    saveProjectState(state, familyId).catch((cause) => {
      setError(`Kunne ikke lagre utstyret. ${String(cause?.message || '')}`.trim());
    });
  }, [state, ready, familyId]);

  // Bookinger lagres fra hendelsesskjemaet. Hent på nytt når vi kommer tilbake,
  // så kalenderen viser dem og vi ikke skriver over med en eldre kopi.
  useFocusEffect(useCallback(() => {
    if (!ready) return undefined;
    let live = true;
    loadProjectState(familyId, { force: true }).then((loaded) => {
      if (!live || !loaded) return;
      loadedRef.current = loaded;
      setState(loaded);
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId, ready]));

  const deskCalendar = isDesktop && tab === 'kalender' && !formOpen;
  useShellWide(deskCalendar);

  useEffect(() => watchEmployees(familyId, (rows) => setEmployees(rows || [])), [familyId]);

  // Utstyr i tilgangsstyringen: Lese = se, begrenset redigering = registrere,
  // endre og reservere, Admin = også slette og styre hvem som kan reservere.
  const rights = !access.ready
    ? 'read'
    : access.canAdmin('equipment') ? 'admin' : access.canEdit('equipment') ? 'edit' : 'read';
  const canManage = rights !== 'read';
  const canDelete = rights === 'admin';
  const canEditAccess = rights === 'admin';
  // «Se som bruker»: siden følger personen som vises.
  const me = access.previewing && access.viewingAs
    ? employees.find((row) => row.id === access.viewingAs.id) || access.viewingAs
    : ownEmployee(employees, {
      uid: uid || '',
      emails: [user?.email, activeProfile?.email].filter(Boolean),
      name: activeProfile?.name || user?.displayName || '',
    });
  const employeeId = me?.id || uid || '';
  const employeeName = me ? displayName(me) : (activeProfile?.name || user?.displayName || 'Ansatt');
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = monthCells(year, monthIndex);
  const equipment = (state.equipment || []).map(normalizeEquipment);
  // Uten Admin vises bare bedriftsutstyr personen har rettighet på i Tilgang.
  const companyGear = equipment.filter((row) => row.scope !== 'private'
    && (rights === 'admin' || employeeMaySeeGear(row, me)));
  const companyGearIds = new Set(companyGear.map((row) => row.id));
  const privateGear = equipment.filter((row) => row.scope === 'private' && row.ownerEmployeeId === employeeId);
  const privatePlates = new Set(privateGear.map((row) => row.plate).filter(Boolean));
  const looseCars = (state.personalVehicles || []).filter((row) => (
    row.employeeId === employeeId && row.plate && !privatePlates.has(String(row.plate).toUpperCase())
  ));

  function matches(blob) {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return blob.toLowerCase().includes(needle);
  }

  const visibleCompany = companyGear.filter((row) => matches(
    `${row.name} ${row.plate} ${row.serial} ${row.location} ${equipmentGroup(row.group).label}`,
  ));
  const visiblePrivate = privateGear.filter((row) => matches(
    `${row.name} ${row.plate} ${row.serial} ${row.location} ${equipmentGroup(row.group).label}`,
  ));
  const visibleCars = looseCars.filter((row) => matches(`${vehicleTitle(row)} ${row.plate} ${row.make}`));
  const dayBookings = bookingsOnDate(state.equipmentBookings, selectedDate)
    .filter((row) => companyGearIds.has(row.equipmentId));
  const projects = useMemo(
    // Prosjektvelgeren: Admin på Prosjekt ser alle, ellers egne og åpne prosjekter.
    () => mileageProjectOptions(
      access.ready && access.canAdmin('projects')
        ? state
        : { ...state, projects: pickableProjects(state, me, employees, { keepId: projectId }) },
      employeeId,
      { query: projectQuery },
    ),
    [state, employeeId, projectQuery, access, me, employees, projectId],
  );

  // Utstyr og egne biler skrives rett inn i skyens ferske kopi, og vi venter på svar.
  // Ellers kan en eldre kopi overskrive endringen, og en feil forsvinner i stillhet.
  async function syncEquipment(result) {
    if (!result.ok) {
      setError(result.error);
      return result;
    }
    const before = state;
    const after = result.state;
    const onto = (base) => ({
      equipment: patchRowsById(base.equipment, before.equipment, after.equipment),
      personalVehicles: patchRowsById(base.personalVehicles, before.personalVehicles, after.personalVehicles),
    });
    setState(after);
    setError('');
    const remote = await patchProjectOperations(familyId, onto);
    if (!remote?.ok) {
      const reason = String(remote?.error?.message || remote?.error?.code || '');
      setError(`Endringen ble ikke lagret i skyen.${reason ? ` ${reason}` : ''} Prøv igjen.`);
      return { ...result, ok: false };
    }
    // En ny lasting underveis kan ha hentet en eldre kopi. Legg endringen inn igjen.
    setState((current) => (current === after ? current : { ...current, ...onto(current) }));
    showSaveToast('Lagret.');
    return result;
  }

  function commit(result) {
    setError(result.ok ? '' : result.error);
    if (result.ok) {
      setState(result.state);
      showSaveToast('Lagret.');
    }
    return result;
  }

  function openForm(scope, existing) {
    setError('');
    setLookupNote('');
    setGear(existing ? { ...EMPTY_GEAR, ...normalizeEquipment(existing) } : {
      ...EMPTY_GEAR,
      scope,
      group: 'kjoretoy',
      category: 'poolbil',
      ownerEmployeeId: scope === 'private' ? employeeId : '',
      ownerName: scope === 'private' ? employeeName : '',
    });
    setFormOpen(true);
  }

  function closeForm() {
    setGear(EMPTY_GEAR);
    setFormOpen(false);
    setLookupNote('');
  }

  async function lookupPlate() {
    setLookupNote('');
    try {
      const hit = await lookupVehicleByReg(gear.plate);
      setGear((row) => ({
        ...row,
        plate: hit.regNumber || row.plate,
        name: row.name || hit.title || (row.scope === 'private' ? 'Min bil' : 'Kjøretøy'),
        make: hit.make || row.make,
        model: hit.model || row.model,
        year: hit.year || row.year,
        fuel: hit.fuelLabel || row.fuel,
        feeClass: feeClassFromSignals({
          electric: hit.fuelType === 'electric',
          fuel: hit.fuelLabel,
          fuelType: hit.fuelType,
          vehicleType: hit.vehicleType,
          tekniskKode: hit.tekniskKode,
          totalWeight: hit.totalWeight,
        }),
        feeSource: 'vegvesen',
        electric: hit.fuelType === 'electric',
        vegvesenSummary: hit.summaryLine || '',
        notes: row.notes || hit.summaryLine || '',
      }));
      setLookupNote(hit.summaryLine || 'Opplysninger hentet.');
      setError('');
    } catch (err) {
      setError(err?.message || 'Klarte ikke slå opp skiltnummeret.');
    }
  }

  function saveGear() {
    const scope = gear.scope === 'private' ? 'private' : 'company';
    if (scope === 'company' && !canManage) return;
    // Tilgangen lagres med utstyret. Bare Admin kan endre den.
    const stored = gear.id ? equipment.find((row) => row.id === gear.id) : null;
    const policy = canEditAccess || !stored ? gear : stored;
    const selected = policy.bookingAccess === 'selected';
    let next = upsertEquipment(state, {
      ...gear,
      bookingAccess: selected ? 'selected' : 'active',
      bookingEmployeeIds: selected ? policy.bookingEmployeeIds : [],
      allowRepeating: policy.allowRepeating !== false,
      scope,
      ownerEmployeeId: scope === 'private' ? (gear.ownerEmployeeId || employeeId) : '',
      ownerName: scope === 'private' ? (gear.ownerName || employeeName) : '',
    });
    if (!next.ok) {
      setError(next.error);
      return;
    }
    const saved = next.equipment;
    if (scope === 'private' && saved.group === 'kjoretoy' && saved.plate) {
      next = upsertPersonalVehicle(next.state, {
        employeeId,
        employeeName,
        plate: saved.plate,
        nickname: saved.name,
        make: saved.make,
        model: saved.model,
        year: saved.year,
        fuel: saved.fuel,
        electric: saved.electric,
        feeClass: saved.feeClass,
        feeSource: saved.feeSource,
        vegvesenSummary: saved.vegvesenSummary || saved.notes,
        trackOdometer: saved.trackOdometer,
        odometerStart: saved.odometerStart,
        odometerSince: saved.odometerSince,
      });
      if (!next.ok) {
        setError(next.error);
        return;
      }
    }
    syncEquipment(next);
    closeForm();
  }

  function deleteGear(item) {
    if (item.scope !== 'private' && !canDelete) return;
    let next = removeEquipment(state, item.id);
    if (!next.ok) {
      setError(next.error);
      return;
    }
    if (item.scope === 'private' && item.plate) {
      const car = (next.state.personalVehicles || []).find((row) => (
        row.employeeId === employeeId && String(row.plate).toUpperCase() === item.plate
      ));
      if (car) next = removePersonalVehicle(next.state, car.id);
    }
    syncEquipment(next);
  }

  function saveBooking() {
    if (!canManage) return;
    const item = companyGear.find((row) => row.id === bookingGearId);
    const project = (state.projects || []).find((row) => row.id === projectId);
    commit(upsertBooking(state, {
      equipmentId: bookingGearId,
      equipmentName: item?.name || '',
      employeeId,
      employeeName,
      projectId: project?.id || '',
      projectName: project ? `#${project.number || ''} ${project.name}` : '',
      date: selectedDate,
      startTime,
      endTime,
      purpose,
      enforceAccess: true,
      manage: canEditAccess,
      employees,
    }));
  }

  function renderGear(row) {
    const group = equipmentGroup(row.group);
    return (
      <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.name}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {group.label}
          {row.plate ? ` · ${row.plate}` : ''}
          {row.serial ? ` · ${row.serial}` : ''}
          {row.location ? ` · ${row.location}` : ''}
          {row.group === 'kjoretoy' && feeClassLabel(feeClassFromSignals(row)) ? ` · ${feeClassLabel(feeClassFromSignals(row))}` : ''}
          {row.scope !== 'private' ? ` · ${EQUIPMENT_STATUSES.find((status) => status.id === row.status)?.label || row.status}` : ''}
        </Text>
        {row.warrantyUntil ? (
          <Text style={{ color: colors.ink, fontSize: 12 }}>
            Garanti til {row.warrantyUntil}{row.warrantyVendor ? ` · ${row.warrantyVendor}` : ''}
          </Text>
        ) : null}
        {row.group === 'kjoretoy' && row.trackOdometer ? (
          <Text style={{ color: colors.ink, fontSize: 12 }}>
            Kilometerstand {vehicleOdometer(row, state.mileageTrips)?.current ?? row.odometerStart} km
          </Text>
        ) : null}
        {(row.scope === 'private' || canManage) ? (
          <View style={styles.row}>
            <TouchableOpacity onPress={() => openForm(row.scope, row)} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Rediger</Text>
            </TouchableOpacity>
            {row.scope === 'private' || canDelete ? (
            <TouchableOpacity onPress={() => deleteGear(row)} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Slett</Text>
            </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Laster…</Text>
      </View>
    );
  }

  const showRegister = tab === 'privat' || canManage;
  // Kalenderen fyller hele flaten. Da ruller den selv, ikke siden.
  const Body = deskCalendar ? View : ScrollView;
  const bodyProps = deskCalendar
    ? { style: [styles.wrap, styles.wrapFill, { backgroundColor: colors.bg }] }
    : { style: [styles.wrap, { backgroundColor: colors.bg }], contentContainerStyle: { padding: 16, gap: 12 }, keyboardShouldPersistTaps: 'handled' };

  return (
    <Body {...bodyProps}>
      {hostedHero ? null : <Text style={styles.title}>Utstyr</Text>}
      <View style={styles.row}>
        <Chip nativeID="equipment-tab-bedrift" label="Bedrift" active={tab === 'bedrift' && !formOpen} onPress={() => { setTab('bedrift'); closeForm(); setQuery(''); }} colors={colors} />
        <Chip nativeID="equipment-tab-privat" label="Privat" active={tab === 'privat' && !formOpen} onPress={() => { setTab('privat'); closeForm(); setQuery(''); }} colors={colors} />
        <Chip nativeID="equipment-tab-kalender" label="Kalender" active={tab === 'kalender' && !formOpen} onPress={() => { setTab('kalender'); closeForm(); }} colors={colors} />
      </View>
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      {rights === 'admin' || !access.ready || tab === 'privat' ? null : (
        <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="equipment-rights">
          {canManage
            ? 'Du kan registrere, endre og reservere utstyr, men ikke slette det.'
            : 'Du har lesetilgang. Bedriftens utstyr kan ses, men ikke endres eller reserveres.'}
        </Text>
      )}

      {formOpen ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {gear.id ? 'Rediger' : 'Registrer'} {gear.scope === 'private' ? 'privat' : 'bedrift'}
          </Text>
          <View style={styles.row}>
            {EQUIPMENT_GROUPS.map((row) => (
              <Chip
                key={row.id}
                label={row.label}
                active={gear.group === row.id}
                onPress={() => setGear((current) => ({
                  ...current,
                  group: row.id,
                  category: categoryForGroup(row.id),
                }))}
                colors={colors}
              />
            ))}
          </View>
          <Field
            label="Navn"
            value={gear.name}
            onChange={(value) => setGear((row) => ({ ...row, name: value }))}
            colors={colors}
            placeholder={gear.group === 'rom' ? 'Møterom' : gear.group === 'kjoretoy' ? 'Min bil' : 'Termokamera 2'}
          />
          {gear.group === 'kjoretoy' ? (
            <View style={{ gap: 8 }}>
              <View style={styles.row}>
                <Field label="Skiltnummer" value={gear.plate} onChange={(value) => setGear((row) => ({ ...row, plate: value }))} colors={colors} placeholder="EN63224" />
                <TouchableOpacity onPress={lookupPlate} style={[styles.btn, { backgroundColor: colors.brand }]}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Hent fra Vegvesenet</Text>
                </TouchableOpacity>
              </View>
              {lookupNote ? <Text style={{ color: colors.brand, fontSize: 12 }}>{lookupNote}</Text> : null}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Gebyrgruppe for bom og ferje. Hent fra Vegvesenet, eller velg selv.
              </Text>
              <View style={styles.row}>
                {VEHICLE_FEE_CLASSES.map((row) => (
                  <Chip
                    key={row.id}
                    label={row.label}
                    active={feeClassFromSignals(gear) === row.id}
                    onPress={() => setGear((current) => ({
                      ...current,
                      feeClass: row.id,
                      feeSource: 'manual',
                      electric: row.id === 'elbil',
                    }))}
                    colors={colors}
                  />
                ))}
              </View>
              {gear.feeSource === 'vegvesen' ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>Gruppen er hentet fra Vegvesenet. Du kan endre den.</Text>
              ) : null}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {[gear.make, gear.model, gear.year].filter(Boolean).join(' ') || 'Skiltnummeret fyller inn merke og modell.'}
              </Text>
              <TouchableOpacity
                onPress={() => setGear((row) => {
                  const trackOdometer = !row.trackOdometer;
                  return {
                    ...row,
                    trackOdometer,
                    odometerSince: trackOdometer && !row.odometerSince ? todayKey() : (row.odometerSince || ''),
                  };
                })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!gear.trackOdometer }}
              >
                <Text style={{ color: colors.ink }}>
                  {gear.trackOdometer ? 'Tell kilometer er på' : 'Tell kilometer'}
                </Text>
              </TouchableOpacity>
              {gear.trackOdometer ? (
                <Field
                  label="Start kilometerstand"
                  value={gear.odometerStart === 0 || gear.odometerStart ? String(gear.odometerStart) : ''}
                  onChange={(value) => setGear((row) => ({ ...row, odometerStart: value }))}
                  colors={colors}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              ) : null}
              {gear.trackOdometer && gear.id ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Kilometerstand nå: {vehicleOdometer({
                    ...gear,
                    trackOdometer: true,
                    odometerStart: Number(String(gear.odometerStart).replace(',', '.')) || 0,
                  }, state.mileageTrips)?.current ?? 0} km
                </Text>
              ) : null}
            </View>
          ) : null}
          {gear.group === 'utstyr' ? (
            <View style={styles.row}>
              <Field label="Serienummer" value={gear.serial} onChange={(value) => setGear((row) => ({ ...row, serial: value }))} colors={colors} />
              <Field label="Plassering" value={gear.location} onChange={(value) => setGear((row) => ({ ...row, location: value }))} colors={colors} />
            </View>
          ) : null}
          {gear.group === 'rom' ? (
            <Field label="Hvor" value={gear.location} onChange={(value) => setGear((row) => ({ ...row, location: value }))} colors={colors} placeholder="1. etasje" />
          ) : null}
          {gear.scope !== 'private' ? (
            <View style={{ gap: 8 }}>
              <View style={styles.row}>
                {EQUIPMENT_STATUSES.map((row) => (
                  <Chip key={row.id} label={row.label} active={gear.status === row.id} onPress={() => setGear((current) => ({ ...current, status: row.id }))} colors={colors} />
                ))}
              </View>
              <View style={styles.row}>
                <Field label="Kjøpt" value={gear.purchasedAt} onChange={(value) => setGear((row) => ({ ...row, purchasedAt: value }))} colors={colors} placeholder="ÅÅÅÅ-MM-DD" />
                <Field label="Garanti til" value={gear.warrantyUntil} onChange={(value) => setGear((row) => ({ ...row, warrantyUntil: value }))} colors={colors} placeholder="ÅÅÅÅ-MM-DD" />
                <Field label="Garantigiver" value={gear.warrantyVendor} onChange={(value) => setGear((row) => ({ ...row, warrantyVendor: value }))} colors={colors} />
              </View>
              <Field label="Garantibevis (lenke)" value={gear.warrantyUri} onChange={(value) => setGear((row) => ({ ...row, warrantyUri: value }))} colors={colors} placeholder="https://" />
            </View>
          ) : null}
          {gear.scope !== 'private' ? (
            <EquipmentBookingAccess
              gear={gear}
              employees={employees}
              canEdit={canEditAccess}
              colors={colors}
              onChange={(patch) => {
                setGear((row) => ({ ...row, ...patch }));
                // Lagret utstyr: tilgangen lagres med en gang, ikke først ved «Lagre».
                if (!gear.id || !canEditAccess) return;
                const merged = { ...gear, ...patch };
                syncEquipment(setEquipmentBookingPolicy(state, {
                  equipmentId: gear.id,
                  bookingAccess: merged.bookingAccess,
                  bookingEmployeeIds: merged.bookingEmployeeIds,
                  allowRepeating: merged.allowRepeating,
                }));
              }}
            />
          ) : null}
          <Field label="Notat" value={gear.notes} onChange={(value) => setGear((row) => ({ ...row, notes: value }))} colors={colors} />
          <View style={styles.row}>
            <TouchableOpacity onPress={saveGear} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={closeForm} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!formOpen && tab === 'bedrift' ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Utstyr bedriften eier. Søk i listen, eller registrer noe nytt.
          </Text>
          <View style={[styles.row, { alignItems: 'flex-end' }]}>
            <Field label="Søk" value={query} onChange={setQuery} colors={colors} placeholder="Søk i listen" />
            {showRegister ? (
              <TouchableOpacity onPress={() => openForm('company')} style={[styles.btn, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Registrer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {visibleCompany.map(renderGear)}
          {!visibleCompany.length ? (
            <Text style={{ color: colors.muted }}>
              {rights === 'admin' ? 'Ingen bedriftsutstyr er registrert.' : 'Du har ikke rettighet på noe bedriftsutstyr.'}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!formOpen && tab === 'privat' ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Ditt private utstyr, for eksempel bilen du bruker i kjøreboken.
          </Text>
          <View style={[styles.row, { alignItems: 'flex-end' }]}>
            <Field label="Søk" value={query} onChange={setQuery} colors={colors} placeholder="Søk i listen" />
            <TouchableOpacity onPress={() => openForm('private')} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Registrer</Text>
            </TouchableOpacity>
          </View>
          {visiblePrivate.map(renderGear)}
          {visibleCars.map((car) => (
            <View key={car.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{vehicleTitle(car)}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Kjøretøy</Text>
              {car.vegvesenSummary ? <Text style={{ color: colors.muted, fontSize: 12 }}>{car.vegvesenSummary}</Text> : null}
              <CarOdometer
                key={`${car.id}-${car.trackOdometer}-${car.odometerStart}-${car.odometerSince}`}
                car={car}
                trips={state.mileageTrips}
                colors={colors}
                onSave={(patch) => syncEquipment(upsertPersonalVehicle(state, { ...car, ...patch }))}
              />
              <TouchableOpacity onPress={() => syncEquipment(removePersonalVehicle(state, car.id))} style={[styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]}>
                <Text style={{ color: colors.ink }}>Slett</Text>
              </TouchableOpacity>
            </View>
          ))}
          {!visiblePrivate.length && !visibleCars.length ? (
            <Text style={{ color: colors.muted }}>Du har ikke registrert privat utstyr.</Text>
          ) : null}
        </View>
      ) : null}

      {!formOpen && tab === 'kalender' && isDesktop ? (
        <View style={[styles.calendarFrame, { borderColor: colors.line }]}>
          <EquipmentCalendar
            familyId={familyId}
            state={state}
            employees={employees}
            viewer={me}
            manage={canEditAccess}
            canBook={canManage}
            employeeId={employeeId}
          />
        </View>
      ) : null}

      {!formOpen && tab === 'kalender' && !isDesktop ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Huk av utstyret i kalenderen og book der. Her kan du også reservere en enkelt dag til et prosjekt.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setCursor(new Date(year, monthIndex - 1, 1))} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Forrige</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{MONTHS[monthIndex]} {year}</Text>
            <TouchableOpacity onPress={() => setCursor(new Date(year, monthIndex + 1, 1))} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Neste</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.week}>
            {WEEKDAYS.map((day) => <Text key={day} style={[styles.dayLabel, { color: colors.muted }]}>{day}</Text>)}
          </View>
          <View style={styles.week}>
            {cells.map((day, index) => {
              const key = day ? dateKey(year, monthIndex, day) : `pad-${index}`;
              const count = day
                ? bookingsOnDate(state.equipmentBookings, key).filter((row) => companyGearIds.has(row.equipmentId)).length
                : 0;
              const active = key === selectedDate;
              return (
                <TouchableOpacity
                  key={key}
                  nativeID={day ? `equipment-day-${key}` : undefined}
                  disabled={!day}
                  onPress={() => setSelectedDate(key)}
                  style={[styles.day, { borderColor: active ? colors.brand : colors.line, backgroundColor: colors.card }]}
                >
                  <Text style={{ color: colors.ink }}>{day || ''}</Text>
                  {count ? <Text style={{ color: colors.brand, fontSize: 11 }}>{count}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedDate && !canManage ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Reservasjoner {selectedDate}</Text>
              {dayBookings.map((row) => (
                <View key={row.id} style={{ gap: 2 }}>
                  <Text style={{ color: colors.ink }}>{row.start.slice(11)}–{row.end.slice(11)} · {row.equipmentName}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{row.employeeName}{row.projectName ? ` · ${row.projectName}` : ''} · {row.purpose}</Text>
                </View>
              ))}
              {!dayBookings.length ? <Text style={{ color: colors.muted }}>Ingen reservasjoner denne dagen.</Text> : null}
            </View>
          ) : selectedDate ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Reserver {selectedDate}</Text>
              <OptionPicker
                options={companyGear
                  .filter((row) => row.bookable && (canEditAccess || employeeMayBook(row, me)))
                  .map((row) => ({ id: row.id, label: row.name }))}
                value={bookingGearId}
                onChange={(id) => { if (id) setBookingGearId(id); }}
                title={`Reserver ${selectedDate}`}
                clearable={false}
              />
              <View style={styles.row}>
                <Field label="Fra kl." value={startTime} onChange={setStartTime} colors={colors} placeholder="08:00" />
                <Field label="Til kl." value={endTime} onChange={setEndTime} colors={colors} placeholder="16:00" />
                <Field label="Hensikt" value={purpose} onChange={setPurpose} colors={colors} />
              </View>
              <Field label="Prosjekt" value={projectQuery} onChange={setProjectQuery} colors={colors} placeholder="Søk, eller velg fra listen" />
              {projects.options.slice(0, 6).map((option) => (
                <TouchableOpacity key={option.project.id} onPress={() => { setProjectId(option.project.id); setProjectQuery(option.label); }}>
                  <Text style={{ color: projectId === option.project.id ? colors.brand : colors.ink, fontSize: 13 }}>{option.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={saveBooking} style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Reserver</Text>
              </TouchableOpacity>
              {dayBookings.map((row) => (
                <View key={row.id} style={{ gap: 2 }}>
                  <Text style={{ color: colors.ink }}>{row.start.slice(11)}–{row.end.slice(11)} · {row.equipmentName}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{row.employeeName}{row.projectName ? ` · ${row.projectName}` : ''} · {row.purpose}</Text>
                  {row.employeeId === employeeId || canDelete ? (
                    <TouchableOpacity onPress={() => commit(cancelBooking(state, row.id))}>
                      <Text style={{ color: colors.brand, fontSize: 12 }}>Avbestill</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : <Text style={{ color: colors.muted }}>{canManage ? 'Velg en dag for å reservere.' : 'Velg en dag for å se reservasjoner.'}</Text>}
        </View>
      ) : null}

    </Body>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  wrapFill: { padding: 16, gap: 12, minHeight: 0 },
  calendarFrame: { flex: 1, minHeight: 480, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '700', color: '#102033' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnGhost: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  week: { flexDirection: 'row', flexWrap: 'wrap' },
  dayLabel: { width: '14.28%', textAlign: 'center', fontSize: 11, paddingBottom: 4 },
  day: { width: '14.28%', minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
