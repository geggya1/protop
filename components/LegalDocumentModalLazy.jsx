import React, { Suspense, useState } from 'react';

// Vilkår og personvern (src/i18n/legal.js) er mye tekst. Den lastes første gang dokumentet åpnes.
const LegalDocumentModal = React.lazy(() => import('./LegalDocumentModal'));

/** Samme props som LegalDocumentModal. Rendrer ingenting før dokumentet har vært åpnet. */
export default function LegalDocumentModalLazy(props) {
  const [opened, setOpened] = useState(!!props.visible);
  if (props.visible && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <LegalDocumentModal {...props} />
    </Suspense>
  );
}
