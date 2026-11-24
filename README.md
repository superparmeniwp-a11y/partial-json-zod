# partial-json-zod

Zero-dependency incremental parser for incomplete streaming JSON with optional [Zod](https://zod.dev) schema validation — built for streaming LLM / AI outputs.

## Why?

When streaming structured JSON from LLMs, chunks arrive mid-token (`{"user": {"name": "Ali`), often wrapped in markdown fences (` ```json ... ``` `) or containing trailing commas, incomplete escape sequences, or partial numbers. `partial-json-zod` repairs and parses the stream on every chunk so your UI can render progressively, while optionally validating against a Zod schema once complete.

## Installation

```bash
npm install partial-json-zod
# Optional peer dependency for schema validation:
npm install zod
```

## Quick Start

### 1. Parse partial JSON (zero dependencies)

```ts
import { parsePartialJson } from 'partial-json-zod';

const { value, isComplete } = parsePartialJson('{"name": "Ada", "tags": ["math');
// value -> { name: 'Ada', tags: ['math'] }
// isComplete -> false
```

### 2. Progressive validation with Zod

```ts
import { z } from 'zod';
import { createJsonStreamParser } from 'partial-json-zod';

const ProfileSchema = z.object({
  name: z.string(),
  age: z.number(),
  tags: z.array(z.string()),
});

const parser = createJsonStreamParser(ProfileSchema);

for await (const chunk of llmTextStream) {
  const result = parser.append(chunk);

  if (result.partial) {
    // Render partial fields immediately in your UI
    console.log('Partial:', result.partial);
  }

  if (result.valid) {
    // Fully validated against ProfileSchema
    console.log('Final:', result.data);
  }
}
```

## Features

- **Zero runtime dependencies** for core parsing (`parsePartialJson`, `repairPartialJson`)
- **Optional Zod integration** (`safeParsePartial`, `createJsonStreamParser`)
- **Handles real-world LLM quirks:**
  - Strips ` ```json ` markdown fences and leading prose
  - Closes unclosed objects, arrays, and strings
  - Drops incomplete object keys (`{"a": 1, "b":`) and trailing commas
  - Strips incomplete `\uXXXX` or trailing `\` escape sequences
  - Handles partial numbers (`42.`, `1e-`, `-`) and literals (`tr`, `fal`, `nul`)
- **Dual ESM + CJS** build with full TypeScript declarations

## API

- `parsePartialJson<T>(input, options?)` → `{ value, isComplete, repaired }`
- `repairPartialJson(input, options?)` → `string`
- `safeParsePartial(schema, input, options?)` → `{ data, partial, isComplete, valid, issues }`
- `createJsonStreamParser(schema?, options?)` → `{ append(chunk), getBuffer(), reset() }`

## License

MIT
