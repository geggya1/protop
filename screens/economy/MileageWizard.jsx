/**
 * Kjørebok: prosjekt → kjøretøy → rute → se over.
 * Forslag fylles ut. Den ansatte kan endre hvert felt før lagring.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { watchEmployees } from '../../src/employees/storage';
import { displayName, ownEmployee } from '../../src/employees/model';
import { formatMoney } from '../../src/economy/invoices';
import { recordDutyTrip } from '../../src/economy/opsState';
import { upsertPersonalVehicle } from '../../src/equipment/state';
import { companyVehicles, employeeVehicles, vehicleTitle } from '../../src/equipment/model';
import {
  companyAddressLabel,
  mileageProjectOptions,
  mileageRate,
  projectAddressLabel,
  roundTripKm,
  sumCharges,
  tripCost,
  visitPurposeLabel,
  VISIT_PURPOSES,
} from '../../src/mileage/flow';
import { chargesForRoute } from '../../src/mileage/routePlan';
import { planDrivingRoute } from '../../src/mileage/drivingRoute';
import { searchPlaces } from '../../src/utils/location';
import { lookupVehicleByReg } from '../../src/utils/vegvesenLookupClient';

const STEPS = [
  { id: 'prosjekt', label: 'Prosjekt' },
  { id: 'kjoretoy', label: 'Kjøretøy' },
  { id: 'rute', label: 'Rute' },
  { id: 'seover', label: 'Se over' },
];

function todayKey() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function Field({ label, value, onChange, colors, placeholder, keyboardType }) {
  return (
    <View style={{ minWidth: 160, flexGrow: 1, flexBasis: 180 }}>
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

function Chip({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, {
        borderColor: active ? colors.brand : colors.line,
        backgroundColor: active ? `${colors.brand}18` : colors.card,
      }]}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function AddressField({ label, value, onChange, onPick, colors }) {
  const [hits, setHits] = useState([]);
  useEffect(() => {
    const q = String(value || '').trim();
    if (q.length < 3) {
      setHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchPlaces(q, 'nb').then((rows) => {
        if (live) setHits((rows || []).slice(0, 5));
      }).catch(() => {
        if (live) setHits([]);
      });
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value]);
  return (
    <View style={{ minWidth: 220, flexGrow: 1, flexBasis: 260 }}>
      <Field label={label} value={value} onChange={onChange} colors={colors} placeholder="Søk adresse" />
      {hits.length ? (
        <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {hits.map((hit) => (
            <TouchableOpacity key={hit.placeId || hit.label} onPress={() => { onPick(hit); setHits([]); }}>
              <Text style={{ color: colors.ink, fontSize: 13, paddingVertical: 6 }}>{hit.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function MileageWizard({ colors, state, onApply, company, onOpenBilling }) {
  const { familyId, user, uid, activeProfile } = useApp();
  const [employees, setEmployees] = useState([]);
  const [step, setStep] = useState('prosjekt');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [routing, setRouting] = useState(false);
  const [plate, setPlate] = useState('');
  const [lookupNote, setLookupNote] = useState('');
  const [saved, setSaved] = useState(null);
  const routeEditedRef = useRef(false);
  const [draft, setDraft] = useState({
    date: todayKey(),
    project: null,
    vehicleKind: 'company',
    vehicleId: '',
    vehicleName: '',
    plate: '',
    electric: false,
    from: '',
    to: '',
    fromPlace: null,
    toPlace: null,
    oneWayKm: 0,
    km: 0,
    routeSource: '',
    routeCharges: [],
    tolls: 0,
    ferries: 0,
    visitPurpose: 'befaring',
    visitCustom: '',
    routeEdited: false,
  });

  useEffect(() => watchEmployees(familyId, (rows) => setEmployees(rows || [])), [familyId]);

  const me = ownEmployee(employees, {
    uid: uid || '',
    emails: [user?.email, activeProfile?.email].filter(Boolean),
    name: activeProfile?.name || user?.displayName || '',
  });
  const employeeId = me?.id || uid || '';
  const employeeName = me ? displayName(me) : (activeProfile?.name || user?.displayName || 'Ansatt');
  const rateInfo = mileageRate(state.mileagePolicies);
  const cars = companyVehicles(state.equipment);
  const mine = employeeVehicles(state.personalVehicles, state.equipment, employeeId);
  const projects = useMemo(
    () => mileageProjectOptions(state, employeeId, { query }),
    [state, employeeId, query],
  );
  function patch(partial) {
    if (Object.prototype.hasOwnProperty.call(partial, 'routeEdited')) {
      routeEditedRef.current = !!partial.routeEdited;
    }
    setDraft((row) => ({ ...row, ...partial }));
  }

  function chooseProject(option) {
    patch({ project: option.project });
    setError('');
  }

  function chooseCompanyCar(car) {
    patch({
      vehicleKind: 'company',
      vehicleId: car.id,
      vehicleName: vehicleTitle(car),
      plate: car.plate,
      electric: !!car.electric,
    });
    setError('');
  }

  function chooseOwnCar(car) {
    patch({
      vehicleKind: 'private',
      vehicleId: car.id,
      vehicleName: vehicleTitle(car),
      plate: car.plate,
      electric: !!car.electric,
    });
    setError('');
  }

  async function lookupPlate() {
    setLookupNote('');
    setError('');
    try {
      const hit = await lookupVehicleByReg(plate);
      const result = onApply(upsertPersonalVehicle(state, {
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
      if (!result?.ok && result?.error) {
        setError(result.error);
        return;
      }
      const vehicle = result?.vehicle;
      if (vehicle) chooseOwnCar(vehicle);
      setLookupNote(hit.summaryLine || 'Kjøretøyet er lagret på din side.');
      setPlate('');
    } catch (err) {
      setError(err?.message || 'Klarte ikke slå opp skiltnummeret.');
    }
  }

  function goToRoute() {
    if (!draft.vehicleId) {
      setError('Velg firmabil eller egen bil.');
      return;
    }
    patch({
      from: draft.from || companyAddressLabel(company),
      to: draft.to || projectAddressLabel(draft.project),
      routeEdited: false,
    });
    setError('');
    setStep('rute');
  }

  useEffect(() => {
    if (step !== 'rute' || draft.routeEdited) return undefined;
    const fromLabel = draft.from;
    const toLabel = draft.to;
    if (!fromLabel || !toLabel) return undefined;
    let live = true;
    const timer = setTimeout(() => {
    setRouting(true);
    (async () => {
      let fromPlace = draft.fromPlace?.label === fromLabel ? draft.fromPlace : null;
      let toPlace = draft.toPlace?.label === toLabel ? draft.toPlace : null;
      if (!fromPlace?.lat) {
        const hits = await searchPlaces(fromLabel, 'nb').catch(() => []);
        fromPlace = hits?.[0] || null;
      }
      if (!toPlace?.lat) {
        const hits = await searchPlaces(toLabel, 'nb').catch(() => []);
        toPlace = hits?.[0] || null;
      }
      if (!live || routeEditedRef.current) {
        setRouting(false);
        return;
      }
      if (!fromPlace?.lat || !toPlace?.lat) {
        setRouting(false);
        patch({ fromPlace, toPlace });
        return;
      }
      const route = await planDrivingRoute(fromPlace, toPlace);
      if (!live || routeEditedRef.current || !route) {
        setRouting(false);
        return;
      }
      const charges = chargesForRoute(route.points, { roundTrip: true });
      patch({
        fromPlace,
        toPlace,
        from: fromPlace.label || fromLabel,
        to: toPlace.label || toLabel,
        oneWayKm: route.oneWayKm,
        km: roundTripKm(route.oneWayKm),
        routeSource: route.source,
        routeCharges: charges,
        tolls: sumCharges(charges, 'toll'),
        ferries: sumCharges(charges, 'ferry'),
      });
      setRouting(false);
    })().catch(() => {
      if (live) setRouting(false);
    });
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [step, draft.from, draft.to, draft.routeEdited]);

  function updateCharge(id, amount) {
    const routeCharges = draft.routeCharges.map((row) => (
      row.id === id ? { ...row, amount: Number(String(amount).replace(',', '.')) || 0, source: 'manuell' } : row
    ));
    patch({
      routeCharges,
      tolls: sumCharges(routeCharges, 'toll'),
      ferries: sumCharges(routeCharges, 'ferry'),
      routeEdited: true,
    });
  }

  const cost = tripCost({
    km: draft.km,
    rate: rateInfo.rate,
    tolls: draft.tolls,
    ferries: draft.ferries,
  });
  const purpose = visitPurposeLabel(draft.visitPurpose, draft.visitCustom);

  function save() {
    const project = draft.project;
    const result = onApply(recordDutyTrip(state, {
      date: draft.date || todayKey(),
      employeeId,
      employeeName,
      vehicleKind: draft.vehicleKind,
      vehicleId: draft.vehicleId,
      vehicleName: draft.vehicleName,
      plate: draft.plate,
      electric: draft.electric,
      purpose: 'duty',
      visitPurpose: draft.visitPurpose,
      notes: purpose,
      from: draft.from,
      to: draft.to,
      km: draft.km,
      oneWayKm: draft.oneWayKm,
      roundTrip: true,
      tolls: draft.tolls,
      ferries: draft.ferries,
      routeCharges: draft.routeCharges,
      routeSource: draft.routeSource,
      fromLat: draft.fromPlace?.lat,
      fromLng: draft.fromPlace?.lng,
      toLat: draft.toPlace?.lat,
      toLng: draft.toPlace?.lng,
      rate: rateInfo.rate,
      projectId: project?.id || '',
      projectNumber: project?.number || '',
      projectName: project?.name || '',
      customerId: project?.customerId || '',
      customerNumber: project?.customerNumber || '',
      customerName: project?.client || '',
      status: 'approved',
    }));
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre turen.');
      return;
    }
    setSaved({ trip: result.trip, expense: result.expense, cost, rateInfo, purpose });
    setStep('ferdig');
    setError('');
  }

  function reset() {
    setSaved(null);
    setDraft({
      date: todayKey(),
      project: null,
      vehicleKind: 'company',
      vehicleId: '',
      vehicleName: '',
      plate: '',
      electric: false,
      from: '',
      to: '',
      fromPlace: null,
      toPlace: null,
      oneWayKm: 0,
      km: 0,
      routeSource: '',
      routeCharges: [],
      tolls: 0,
      ferries: 0,
      visitPurpose: 'befaring',
      visitCustom: '',
      routeEdited: false,
    });
    setQuery('');
    setStep('prosjekt');
  }

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Ny kjøretur</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Turen lagres i kjøreboken og som utlegg på prosjektet.
      </Text>

      {step !== 'ferdig' ? (
        <View style={styles.row}>
          {STEPS.map((item, index) => (
            <Text key={item.id} style={{ color: step === item.id ? colors.ink : colors.muted, fontSize: 12, fontWeight: step === item.id ? '700' : '500' }}>
              {index + 1}. {item.label}
            </Text>
          ))}
        </View>
      ) : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {step === 'prosjekt' ? (
        <View style={{ gap: 8 }}>
          <Field label="Søk prosjekt" value={query} onChange={setQuery} colors={colors} placeholder="Nummer, navn eller kunde" />
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {query
              ? 'Treff i hele prosjektregisteret.'
              : `Aktive prosjekt ${projects.range.fromDate}–${projects.range.toDate}, som i timelisten.`}
          </Text>
          {projects.options.map((option) => {
            const active = draft.project?.id === option.project.id;
            return (
              <TouchableOpacity
                key={option.project.id}
                onPress={() => chooseProject(option)}
                style={[styles.choice, { borderColor: active ? colors.brand : colors.line }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{option.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {[option.project.client, option.address].filter(Boolean).join(' · ') || 'Ingen adresse registrert'}
                </Text>
              </TouchableOpacity>
            );
          })}
          {!projects.options.length ? (
            <Text style={{ color: colors.muted }}>
              {query ? 'Ingen prosjekt matcher søket.' : 'Ingen timer de siste to månedene. Søk frem prosjektet.'}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              if (!draft.project) {
                setError('Velg prosjekt før du går videre.');
                return;
              }
              setStep('kjoretoy');
              setError('');
            }}
            style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Neste: kjøretøy</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'kjoretoy' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Firmaets biler</Text>
          {cars.map((car) => (
            <TouchableOpacity key={car.id} onPress={() => chooseCompanyCar(car)} style={[styles.choice, { borderColor: draft.vehicleId === car.id ? colors.brand : colors.line }]}>
              <Text style={{ color: colors.ink }}>{vehicleTitle(car)}</Text>
            </TouchableOpacity>
          ))}
          {!cars.length ? <Text style={{ color: colors.muted }}>Ingen poolbil er registrert under Utstyr ennå.</Text> : null}
          <Text style={{ color: colors.ink, fontWeight: '600', marginTop: 6 }}>Egen bil</Text>
          {mine.map((car) => (
            <TouchableOpacity key={car.id} onPress={() => chooseOwnCar(car)} style={[styles.choice, { borderColor: draft.vehicleId === car.id ? colors.brand : colors.line }]}>
              <Text style={{ color: colors.ink }}>{vehicleTitle(car)}</Text>
              {car.vegvesenSummary ? <Text style={{ color: colors.muted, fontSize: 12 }}>{car.vegvesenSummary}</Text> : null}
            </TouchableOpacity>
          ))}
          <View style={styles.row}>
            <Field label="Skiltnummer" value={plate} onChange={setPlate} colors={colors} placeholder="EL12345" />
            <TouchableOpacity onPress={lookupPlate} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Hent fra Vegvesenet</Text>
            </TouchableOpacity>
          </View>
          {lookupNote ? <Text style={{ color: colors.brand, fontSize: 12 }}>{lookupNote}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setStep('prosjekt')} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Tilbake</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToRoute} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Neste: rute</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {step === 'rute' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Start er selskapets adresse. Destinasjon er prosjektadressen. Begge kan endres.
          </Text>
          <View style={styles.row}>
            <AddressField
              label="Fra"
              value={draft.from}
              colors={colors}
              onChange={(value) => patch({ from: value, fromPlace: null, routeEdited: false })}
              onPick={(hit) => patch({ from: hit.label, fromPlace: hit, routeEdited: false })}
            />
            <AddressField
              label="Til"
              value={draft.to}
              colors={colors}
              onChange={(value) => patch({ to: value, toPlace: null, routeEdited: false })}
              onPick={(hit) => patch({ to: hit.label, toPlace: hit, routeEdited: false })}
            />
          </View>
          {routing ? <ActivityIndicator /> : null}
          <View style={styles.row}>
            <Field
              label="Én vei, km"
              value={draft.oneWayKm ? String(draft.oneWayKm) : ''}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => {
                const oneWayKm = Number(String(value).replace(',', '.')) || 0;
                patch({ oneWayKm, km: roundTripKm(oneWayKm), routeEdited: true, routeSource: 'manuell' });
              }}
            />
            <Field
              label="Tur/retur, km"
              value={draft.km ? String(draft.km) : ''}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => patch({ km: Number(String(value).replace(',', '.')) || 0, routeEdited: true, routeSource: 'manuell' })}
            />
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {draft.routeSource === 'osrm'
              ? 'Kjørelengde fra veirute, ganget med to for tur/retur.'
              : draft.routeSource === 'estimate'
                ? 'Veitjenesten svarte ikke. Lengden er et estimat og kan rettes.'
                : 'Lengde og bom fylles når begge adressene er funnet.'}
          </Text>
          {draft.routeCharges.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={{ color: colors.ink, flex: 1 }}>
                {row.kind === 'ferry' ? 'Ferje' : 'Bom'} · {row.name} · {row.passes} passeringer
              </Text>
              <Field
                label="Beløp"
                value={String(row.amount ?? '')}
                colors={colors}
                keyboardType="decimal-pad"
                onChange={(value) => updateCharge(row.id, value)}
              />
            </View>
          ))}
          {!draft.routeCharges.length && draft.km ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen kjent bom eller ferje traff ruten. Legg inn beløp under om du har passert noe.</Text>
          ) : null}
          <View style={styles.row}>
            <Field
              label="Bom, kr"
              value={String(draft.tolls ?? '')}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => patch({ tolls: Number(String(value).replace(',', '.')) || 0, routeEdited: true })}
            />
            <Field
              label="Ferje, kr"
              value={String(draft.ferries ?? '')}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => patch({ ferries: Number(String(value).replace(',', '.')) || 0, routeEdited: true })}
            />
          </View>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setStep('kjoretoy')} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Tilbake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!draft.from || !draft.to || !(Number(draft.km) > 0)) {
                  setError('Fra, til og kjørelengde må være fylt ut.');
                  return;
                }
                setError('');
                setStep('seover');
              }}
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Neste: se over</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {step === 'seover' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink }}>
            {draft.from} → {draft.to} · {draft.km} km tur/retur
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {draft.project ? `#${draft.project.number || ''} ${draft.project.name}` : ''} · {draft.vehicleName} · {employeeName}
          </Text>
          <Field label="Dato" value={draft.date} onChange={(value) => patch({ date: value })} colors={colors} placeholder="ÅÅÅÅ-MM-DD" />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Hensikt med turen</Text>
          <View style={styles.row}>
            {VISIT_PURPOSES.map((row) => (
              <Chip
                key={row.id}
                label={row.label}
                colors={colors}
                active={draft.visitPurpose === row.id}
                onPress={() => patch({ visitPurpose: row.id })}
              />
            ))}
          </View>
          {draft.visitPurpose === 'annet' ? (
            <Field label="Egen hensikt" value={draft.visitCustom} onChange={(value) => patch({ visitCustom: value })} colors={colors} />
          ) : null}
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {formatMoney(cost.amount)} · {draft.km} km × {rateInfo.rate.toFixed(2)} + bom/ferje {formatMoney(cost.extras)}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setStep('rute')} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Tilbake</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre kjøretur</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {step === 'ferdig' && saved ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>{formatMoney(saved.trip.amount)}</Text>
          <Text style={{ color: colors.muted }}>
            {saved.rateInfo.label} {saved.rateInfo.rate.toFixed(2)} kr/km · {saved.purpose}
          </Text>
          <Text style={{ color: colors.ink }}>
            {saved.trip.from} → {saved.trip.to} · {saved.trip.km} km tur/retur
          </Text>
          <Text style={{ color: colors.ink }}>
            {saved.trip.projectName || 'Prosjekt'} · {saved.trip.employeeName} · {saved.trip.vehicleName}
          </Text>
          {saved.trip.tolls ? <Text style={{ color: colors.ink }}>Bom {formatMoney(saved.trip.tolls)}</Text> : null}
          {saved.trip.ferries ? <Text style={{ color: colors.ink }}>Ferje {formatMoney(saved.trip.ferries)}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Lagret i kjøreboken og som utlegg på prosjektet. Fakturagrunnlaget bruker kjøreturen, så beløpet ikke faktureres dobbelt.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Ny tur</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onOpenBilling} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Fakturagrunnlag</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnGhost: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  choice: { borderWidth: 1, borderRadius: 8, padding: 10 },
  menu: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, marginTop: 4 },
});
