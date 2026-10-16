/**
 * Utstyr og lager: registrer det selskapet eier, og reserver det i kalenderen.
 * Poolbiler herfra er valgbare i kjøreboken. Egne biler registreres på samme side.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { showSaveToast } from '../../src/ui/saveToast';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { watchEmployees } from '../../src/employees/storage';
import { displayName, ownEmployee } from '../../src/employees/model';
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, equipmentCategory } from '../../src/equipment/catalog';
import {
  bookingsOnDate,
  normalizeEquipment,
  vehicleTitle,
  vehiclesForEmployee,
} from '../../src/equipment/model';
import {
  cancelBooking,
  removeEquipment,
  removePersonalVehicle,
  upsertBooking,
  upsertEquipment,
  upsertPersonalVehicle,
} from '../../src/equipment/state';
import { mileageProjectOptions } from '../../src/mileage/flow';
import { lookupVehicleByReg } from '../../src/utils/vegvesenLookupClient';

const WEEKDAYS = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function Field({ label, value, onChange, colors, placeholder }) {
  return (
    <View style={{ minWidth: 140, flexGrow: 1, flexBasis: 160 }}>
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function Chip({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? `${colors.brand}18` : colors.card }]}>
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
  name: '', category: 'drone', plate: '', serial: '', make: '', model: '', location: '',
  status: 'available', purchasedAt: '', warrantyUntil: '', warrantyVendor: '', warrantyNote: '', warrantyUri: '', notes: '',
};

export default function EquipmentScreen() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, user, uid, activeProfile } = useApp();
  const access = useCompanyAccess();
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [tab, setTab] = useState('register');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [gear, setGear] = useState(EMPTY_GEAR);
  const [editing, setEditing] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState('');
  const [bookingGearId, setBookingGearId] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [purpose, setPurpose] = useState('Prosjekt');
  const [projectQuery, setProjectQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [plate, setPlate] = useState('');
  const [lookupNote, setLookupNote] = useState('');

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (ready) saveProjectState(state, familyId).catch(() => {});
  }, [state, ready, familyId]);

  useEffect(() => watchEmployees(familyId, (rows) => setEmployees(rows || [])), [familyId]);

  const canManage = access.can('projects', 'write') || access.can('economy', 'write');
  const me = ownEmployee(employees, {
    uid: uid || '',
    emails: [user?.email, activeProfile?.email].filter(Boolean),
    name: activeProfile?.name || user?.displayName || '',
  });
  const employeeId = me?.id || uid || '';
  const employeeName = me ? displayName(me) : (activeProfile?.name || user?.displayName || 'Ansatt');
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = monthCells(year, monthIndex);
  const equipment = state.equipment || [];
  const visible = equipment.filter((row) => {
    const blob = `${row.name} ${row.plate} ${row.serial} ${row.make} ${equipmentCategory(row.category).label}`.toLowerCase();
    return blob.includes(query.trim().toLowerCase());
  });
  const dayBookings = bookingsOnDate(state.equipmentBookings, selectedDate);
  const projects = useMemo(
    () => mileageProjectOptions(state, employeeId, { query: projectQuery }),
    [state, employeeId, projectQuery],
  );
  const mine = vehiclesForEmployee(state.personalVehicles, employeeId);

  function apply(result) {
    setError(result.ok ? '' : result.error);
    if (result.ok) {
      setState(result.state);
      showSaveToast('Lagret.');
    }
    return result;
  }

  async function lookupGearPlate() {
    setLookupNote('');
    try {
      const hit = await lookupVehicleByReg(gear.plate);
      setGear((row) => ({
        ...row,
        plate: hit.regNumber || row.plate,
        name: row.name || hit.title || 'Poolbil',
        make: hit.make || row.make,
        model: hit.model || row.model,
        notes: row.notes || hit.summaryLine || '',
      }));
      setLookupNote(hit.summaryLine || 'Opplysninger hentet.');
    } catch (err) {
      setError(err?.message || 'Klarte ikke slå opp skiltnummeret.');
    }
  }

  async function lookupOwnPlate() {
    setLookupNote('');
    try {
      const hit = await lookupVehicleByReg(plate);
      const result = apply(upsertPersonalVehicle(state, {
        employeeId,
        employeeName,
        plate: hit.regNumber || plate,
        nickname: hit.title || '',
        make: hit.make || '',
        model: hit.model || '',
        year: hit.year || '',
        fuel: hit.fuelLabel || '',
        electric: hit.fuelType === 'electric' || /el/i.test(hit.fuelLabel || ''),
        vegvesenSummary: hit.summaryLine || '',
      }));
      if (result.ok) {
        setPlate('');
        setLookupNote(hit.summaryLine || 'Bilen er lagret.');
      }
    } catch (err) {
      setError(err?.message || 'Klarte ikke slå opp skiltnummeret.');
    }
  }

  function saveGear() {
    const result = apply(upsertEquipment(state, gear));
    if (result.ok) {
      setGear(EMPTY_GEAR);
      setEditing(false);
    }
  }

  function saveBooking() {
    const item = equipment.find((row) => row.id === bookingGearId);
    const project = (state.projects || []).find((row) => row.id === projectId);
    apply(upsertBooking(state, {
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
    }));
  }

  if (!ready) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Laster…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: colors.bg }]} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {hostedHero ? null : <Text style={styles.title}>Utstyr</Text>}
      <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 720 }}>
        Registrer utstyr selskapet eier, fra poolbil og drone til nettbrett og termokamera. Ansatte reserverer det i kalenderen til bruk på prosjekt.
      </Text>
      <View style={styles.row}>
        <Chip label="Register" active={tab === 'register'} onPress={() => setTab('register')} colors={colors} />
        <Chip label="Kalender" active={tab === 'kalender'} onPress={() => setTab('kalender')} colors={colors} />
        <Chip label="Mine biler" active={tab === 'biler'} onPress={() => setTab('biler')} colors={colors} />
      </View>
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {tab === 'register' ? (
        <View style={{ gap: 10 }}>
          <Field label="Søk" value={query} onChange={setQuery} colors={colors} placeholder="Navn, skilt eller serienummer" />
          {canManage ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{gear.id ? 'Rediger enhet' : 'Ny enhet'}</Text>
              {!editing && !gear.id ? (
                <TouchableOpacity onPress={() => setEditing(true)} style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Registrer utstyr</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Field label="Navn" value={gear.name} onChange={(value) => setGear((row) => ({ ...row, name: value }))} colors={colors} placeholder="Termokamera 2" />
                    <Field label="Serienummer" value={gear.serial} onChange={(value) => setGear((row) => ({ ...row, serial: value }))} colors={colors} />
                    <Field label="Plassering" value={gear.location} onChange={(value) => setGear((row) => ({ ...row, location: value }))} colors={colors} />
                  </View>
                  <View style={styles.row}>
                    {EQUIPMENT_CATEGORIES.map((row) => (
                      <Chip key={row.id} label={row.label} active={gear.category === row.id} onPress={() => setGear((current) => ({ ...current, category: row.id }))} colors={colors} />
                    ))}
                  </View>
                  {gear.category === 'poolbil' ? (
                    <View style={styles.row}>
                      <Field label="Skiltnummer" value={gear.plate} onChange={(value) => setGear((row) => ({ ...row, plate: value }))} colors={colors} placeholder="EL12345" />
                      <TouchableOpacity onPress={lookupGearPlate} style={[styles.btn, { backgroundColor: colors.brand }]}>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Hent fra Vegvesenet</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
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
                  <Field label="Garantimerknad" value={gear.warrantyNote} onChange={(value) => setGear((row) => ({ ...row, warrantyNote: value }))} colors={colors} />
                  <Field label="Notat" value={gear.notes} onChange={(value) => setGear((row) => ({ ...row, notes: value }))} colors={colors} />
                  {lookupNote ? <Text style={{ color: colors.brand, fontSize: 12 }}>{lookupNote}</Text> : null}
                  <View style={styles.row}>
                    <TouchableOpacity onPress={saveGear} style={[styles.btn, { backgroundColor: colors.brand }]}>
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre enhet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setGear(EMPTY_GEAR); setEditing(false); }} style={[styles.btnGhost, { borderColor: colors.line }]}>
                      <Text style={{ color: colors.ink }}>Avbryt</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ) : null}
          {visible.map((row) => {
            const item = normalizeEquipment(row);
            const category = equipmentCategory(item.category);
            return (
              <View key={item.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {category.label}
                  {item.plate ? ` · ${item.plate}` : ''}
                  {item.serial ? ` · ${item.serial}` : ''}
                  {item.location ? ` · ${item.location}` : ''}
                  {` · ${EQUIPMENT_STATUSES.find((status) => status.id === item.status)?.label || item.status}`}
                </Text>
                {item.warrantyUntil ? (
                  <Text style={{ color: colors.ink, fontSize: 12 }}>
                    Garanti til {item.warrantyUntil}{item.warrantyVendor ? ` · ${item.warrantyVendor}` : ''}
                  </Text>
                ) : null}
                {item.warrantyUri ? <Text style={{ color: colors.brand, fontSize: 12 }}>{item.warrantyUri}</Text> : null}
                {item.warrantyNote ? <Text style={{ color: colors.muted, fontSize: 12 }}>{item.warrantyNote}</Text> : null}
                {canManage ? (
                  <View style={styles.row}>
                    <TouchableOpacity onPress={() => { setGear(item); setEditing(true); }} style={[styles.btnGhost, { borderColor: colors.line }]}>
                      <Text style={{ color: colors.ink }}>Rediger</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => apply(removeEquipment(state, item.id))} style={[styles.btnGhost, { borderColor: colors.line }]}>
                      <Text style={{ color: colors.ink }}>Slett</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
          {!visible.length ? <Text style={{ color: colors.muted }}>Ingen utstyr er registrert ennå.</Text> : null}
        </View>
      ) : null}

      {tab === 'kalender' ? (
        <View style={{ gap: 10 }}>
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
              const count = day ? bookingsOnDate(state.equipmentBookings, key).length : 0;
              const active = key === selectedDate;
              return (
                <TouchableOpacity
                  key={key}
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
          {selectedDate ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Reserver {selectedDate}</Text>
              <View style={styles.row}>
                {equipment.filter((row) => normalizeEquipment(row).bookable).map((row) => (
                  <Chip key={row.id} label={row.name} active={bookingGearId === row.id} onPress={() => setBookingGearId(row.id)} colors={colors} />
                ))}
              </View>
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
                  {row.employeeId === employeeId || canManage ? (
                    <TouchableOpacity onPress={() => apply(cancelBooking(state, row.id))}>
                      <Text style={{ color: colors.brand, fontSize: 12 }}>Avbestill</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : <Text style={{ color: colors.muted }}>Velg en dag for å reservere.</Text>}
        </View>
      ) : null}

      {tab === 'biler' ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Egne biler lagres på deg og kan velges i kjøreboken. Skiltnummeret slås opp hos Statens vegvesen.
          </Text>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Field label="Skiltnummer" value={plate} onChange={setPlate} colors={colors} placeholder="AB12345" />
              <TouchableOpacity onPress={lookupOwnPlate} style={[styles.btn, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Hent og lagre</Text>
              </TouchableOpacity>
            </View>
            {lookupNote ? <Text style={{ color: colors.brand, fontSize: 12 }}>{lookupNote}</Text> : null}
          </View>
          {mine.map((car) => (
            <View key={car.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{vehicleTitle(car)}</Text>
              {car.vegvesenSummary ? <Text style={{ color: colors.muted, fontSize: 12 }}>{car.vegvesenSummary}</Text> : null}
              <TouchableOpacity onPress={() => apply(removePersonalVehicle(state, car.id))} style={[styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]}>
                <Text style={{ color: colors.ink }}>Fjern</Text>
              </TouchableOpacity>
            </View>
          ))}
          {!mine.length ? <Text style={{ color: colors.muted }}>Du har ingen egen bil registrert.</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
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
