import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { callGeminiJson, TUTOR_GEMINI_MODELS } from './aiShared.js';

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
});
