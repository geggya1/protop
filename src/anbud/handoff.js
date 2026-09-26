import { addContract, createProject } from '../project/engine.js';

function text(value) {
  return String(value || '').trim();
}

function projectNumber(contract, projects) {
  const base = contract.noticeId
    ? `A-${contract.noticeId}`
    : `A-${text(contract.id).replace(/\W/g, '').slice(-8) || 'ny'}`;
  let number = base.slice(0, 32);
  let n = 2;
  const taken = new Set((projects || []).filter((row) => row.status !== 'arkivert').map((row) => row.number));
  while (taken.has(number)) {
    const suffix = `-${n}`;
    number = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    n += 1;
  }
  return number;
}

/** Vunnet kontrakt blir et prosjekt med kontraktssummen ført i prosjektregnskapet. */
export function projectFromAward(projectState, contract) {
  if (!contract?.id || !contract.title) {
    return { ok: false, state: projectState, error: 'Kontrakten mangler tittel.' };
  }
  if (contract.projectId && (projectState.projects || []).some((row) => row.id === contract.projectId)) {
    return { ok: true, state: projectState, projectId: contract.projectId, created: false, error: null };
  }
  const created = createProject(projectState, {
    name: contract.title,
    number: projectNumber(contract, projectState.projects),
    client: contract.buyer,
    phase: 'planlegging',
  });
  if (!created.ok) return { ...created, projectId: null, created: false };
  const projectId = created.state.activeProjectId;
  const withContract = addContract(created.state, {
    projectId,
    title: contract.title,
    party: text(contract.buyer) || 'Oppdragsgiver',
    value: contract.value,
  });
  if (!withContract.ok) return { ...withContract, projectId: null, created: false };
  return { ok: true, state: withContract.state, projectId, created: true, error: null };
}
