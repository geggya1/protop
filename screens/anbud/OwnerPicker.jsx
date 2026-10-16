import React from 'react';
import AgreementPersonField from './AgreementPersonField';

/** Valgt ansvarlig vises med navn. Blyanten åpner søk og bla. */
export default function OwnerPicker({
  colors,
  people = [],
  value = '',
  onChange,
  label = 'Ansvarlig for avtalen',
}) {
  return (
    <AgreementPersonField
      colors={colors}
      people={people}
      ownerUid={value}
      label={label}
      placeholder="Ikke tildelt"
      onSelect={onChange}
    />
  );
}
