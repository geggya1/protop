import { postSameOrigin } from './sameOriginFn';

/** Same-origin proxy for åpne feeds. Unngår callable CORS mot cloudfunctions.net. */
export async function proxyOpenFeed(url) {
  const data = await postSameOrigin('/api/open-feed', { url });
  const body = data?.body;
  if (typeof body !== 'string' || !body) {
    throw new Error('Tomt svar fra kilden');
  }
  return body;
}
