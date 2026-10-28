/**
 * Godkjenningstrinn i prosesser kan bare fullføres av rollen i trinnet eller en godkjenner (ISO-15).
 * Testen gjenskaper feilen fra revisjonen: alle som så saken, kunne godkjenne.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveAndPublish, completeStep, createProcess, startInstance, stepAssignee, stepBlocker, submitForApproval, normalizeDiagram, publishedVersionOf,
} from './processes.js';
import { templateByKey } from './processTemplates.js';
import { isoCapabilities } from './access.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const LEDER = { uid: 'u7', name: 'Lise Leder' };
const STAFF = { uid: 'u9', name: 'Stian Ansatt' };
const now = new Date('2026-10-27T10:00:00Z');
const ADMIN = isoCapabilities({ bypass: true, uid: 'u3' });
const READER = isoCapabilities({ grants: { iso: 'see' }, uid: 'u9' });
const MANAGER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u7' });
const ROLES = { manager: { name: LEDER.name, uid: LEDER.uid } };

/** Avviksprosessen kjørt fram til godkjenningstrinnet «Godkjenn lukking» (rolle: leder). */
function atApproval() {
  let p = createProcess({ title: 'Avvik', ownerName: ANNE.name }, { actor: ANNE, now, template: templateByKey('P02_avvik') }).process;
  p = submitForApproval(p, {}, { actor: ANNE, now }).process;
  p = approveAndPublish(p, {}, { actor: { uid: 'u3', name: 'Sjef' }, caps: ADMIN, now }).process;
  let inst = startInstance(p, { title: 'AVV-2026-001' }, { actor: ANNE, now }).instance;
  for (const [id, input] of [['a', {}], ['b', {}], ['c', { decision: 'no' }], ['f', { decision: 'no' }], ['l', {}]]) {
    const r = completeStep(inst, p, id, input, { actor: ANNE, now });
    assert.equal(r.ok, true, `${id}: ${r.error}`);
    inst = r.instance;
  }
  assert.deepEqual(inst.active, ['k']);
  return { p, inst };
}

test('ISO-15: godkjenningstrinn kan ikke fullføres av hvem som helst som ser saken', () => {
  const { p, inst } = atApproval();
  const denied = completeStep(inst, p, 'k', { approval: 'approved' }, { actor: STAFF, now, caps: READER, roleMap: ROLES });
  assert.equal(denied.ok, false, 'ansatt kunne godkjenne før rettingen');
  assert.match(denied.error, /Lise Leder/);
  assert.match(stepBlocker(inst, p, 'k', { actor: STAFF, caps: READER, roleMap: ROLES }), /Godkjennes av/);
});

test('ISO-15: rollen i trinnet eller en godkjenner i ISO kan godkjenne', () => {
  const { p, inst } = atApproval();
  const diagram = normalizeDiagram(publishedVersionOf(p).diagram);
  assert.equal(stepAssignee(inst, diagram, diagram.nodes.find((n) => n.id === 'k'), ROLES).uid, LEDER.uid);
  assert.equal(completeStep(inst, p, 'k', { approval: 'approved' }, { actor: LEDER, now, caps: MANAGER, roleMap: ROLES }).ok, true);
  assert.equal(completeStep(inst, p, 'k', { approval: 'approved' }, { actor: { uid: 'u3', name: 'Sjef' }, now, caps: ADMIN, roleMap: ROLES }).ok, true, 'godkjenner som stedfortreder');
  // Tildelt på saken går foran rollen i innstillingene.
  const assigned = { ...inst, roleAssignments: { manager: { uid: STAFF.uid, name: STAFF.name } } };
  assert.equal(completeStep(assigned, p, 'k', { approval: 'approved' }, { actor: STAFF, now, caps: READER, roleMap: ROLES }).ok, true);
  // Vanlige trinn er som før.
  assert.equal(stepBlocker(inst, p, 'a', { actor: STAFF, caps: READER, roleMap: ROLES }), '');
});
