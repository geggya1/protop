import { useCallback, useEffect, useState } from 'react';
import { libraryForm, libraryTemplateId } from '../../src/forms/ksLibrary';
import { newFilledDoc } from '../../src/forms/filledDocs';
import { normalizeFormTemplates } from '../../src/anbud/bidLibrary';
import { loadAnbudState, peekAnbudState } from '../../src/anbud/storage';
import { displayName } from '../../src/employees/model';
import { fillSource, templateControlKey } from '../../src/doccontrol/templates';
import { useDocControl } from '../doccontrol/useDocControl';

/** Ferdige felt som kan fylles fra personkortet. */
export function prefillFromEmployee(doc, employee) {
  if (!employee) return doc;
  const person = employee.person || {};
  const name = displayName(employee);
  const company = employee.company || {};
  const values = {
    navn: name,
    medarbeider: name,
    stilling: company.title || '',
    ansattnummer: company.externalEmployeeNumber || '',
    'privat e-post': person.email || '',
    'privat telefon': person.phone || '',
    'e-post arbeid': company.email || '',
    'telefon arbeid': '',
    adresse: [person.address1, person.address2].filter(Boolean).join(', '),
    'postnr. og sted': [person.postalCode, person.place].filter(Boolean).join(' '),
    pårørende: person.kinName || '',
    'telefon pårørende': person.kinPhone || '',
  };
  const dates = {
    tiltredelsesdato: company.periodFrom || '',
    'ansatt siden': company.periodFrom || '',
    fødselsdato: person.birthDate || '',
  };
  return {
    ...doc,
    fields: doc.fields.map((field) => {
      const key = String(field.label || '').trim().toLocaleLowerCase('nb-NO');
      if (field.editor === 'fast' || field.value) return field;
      if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(dates[key] || ''))) return { ...field, value: String(dates[key]).slice(0, 10) };
      const value = values[key];
      if (!value || !['text', 'long'].includes(field.kind)) return field;
      return { ...field, value: String(value) };
    }),
  };
}

/**
 * Start et personalskjema fra KS-biblioteket (HR → Skjemaer og HR → Oppfølging bruker det samme):
 * bedriftens tilpassede mal om den finnes, ellers standardmalen, med gjeldende godkjente versjon og
 * dokumenthodet fra dokumentstyringen. Felt fra personkortet fylles inn.
 * start(key, employee, actor) gir { doc, approved }.
 */
export function useHrFormStart(familyId) {
  const [templates, setTemplates] = useState(() => normalizeFormTemplates(peekAnbudState(familyId)?.formTemplates || []));
  const dc = useDocControl();

  useEffect(() => {
    let live = true;
    loadAnbudState(familyId).then((state) => { if (live) setTemplates(normalizeFormTemplates(state?.formTemplates || [])); });
    return () => { live = false; };
  }, [familyId]);

  // Ny funksjon bare når malene eller dokumentstyringen endres.
  const start = useCallback((key, employee, actor) => {
    const own = templates.find((row) => row.id === libraryTemplateId(key));
    const form = own ? null : libraryForm(key);
    const template = own || (form ? { ...form, id: libraryTemplateId(key) } : null);
    if (!template) return null;
    const source = fillSource(template, dc.controlFor(templateControlKey(template)));
    const subject = employee ? { kind: 'employee', id: employee.id, name: displayName(employee) } : null;
    // libraryKey alltid med, også fra bedriftens tilpassede mal, så samtalen kjennes igjen overalt.
    const doc = newFilledDoc({ ...source.form, libraryKey: source.form.libraryKey || key }, { actor, scope: 'hr', subject });
    return { doc: prefillFromEmployee(doc, employee), approved: !!source.approved };
  }, [templates, dc]);

  return { start, dc };
}
