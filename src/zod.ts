import type { ZodError, ZodIssue, ZodTypeAny, infer as ZodInfer } from 'zod';
import { parsePartialJson, type ParseOptions } from './parser.js';

export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends Record<string, unknown>
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export interface ZodParseResult<S extends ZodTypeAny> {
  /** Full validated data when `valid === true`. */
  data: ZodInfer<S> | undefined;
  /** Best-effort partial value parsed from the stream, even before all required fields arrive. */
  partial: DeepPartial<ZodInfer<S>> | undefined;
  /** `true` when the raw JSON input was syntactically complete without repair. */
  isComplete: boolean;
  /** `true` when `schema.safeParse` succeeded. */
  valid: boolean;
  /** Zod validation issues when `valid === false` and a partial value was parsed. */
  issues: ZodIssue[];
}

/**
 * Parses an incomplete or complete JSON string and validates it against a Zod schema.
 * Always returns `partial` for progressive UI rendering while `valid` indicates full schema compliance.
 */
export function safeParsePartial<S extends ZodTypeAny>(
  schema: S,
  input: string,
  options?: ParseOptions
): ZodParseResult<S> {
  const { value, isComplete } = parsePartialJson(input, options);

  if (value === undefined) {
    return {
      data: undefined,
      partial: undefined,
      isComplete: false,
      valid: false,
      issues: [],
    };
  }

  const result = schema.safeParse(value);
  if (result.success) {
    return {
      data: result.data,
      partial: result.data as DeepPartial<ZodInfer<S>>,
      isComplete,
      valid: true,
      issues: [],
    };
  }

  const error: ZodError = result.error;
  return {
    data: undefined,
    partial: value as DeepPartial<ZodInfer<S>>,
    isComplete,
    valid: false,
    issues: error.issues,
  };
}

export interface JsonStreamParser<S extends ZodTypeAny | undefined = undefined> {
  /** Append a new text chunk from the stream and return the latest parse state. */
  append(
    chunk: string
  ): S extends ZodTypeAny
    ? ZodParseResult<S>
    : { value: unknown; isComplete: boolean; repaired: string };
  /** Return the accumulated raw buffer so far. */
  getBuffer(): string;
  /** Reset the internal buffer. */
  reset(): void;
}

/**
 * Creates a stateful incremental parser for streaming LLM chunks.
 */
export function createJsonStreamParser<S extends ZodTypeAny>(
  schema: S,
  options?: ParseOptions
): JsonStreamParser<S>;
export function createJsonStreamParser(
  schema?: undefined,
  options?: ParseOptions
): JsonStreamParser<undefined>;
export function createJsonStreamParser<S extends ZodTypeAny | undefined>(
  schema?: S,
  options?: ParseOptions
): JsonStreamParser<S> {
  let buffer = '';

  return {
    append(chunk: string) {
      buffer += chunk;
      if (schema) {
        return safeParsePartial(schema, buffer, options) as ReturnType<
          JsonStreamParser<S>['append']
        >;
      }
      return parsePartialJson(buffer, options) as ReturnType<
        JsonStreamParser<S>['append']
      >;
    },
    getBuffer() {
      return buffer;
    },
    reset() {
      buffer = '';
    },
  };
}
