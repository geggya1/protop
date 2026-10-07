import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { restoreFunctionSrc, stageFunctionSrc } from './stage-function-src.mjs';

test('CV-koden følger med i functions-pakken', () => {
  const root = mkdtempSync(join(tmpdir(), 'protop-fn-'));
  try {
    mkdirSync(join(root, 'src', 'employees'), { recursive: true });
    mkdirSync(join(root, 'functions', 'nested'), { recursive: true });
    writeFileSync(join(root, 'src', 'employees', 'cvText.js'), 'export const ready = true;\n');
    writeFileSync(
      join(root, 'functions', 'importInterpret.js'),
      "import { ready } from '../src/employees/cvText.js';\nexport { ready };\n",
    );
    writeFileSync(
      join(root, 'functions', 'nested', 'deeper.js'),
      "import { ready } from '../../src/employees/cvText.js';\n",
    );

    const staged = stageFunctionSrc(root);
    assert.deepEqual(staged.files, ['functions/importInterpret.js']);
    const rewritten = readFileSync(join(root, 'functions', 'importInterpret.js'), 'utf8');
    assert.match(rewritten, /from '\.\/_src\/employees\/cvText\.js'/);
    assert.equal(
      readFileSync(join(root, 'functions', '_src', 'employees', 'cvText.js'), 'utf8'),
      'export const ready = true;\n',
    );
    assert.match(
      readFileSync(join(root, 'functions', 'nested', 'deeper.js'), 'utf8'),
      /from '\.\.\/\.\.\/src\/employees\/cvText\.js'/,
    );

    restoreFunctionSrc(root);
    assert.equal(
      readFileSync(join(root, 'functions', 'importInterpret.js'), 'utf8'),
      "import { ready } from '../src/employees/cvText.js';\nexport { ready };\n",
    );
    assert.equal(
      readFileSync(join(root, 'functions', 'nested', 'deeper.js'), 'utf8'),
      "import { ready } from '../../src/employees/cvText.js';\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
