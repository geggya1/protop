/**
 * Et callable som ble opprettet da helsesjekken feilet, fikk aldri
 * offentlig invoker. Senere oppdateringer setter ikke tilgangen på nytt,
 * så nettleseren får 403 og viser det som «internal».
 */

export function withPublicInvoker(policy) {
  const bindings = (policy?.bindings || []).map((binding) => ({
    role: binding.role,
    members: [...(binding.members || [])],
  }));
  let binding = bindings.find((row) => row.role === 'roles/run.invoker');
  if (!binding) {
    binding = { role: 'roles/run.invoker', members: [] };
    bindings.push(binding);
  }
  if (!binding.members.includes('allUsers')) binding.members.push('allUsers');
  return {
    bindings,
    etag: policy?.etag || '',
    version: policy?.version || 3,
  };
}

export function serviceResource(project, region, service) {
  return `projects/${project}/locations/${region}/services/${service}`;
}

async function openService(project, region, service) {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const name = serviceResource(project, region, service);
  const current = await client.request({ url: `https://run.googleapis.com/v1/${name}:getIamPolicy` });
  const policy = withPublicInvoker(current.data);
  await client.request({
    url: `https://run.googleapis.com/v1/${name}:setIamPolicy`,
    method: 'POST',
    data: { policy, updateMask: 'bindings' },
  });
  console.log(`opened ${service} for signed-in calls`);
}

if (process.argv[1] && process.argv[1].endsWith('open-callable-invoker.mjs')) {
  const [project, region, service] = process.argv.slice(2);
  if (!project || !region || !service) {
    console.error('usage: node scripts/open-callable-invoker.mjs <project> <region> <service>');
    process.exit(1);
  }
  openService(project, region, service).catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
