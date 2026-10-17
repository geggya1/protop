/**
 * Kjørebok: prosjekt → kjøretøy → rute → se over.
 * Registreringen åpnes i en popup med samme mål på alle trinn.
 * Forslag fylles ut. Den ansatte kan endre hvert felt før lagring.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { watchEmployees } from '../../src/employees/storage';
import { displayName, ownEmployee } from '../../src/employees/model';
import { formatMoney } from '../../src/economy/invoices';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { employeeLevelIds } from '../../src/access/companyAccess';
import { recordDutyTrip } from '../../src/economy/opsState';
import { upsertEquipment, upsertPersonalVehicle } from '../../src/equipment/state';
import { canAddCompanyVehicle, companyVehicles, employeeVehicles, vehicleTitle } from '../../src/equipment/model';
import { firebaseConfig } from '../../firebase';
import {
  companyAddressLabel,
  mileageProjectOptions,
  mileageRate,
  projectAddressLabel,
  projectDestinationSuggestion,
  roundTripKm,
  sumCharges,
  tripCost,
  visitPurposeLabel,
  VISIT_PURPOSES,
} from '../../src/mileage/flow';
import { suggestDriving } from '../../src/mileage/suggestRoute';
import { mileageModalFrame } from '../../src/mileage/modalFrame';
import { searchPlaces } from '../../src/utils/location';

const STEPS = [
  { id: 'prosjekt', label: 'Prosjekt' },
  { id: 'kjoretoy', label: 'Kjøretøy' },
  { id: 'rute', label: 'Rute' },
  { id: 'seover', label: 'Se over' },
];

function useViewportSize() {
  const windowSize = useWindowDimensions();
  const [visualHeight, setVisualHeight] = useState(windowSize.height);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof globalThis.window === 'undefined' || !globalThis.window.visualViewport) {
      setVisualHeight(windowSize.height);
      return undefined;
    }
    const viewport = globalThis.window.visualViewport;
    const read = () => setVisualHeight(viewport.height || windowSize.height);
    read();
    viewport.addEventListener('resize', read);
    return () => viewport.removeEventListener('resize', read);
  }, [windowSize.height]);
  return { width: windowSize.width, height: visualHeight };
}

function todayKey() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function Field({ label, value, onChange, colors, placeholder, keyboardType, onFocus }) {
  return (
    <View style={{ minWidth: 160, flexBasis: 180, alignSelf: 'stretch' }}>
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const q = String(value || '').trim();
    if (!open || q.length < 3) {
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
  }, [value, open]);
  return (
    <View style={{ minWidth: 220, flexGrow: 1, flexBasis: 260 }}>
      <Field
        label={label}
        value={value}
        colors={colors}
        placeholder="Søk adresse"
        onFocus={() => setOpen(true)}
        onChange={(next) => { setOpen(true); onChange(next); }}
      />
      {hits.length ? (
        <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {hits.map((hit) => (
            <TouchableOpacity key={hit.placeId || hit.label} onPress={() => { onPick(hit); setHits([]); setOpen(false); }}>
              <Text style={{ color: colors.ink, fontSize: 13, paddingVertical: 6 }}>{hit.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function MileageWizard({
  colors,
  state,
  onApply,
  company,
  onOpenBilling,
  customers = [],
  contracts = [],
}) {
  const { familyId, user, uid, activeProfile } = useApp();
  const access = useCompanyAccess();
  const { width, height } = useViewportSize();
  const insets = useSafeAreaInsets();
  const frame = mileageModalFrame(width, height, insets);
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [step, setStep] = useState('prosjekt');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [routing, setRouting] = useState(false);
  const [vehicleMenu, setVehicleMenu] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState('private');
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
    suggestedTo: '',
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
  const levelIds = access.previewing
    ? employeeLevelIds(access.viewingAs)
    : (employeeLevelIds(me).length ? employeeLevelIds(me) : (access.levelId ? [access.levelId] : []));
  const canCompany = canAddCompanyVehicle(levelIds, { bypass: !!access.bypass && !access.previewing });
  const addressSources = useMemo(() => ({
    customers,
    contracts: [...(contracts || []), ...(state?.contracts || [])],
  }), [customers, contracts, state]);
  const projects = useMemo(
    () => mileageProjectOptions(state, employeeId, { query, customers, contracts: addressSources.contracts }),
    [state, employeeId, query, customers, addressSources],
  );
  function patch(partial) {
    if (Object.prototype.hasOwnProperty.call(partial, 'routeEdited')) {
      routeEditedRef.current = !!partial.routeEdited;
    }
    setDraft((row) => ({ ...row, ...partial }));
  }

  function chooseProject(option) {
    patch({
      project: option.project,
      to: '',
      toPlace: null,
      suggestedTo: '',
      oneWayKm: 0,
      km: 0,
      routeSource: '',
      routeCharges: [],
      tolls: 0,
      ferries: 0,
      routeEdited: false,
    });
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

  function openVehicleMenu() {
    setAddingVehicle(false);
    setVehicleMenu((open) => !open);
    setError('');
  }

  function beginAddVehicle() {
    setVehicleMenu(false);
    setAddingVehicle(true);
    setNewScope('private');
    setNewPlate('');
    setNewName('');
    setError('');
  }

  function saveNewVehicle() {
    const plate = newPlate.trim();
    const name = newName.trim();
    if (!plate) {
      setError('Skriv inn skiltnummer.');
      return;
    }
    if (newScope === 'company') {
      if (!canCompany) {
        setError('Bare øverste leder og administrator kan legge til kjøretøy på bedriften.');
        return;
      }
      const result = onApply(upsertEquipment(state, {
        name: name || plate,
        plate,
        category: 'poolbil',
        group: 'kjoretoy',
        scope: 'company',
      }));
      if (!result?.ok) {
        setError(result?.error || 'Kunne ikke lagre kjøretøyet.');
        return;
      }
      if (result.equipment) chooseCompanyCar(result.equipment);
    } else {
      const result = onApply(upsertPersonalVehicle(state, {
        employeeId,
        employeeName,
        plate,
        nickname: name,
      }));
      if (!result?.ok) {
        setError(result?.error || 'Kunne ikke lagre kjøretøyet.');
        return;
      }
      if (result.vehicle) chooseOwnCar(result.vehicle);
    }
    setAddingVehicle(false);
    setVehicleMenu(false);
    setError('');
  }

  function goToRoute() {
    if (!draft.vehicleId) {
      setError('Velg firmabil eller egen bil.');
      return;
    }
    const destination = draft.to || projectDestinationSuggestion(draft.project, addressSources);
    patch({
      from: draft.from || companyAddressLabel(company),
      to: destination,
      suggestedTo: projectDestinationSuggestion(draft.project, addressSources),
      routeEdited: false,
    });
    setError('');
    setStep('rute');
  }

  useEffect(() => {
    if (step !== 'rute' || draft.routeEdited) return undefined;
    const real = projectAddressLabel(draft.project, addressSources);
    if (!real || !draft.to || draft.to === real) return undefined;
    const name = String(draft.project?.name || '').trim();
    if (draft.to !== name && draft.to !== draft.suggestedTo) return undefined;
    patch({ to: real, suggestedTo: real, toPlace: null, routeEdited: false });
    return undefined;
  }, [step, draft.project, draft.to, draft.suggestedTo, draft.routeEdited, addressSources]);

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
      const route = await suggestDriving(fromPlace, toPlace, {
        apiKey: firebaseConfig?.apiKey || '',
        roundTrip: true,
      });
      if (!live || routeEditedRef.current || !route) {
        setRouting(false);
        return;
      }
      const charges = route.charges || [];
      patch({
        fromPlace,
        toPlace,
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
      suggestedTo: '',
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

  function closeModal() {
    setOpen(false);
    if (step === 'ferdig') reset();
  }

  function goBack() {
    const index = STEPS.findIndex((item) => item.id === step);
    setError('');
    if (step === 'ferdig' || index <= 0) {
      closeModal();
      return;
    }
    setStep(STEPS[index - 1].id);
  }

  function goNext() {
    if (step === 'ferdig') {
      reset();
      return;
    }
    if (step === 'prosjekt') {
      if (!draft.project) {
        setError('Velg prosjekt før du går videre.');
        return;
      }
      setError('');
      setStep('kjoretoy');
      return;
    }
    if (step === 'kjoretoy') {
      goToRoute();
      return;
    }
    if (step === 'rute') {
      if (!draft.from || !draft.to || !(Number(draft.km) > 0)) {
        setError('Fra, til og kjørelengde må være fylt ut.');
        return;
      }
      setError('');
      setStep('seover');
      return;
    }
    if (step === 'seover') save();
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const done = step === 'ferdig';
  const backLabel = done ? 'Lukk' : stepIndex <= 0 ? 'Avbryt' : 'Tilbake';
  const nextLabel = done ? 'Ny tur' : step === 'seover' ? 'Lagre' : 'Neste';

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Registrer kjøretur"
        nativeID="mileage-register"
        style={[styles.launch, { backgroundColor: colors.brand }]}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.launchTxt}>Registrer kjøretur</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={closeModal} statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.backdrop, { paddingTop: insets.top + 8, paddingBottom: Math.max(8, insets.bottom) }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} accessibilityLabel="Lukk registrering" />
          <View
            nativeID="mileage-wizard-modal"
            style={[styles.sheet, {
              width: frame.width,
              height: frame.height,
              backgroundColor: colors.card,
              borderColor: colors.line,
            }]}
          >
            <View style={styles.head}>
              <View style={styles.headRow}>
                <Text style={[styles.title, { color: colors.ink }]}>Ny kjøretur</Text>
                <TouchableOpacity
                  onPress={closeModal}
                  accessibilityRole="button"
                  accessibilityLabel="Lukk"
                  hitSlop={8}
                  style={styles.closeHit}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <View style={styles.steps}>
                {STEPS.map((item, index) => {
                  const active = item.id === step || (done && index === STEPS.length - 1);
                  const reached = done || (stepIndex >= 0 && index <= stepIndex);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      disabled={!reached || done}
                      onPress={() => { setError(''); setStep(item.id); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={styles.stepHit}
                    >
                      <View style={[styles.stepBar, { backgroundColor: reached ? colors.brand : colors.line }]} />
                      <Text numberOfLines={1} style={{ color: active ? colors.ink : colors.muted, fontSize: 12, fontWeight: active ? '700' : '500' }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
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
        </View>
      ) : null}

      {step === 'kjoretoy' ? (
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={openVehicleMenu}
            accessibilityRole="button"
            accessibilityLabel="Velg kjøretøy"
            accessibilityState={{ expanded: vehicleMenu }}
            nativeID="mileage-vehicle-picker"
            style={[styles.choice, styles.picker, { borderColor: draft.vehicleId ? colors.brand : colors.line }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Velg kjøretøy</Text>
              <Text style={{ color: draft.vehicleName ? colors.ink : colors.muted, fontSize: 16 }}>
                {draft.vehicleName || 'Firma eller din private bil'}
              </Text>
            </View>
            <Ionicons name={vehicleMenu ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink} />
          </TouchableOpacity>
          {vehicleMenu && !addingVehicle ? (
            <View style={[styles.vehicleMenu, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <ScrollView style={styles.vehicleScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {cars.length ? <Text style={[styles.menuLabel, { color: colors.muted }]}>Firma</Text> : null}
                {cars.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    onPress={() => { chooseCompanyCar(car); setVehicleMenu(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={vehicleTitle(car)}
                    accessibilityState={{ selected: draft.vehicleId === car.id }}
                    style={[styles.menuRow, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 16 }}>{vehicleTitle(car)}</Text>
                  </TouchableOpacity>
                ))}
                {mine.length ? <Text style={[styles.menuLabel, { color: colors.muted }]}>Privat</Text> : null}
                {mine.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    onPress={() => { chooseOwnCar(car); setVehicleMenu(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={vehicleTitle(car)}
                    accessibilityState={{ selected: draft.vehicleId === car.id }}
                    style={[styles.menuRow, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 16 }}>{vehicleTitle(car)}</Text>
                  </TouchableOpacity>
                ))}
                {!cars.length && !mine.length ? (
                  <Text style={{ color: colors.muted, fontSize: 14, paddingVertical: 8 }}>Ingen registrerte kjøretøy ennå.</Text>
                ) : null}
              </ScrollView>
              <TouchableOpacity
                onPress={beginAddVehicle}
                accessibilityRole="button"
                accessibilityLabel="Legg til ny"
                nativeID="mileage-add-vehicle"
                style={[styles.menuAdd, { borderTopColor: colors.line }]}
              >
                <Ionicons name="add" size={18} color={colors.brand} />
                <Text style={{ color: colors.brand, fontSize: 16, fontWeight: '600' }}>Legg til ny</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {addingVehicle ? (
            <View style={{ gap: 8 }}>
              <Field label="Skiltnummer" value={newPlate} onChange={setNewPlate} colors={colors} placeholder="EL12345" />
              <Field label="Navn" value={newName} onChange={setNewName} colors={colors} placeholder="Valgfritt" />
              {canCompany ? (
                <View style={styles.row}>
                  <Chip label="På meg" colors={colors} active={newScope === 'private'} onPress={() => setNewScope('private')} />
                  <Chip label="På bedriften" colors={colors} active={newScope === 'company'} onPress={() => setNewScope('company')} />
                </View>
              ) : (
                <Text style={{ color: colors.muted, fontSize: 13 }}>Bilen lagres på deg.</Text>
              )}
              <View style={styles.row}>
                <TouchableOpacity onPress={() => setAddingVehicle(false)} style={[styles.btn, styles.btnGhost, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveNewVehicle} accessibilityRole="button" accessibilityLabel="Lagre kjøretøy" style={[styles.btn, { backgroundColor: colors.brand }]}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre kjøretøy</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
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
          {draft.to && draft.to === draft.suggestedTo ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {projectAddressLabel(draft.project, addressSources)
                ? 'Til er prosjektets adresse. Den kan endres.'
                : 'Til er foreslått fra prosjektnavnet. Rett adressen om stedet er et annet.'}
            </Text>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {draft.routeSource === 'google'
              ? 'Kjørelengde fra Google Maps, ganget med to for tur/retur.'
              : draft.routeSource === 'osrm'
                ? 'Kjørelengde fra veirute, ganget med to for tur/retur.'
                : draft.routeSource === 'estimate'
                  ? 'Veitjenesten svarte ikke. Lengden er et estimat og kan rettes.'
                  : routing
                    ? 'Henter kjørelengde og bompasseringer…'
                    : 'Lengde og bom fylles når begge adressene er funnet.'}
          </Text>
          {draft.routeCharges.some((row) => row.source === 'nvdb') ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Bompasseringene er AutoPASS-stasjonene ruta krysser. Beløpet er takst for liten bil og kan endres.
            </Text>
          ) : null}
          {draft.routeCharges.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={{ color: colors.ink, flex: 1 }}>
                {row.kind === 'ferry' ? 'Ferje' : 'Bom'} · {row.name} · {row.passes === 1 ? '1 passering' : `${row.passes} passeringer`}
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
          <TouchableOpacity onPress={onOpenBilling} style={[styles.footBtn, styles.linkBtn, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>Fakturagrunnlag</Text>
          </TouchableOpacity>
        </View>
      ) : null}
            </ScrollView>
            <View style={[styles.foot, { borderTopColor: colors.line }]}>
              <TouchableOpacity
                onPress={goBack}
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                nativeID="mileage-wizard-back"
                style={[styles.footBtn, styles.footSecondary, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>{backLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={goNext}
                accessibilityRole="button"
                accessibilityLabel={nextLabel}
                nativeID="mileage-wizard-next"
                style={[styles.footBtn, styles.footPrimary, { backgroundColor: colors.brand, borderColor: colors.brand }]}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{nextLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  launch: {
    minHeight: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  launchTxt: { color: '#fff', fontSize: 17, fontWeight: '600' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', flexDirection: 'column' },
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', gap: 8 },
  stepHit: { flex: 1, minHeight: 32, justifyContent: 'center', gap: 6 },
  stepBar: { height: 4, borderRadius: 2 },
  body: { flex: 1, minHeight: 0 },
  bodyInner: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  foot: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footSecondary: { flex: 1 },
  footPrimary: { flex: 1.45 },
  linkBtn: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, minHeight: 48 },
  btn: { borderRadius: 12, paddingHorizontal: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  choice: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center' },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  vehicleMenu: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  vehicleScroll: { maxHeight: 220 },
  menuLabel: { fontSize: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  menuRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  menuAdd: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnGhost: { borderWidth: 1, backgroundColor: 'transparent' },
  menu: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginTop: 4 },
});
