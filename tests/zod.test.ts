import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createJsonStreamParser, safeParsePartial } from '../src/index.js';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  tags: z.array(z.string()),
});

describe('safeParsePartial & createJsonStreamParser', () => {
  it('returns partial data before required fields are complete', () => {
    const res = safeParsePartial(UserSchema, '{"name": "Ada');
    expect(res.valid).toBe(false);
    expect(res.isComplete).toBe(false);
    expect(res.data).toBeUndefined();
    expect(res.partial).toEqual({ name: 'Ada' });
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('validates once all required fields arrive', () => {
    const res = safeParsePartial(
      UserSchema,
      '{"name": "Ada", "age": 36, "tags": ["math", "code"]}'
    );
    expect(res.valid).toBe(true);
    expect(res.isComplete).toBe(true);
    expect(res.data).toEqual({ name: 'Ada', age: 36, tags: ['math', 'code'] });
    expect(res.issues).toEqual([]);
  });

  it('streams chunks incrementally via createJsonStreamParser', () => {
    const parser = createJsonStreamParser(UserSchema);
    const chunks = [
      '```json\n{"name": "Gra',
      'ce", "age": 4',
      '0, "tags": ["comp',
      'iler"]}\n```',
    ];

    const r1 = parser.append(chunks[0]);
    expect(r1.valid).toBe(false);
    expect(r1.partial).toEqual({ name: 'Gra' });

    const r2 = parser.append(chunks[1]);
    expect(r2.valid).toBe(false);
    expect(r2.partial).toEqual({ name: 'Grace', age: 4 });

    const r3 = parser.append(chunks[2]);
    expect(r3.valid).toBe(true);
    expect(r3.isComplete).toBe(false);
    expect(r3.partial).toEqual({ name: 'Grace', age: 40, tags: ['comp'] });

    const r4 = parser.append(chunks[3]);
    expect(r4.valid).toBe(true);
    expect(r4.isComplete).toBe(true);
    expect(r4.data).toEqual({ name: 'Grace', age: 40, tags: ['compiler'] });

    parser.reset();
    expect(parser.getBuffer()).toBe('');
  });
});
