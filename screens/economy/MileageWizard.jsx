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
import OptionPicker from '../../components/OptionPicker';
import { useApp } from '../../src/context/AppContext';
import { useEmployees } from '../../src/context/CompanyDataContext';
import { displayName, ownEmployee } from '../../src/employees/model';
import { formatMoney } from '../../src/economy/invoices';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { employeeLevelIds } from '../../src/access/companyAccess';
import { recordDutyTrip } from '../../src/economy/opsState';
import { updateProject } from '../../src/project/engine';
import { upsertEquipment, upsertPersonalVehicle } from '../../src/equipment/state';
import { canAddCompanyVehicle, companyVehicles, employeeVehicles, vehicleTitle } from '../../src/equipment/model';
import { equipmentViewerAccess, vehiclesForViewer } from '../../src/equipment/calendars';
import { pickableProjects } from '../../src/project/myProjects';
import { CUSTOMER_COST_KINDS, customerCostTitle, sumCustomerCosts } from '../../src/mileage/customerCosts';
import { feeClassFromSignals, feeClassLabel, VEHICLE_FEE_CLASSES } from '../../src/mileage/vehicleFee';
import { pickReceipt, uploadImage } from '../../src/utils/media';
import { lookupVehicleByReg } from '../../src/utils/vegvesenLookupClient';
import { firebaseConfig } from '../../firebase';
import {
  addressFieldsFromPlace,
  automaticPlaceHit,
  companyAddressLabel,
  companyAddressQueries,
  companyAddressSearchHit,
  mileageProjectOptions,
  mileageRate,
  projectAddressLabel,
  projectDestinationSuggestion,
  projectHasOwnAddress,
  roundTripKm,
  sumCharges,
  tripCost,
  vehicleOdometer,
  visitPurposeLabel,
  VISIT_PURPOSES,
} from '../../src/mileage/flow';
import { suggestDriving } from '../../src/mileage/suggestRoute';
import { mileageModalFrame } from '../../src/mileage/modalFrame';
import { getDeviceLocation, reverseGeocode, searchPlaces } from '../../src/utils/location';
import MileageRouteMap from '../../components/mileage/MileageRouteMap';
import { formatDate } from '../../src/format/nb';

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

function Field({ label, value, onChange, colors, placeholder, keyboardType, onFocus, half, accessory }) {
  return (
    <View style={half ? styles.half : styles.field}>
      <View style={styles.labelRow}>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
        {accessory || null}
      </View>
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

function AddressField({ label, value, onChange, onPick, colors, shortcuts, onFocusField, matchQuery }) {
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
  const suggestions = Array.isArray(shortcuts) ? shortcuts : [];
  const pinned = typeof matchQuery === 'function' ? matchQuery(value) : null;
  const shown = [
    pinned,
    ...hits.filter((hit) => hit?.label !== pinned?.label),
  ].filter(Boolean);
  return (
    <View style={styles.field}>
      <Field
        label={label}
        value={value}
        colors={colors}
        placeholder="Søk adresse"
        onFocus={() => { setOpen(true); onFocusField?.(); }}
        onChange={(next) => { setOpen(true); onFocusField?.(); onChange(next); }}
      />
      {suggestions.length ? (
        <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {suggestions.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => { setOpen(false); row.onPress(); }}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              style={styles.shortcut}
            >
              <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>{row.label}</Text>
              {row.detail ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.detail}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {open && String(value || '').trim().length >= 3 && !shown.length ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Søker adresser…</Text>
      ) : null}
      {shown.length ? (
        <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {shown.map((hit) => (
            <TouchableOpacity key={hit.placeId || hit.label} onPress={() => { onPick(hit); setHits([]); setOpen(false); }}>
              <Text style={{ color: colors.ink, fontSize: 13, paddingVertical: 6 }}>{hit.label}</Text>
              {hit.source === 'company' ? (
                <Text style={{ color: colors.muted, fontSize: 12, paddingBottom: 6 }}>Firmaadresse</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const placeCache = new Map();

function hasCoords(place) {
  return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng));
}

function sameText(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

async function resolveMappablePlace(label, { companyLabel = '', companyQueries = [] } = {}) {
  const typed = String(label || '').trim();
  if (!typed) return null;
  const cached = placeCache.get(typed);
  if (hasCoords(cached)) return cached;
  const queries = companyLabel && sameText(typed, companyLabel) && companyQueries.length
    ? companyQueries
    : [typed];
  for (const query of queries) {
    const known = placeCache.get(query);
    if (hasCoords(known)) {
      placeCache.set(typed, known);
      return known;
    }
    const hits = await searchPlaces(query, 'nb').catch(() => []);
    const hit = automaticPlaceHit(query, hits);
    if (hasCoords(hit)) {
      placeCache.set(query, hit);
      placeCache.set(typed, hit);
      return hit;
    }
  }
  return null;
}

function readingAfterDraft(odometer, draft, trips) {
  if (!odometer) return null;
  const existing = (trips || []).find((row) => row?.id && row.id === draft.id && row.vehicleId === draft.vehicleId);
  let counted = 0;
  if (existing && existing.status !== 'rejected') {
    const date = String(existing.date || '');
    if (!(odometer.since && date && date < odometer.since)) counted = Number(existing.km) || 0;
  }
  return Math.round((odometer.current - counted + (Number(draft.km) || 0)) * 10) / 10;
}

function emptyDraft() {
  return {
    id: '',
    expenseId: '',
    date: todayKey(),
    project: null,
    vehicleKind: 'company',
    vehicleId: '',
    vehicleName: '',
    plate: '',
    electric: false,
    feeClass: 'lett',
    from: '',
    to: '',
    fromPlace: null,
    toPlace: null,
    oneWayKm: 0,
    km: 0,
    routeSource: '',
    routePoints: [],
    suggestedTo: '',
    routeCharges: [],
    extraCosts: [],
    tolls: 0,
    ferries: 0,
    visitPurpose: 'befaring',
    visitCustom: '',
    routeEdited: false,
  };
}

function draftFromTrip(trip) {
  const base = emptyDraft();
  if (!trip) return base;
  return {
    ...base,
    id: trip.id || '',
    expenseId: trip.expenseId || '',
    date: trip.date || base.date,
    project: trip.projectId ? {
      id: trip.projectId,
      number: trip.projectNumber || '',
      name: trip.projectName || '',
      client: trip.customerName || '',
      customerId: trip.customerId || '',
      customerNumber: trip.customerNumber || '',
    } : null,
    vehicleKind: trip.vehicleKind === 'company' ? 'company' : 'private',
    vehicleId: trip.vehicleId || '',
    vehicleName: trip.vehicleName || '',
    plate: trip.plate || '',
    electric: !!trip.electric,
    feeClass: trip.feeClass || (trip.electric ? 'elbil' : 'lett'),
    from: trip.from || '',
    to: trip.to || '',
    fromPlace: trip.fromLat ? { label: trip.from, lat: trip.fromLat, lng: trip.fromLng } : null,
    toPlace: trip.toLat ? { label: trip.to, lat: trip.toLat, lng: trip.toLng } : null,
    oneWayKm: Number(trip.oneWayKm) || 0,
    km: Number(trip.km) || 0,
    routeSource: trip.routeSource || 'manuell',
    routeCharges: trip.routeCharges || [],
    extraCosts: Array.isArray(trip.extraCosts) && trip.extraCosts.length
      ? trip.extraCosts
      : [
        ...(Number(trip.parking) > 0 ? [{ id: 'parking', kind: 'parking', amount: Number(trip.parking), label: '', receiptUri: '', receiptName: '' }] : []),
        ...(Number(trip.charging) > 0 ? [{ id: 'charging', kind: 'charging', amount: Number(trip.charging), label: '', receiptUri: '', receiptName: '' }] : []),
        ...(Number(trip.otherCosts) > 0 ? [{ id: 'other', kind: 'other', amount: Number(trip.otherCosts), label: '', receiptUri: '', receiptName: '' }] : []),
      ],
    tolls: Number(trip.tolls) || 0,
    ferries: Number(trip.ferries) || 0,
    visitPurpose: trip.visitPurpose || 'befaring',
    routeEdited: true,
  };
}

export default function MileageWizard({
  colors,
  state,
  onApply,
  company,
  customers = [],
  contracts = [],
  launch = true,
  editingTrip = null,
  onDismiss,
  onDelete,
}) {
  const { familyId, user, uid, activeProfile } = useApp();
  const access = useCompanyAccess();
  const { width, height } = useViewportSize();
  const insets = useSafeAreaInsets();
  const frame = mileageModalFrame(width, height, insets);
  const editing = !!editingTrip;
  const [open, setOpen] = useState(editing);
  const { employees } = useEmployees(familyId);
  const [step, setStep] = useState(editing ? 'rute' : 'prosjekt');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [routing, setRouting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinAddress, setPinAddress] = useState(false);
  const [addressAsk, setAddressAsk] = useState(true);
  const [focusField, setFocusField] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [routeNonce, setRouteNonce] = useState(0);
  const [vehicleMenu, setVehicleMenu] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState('private');
  const [newFeeClass, setNewFeeClass] = useState('lett');
  const [newFeeSource, setNewFeeSource] = useState('manual');
  const [receiptBusy, setReceiptBusy] = useState('');
  const routeEditedRef = useRef(!!editingTrip);
  const routeGen = useRef(0);
  const [draft, setDraft] = useState(() => draftFromTrip(editingTrip));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const me = ownEmployee(employees, {
    uid: uid || '',
    emails: [user?.email, activeProfile?.email].filter(Boolean),
    name: activeProfile?.name || user?.displayName || '',
  });
  const employeeId = me?.id || uid || '';
  const employeeName = me ? displayName(me) : (activeProfile?.name || user?.displayName || 'Ansatt');
  const rateInfo = mileageRate(state.mileagePolicies);
  // Firmabiler: uten Admin på Utstyr bare de personen har rettighet på (Tilgang på kjøretøyet).
  const gearAccess = equipmentViewerAccess(access, { employees, self: me });
  const cars = vehiclesForViewer(companyVehicles(state.equipment), {
    viewer: gearAccess.viewer,
    manage: gearAccess.manage,
    keepId: draft.vehicleKind === 'company' ? draft.vehicleId : '',
  });
  const mine = employeeVehicles(state.personalVehicles, state.equipment, employeeId);
  const levelIds = access.previewing
    ? employeeLevelIds(access.viewingAs)
    : (employeeLevelIds(me).length ? employeeLevelIds(me) : (access.levelId ? [access.levelId] : []));
  // Registrere firmabil: Begrenset redigering på Utstyr, som på Utstyr-siden.
  const canCompany = access.active
    ? !!access.ready && access.canEdit('equipment')
    : canAddCompanyVehicle(levelIds, { bypass: !!access.bypass && !access.previewing });
  const addressSources = useMemo(() => ({
    customers,
    contracts: [...(contracts || []), ...(state?.contracts || [])],
  }), [customers, contracts, state]);
  // Prosjektvelgeren: Admin på Prosjekt ser alle, ellers egne og åpne prosjekter.
  const allProjects = !access.active || (access.ready && access.canAdmin('projects'));
  const projects = useMemo(
    () => mileageProjectOptions(
      allProjects
        ? state
        : { ...state, projects: pickableProjects(state, gearAccess.viewer, employees, { keepId: draft.project?.id || '' }) },
      employeeId,
      { query, customers, contracts: addressSources.contracts },
    ),
    [state, employeeId, query, customers, addressSources, allProjects, gearAccess.viewer, employees, draft.project?.id],
  );
  function patch(partial) {
    if (Object.prototype.hasOwnProperty.call(partial, 'routeEdited')) {
      routeEditedRef.current = !!partial.routeEdited;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'to')) setAddressAsk(true);
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
      routePoints: [],
      routeCharges: [],
      tolls: 0,
      ferries: 0,
      routeEdited: false,
    });
    setQuery('');
    setPinAddress(false);
    setError('');
  }

  function chooseCompanyCar(car) {
    patch({
      vehicleKind: 'company',
      vehicleId: car.id,
      vehicleName: vehicleTitle(car),
      plate: car.plate,
      electric: feeClassFromSignals(car) === 'elbil',
      feeClass: feeClassFromSignals(car),
      routeEdited: false,
    });
    setError('');
  }

  function chooseOwnCar(car) {
    patch({
      vehicleKind: 'private',
      vehicleId: car.id,
      vehicleName: vehicleTitle(car),
      plate: car.plate,
      electric: feeClassFromSignals(car) === 'elbil',
      feeClass: feeClassFromSignals(car),
      routeEdited: false,
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
    setNewFeeClass('lett');
    setNewFeeSource('manual');
    setError('');
  }

  async function lookupNewPlate() {
    setError('');
    try {
      const hit = await lookupVehicleByReg(newPlate);
      const feeClass = feeClassFromSignals({
        electric: hit.fuelType === 'electric',
        fuel: hit.fuelLabel,
        fuelType: hit.fuelType,
        vehicleType: hit.vehicleType,
        tekniskKode: hit.tekniskKode,
        totalWeight: hit.totalWeight,
      });
      setNewFeeClass(feeClass);
      setNewFeeSource('vegvesen');
      if (!newName.trim() && hit.title) setNewName(hit.title);
      setError('');
    } catch (err) {
      setError(err?.message || 'Klarte ikke slå opp skiltnummeret.');
    }
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
        feeClass: newFeeClass,
        feeSource: newFeeSource,
        electric: newFeeClass === 'elbil',
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
        feeClass: newFeeClass,
        feeSource: newFeeSource,
        electric: newFeeClass === 'elbil',
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
    const office = companyAddressLabel(company);
    const cachedOffice = office ? placeCache.get(office) : null;
    patch({
      from: draft.from || office,
      fromPlace: draft.from ? draft.fromPlace : (hasCoords(cachedOffice) ? cachedOffice : null),
      to: destination,
      toPlace: draft.to ? draft.toPlace : null,
      suggestedTo: projectDestinationSuggestion(draft.project, addressSources),
      routeEdited: false,
    });
    setFocusField('');
    setError('');
    setStep('rute');
  }

  function applyEndpoint(side, label, place) {
    setFocusField('');
    setRouteNonce((n) => n + 1);
    if (side === 'to') patch({ to: label, toPlace: place, routeEdited: false, routePoints: [] });
    else patch({ from: label, fromPlace: place, routeEdited: false, routePoints: [] });
  }

  function applyCompany(side) {
    const office = companyAddressLabel(company);
    if (!office) {
      setError('Firmaet har ingen adresse.');
      return;
    }
    const cached = placeCache.get(office);
    applyEndpoint(side, office, hasCoords(cached) ? cached : null);
    setError('');
  }

  function endpointShortcuts(side) {
    const rows = [];
    if (companyAddressLabel(company)) {
      rows.push({
        id: 'company',
        label: 'Bruk firmaadressen',
        detail: companyAddressLabel(company),
        onPress: () => applyCompany(side),
      });
    }
    rows.push({
      id: 'here',
      label: 'Bruk hvor jeg er nå',
      onPress: () => useHere(side),
    });
    return rows;
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
    const office = companyAddressLabel(company);
    if (!open || !office || hasCoords(placeCache.get(office))) return undefined;
    resolveMappablePlace(office, {
      companyLabel: office,
      companyQueries: companyAddressQueries(company),
    }).catch(() => null);
    return undefined;
  }, [open, company]);

  useEffect(() => {
    if (step !== 'rute' || draft.routeEdited) return undefined;
    const fromLabel = String(draft.from || '').trim();
    const toLabel = String(draft.to || '').trim();
    if (!fromLabel || !toLabel) return undefined;
    const gen = routeGen.current + 1;
    routeGen.current = gen;
    let live = true;
    const timer = setTimeout(() => {
      setRouting(true);
      (async () => {
        const office = companyAddressLabel(company);
        let fromPlace = hasCoords(draft.fromPlace) ? draft.fromPlace : null;
        let toPlace = hasCoords(draft.toPlace) ? draft.toPlace : null;
        if (!fromPlace) {
          fromPlace = await resolveMappablePlace(fromLabel, {
            companyLabel: office,
            companyQueries: companyAddressQueries(company),
          });
        }
        const bareName = sameText(toLabel, draft.project?.name) && !projectAddressLabel(draft.project, addressSources);
        if (!toPlace && !bareName) {
          toPlace = await resolveMappablePlace(toLabel, {
            companyLabel: office,
            companyQueries: companyAddressQueries(company),
          });
        }
        if (!live || gen !== routeGen.current || routeEditedRef.current) {
          if (live && gen === routeGen.current) setRouting(false);
          return;
        }
        if (!hasCoords(fromPlace) || !hasCoords(toPlace)) {
          patch({ fromPlace: fromPlace || null, toPlace: toPlace || null });
          setRouting(false);
          return;
        }
        const route = await suggestDriving(fromPlace, toPlace, {
          apiKey: firebaseConfig?.apiKey || '',
          roundTrip: true,
          feeClass: draftRef.current.feeClass || 'lett',
        });
        if (!live || gen !== routeGen.current || routeEditedRef.current || !route) {
          if (live && gen === routeGen.current) setRouting(false);
          return;
        }
        const charges = route.charges || [];
        patch({
          fromPlace,
          toPlace,
          oneWayKm: route.oneWayKm,
          km: roundTripKm(route.oneWayKm),
          routeSource: route.source,
          routePoints: route.points || [],
          routeCharges: charges,
          tolls: sumCharges(charges, 'toll'),
          ferries: sumCharges(charges, 'ferry'),
        });
        setRouting(false);
      })().catch(() => {
        if (live && gen === routeGen.current) setRouting(false);
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [step, draft.from, draft.to, draft.feeClass, draft.routeEdited, draft.fromPlace?.lat, draft.toPlace?.lat, company, addressSources, routeNonce]);

  // Ved redigering av lagret tur mangler polyline — hent geometri til kartet på «Se over».
  useEffect(() => {
    if (step !== 'seover') return undefined;
    if ((draft.routePoints || []).length >= 2) return undefined;
    if (!hasCoords(draft.fromPlace) || !hasCoords(draft.toPlace)) return undefined;
    let live = true;
    const gen = routeGen.current + 1;
    routeGen.current = gen;
    (async () => {
      const route = await suggestDriving(draft.fromPlace, draft.toPlace, {
        apiKey: firebaseConfig?.apiKey || '',
        roundTrip: true,
        feeClass: draft.feeClass || 'lett',
      });
      if (!live || gen !== routeGen.current || !route?.points?.length) return;
      patch({ routePoints: route.points });
    })().catch(() => {});
    return () => { live = false; };
  }, [step, draft.fromPlace?.lat, draft.fromPlace?.lng, draft.toPlace?.lat, draft.toPlace?.lng, draft.feeClass, (draft.routePoints || []).length]);

  async function useHere(side = 'from') {
    setLocating(true);
    setError('');
    const gen = routeGen.current + 1;
    routeGen.current = gen;
    try {
      const pos = await getDeviceLocation();
      if (gen !== routeGen.current) return;
      const place = await reverseGeocode(pos.lat, pos.lng, 'nb');
      if (gen !== routeGen.current) return;
      const label = place?.label || `${Number(pos.lat).toFixed(5)}, ${Number(pos.lng).toFixed(5)}`;
      applyEndpoint(side, label, {
        ...place,
        label,
        lat: Number(pos.lat),
        lng: Number(pos.lng),
      });
    } catch (err) {
      const code = err?.message;
      setError(code === 'denied'
        ? 'Posisjon er ikke tillatt i nettleseren.'
        : 'Fant ikke posisjonen. Skriv adressen, eller prøv igjen.');
    } finally {
      setLocating(false);
    }
  }

  async function fillRouteIfMissing(current) {
    const from = String(current.from || '').trim();
    const to = String(current.to || '').trim();
    let km = Number(current.km) || 0;
    const oneWay = Number(current.oneWayKm) || 0;
    if (!(km > 0) && oneWay > 0) km = roundTripKm(oneWay);
    if (!from || !to || km > 0) return { from, to, km };
    const office = companyAddressLabel(company);
    const bareName = sameText(to, current.project?.name) && !projectAddressLabel(current.project, addressSources);
    let fromPlace = hasCoords(current.fromPlace) ? current.fromPlace : null;
    let toPlace = hasCoords(current.toPlace) ? current.toPlace : null;
    if (!fromPlace) {
      fromPlace = await resolveMappablePlace(from, {
        companyLabel: office,
        companyQueries: companyAddressQueries(company),
      });
    }
    if (!toPlace && !bareName) {
      toPlace = await resolveMappablePlace(to, {
        companyLabel: office,
        companyQueries: companyAddressQueries(company),
      });
    }
    if (!hasCoords(fromPlace) || !hasCoords(toPlace)) return { from, to, km: 0, fromPlace, toPlace };
    const route = await suggestDriving(fromPlace, toPlace, {
      apiKey: firebaseConfig?.apiKey || '',
      roundTrip: true,
      feeClass: current.feeClass || 'lett',
    });
    if (!route?.oneWayKm) return { from, to, km: 0, fromPlace, toPlace };
    const charges = route.charges || [];
    const nextKm = roundTripKm(route.oneWayKm);
    patch({
      fromPlace,
      toPlace,
      oneWayKm: route.oneWayKm,
      km: nextKm,
      routeSource: route.source,
      routePoints: route.points || [],
      routeCharges: charges,
      tolls: sumCharges(charges, 'toll'),
      ferries: sumCharges(charges, 'ferry'),
    });
    return { from, to, km: nextKm };
  }

  function addCustomerCost() {
    const id = `kost-${Date.now().toString(36)}`;
    setDraft((row) => ({
      ...row,
      extraCosts: [...(row.extraCosts || []), { id, kind: 'parking', label: '', amount: 0, receiptUri: '', receiptName: '' }],
    }));
  }

  function updateCustomerCost(id, partial) {
    setDraft((row) => ({
      ...row,
      extraCosts: (row.extraCosts || []).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    }));
  }

  function removeCustomerCost(id) {
    setDraft((row) => ({
      ...row,
      extraCosts: (row.extraCosts || []).filter((item) => item.id !== id),
    }));
  }

  async function attachReceipt(row) {
    setError('');
    try {
      const picked = await pickReceipt();
      if (!picked) return;
      setReceiptBusy(row.id);
      const safe = String(picked.name || 'bilag').replace(/[^\w.\-æøåÆØÅ]+/g, '-').slice(0, 80);
      const url = await uploadImage(`families/${familyId || 'personal'}/mileage/${Date.now()}-${safe}`, picked);
      updateCustomerCost(row.id, { receiptUri: url, receiptName: picked.name || 'Bilag' });
    } catch (err) {
      setError(err?.message || 'Kunne ikke legge ved bilaget.');
    } finally {
      setReceiptBusy('');
    }
  }

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

  const parkingSum = sumCustomerCosts(draft.extraCosts, 'parking');
  const chargingSum = sumCustomerCosts(draft.extraCosts, 'charging');
  const otherSum = sumCustomerCosts(draft.extraCosts, 'other');
  const cost = tripCost({
    km: draft.km,
    rate: rateInfo.rate,
    tolls: draft.tolls,
    ferries: draft.ferries,
    parking: parkingSum,
    charging: chargingSum,
    other: otherSum,
  });
  const purpose = visitPurposeLabel(draft.visitPurpose, draft.visitCustom);
  const fullProject = draft.project?.id
    ? ((state.projects || []).find((row) => row.id === draft.project.id) || draft.project)
    : null;
  const needsAddress = !!(fullProject && !projectHasOwnAddress(fullProject) && draft.to);
  const selectedVehicle = draft.vehicleKind === 'company'
    ? cars.find((row) => row.id === draft.vehicleId)
    : mine.find((row) => row.id === draft.vehicleId);
  const odometer = vehicleOdometer(selectedVehicle, state.mileageTrips);

  function save() {
    const project = draft.project;
    const result = onApply(recordDutyTrip(state, {
      id: draft.id || undefined,
      expenseId: draft.expenseId || undefined,
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
      parking: parkingSum,
      charging: chargingSum,
      otherCosts: otherSum,
      extraCosts: draft.extraCosts,
      feeClass: draft.feeClass,
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
    if (pinAddress && needsAddress && addressAsk && fullProject) {
      const addressed = onApply(updateProject(
        result.state,
        fullProject.id,
        addressFieldsFromPlace(draft.toPlace, draft.to),
      ));
      if (!addressed?.ok) {
        patch({ id: result.trip?.id || draft.id, expenseId: result.expense?.id || draft.expenseId });
        setError(addressed?.error || 'Turen er lagret, men prosjektadressen ble ikke oppdatert.');
        return;
      }
    }
    setError('');
    setOpen(false);
    if (editing) {
      onDismiss?.();
      return;
    }
    reset();
  }

  function reset() {
    setPinAddress(false);
    setAddressAsk(true);
    setFocusField('');
    setDraft(emptyDraft());
    routeEditedRef.current = false;
    setQuery('');
    setStep('prosjekt');
    setError('');
  }

  function closeModal() {
    setOpen(false);
    if (editing) {
      onDismiss?.();
      return;
    }
    reset();
  }

  function goBack() {
    const index = STEPS.findIndex((item) => item.id === step);
    setError('');
    setFocusField('');
    if (index <= 0) {
      closeModal();
      return;
    }
    setStep(STEPS[index - 1].id);
  }

  async function goNext() {
    const current = draftRef.current;
    if (step === 'prosjekt') {
      if (!current.project) {
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
      const date = String(current.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setError('Dato må være på formen ÅÅÅÅ-MM-DD.');
        return;
      }
      const from = String(current.from || '').trim();
      const to = String(current.to || '').trim();
      if (!from || !to) {
        setError(from ? 'Til må være fylt ut.' : 'Fra må være fylt ut.');
        return;
      }
      setRouting(true);
      let km = 0;
      try {
        const filled = await fillRouteIfMissing(draftRef.current);
        km = filled.km;
      } catch {
        km = Number(draftRef.current.km) || 0;
      } finally {
        setRouting(false);
      }
      if (!(km > 0)) {
        setError('Kjørelengde mangler. Skriv inn kilometer, eller velg et adressetreff.');
        return;
      }
      setError('');
      setStep('seover');
      return;
    }
    if (step === 'seover') save();
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const backLabel = stepIndex <= 0 ? 'Avbryt' : 'Tilbake';
  const nextLabel = step === 'seover' ? 'Lagre' : 'Neste';

  const bodyMax = Math.max(160, frame.maxHeight - 132);

  return (
    <>
      {launch ? (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Registrer kjøretur"
          nativeID="mileage-register"
          style={[styles.launch, { backgroundColor: colors.brand }]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.launchTxt}>Registrer kjøretur</Text>
        </TouchableOpacity>
      ) : null}
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
              maxHeight: frame.maxHeight,
              backgroundColor: colors.card,
              borderColor: colors.line,
            }]}
          >
            <View style={styles.head}>
              <View style={styles.headRow}>
                <Text style={[styles.title, { color: colors.ink }]}>{editing ? 'Rediger kjøretur' : 'Ny kjøretur'}</Text>
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
                  const active = item.id === step;
                  const reached = stepIndex >= 0 && index <= stepIndex;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      disabled={!reached}
                      onPress={() => { setError(''); setFocusField(''); setStep(item.id); }}
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
              style={[styles.body, { maxHeight: bodyMax }]}
              contentContainerStyle={styles.bodyInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {step === 'prosjekt' ? (
        <View style={styles.stack}>
          <Field
            label="Søk prosjekt"
            value={query}
            onChange={setQuery}
            colors={colors}
            placeholder="Nummer, navn eller kunde"
          />
          <Text style={[styles.hint, { color: colors.muted }]}>
            {query
              ? 'Treff i hele prosjektregisteret. Prosjekt med timer de to siste månedene står først.'
              : 'Prosjekt du har ført timer på de to siste månedene. Søk for å finne andre.'}
          </Text>
          {draft.project && !query ? (
            <View
              nativeID="mileage-project-picker"
              style={[styles.selectedCard, { borderColor: colors.brand, backgroundColor: `${colors.brand}18` }]}
            >
              <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '700' }}>Valgt prosjekt</Text>
              <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>
                {[draft.project.number ? `#${draft.project.number}` : '', draft.project.name].filter(Boolean).join(' ')}
              </Text>
              {[draft.project.client, projectAddressLabel(draft.project, addressSources)].filter(Boolean).length ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {[draft.project.client, projectAddressLabel(draft.project, addressSources)].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          ) : (
            <ScrollView
              style={styles.vehicleScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {projects.options.map((option) => {
                const active = draft.project?.id === option.project.id;
                const detail = [option.project.client, option.address].filter(Boolean).join(' · ');
                return (
                  <TouchableOpacity
                    key={option.project.id}
                    onPress={() => chooseProject(option)}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: active }}
                    nativeID="mileage-project-picker"
                    style={[styles.menuRow, {
                      borderColor: active ? colors.brand : colors.line,
                      backgroundColor: active ? `${colors.brand}18` : colors.card,
                      borderWidth: active ? 2 : 0,
                    }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 15, fontWeight: active ? '700' : '400' }} numberOfLines={1}>{option.label}</Text>
                    {detail ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{detail}</Text> : null}
                  </TouchableOpacity>
                );
              })}
              {!projects.options.length ? (
                <Text style={{ color: colors.muted, fontSize: 14, paddingVertical: 8 }}>
                  {query ? 'Ingen prosjekt matcher søket.' : 'Ingen prosjekt med timer de to siste månedene. Søk i registeret.'}
                </Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      ) : null}

      {step === 'kjoretoy' ? (
        <View style={styles.stack}>
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
          {draft.vehicleId ? (
            <Text style={{ color: colors.ink, fontSize: 13 }}>
              {`Gebyrgruppe: ${feeClassLabel(draft.feeClass) || 'Lett kjøretøy'}. Brukes på bom og ferje.`}
            </Text>
          ) : null}
          {odometer ? (
            <Text style={{ color: colors.ink, fontSize: 13 }}>
              Kilometerstand nå: {odometer.current} km
            </Text>
          ) : null}
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
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{feeClassLabel(feeClassFromSignals(car)) || 'Lett kjøretøy'}</Text>
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
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{feeClassLabel(feeClassFromSignals(car)) || 'Lett kjøretøy'}</Text>
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
            <View style={styles.stack}>
              <Field label="Skiltnummer" value={newPlate} onChange={setNewPlate} colors={colors} placeholder="EL12345" />
              <TouchableOpacity onPress={lookupNewPlate} accessibilityRole="button" accessibilityLabel="Hent fra Vegvesenet" style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Hent fra Vegvesenet</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Gebyrgruppe for bom og ferje. Importen foreslår gruppen, og du kan velge selv.
              </Text>
              <View style={styles.row}>
                {VEHICLE_FEE_CLASSES.map((row) => (
                  <Chip
                    key={row.id}
                    label={row.label}
                    colors={colors}
                    active={newFeeClass === row.id}
                    onPress={() => { setNewFeeClass(row.id); setNewFeeSource('manual'); }}
                  />
                ))}
              </View>
              {newFeeSource === 'vegvesen' ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>Gruppen er hentet fra Vegvesenet.</Text>
              ) : null}
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
        <View style={styles.stack}>
          <View style={styles.pair}>
            <Field
              half
              label="Dato"
              value={draft.date}
              colors={colors}
              placeholder="ÅÅÅÅ-MM-DD"
              onChange={(value) => patch({ date: value })}
            />
            <View style={styles.half}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Registrert av</Text>
              <Text style={{ color: colors.ink, fontSize: 15, marginTop: 6 }}>{employeeName}</Text>
            </View>
          </View>
          <AddressField
            label="Fra"
            value={draft.from}
            colors={colors}
            onFocusField={() => setFocusField('from')}
            shortcuts={focusField === 'from' ? endpointShortcuts('from') : null}
            matchQuery={(query) => companyAddressSearchHit(company, query)}
            onChange={(value) => patch({ from: value, fromPlace: null, routeEdited: false })}
            onPick={(hit) => { setFocusField(''); patch({ from: hit.label, fromPlace: hit, routeEdited: false }); }}
          />
          <AddressField
            label="Til"
            value={draft.to}
            colors={colors}
            onFocusField={() => setFocusField('to')}
            shortcuts={focusField === 'to' ? endpointShortcuts('to') : null}
            matchQuery={(query) => companyAddressSearchHit(company, query)}
            onChange={(value) => patch({ to: value, toPlace: null, routeEdited: false })}
            onPick={(hit) => { setFocusField(''); patch({ to: hit.label, toPlace: hit, routeEdited: false }); }}
          />
          {locating ? <Text style={{ color: colors.muted, fontSize: 12 }}>Henter posisjon…</Text> : null}
          {routing ? <ActivityIndicator /> : null}
          <View style={styles.pair}>
            <Field
              half
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
              half
              label="Tur/retur, km"
              value={draft.km ? String(draft.km) : ''}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => patch({ km: Number(String(value).replace(',', '.')) || 0, routeEdited: true, routeSource: 'manuell' })}
            />
          </View>
          {draft.to && draft.to === draft.suggestedTo ? (
            <Text style={[styles.hint, { color: colors.muted }]}>
              {projectAddressLabel(draft.project, addressSources)
                ? 'Til er prosjektets adresse. Den kan endres.'
                : 'Til er foreslått fra prosjektnavnet. Rett adressen om stedet er et annet.'}
            </Text>
          ) : null}
          <Text style={[styles.hint, { color: colors.muted }]}>
            {draft.routeSource === 'google' || draft.routeSource === 'osrm'
              ? 'Kjørelengde er tur/retur. Bom fylles fra passeringene på ruta.'
              : draft.routeSource === 'estimate'
                ? 'Veitjenesten svarte ikke. Lengden er et estimat og kan rettes.'
                : routing
                  ? 'Henter kjørelengde og bompasseringer…'
                  : 'Lengde og bom fylles når begge adressene er funnet. Skriv minst tre bokstaver.'}
          </Text>
          {draft.routeCharges.some((row) => row.source === 'nvdb') ? (
            <Text style={[styles.hint, { color: colors.muted }]}>
              {`Bompasseringene er AutoPASS-stasjonene ruta krysser. Beløpet er takst for ${feeClassLabel(draft.feeClass) || 'lett kjøretøy'} og kan endres.`}
            </Text>
          ) : null}
          {draft.routeCharges.some((row) => row.tariff && row.tariff !== 'lett' && row.tariffExact === false) ? (
            <Text style={[styles.hint, { color: colors.muted }]}>
              Noen stasjoner har ikke egen takst for denne gebyrgruppen. Der brukes takst for lett kjøretøy, og beløpet kan endres.
            </Text>
          ) : null}
          {draft.routeCharges.map((row) => (
            <View key={row.id} style={styles.charge}>
              <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }} numberOfLines={2}>
                {`${row.kind === 'ferry' ? 'Ferje' : 'Bom'} · ${row.name}${row.tariff ? ` · ${feeClassLabel(row.tariff)}` : ''} · ${row.passes === 1 ? '1 passering' : `${row.passes} passeringer`}`}
              </Text>
              <TextInput
                value={String(row.amount ?? '')}
                onChangeText={(value) => updateCharge(row.id, value)}
                keyboardType="decimal-pad"
                accessibilityLabel={`Beløp ${row.name}`}
                placeholder="kr"
                placeholderTextColor={colors.muted}
                style={[styles.amount, { color: colors.ink, borderColor: colors.line }]}
              />
            </View>
          ))}
          {!draft.routeCharges.length && draft.km ? (
            <Text style={[styles.hint, { color: colors.muted }]}>Ingen kjent bom eller ferje traff ruten. Legg inn beløp under om du har passert noe.</Text>
          ) : null}
          <View style={styles.pair}>
            <Field
              half
              label="Bom, kr"
              value={String(draft.tolls ?? '')}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => patch({ tolls: Number(String(value).replace(',', '.')) || 0, routeEdited: true })}
            />
            <Field
              half
              label="Ferje, kr"
              value={String(draft.ferries ?? '')}
              colors={colors}
              keyboardType="decimal-pad"
              onChange={(value) => patch({ ferries: Number(String(value).replace(',', '.')) || 0, routeEdited: true })}
            />
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Andre kostnader kunden skal betale. Hver linje kan få et bilag.
          </Text>
          {(draft.extraCosts || []).map((row) => (
            <View key={row.id} style={[styles.prompt, { borderColor: colors.line }]}>
              <View style={styles.row}>
                {CUSTOMER_COST_KINDS.map((kind) => (
                  <Chip
                    key={kind.id}
                    label={kind.label}
                    colors={colors}
                    active={row.kind === kind.id}
                    onPress={() => updateCustomerCost(row.id, { kind: kind.id })}
                  />
                ))}
              </View>
              {row.kind === 'other' ? (
                <Field
                  label="Hva gjelder det"
                  value={row.label || ''}
                  colors={colors}
                  placeholder="For eksempel bompenger kontant"
                  onChange={(value) => updateCustomerCost(row.id, { label: value })}
                />
              ) : null}
              <Field
                label="Beløp, kr"
                value={row.amount ? String(row.amount) : ''}
                colors={colors}
                keyboardType="decimal-pad"
                onChange={(value) => updateCustomerCost(row.id, { amount: Number(String(value).replace(',', '.')) || 0 })}
              />
              <View style={styles.row}>
                <TouchableOpacity
                  onPress={() => attachReceipt(row)}
                  accessibilityRole="button"
                  accessibilityLabel="Legg ved bilag"
                  style={[styles.btn, styles.btnGhost, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>
                    {receiptBusy === row.id ? 'Laster opp…' : (row.receiptName || (row.receiptUri ? 'Bilag lagt ved' : 'Legg ved bilag'))}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeCustomerCost(row.id)} accessibilityRole="button" accessibilityLabel="Fjern kostnad">
                  <Text style={{ color: colors.muted, fontWeight: '600' }}>Fjern</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity
            onPress={addCustomerCost}
            accessibilityRole="button"
            accessibilityLabel="Legg til kostnad"
            style={[styles.btn, styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Legg til kostnad</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'seover' ? (
        <View style={styles.stack}>
          <View style={[styles.reviewBlock, { borderColor: colors.line }]}>
            <View style={styles.reviewLine}>
              <Text style={[styles.reviewKey, { color: colors.muted }]}>Fra</Text>
              <Text style={[styles.reviewValue, { color: colors.ink }]}>{draft.from || '—'}</Text>
            </View>
            <View style={styles.reviewLine}>
              <Text style={[styles.reviewKey, { color: colors.muted }]}>Til</Text>
              <Text style={[styles.reviewValue, { color: colors.ink }]}>{draft.to || '—'}</Text>
            </View>
          </View>
          <MileageRouteMap
            fromPlace={draft.fromPlace}
            toPlace={draft.toPlace}
            points={draft.routePoints}
            fromLabel={draft.from}
            toLabel={draft.to}
            colors={colors}
            height={220}
          />
          <View style={[styles.reviewBlock, { borderColor: colors.line }]}>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Dato</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{formatDate(draft.date)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Person</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{employeeName}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Prosjekt</Text>
              <Text style={{ color: colors.ink, fontSize: 14, flex: 1, textAlign: 'right' }} numberOfLines={2}>
                {draft.project ? [draft.project.number ? `#${draft.project.number}` : '', draft.project.name].filter(Boolean).join(' ') : '—'}
              </Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Kjøretøy</Text>
              <Text style={{ color: colors.ink, fontSize: 14, flex: 1, textAlign: 'right' }} numberOfLines={1}>{draft.vehicleName || '—'}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Gebyrgruppe</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{feeClassLabel(draft.feeClass) || 'Lett kjøretøy'}</Text>
            </View>
          </View>
          {odometer ? (
            <Text style={{ color: colors.ink, fontSize: 13 }}>
              Kilometerstand etter denne turen: {readingAfterDraft(odometer, draft, state.mileageTrips)} km
            </Text>
          ) : null}
          {needsAddress && addressAsk ? (
            <View style={[styles.prompt, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 14 }}>
                Vil du registrere dette som fast prosjektadresse på prosjektet?
              </Text>
              <View style={styles.row}>
                <TouchableOpacity
                  onPress={() => setPinAddress(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Ja, lagre prosjektadresse"
                  style={[styles.btn, { backgroundColor: pinAddress ? colors.brand : 'transparent', borderColor: colors.brand, borderWidth: 1 }]}
                >
                  <Text style={{ color: pinAddress ? '#fff' : colors.brand, fontWeight: '600' }}>Ja</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setPinAddress(false); setAddressAsk(false); }}
                  accessibilityRole="button"
                  accessibilityLabel="Nei, ikke lagre prosjektadresse"
                  style={[styles.btn, { borderColor: colors.line, borderWidth: 1, backgroundColor: colors.card }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Nei</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Hensikt med turen</Text>
          <OptionPicker
            options={VISIT_PURPOSES}
            value={draft.visitPurpose}
            onChange={(id) => { if (id) patch({ visitPurpose: id }); }}
            title="Hensikt med turen"
            clearable={false}
          />
          {draft.visitPurpose === 'annet' ? (
            <Field label="Egen hensikt" value={draft.visitCustom} onChange={(value) => patch({ visitCustom: value })} colors={colors} />
          ) : null}
          <View style={[styles.reviewBlock, { borderColor: colors.line }]}>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Én vei</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{draft.oneWayKm ? `${draft.oneWayKm} km` : '—'}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Tur/retur</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{draft.km ? `${draft.km} km` : '—'}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{rateInfo.label}</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{draft.km} km × {rateInfo.rate.toFixed(2)} kr</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Kjøregodtgjørelse</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{formatMoney(cost.allowance)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Bom</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{formatMoney(draft.tolls || 0)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Ferje</Text>
              <Text style={{ color: colors.ink, fontSize: 14 }}>{formatMoney(draft.ferries || 0)}</Text>
            </View>
            {(draft.extraCosts || []).filter((row) => row.amount > 0 || row.receiptUri).map((row) => (
              <View key={row.id} style={styles.calcRow}>
                <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={2}>
                  {`${customerCostTitle(row)}${row.receiptName || row.receiptUri ? ' · bilag' : ''}`}
                </Text>
                <Text style={{ color: colors.ink, fontSize: 14 }}>{formatMoney(row.amount || 0)}</Text>
              </View>
            ))}
            <View style={[styles.calcRow, { marginTop: 4 }]}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Til sammen</Text>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{formatMoney(cost.amount)}</Text>
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Ingenting lagres før du trykker Lagre. Da lukkes registreringen.
          </Text>
        </View>
      ) : null}
            </ScrollView>
            {editing && confirmDelete ? (
              <Text style={{ color: colors.ink, fontSize: 13, paddingHorizontal: 16, paddingTop: 8 }}>
                Trykk «Slett nå» for å fjerne kjøreturen fra kjøreboken, utlegget og prosjektet.
              </Text>
            ) : null}
            <View style={[styles.foot, { borderTopColor: colors.line }]}>
              {editing && onDelete ? (
                <TouchableOpacity
                  onPress={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    onDelete(editingTrip);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Slett kjøretur"
                  style={[styles.footBtn, styles.footSecondary, { borderColor: colors.danger || '#b42318', backgroundColor: colors.card, marginRight: 'auto' }]}
                >
                  <Text style={{ color: colors.danger || '#b42318', fontSize: 16, fontWeight: '700' }}>
                    {confirmDelete ? 'Slett nå' : 'Slett'}
                  </Text>
                </TouchableOpacity>
              ) : null}
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
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  launchTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
  body: { flexGrow: 0, flexShrink: 1 },
  bodyInner: { flexGrow: 0, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  stack: { gap: 6 },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  field: { alignSelf: 'stretch' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2, minHeight: 18 },
  prompt: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  hint: { fontSize: 12, lineHeight: 16 },
  charge: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  amount: {
    width: 72,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 15,
    textAlign: 'right',
  },
  menuSearch: { paddingHorizontal: 10, paddingTop: 8 },
  menuHint: { fontSize: 12, lineHeight: 16, paddingHorizontal: 12, paddingBottom: 4 },
  foot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footBtn: {
    alignSelf: 'flex-start',
    minHeight: 40,
    minWidth: 96,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  footSecondary: {},
  footPrimary: {},
  linkBtn: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 15, minHeight: 36 },
  btn: { borderRadius: 10, paddingHorizontal: 12, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  choice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  vehicleMenu: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  vehicleScroll: { maxHeight: 220, flexGrow: 0 },
  menuLabel: { fontSize: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  menuRow: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  menuAdd: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnGhost: { borderWidth: 1, backgroundColor: 'transparent' },
  menu: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginTop: 2 },
  shortcut: { paddingVertical: 6 },
  selectedCard: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  reviewBlock: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  reviewLine: { gap: 1 },
  reviewKey: { fontSize: 11, fontWeight: '600' },
  reviewValue: { fontSize: 16, fontWeight: '700' },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
