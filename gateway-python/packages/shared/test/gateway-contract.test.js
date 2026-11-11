// Teste de contrato entre linguagens: o que o gateway (Python, Grupo 1) publica
// precisa passar no validador que o front e o backend usam (JavaScript).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEnvelope, schema } from '../src/validate.js';

const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/gateway-sample.json', import.meta.url), 'utf8'));
const tagPattern = new RegExp(schema.properties.tag.pattern);

test('todo envelope do gateway passa no validador JS', () => {
  assert.ok(fixtures.length > 0);
  for (const env of fixtures) assert.doesNotThrow(() => validateEnvelope(env), env.tag);
});

test('campos obrigatórios do schema estão presentes', () => {
  for (const env of fixtures)
    for (const field of schema.required) assert.ok(field in env, `${env.tag} sem ${field}`);
});

test('tags seguem o padrão e não carregam endereço do CLP', () => {
  for (const env of fixtures) {
    assert.match(env.tag, tagPattern);
    assert.doesNotMatch(JSON.stringify(env), /ns=\d|DB\d+,X/);
  }
});

test('dado de mock nunca sai como medido', () => {
  for (const env of fixtures) assert.notEqual(env.origin, 'medido');
});

test('falha de leitura vem como BAD com value null (nunca valor congelado)', () => {
  const bad = fixtures.filter(e => e.quality.status === 'BAD');
  assert.ok(bad.length > 0);
  for (const e of bad) assert.equal(e.value, null);
});
