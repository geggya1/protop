/**
 * Produkt: katalogen som oversiktlig tabell med søk, filter og nøkkeltall.
 * Et trykk på et produkt åpner produktsiden med info, redigering, salg,
 * arkivering og statistikk over hvor produktet er brukt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import OptionPicker from '../../components/OptionPicker';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadAnbudState } from '../../src/anbud/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { formatMoney } from '../../src/economy/invoices.js';
import {
  catalogTotals,
  filterCatalog,
  salesByProduct,
  usageByProduct,
} from '../../src/economy/productCatalog.js';
import {
  PRODUCT_KINDS,
  emptyProduct,
  normalizeProduct,
  productKind,
  productsToCsv,
} from '../../src/economy/products.js';
import {
  deleteProduct,
  setProductArchived,
  setSaleStatus,
  upsertProduct,
  upsertSale,
} from '../../src/economy/opsState.js';
import { loadProductSales } from '../../src/economy/productSalesStorage.js';
import { combineSales } from '../../src/economy/productSaleSave.js';
import { patchRowsById } from '../../src/equipment/state';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, patchProjectOperations } from '../../src/project/storage';
import { showSaveToast } from '../../src/ui/saveToast';
import ProductDetail from './ProductDetail';
import { ProductForm } from './ProductForms';
import {
  Btn, Card, StatTile, kroner, qtyText, shortDate, ui as styles,
} from './productUi';

function downloadCsv(name, csv) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const COLUMNS = [
  { key: 'sku', label: 'Varenr', width: 92, sort: 'sku' },
  { key: 'name', label: 'Produkt', flex: true, sort: 'name' },
  { key: 'price', label: 'Pris eks. mva', width: 130, num: true },
  { key: 'stock', label: 'Lager', width: 80, num: true },
  { key: 'count', label: 'Salg', width: 64, num: true },
  { key: 'revenue', label: 'Omsetning eks. mva', width: 150, num: true, sort: 'revenue' },
  { key: 'last', label: 'Sist solgt', width: 104, sort: 'lastSold' },
];

function CatalogTable({ rows, colors, sort, onSort, onOpen, salesReady }) {
  return (
    <View nativeID="produkt-tabell" accessibilityRole="table" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={[styles.tr, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}>
        {COLUMNS.map((col) => {
          const on = col.sort && sort === col.sort;
          const box = [col.flex ? { flex: 1 } : { width: col.width }, col.key === 'last' ? { paddingLeft: 14 } : null];
          const label = (
            <Text style={[styles.th, col.num ? styles.num : null, { color: on ? colors.ink : colors.muted }]}>
              {col.label}{on ? (col.sort === 'name' || col.sort === 'sku' ? ' ↑' : ' ↓') : ''}
            </Text>
          );
          return col.sort ? (
            <TouchableOpacity key={col.key} onPress={() => onSort(col.sort)} accessibilityRole="button" accessibilityLabel={`Sorter på ${col.label}`} style={box}>
              {label}
            </TouchableOpacity>
          ) : (
            <View key={col.key} style={box}>{label}</View>
          );
        })}
        <View style={{ width: 20 }} />
      </View>
      {rows.map(({ product, usage }) => (
        <Pressable
          key={product.id}
          nativeID={`produkt-rad-${product.id}`}
          onPress={() => onOpen(product.id)}
          accessibilityRole="button"
          accessibilityLabel={`Åpne ${product.name}`}
          style={({ hovered, pressed }) => [
            styles.tr,
            { borderBottomColor: colors.line },
            hovered || pressed ? { backgroundColor: colors.sunken || colors.bg } : null,
          ]}
        >
          <Text style={[styles.td, { width: 92, color: colors.muted }]} numberOfLines={1}>{product.sku || '—'}</Text>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{product.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
              {[productKind(product.kind).label, product.description.split('\n')[0]].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={[styles.td, styles.num, { width: 130, color: colors.ink }]}>
            {formatMoney(product.priceExVat)}
            <Text style={{ color: colors.muted, fontSize: 11 }}>{` /${product.unit}`}</Text>
          </Text>
          <Text style={[styles.td, styles.num, { width: 80, color: product.trackStock ? colors.ink : colors.muted }]}>
            {product.trackStock ? qtyText(product.stock) : '—'}
          </Text>
          <Text style={[styles.td, styles.num, { width: 64, color: usage.count ? colors.ink : colors.muted }]}>
            {salesReady ? String(usage.count) : '…'}
          </Text>
          <Text style={[styles.td, styles.num, { width: 150, color: usage.count ? colors.ink : colors.muted }]}>
            {salesReady ? (usage.count ? formatMoney(usage.amountExVat) : '—') : '…'}
          </Text>
          <Text style={[styles.td, { width: 104, color: colors.muted, paddingLeft: 14 }]}>{usage.lastDate ? shortDate(usage.lastDate) : '—'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ width: 20 }} />
        </Pressable>
      ))}
    </View>
  );
}

function CatalogCards({ rows, colors, onOpen, salesReady }) {
  return (
    <View nativeID="produkt-tabell" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {rows.map(({ product, usage }) => (
        <TouchableOpacity
          key={product.id}
          nativeID={`produkt-rad-${product.id}`}
          onPress={() => onOpen(product.id)}
          accessibilityRole="button"
          accessibilityLabel={`Åpne ${product.name}`}
          style={[styles.cardRow, { borderBottomColor: colors.line }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{product.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
              {[product.sku, productKind(product.kind).label].filter(Boolean).join(' · ')}
            </Text>
            <Text style={{ color: colors.ink, fontSize: 13 }}>
              {`${formatMoney(product.priceExVat)} / ${product.unit}`}
              <Text style={{ color: colors.muted }}>
                {salesReady ? `  ·  ${usage.count ? `${usage.count} salg` : 'ikke solgt'}` : ''}
              </Text>
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ProductCatalog() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const { width: windowWidth } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState(0);
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [remoteSales, setRemoteSales] = useState([]);
  // loading | ok | error. Ved feil vises statistikken uten importerte salg, og ingenting kan slettes.
  const [salesLoad, setSalesLoad] = useState('loading');
  const [view, setView] = useState({ mode: 'list', id: '' });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const salesReady = salesLoad !== 'loading';
  const canEdit = access.canEdit('products');
  const canAdmin = access.canAdmin('products');
  const width = boxWidth || windowWidth;
  const narrow = width < 720;
  const wide = width >= 1080;

  useEffect(() => {
    let live = true;
    setReady(false);
    loadProjectState(familyId, { hours: false }).then((loaded) => {
      if (!live) return;
      setState(loaded || emptyProjectState());
      setReady(true);
    }).catch((cause) => {
      if (!live) return;
      setReady(true);
      setError(String(cause?.message || '') || 'Kunne ikke laste produktene.');
    });
    loadAnbudState(familyId).then((loaded) => {
      if (live) setCustomers(loaded?.customers || []);
    }).catch(() => {});
    setSalesLoad('loading');
    loadProductSales(familyId).then((rows) => {
      if (!live) return;
      setRemoteSales(rows || []);
      setSalesLoad('ok');
    }).catch(() => {
      if (live) setSalesLoad('error');
    });
    return () => { live = false; };
  }, [familyId]);

  const products = state.products || [];
  const sales = useMemo(
    () => combineSales(state.sales, remoteSales),
    [remoteSales, state.sales],
  );
  const grouped = useMemo(() => salesByProduct(products, sales), [products, sales]);
  const usage = useMemo(() => usageByProduct(grouped), [grouped]);
  const totals = useMemo(() => catalogTotals(products, grouped), [products, grouped]);
  const rows = useMemo(
    () => filterCatalog(products, usage, { query, status, kind, sort }),
    [products, usage, query, status, kind, sort],
  );
  const projects = useMemo(
    () => (state.projects || [])
      .filter((row) => row?.id && row.status !== 'arkivert')
      .sort((a, b) => String(a.number || a.name).localeCompare(String(b.number || b.name), 'nb', { numeric: true })),
    [state.projects],
  );
  const current = useMemo(() => {
    const raw = view.id ? products.find((row) => row.id === view.id) : null;
    return raw ? normalizeProduct(raw) : null;
  }, [products, view.id]);
  const currentRows = (current && grouped.get(current.id)) || [];

  /**
   * Endringen skrives rett inn i skyens ferske kopi, og vi venter på svar.
   * Feiler det, rulles skjermen tilbake og feilen vises.
   */
  async function commit(result, message) {
    if (!result.ok) {
      setError(result.error);
      return result;
    }
    const before = state;
    const after = result.state;
    const onto = (base) => {
      const patch = {};
      for (const key of ['products', 'sales', 'deletedProducts']) {
        if (before[key] !== after[key]) patch[key] = patchRowsById(base[key], before[key], after[key]);
      }
      return patch;
    };
    setState(after);
    setError('');
    setBusy(true);
    let remote;
    try {
      remote = await patchProjectOperations(familyId, onto);
    } catch (cause) {
      remote = { ok: false, error: cause };
    }
    setBusy(false);
    if (!remote?.ok) {
      const raw = String(remote?.error?.message || remote?.error?.code || '');
      const reason = /exceeds the maximum allowed size|too big/i.test(raw)
        ? 'Prosjektdataene til selskapet er større enn Firestore tillater i ett dokument.'
        : raw;
      setState((now) => (now === after ? before : now));
      setError(`Endringen ble ikke lagret.${reason ? ` ${reason}` : ''} Prøv igjen.`);
      return { ...result, ok: false };
    }
    // En ny lasting underveis kan ha hentet en eldre kopi. Legg endringen inn igjen.
    setState((now) => (now === after ? now : { ...now, ...onto(now) }));
    showSaveToast(message || 'Lagret.');
    return result;
  }

  function openProduct(id) {
    setError('');
    setNote('');
    setView({ mode: 'detail', id });
  }

  function backToList() {
    setError('');
    setView({ mode: 'list', id: '' });
  }

  async function createProduct(input) {
    const result = await commit(upsertProduct(state, emptyProduct(input)), 'Produktet er opprettet.');
    if (result.ok) setView({ mode: 'detail', id: result.product.id });
    return result;
  }

  async function removeProduct(product, usedCount) {
    const result = await commit(deleteProduct(state, product.id, { usedCount }), 'Produktet er slettet.');
    if (result.ok) {
      setView({ mode: 'list', id: '' });
      setNote(`«${product.name}» er slettet.`);
    }
    return result;
  }

  if (!ready) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg, padding: 16 }]}>
        <Text style={{ color: colors.muted }}>Laster produkter…</Text>
      </View>
    );
  }

  const body = view.mode === 'new' ? (
    <View style={{ gap: 14, maxWidth: 860 }} nativeID="produkt-ny-side">
      <TouchableOpacity onPress={backToList} accessibilityRole="link" style={styles.back}>
        <Ionicons name="chevron-back" size={16} color={colors.brand} />
        <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Alle produkter</Text>
      </TouchableOpacity>
      <Card title="Nytt produkt" colors={colors}>
        <ProductForm
          isNew
          product={emptyProduct({ kind: 'service' })}
          colors={colors}
          narrow={narrow}
          busy={busy}
          error={error}
          onCancel={backToList}
          onSave={createProduct}
        />
      </Card>
    </View>
  ) : view.mode === 'detail' && current ? (
    <ProductDetail
      key={current.id}
      product={current}
      rows={currentRows}
      colors={colors}
      wide={wide}
      narrow={narrow}
      canEdit={canEdit}
      canAdmin={canAdmin}
      salesReady={salesReady}
      salesComplete={salesLoad === 'ok'}
      busy={busy}
      error={error}
      customers={customers}
      projects={projects}
      onBack={backToList}
      onClearError={() => setError('')}
      onSave={(next) => commit(upsertProduct(state, next), 'Produktet er lagret.')}
      onSell={(sale) => commit(upsertSale(state, sale), 'Salget er registrert.')}
      onArchive={(product) => commit(setProductArchived(state, product.id, true), 'Produktet er arkivert.')}
      onRestore={(product) => commit(setProductArchived(state, product.id, false), 'Produktet er hentet tilbake.')}
      onDelete={removeProduct}
      onApproveSale={(sale) => commit(setSaleStatus(state, sale.id, 'approved'), 'Salget er klart for faktura.')}
      onOpenSales={() => requestShellTab?.('arbeid', 'salg')}
      onOpenBilling={() => requestShellTab?.('okonomi', 'fakturagrunnlag')}
    />
  ) : (
    <View style={{ gap: 14 }} nativeID="produkt-katalog">
      <View style={styles.tiles}>
        <StatTile label="Aktive produkter" value={String(totals.active)} hint={totals.archived ? `${totals.archived} arkivert` : 'Ingen arkivert'} colors={colors} />
        <StatTile
          label={`Omsetning ${new Date().getFullYear()} eks. mva`}
          value={salesReady ? kroner(totals.yearAmountExVat) : '…'}
          hint={salesReady ? `${totals.yearCount} salg` : 'Henter salg'}
          colors={colors}
        />
        <StatTile
          label="Mest solgt i år"
          value={salesReady ? (totals.topName || '—') : '…'}
          hint={totals.topName ? kroner(totals.topAmountExVat) : 'Ingen salg i år'}
          colors={colors}
        />
        <StatTile label="Uten salg" value={salesReady ? String(totals.unused) : '…'} hint="Aktive produkter som aldri er solgt" colors={colors} />
      </View>

      <View style={[styles.toolbar, narrow ? { flexDirection: 'column', alignItems: 'stretch' } : null]}>
        <View dataSet={{ focusWithin: '1' }} style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }, narrow ? null : { width: 340 }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            nativeID="produkt-sok"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på navn, varenr eller beskrivelse"
            placeholderTextColor={colors.placeholder || colors.muted}
            accessibilityLabel="Søk i produkter"
            style={[{ flex: 1, color: colors.ink, fontSize: 14, paddingVertical: 8 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
          />
        </View>
        <View style={{ minWidth: 200 }}>
          <OptionPicker
            options={[
              { id: 'active', label: `Aktive (${totals.active})` },
              { id: 'archived', label: `Arkiverte (${totals.archived})` },
            ]}
            value={status}
            onChange={(id) => { if (id) setStatus(id); }}
            clearable={false}
            small
            title="Vis"
          />
        </View>
        <View style={{ width: narrow ? undefined : 200 }}>
          <OptionPicker
            options={PRODUCT_KINDS.map((row) => ({ id: row.id, label: row.label }))}
            value={kind}
            onChange={(id) => setKind(id || '')}
            placeholder="Alle typer"
            clearLabel="Alle typer"
            chipLimit={0}
            title="Type"
          />
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.actions}>
          {products.length ? (
            <Btn label="Eksporter" icon="download-outline" onPress={() => downloadCsv('produkter.csv', productsToCsv(products))} colors={colors} accessibilityLabel="Eksporter katalog" />
          ) : null}
          {canEdit ? (
            <Btn label="Nytt produkt" icon="add" primary onPress={() => { setError(''); setView({ mode: 'new', id: '' }); }} colors={colors} nativeID="produkt-ny" />
          ) : null}
        </View>
      </View>

      {!products.length ? (
        <Card colors={colors} nativeID="produkt-tom">
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>Ingen produkter ennå</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            Legg inn det dere selger: varer og tjenester med pris, enhet og beskrivelse. Importerte produktsalg legger også nye produkter her.
          </Text>
        </Card>
      ) : !rows.length ? (
        <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="produkt-ingen-treff">
          {status === 'archived' && !query && !kind ? 'Ingen arkiverte produkter.' : 'Ingen produkter treffer søket.'}
        </Text>
      ) : narrow ? (
        <CatalogCards rows={rows} colors={colors} onOpen={openProduct} salesReady={salesReady} />
      ) : (
        <CatalogTable rows={rows} colors={colors} sort={sort} onSort={setSort} onOpen={openProduct} salesReady={salesReady} />
      )}
      {rows.length ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`${rows.length} ${rows.length === 1 ? 'produkt' : 'produkter'}. Trykk på et produkt for å se info, redigere, registrere salg og se hvor det er brukt.`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={[styles.wrap, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      nativeID="produkt-side"
    >
      <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)} style={{ gap: 12, maxWidth: 1440, width: '100%' }}>
        {hostedHero ? null : <Text style={[styles.title, { color: colors.ink }]}>Produkter</Text>}
        {salesLoad === 'error' ? (
          <Text style={{ color: colors.warn || colors.muted, fontSize: 13 }} nativeID="produkt-salg-feil">
            Fikk ikke hentet importerte produktsalg. Statistikken viser bare salg registrert i ProTop, og produkter kan bare arkiveres.
          </Text>
        ) : null}
        {note ? <Text style={{ color: colors.muted, fontSize: 13 }}>{note}</Text> : null}
        {error && view.mode === 'list' ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
        {body}
      </View>
    </ScrollView>
  );
}
