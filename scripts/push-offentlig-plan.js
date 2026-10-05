/**
 * Decide whether HEAD can be sent live on the `offentlig` branch.
 * Normal pushes never deploy. Only this snapshot goes to protop.no.
 */
export function planOffentligPush({
  dirty = false,
  headSha = '',
  remoteOffentligSha = '',
  commitsNotLive = [],
} = {}) {
  const head = String(headSha || '').trim();
  if (dirty) {
    return {
      ok: false,
      error: 'Working tree er ikke ren. Commit alt som skal med — offentlig sender hele snapshotet, ikke et utvalg.',
    };
  }
  if (!/^[0-9a-f]{7,40}$/i.test(head)) {
    return { ok: false, error: 'Mangler en gyldig HEAD-commit å sende offentlig.' };
  }
  if (remoteOffentligSha && remoteOffentligSha === head) {
    return {
      ok: false,
      error: 'HEAD er allerede på origin/offentlig. Ingenting nytt å sende live.',
    };
  }
  return {
    ok: true,
    remote: 'origin',
    dest: 'refs/heads/offentlig',
    refspec: `${head}:refs/heads/offentlig`,
    commitsNotLive: [...commitsNotLive],
  };
}
