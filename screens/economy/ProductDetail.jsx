/**
 * Siden for ett produkt: info, redigering, salg, arkivering/sletting og statistikk.
 * Brukte produkter arkiveres. Bare produkter uten salg kan slettes for godt.
 */
import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '../../src/economy/invoices.js';
import { productMargin, productRemoval, usageSummary } from '../../src/economy/productCatalog.js';
import { productKind } from '../../src/economy/products.js';
import { ProductForm, SaleForm } from './ProductForms';
import ProductStatsCard from './ProductStats';
import {
  Btn, Card, Fact, Pill, SectionLabel, qtyText, shortDate, ui as styles, vatLabel, withVat,
} from './productUi';

function ProductInfo({ product, colors }) {
  const margin = productMargin(product);
  return (
    <View style={{ gap: 14 }} nativeID="produkt-info">
      <View style={{ gap: 4 }}>
        <SectionLabel colors={colors}>Beskrivelse</SectionLabel>
        <Text style={{ color: product.description ? colors.ink : colors.muted, fontSize: 14, lineHeight: 20 }}>
          {product.description || 'Ingen beskrivelse ennå. Trykk «Rediger» og beskriv hva produktet er.'}
        </Text>
      </View>
      <View style={styles.facts}>
        <Fact label="Pris eks. mva" value={`${formatMoney(product.priceExVat)} / ${product.unit}`} colors={colors} strong />
        <Fact label="Pris inkl. mva" value={formatMoney(withVat(product.priceExVat, product.vatCode))} colors={colors} />
        <Fact label="MVA" value={vatLabel(product.vatCode)} colors={colors} />
        <Fact label="Kostpris eks. mva" value={product.costExVat > 0 ? formatMoney(product.costExVat) : '—'} colors={colors} />
        <Fact label="Dekningsbidrag" value={margin ? `${formatMoney(margin.amount)} (${String(margin.percent).replace('.', ',')} %)` : '—'} colors={colors} />
        <Fact label="Type" value={productKind(product.kind).label} colors={colors} />
        <Fact label="Salgskonto" value={product.account || '—'} colors={colors} />
        <Fact label="Lager" value={product.trackStock ? `${qtyText(product.stock)} ${product.unit}` : 'Føres ikke'} colors={colors} />
      </View>
      {product.notes ? (
        <View style={{ gap: 4 }}>
          <SectionLabel colors={colors}>Internt notat</SectionLabel>
          <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>{product.notes}</Text>
        </View>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {[
          product.createdAt ? `Opprettet ${shortDate(product.createdAt)}` : '',
          product.updatedAt ? `endret ${shortDate(product.updatedAt)}` : '',
          product.archived && product.archivedAt ? `arkivert ${shortDate(product.archivedAt)}` : '',
        ].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

function RemovalPanel({ product, removal, canDeleteForGood, colors, busy, onArchive, onDelete, onCancel }) {
  const archive = removal.mode === 'archive' || !canDeleteForGood;
  return (
    <View nativeID="produkt-slett-panel" style={[styles.notice, { borderColor: colors.danger || '#b42318', backgroundColor: `${colors.danger || '#b42318'}0d` }]}>
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>
        {archive ? `Arkivere «${product.name}»?` : `Slette «${product.name}» for godt?`}
      </Text>
      <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>
        {removal.mode === 'archive'
          ? `Produktet er brukt i ${removal.count} salg og kan ikke slettes. Det arkiveres i stedet: det skjules fra katalogen, og salgshistorikken beholdes. Du kan hente det tilbake senere.`
          : archive
            ? 'Produktet skjules fra katalogen. Du kan hente det tilbake senere.'
            : 'Produktet er ikke brukt i noe salg. Det fjernes fra katalogen, og det kan ikke angres.'}
      </Text>
      <View style={styles.actions}>
        {archive ? (
          <Btn label="Arkiver" icon="archive-outline" primary onPress={onArchive} disabled={busy} colors={colors} nativeID="produkt-arkiver-bekreft" />
        ) : (
          <Btn label="Slett nå" icon="trash-outline" danger onPress={onDelete} disabled={busy} colors={colors} nativeID="produkt-slett-bekreft" />
        )}
        <Btn label="Avbryt" onPress={onCancel} disabled={busy} colors={colors} />
      </View>
    </View>
  );
}

export default function ProductDetail({
  product, rows, colors, wide, narrow, canEdit, canAdmin, salesReady, salesComplete, busy, error,
  customers, projects, onBack, onSave, onSell, onArchive, onRestore, onDelete, onApproveSale,
  onOpenSales, onOpenBilling, onClearError,
}) {
  const [mode, setMode] = useState('view');
  const usage = useMemo(() => usageSummary(rows), [rows]);
  const removal = productRemoval(usage);
  // Slett for godt bare når alle salg er hentet og ingen bruker produktet.
  const canDeleteForGood = canAdmin && salesComplete && removal.mode === 'delete';

  function open(next) {
    onClearError();
    setMode(next);
  }

  const kind = productKind(product.kind);
  const actions = canEdit ? (
    <View style={styles.actions}>
      {product.archived ? (
        <Btn label="Hent tilbake" icon="arrow-undo-outline" primary onPress={() => onRestore(product)} disabled={busy} colors={colors} nativeID="produkt-hent-tilbake" />
      ) : (
        <>
          <Btn label="Registrer salg" icon="cart-outline" primary onPress={() => open('sell')} disabled={busy || mode === 'sell'} colors={colors} nativeID="produkt-registrer-salg" />
          <Btn label="Rediger" icon="create-outline" onPress={() => open('edit')} disabled={busy || mode === 'edit'} colors={colors} nativeID="produkt-rediger" />
        </>
      )}
      {!product.archived || canDeleteForGood ? (
        <Btn
          label={!product.archived && removal.mode === 'archive' ? 'Slett / arkiver' : 'Slett'}
          icon="trash-outline"
          danger
          onPress={() => open('remove')}
          disabled={busy || mode === 'remove' || !salesReady}
          colors={colors}
          nativeID="produkt-slett"
        />
      ) : null}
    </View>
  ) : null;

  const info = (
    <Card title="Produktinfo" colors={colors} nativeID="produkt-info-kort">
      {mode === 'edit' ? (
        <ProductForm
          product={product}
          colors={colors}
          narrow={narrow}
          busy={busy}
          error={error}
          onCancel={() => open('view')}
          onSave={async (next) => {
            const result = await onSave(next);
            if (result?.ok) setMode('view');
          }}
        />
      ) : (
        <ProductInfo product={product} colors={colors} />
      )}
    </Card>
  );

  const sell = mode === 'sell' ? (
    <Card title="Registrer salg" colors={colors} nativeID="produkt-salg-kort">
      <SaleForm
        product={product}
        colors={colors}
        narrow={narrow}
        customers={customers}
        projects={projects}
        busy={busy}
        error={error}
        onCancel={() => open('view')}
        onSave={async (sale) => {
          const result = await onSell(sale);
          if (result?.ok) setMode('view');
        }}
      />
    </Card>
  ) : null;

  const stats = (
    <ProductStatsCard
      product={product}
      rows={rows}
      colors={colors}
      narrow={narrow}
      salesReady={salesReady}
      canApprove={canEdit}
      onApprove={onApproveSale}
      onOpenSales={onOpenSales}
      onOpenBilling={onOpenBilling}
    />
  );

  return (
    <View style={{ gap: 14 }} nativeID="produkt-detalj">
      <TouchableOpacity onPress={onBack} accessibilityRole="link" style={styles.back} nativeID="produkt-tilbake">
        <Ionicons name="chevron-back" size={16} color={colors.brand} />
        <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Alle produkter</Text>
      </TouchableOpacity>

      <View style={[styles.detailHead, narrow ? { flexDirection: 'column', alignItems: 'flex-start' } : null]}>
        <View style={{ flex: narrow ? undefined : 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {product.sku ? <Text style={{ color: colors.muted, fontSize: 15 }}>{product.sku}</Text> : null}
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', flexShrink: 1 }} nativeID="produkt-tittel">{product.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Pill label={kind.label} colors={colors} />
            <Pill label={`${formatMoney(product.priceExVat)} eks. mva / ${product.unit}`} colors={colors} />
            {product.archived ? <Pill label="Arkivert" tone="archived" colors={colors} /> : null}
            {salesReady ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {usage.count ? `Brukt i ${usage.count} salg` : 'Ikke brukt i salg'}
              </Text>
            ) : null}
          </View>
        </View>
        {actions}
      </View>

      {product.archived ? (
        <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="produkt-arkivert-info">
          {usage.count
            ? `Arkivert${product.archivedAt ? ` ${shortDate(product.archivedAt)}` : ''}. Brukt i ${usage.count} salg, så historikken beholdes. Hent tilbake for å selge produktet igjen.`
            : `Arkivert${product.archivedAt ? ` ${shortDate(product.archivedAt)}` : ''}. Hent tilbake for å selge produktet igjen.`}
        </Text>
      ) : null}

      {mode === 'remove' ? (
        <RemovalPanel
          product={product}
          removal={removal}
          canDeleteForGood={canDeleteForGood}
          colors={colors}
          busy={busy}
          onArchive={async () => {
            const result = await onArchive(product);
            if (result?.ok) setMode('view');
          }}
          onDelete={() => onDelete(product, usage.count)}
          onCancel={() => open('view')}
        />
      ) : null}
      {error && mode !== 'edit' && mode !== 'sell' ? (
        <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>
      ) : null}

      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{ flex: 5, gap: 14, minWidth: 0 }}>
            {sell}
            {info}
          </View>
          <View style={{ flex: 7, gap: 14, minWidth: 0 }}>{stats}</View>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {sell}
          {info}
          {stats}
        </View>
      )}
    </View>
  );
}
