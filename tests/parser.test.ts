import { describe, expect, it } from 'vitest';
import { parsePartialJson, repairPartialJson } from '../src/index.js';

describe('parsePartialJson', () => {
  it('handles empty and whitespace-only inputs', () => {
    expect(parsePartialJson('')).toEqual({
      value: undefined,
      isComplete: false,
      repaired: '',
    });
    expect(parsePartialJson('   \n\t ')).toEqual({
      value: undefined,
      isComplete: false,
      repaired: '',
    });
  });

  it('fast-paths complete valid JSON', () => {
    const res = parsePartialJson<{ a: number; b: string }>('{"a": 1, "b": "ok"}');
    expect(res.isComplete).toBe(true);
    expect(res.value).toEqual({ a: 1, b: 'ok' });
  });

  it('parses unclosed objects and strings', () => {
    expect(parsePartialJson('{"name": "Ali').value).toEqual({ name: 'Ali' });
    expect(parsePartialJson('{"user": {"name": "Ali').value).toEqual({
      user: { name: 'Ali' },
    });
  });

  it('drops incomplete object keys and trailing colons', () => {
    expect(parsePartialJson('{"a": 1, "b').value).toEqual({ a: 1 });
    expect(parsePartialJson('{"a": 1, "b":').value).toEqual({ a: 1 });
    expect(parsePartialJson('{"a": 1, "b": ').value).toEqual({ a: 1 });
  });

  it('handles trailing commas in arrays and objects', () => {
    expect(parsePartialJson('[1, 2, ').value).toEqual([1, 2]);
    expect(parsePartialJson('{"a": 1, ').value).toEqual({ a: 1 });
  });

  it('handles incomplete escape sequences in strings', () => {
    expect(parsePartialJson('{"msg": "hello\\').value).toEqual({ msg: 'hello' });
    expect(parsePartialJson('{"msg": "hi\\u00').value).toEqual({ msg: 'hi' });
    expect(parsePartialJson('{"msg": "hi\\u0041').value).toEqual({ msg: 'hiA' });
  });

  it('handles incomplete numbers and literals', () => {
    expect(parsePartialJson('{"n": 42.').value).toEqual({ n: 42 });
    expect(parsePartialJson('{"n": 1e-').value).toEqual({ n: 1 });
    expect(parsePartialJson('{"n": -').value).toEqual({});
    expect(parsePartialJson('{"ok": tr').value).toEqual({ ok: true });
    expect(parsePartialJson('{"ok": fal').value).toEqual({ ok: false });
    expect(parsePartialJson('{"ok": nul').value).toEqual({ ok: null });
  });

  it('respects allowPartialStrings: false and completeLiterals: false', () => {
    expect(
      parsePartialJson('{"a": "hel', { allowPartialStrings: false }).value
    ).toEqual({});
    expect(
      parsePartialJson('{"a": tr', { completeLiterals: false }).value
    ).toEqual({});
  });

  it('strips markdown code fences and leading prose', () => {
    const input = 'Here is the JSON:\n```json\n{"title": "Hel';
    expect(parsePartialJson(input).value).toEqual({ title: 'Hel' });

    const completeFenced = '```json\n{"ok": true}\n```';
    expect(parsePartialJson(completeFenced).value).toEqual({ ok: true });
  });

  it('repairPartialJson returns valid JSON string', () => {
    const repaired = repairPartialJson('{"items": [1, 2, {"x": "a');
    expect(JSON.parse(repaired)).toEqual({ items: [1, 2, { x: 'a' }] });
  });
});
