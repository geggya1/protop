import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { callGeminiJson, friendlyGeminiError, preferGeminiError, TUTOR_GEMINI_MODELS } from './aiShared.js';

function geminiOk(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(payload) }] },
        }],
      };
    },
    async text() { return ''; },
  };
}

function geminiHttp(status) {
  return {
    ok: false,
    status,
    async json() { return {}; },
    async text() { return `{"error":{"code":${status}}}`; },
  };
}

describe('callGeminiJson race / lite-first', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('TUTOR_GEMINI_MODELS starter med lite', () => {
    assert.match(TUTOR_GEMINI_MODELS[0], /lite/i);
    assert.ok(TUTOR_GEMINI_MODELS.length >= 3);
  });

  it('parallel:2 returnerer første suksess uten å vente på neste batch', async () => {
    const calls = [];
    mock.method(globalThis, 'fetch', async (url) => {
      const model = decodeURIComponent(String(url).match(/models\/([^:]+)/)?.[1] || '');
      calls.push(model);
      if (model.includes('flash-lite-latest')) {
        return geminiOk({ message: 'fra-lite', boardSteps: [] });
      }
      // Tung modell «henger» — race skal likevel vinne på lite
      await new Promise((r) => setTimeout(r, 200));
      return geminiHttp(429);
    });

    const t0 = Date.now();
    const result = await callGeminiJson('fake-key', 'sys', [{ text: 'hei' }], {
      models: ['gemini-flash-lite-latest', 'gemini-2.5-flash'],
      parallel: 2,
      maxModels: 2,
      perModelTimeoutMs: 5000,
    });
    const elapsed = Date.now() - t0;

    assert.equal(result.message, 'fra-lite');
    assert.deepEqual(calls.sort(), ['gemini-2.5-flash', 'gemini-flash-lite-latest'].sort());
    assert.ok(elapsed < 120, `race should finish fast, got ${elapsed}ms`);
  });

  it('går videre til neste batch når hele racet feiler', async () => {
    const calls = [];
    mock.method(globalThis, 'fetch', async (url) => {
      const model = decodeURIComponent(String(url).match(/models\/([^:]+)/)?.[1] || '');
      calls.push(model);
      if (model === 'gemini-2.5-flash-lite') {
        return geminiOk({ message: 'batch2', boardSteps: [] });
      }
      return geminiHttp(429);
    });

    const result = await callGeminiJson('fake-key', 'sys', [{ text: 'hei' }], {
      models: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      parallel: 2,
      maxModels: 3,
    });

    assert.equal(result.message, 'batch2');
    assert.ok(calls.includes('gemini-flash-latest'));
    assert.ok(calls.includes('gemini-2.5-flash'));
    assert.ok(calls.includes('gemini-2.5-flash-lite'));
  });

  it('beholder 400 når en senere modell ikke finnes', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      const model = decodeURIComponent(String(url).match(/models\/([^:]+)/)?.[1] || '');
      if (model.includes('3.5')) return geminiHttp(404);
      return geminiHttp(400);
    });
    await assert.rejects(
      () => callGeminiJson('fake-key', 'sys', [{ text: 'hei' }], {
        models: ['gemini-2.5-flash', 'gemini-3.5-flash'],
        maxModels: 2,
      }),
      /Gemini HTTP 400/,
    );
    const hidden = preferGeminiError(
      new Error('Gemini HTTP 400 (gemini-2.5-flash): invalid image'),
      new Error('Gemini HTTP 404 (gemini-3.5-flash)'),
    );
    assert.match(friendlyGeminiError(hidden), /Komprimer/);
    assert.match(friendlyGeminiError(new Error('Gemini HTTP 404 (gemini-3.5-flash)')), /midlertidig utilgjengelig/);
  });

  it('sender bilder med JSON-navnene inlineData og mimeType', async () => {
    let body = null;
    mock.method(globalThis, 'fetch', async (_url, opts) => {
      body = JSON.parse(opts.body);
      return geminiOk({ ok: true });
    });
    await callGeminiJson('fake-key', 'sys', [{
      inline_data: { mime_type: 'image/jpeg', data: 'abc' },
    }], {
      models: ['gemini-2.5-flash'],
      maxModels: 1,
    });
    const part = body.contents[0].parts[0];
    assert.equal(part.inlineData.mimeType, 'image/jpeg');
    assert.equal(part.inlineData.data, 'abc');
    assert.equal(part.inline_data, undefined);
  });
});
