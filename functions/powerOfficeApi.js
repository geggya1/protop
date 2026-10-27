/**
 * PowerOffice Go API v2: token, kall og grensen på 10 kall i sekundet.
 *
 * Nøkler:
 * - applikasjonsnøkkel og abonnementsnøkkel per miljø (Secret Manager, se POWEROFFICE_ENVS)
 * - klientnøkkel per bedrift (powerOfficeClients/{familyId}, bare serveren leser den)
 *
 * Ref: e-post fra PowerOffice API-support 19.–21.10.2026 og developer.poweroffice.net.
 */

export const POWEROFFICE_ENVS = {
  demo: {
    label: 'Demo',
    tokenUrl: 'https://goapi.poweroffice.net/Demo/OAuth/Token',
    baseUrl: 'https://goapi.poweroffice.net/demo/v2',
    guiUrl: 'https://godemo.poweroffice.net/',
    secrets: {
      applicationKey: 'POWEROFFICE_DEMO_APPLICATION_KEY',
      subscriptionKey: 'POWEROFFICE_DEMO_SUBSCRIPTION_KEY',
    },
  },
  prod: {
    label: 'Produksjon',
    tokenUrl: 'https://goapi.poweroffice.net/OAuth/Token',
    baseUrl: 'https://goapi.poweroffice.net/v2',
    guiUrl: 'https://go.poweroffice.net/',
    secrets: {
      applicationKey: 'POWEROFFICE_APPLICATION_KEY',
      subscriptionKey: 'POWEROFFICE_SUBSCRIPTION_KEY',
    },
  },
};

/** API-et tillater 10 kall i sekundet. Litt luft gjør at vi holder oss under. */
export const MIN_CALL_INTERVAL_MS = 110;

export class PowerOfficeError extends Error {
  constructor(message, { status = 0, path = '', problem = null } = {}) {
    super(message);
    this.name = 'PowerOfficeError';
    this.status = status;
    this.path = path;
    this.problem = problem;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(res) {
  const raw = await res.text().catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** ProblemDetail fra API-et: { title, detail, errors: { Felt: ['melding'] } }. */
export function problemMessage(problem, status) {
  if (problem && typeof problem === 'object') {
    const fieldErrors = problem.errors && typeof problem.errors === 'object'
      ? Object.entries(problem.errors)
        .flatMap(([field, list]) => (Array.isArray(list) ? list : [list]).map((msg) => `${field}: ${msg}`))
      : [];
    const parts = [problem.detail, problem.title, ...fieldErrors]
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (parts.length) return [...new Set(parts)].join(' · ');
  }
  if (typeof problem === 'string' && problem.trim()) return problem.trim().slice(0, 300);
  if (status === 401) return 'PowerOffice avviste nøklene.';
  if (status === 403) return 'Integrasjonen mangler tilgang til dette i PowerOffice.';
  if (status === 404) return 'Fant ikke dette i PowerOffice.';
  if (status === 429 || status === 503) return 'PowerOffice er opptatt. Prøv igjen om litt.';
  return `PowerOffice svarte ${status || 'uten status'}.`;
}

export function createPowerOfficeClient({
  env = 'demo',
  applicationKey,
  clientKey,
  subscriptionKey,
  fetchImpl = fetch,
  now = Date.now,
  sleep = defaultSleep,
  minIntervalMs = MIN_CALL_INTERVAL_MS,
  maxRetries = 3,
} = {}) {
  const config = POWEROFFICE_ENVS[env];
  if (!config) throw new PowerOfficeError(`Ukjent PowerOffice-miljø: ${env}`);
  if (!applicationKey || !subscriptionKey) {
    throw new PowerOfficeError(`PowerOffice-nøklene for ${config.label.toLowerCase()} er ikke satt opp.`);
  }
  if (!clientKey) throw new PowerOfficeError('Klientnøkkel for PowerOffice mangler.');

  let token = null;
  let nextSlot = 0;

  async function takeSlot() {
    const t = now();
    const start = Math.max(t, nextSlot);
    nextSlot = start + minIntervalMs;
    if (start > t) await sleep(start - t);
  }

  async function send(url, init) {
    for (let attempt = 0; ; attempt += 1) {
      await takeSlot();
      const res = await fetchImpl(url, init);
      // 429 ved for mange kall, 503 når SalesOrders/Complete når makskapasitet.
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 30) * 1000
          : 500 * 2 ** attempt;
        await sleep(waitMs);
        continue;
      }
      return res;
    }
  }

  async function accessToken() {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const basic = Buffer.from(`${applicationKey}:${clientKey}`).toString('base64');
    const res = await send(config.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    const body = await readBody(res);
    if (!res.ok || !body?.access_token) {
      const message = res.status === 400 || res.status === 401
        ? 'PowerOffice avviste nøklene. Sjekk klientnøkkelen og at integrasjonen er aktivert på klienten.'
        : problemMessage(body, res.status);
      throw new PowerOfficeError(message, { status: res.status, path: 'OAuth/Token', problem: body });
    }
    const seconds = Number(body.expires_in) || 1200;
    token = { value: body.access_token, expiresAt: now() + seconds * 1000 };
    return token.value;
  }

  /**
   * Ett kall mot API-et. GET som gir 404 returnerer null, så den som spør
   * kan skille «finnes ikke» fra feil.
   */
  async function request(method, path, { query = null, body = undefined } = {}) {
    const url = new URL(`${config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    const call = async () => send(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let res = await call();
    if (res.status === 401) {
      token = null;
      res = await call();
    }
    if (res.status === 404 && method === 'GET') return null;
    const data = await readBody(res);
    if (!res.ok) {
      throw new PowerOfficeError(problemMessage(data, res.status), { status: res.status, path, problem: data });
    }
    return data;
  }

  /** Henter alle sider (PageNumber er 1-basert). */
  async function listAll(path, query = {}, { pageSize = 100, maxPages = 50 } = {}) {
    const rows = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await request('GET', path, { query: { ...query, PageNumber: page, PageSize: pageSize } });
      const list = Array.isArray(batch) ? batch : [];
      rows.push(...list);
      if (list.length < pageSize) break;
    }
    return rows;
  }

  return { env, config, accessToken, request, listAll };
}
