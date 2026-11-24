export interface ParseOptions {
  /**
   * Strip markdown code fences (e.g. ```json ... ```) and leading prose before the first `{` or `[`.
   * @default true
   */
  stripMarkdown?: boolean;
  /**
   * Include string values whose closing quote has not arrived yet.
   * @default true
   */
  allowPartialStrings?: boolean;
  /**
   * Complete partial boolean/null literals (`tru` -> `true`, `fal` -> `false`, `nul` -> `null`).
   * When false, incomplete literals are omitted.
   * @default true
   */
  completeLiterals?: boolean;
}

export interface ParseResult<T = unknown> {
  /** Parsed JavaScript value, or `undefined` if no valid JSON structure has started yet. */
  value: T | undefined;
  /** `true` when the input is already valid, complete JSON without needing repair. */
  isComplete: boolean;
  /** The repaired JSON string that was parsed, or empty string if unparseable. */
  repaired: string;
}

type ContainerType = '{' | '[';

const LITERALS = ['true', 'false', 'null'] as const;

/**
 * Strips optional markdown code fences and leading non-JSON text.
 */
function preprocessInput(raw: string, stripMarkdown: boolean): string {
  let text = raw.trimStart();
  if (!stripMarkdown || text.length === 0) {
    return text;
  }

  // Remove opening markdown fence like ```json or ```
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n');
    if (firstNewline === -1) {
      return '';
    }
    text = text.slice(firstNewline + 1).trimStart();
  }

  // Remove closing markdown fence if present
  const closingFence = text.lastIndexOf('```');
  if (closingFence !== -1 && text.slice(closingFence).trim() === '```') {
    text = text.slice(0, closingFence).trimEnd();
  }

  // If there is leading prose before the first JSON object/array, skip to it
  if (text.length > 0 && text[0] !== '{' && text[0] !== '[') {
    const objIdx = text.indexOf('{');
    const arrIdx = text.indexOf('[');
    const startIdx =
      objIdx === -1 ? arrIdx : arrIdx === -1 ? objIdx : Math.min(objIdx, arrIdx);
    if (startIdx !== -1) {
      text = text.slice(startIdx);
    }
  }

  return text;
}

/**
 * Repairs an incomplete JSON string so it can be parsed by `JSON.parse`.
 */
export function repairPartialJson(
  input: string,
  options: ParseOptions = {}
): string {
  const {
    stripMarkdown = true,
    allowPartialStrings = true,
    completeLiterals = true,
  } = options;

  const text = preprocessInput(input, stripMarkdown);
  if (text.length === 0) {
    return '';
  }

  const stack: ContainerType[] = [];
  let out = '';
  let i = 0;
  const len = text.length;

  // Track whether we are expecting a key or value inside an object
  // Possible states at top of container:
  // For '{': expecting key -> ':' -> value -> ',' or '}'
  // We use a simple token-level approach with rollback markers for incomplete object entries.
  interface ObjectFrame {
    type: '{';
    /** Output length right after '{' or after the last completed ',' */
    lastSafeOutLen: number;
    /** Whether we have seen a ':' for the current key */
    hasColon: boolean;
    /** Whether we have seen a value after ':' for the current key */
    hasValue: boolean;
  }
  interface ArrayFrame {
    type: '[';
    lastSafeOutLen: number;
    hasValue: boolean;
  }
  type Frame = ObjectFrame | ArrayFrame;
  const frames: Frame[] = [];

  const markValueSeen = () => {
    const top = frames[frames.length - 1];
    if (!top) return;
    if (top.type === '{') {
      if (top.hasColon) {
        top.hasValue = true;
      }
    } else {
      top.hasValue = true;
    }
  };

  while (i < len) {
    const ch = text[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      out += ch;
      i++;
      continue;
    }

    // String
    if (ch === '"') {
      const stringStartOut = out.length;
      let str = '"';
      i++;
      let closed = false;
      while (i < len) {
        const c = text[i];
        if (c === '\\') {
          if (i + 1 >= len) {
            // Trailing escape backslash at end of stream: drop it
            i++;
            break;
          }
          const next = text[i + 1];
          if (next === 'u') {
            // Check if full \uXXXX is available
            const hex = text.slice(i + 2, i + 6);
            if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
              // Incomplete unicode escape at end of stream: drop it
              i = len;
              break;
            }
            str += '\\u' + hex;
            i += 6;
            continue;
          }
          str += '\\' + next;
          i += 2;
          continue;
        }
        if (c === '"') {
          str += '"';
          i++;
          closed = true;
          break;
        }
        // Escape raw control characters if any
        if (c === '\n') {
          str += '\\n';
        } else if (c === '\r') {
          str += '\\r';
        } else if (c === '\t') {
          str += '\\t';
        } else {
          str += c;
        }
        i++;
      }

      if (!closed) {
        const top = frames[frames.length - 1];
        const isObjectKey = top && top.type === '{' && !top.hasColon;
        if (isObjectKey || !allowPartialStrings) {
          // Roll back incomplete object key or disallowed partial string
          if (top) {
            out = out.slice(0, top.lastSafeOutLen);
          } else {
            out = out.slice(0, stringStartOut);
          }
          break;
        }
        str += '"';
      }

      out += str;
      markValueSeen();
      continue;
    }

    // Open Object / Array
    if (ch === '{' || ch === '[') {
      markValueSeen();
      out += ch;
      stack.push(ch);
      if (ch === '{') {
        frames.push({
          type: '{',
          lastSafeOutLen: out.length,
          hasColon: false,
          hasValue: false,
        });
      } else {
        frames.push({
          type: '[',
          lastSafeOutLen: out.length,
          hasValue: false,
        });
      }
      i++;
      continue;
    }

    // Close Object / Array
    if (ch === '}' || ch === ']') {
      // Strip trailing comma if present before closing
      const trimmed = out.trimEnd();
      if (trimmed.endsWith(',')) {
        out = trimmed.slice(0, -1);
      }
      out += ch;
      stack.pop();
      frames.pop();
      markValueSeen();
      i++;
      continue;
    }

    // Colon
    if (ch === ':') {
      const top = frames[frames.length - 1];
      if (top && top.type === '{') {
        top.hasColon = true;
      }
      out += ch;
      i++;
      continue;
    }

    // Comma
    if (ch === ',') {
      const top = frames[frames.length - 1];
      out += ch;
      if (top) {
        // Safe rollback point is BEFORE the comma, so if the next entry is incomplete we don't leave a trailing comma
        top.lastSafeOutLen = out.length - 1;
        if (top.type === '{') {
          top.hasColon = false;
          top.hasValue = false;
        } else {
          top.hasValue = false;
        }
      }
      i++;
      continue;
    }

    // Numbers
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const start = i;
      while (i < len && /[0-9eE+\-.]/.test(text[i])) {
        i++;
      }
      let numStr = text.slice(start, i);
      // Trim incomplete trailing number characters like '-', '.', 'e', 'e+', 'e-'
      while (
        numStr.length > 0 &&
        (numStr.endsWith('-') ||
          numStr.endsWith('+') ||
          numStr.endsWith('.') ||
          numStr.endsWith('e') ||
          numStr.endsWith('E'))
      ) {
        numStr = numStr.slice(0, -1);
      }
      if (numStr.length === 0) {
        const top = frames[frames.length - 1];
        if (top) {
          out = out.slice(0, top.lastSafeOutLen);
        }
        break;
      }
      out += numStr;
      markValueSeen();
      continue;
    }

    // Literals: true, false, null
    if (ch === 't' || ch === 'f' || ch === 'n') {
      const start = i;
      while (i < len && /[a-z]/.test(text[i])) {
        i++;
      }
      const word = text.slice(start, i);
      const match = LITERALS.find((lit) => lit.startsWith(word));
      if (match && (word === match || (completeLiterals && i === len))) {
        out += match;
        markValueSeen();
        continue;
      }
      // Incomplete literal at end of stream when completeLiterals is false, or invalid token
      const top = frames[frames.length - 1];
      if (top) {
        out = out.slice(0, top.lastSafeOutLen);
      }
      break;
    }

    // Any other unexpected character: skip
    i++;
  }

  // Finalize any incomplete trailing object key/colon (e.g. `{"a": 1, "b":`)
  const topFrame = frames[frames.length - 1];
  if (topFrame && topFrame.type === '{' && !topFrame.hasValue) {
    out = out.slice(0, topFrame.lastSafeOutLen);
  }

  // Remove trailing comma if stream ended right after ','
  const trimmedEnd = out.trimEnd();
  if (trimmedEnd.endsWith(',')) {
    out = trimmedEnd.slice(0, -1);
  }

  // Close all remaining open containers in reverse order
  while (stack.length > 0) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }

  return out;
}

/**
 * Parses an incomplete or complete JSON string.
 */
export function parsePartialJson<T = unknown>(
  input: string,
  options: ParseOptions = {}
): ParseResult<T> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { value: undefined, isComplete: false, repaired: '' };
  }

  // Fast path: input (or stripped markdown block) is already valid JSON
  const candidate = preprocessInput(input, options.stripMarkdown ?? true);
  if (candidate.length > 0) {
    try {
      const value = JSON.parse(candidate) as T;
      return { value, isComplete: true, repaired: candidate };
    } catch {
      // Fall through to partial repair
    }
  }

  const repaired = repairPartialJson(input, options);
  if (repaired.length === 0) {
    return { value: undefined, isComplete: false, repaired: '' };
  }

  try {
    const value = JSON.parse(repaired) as T;
    return { value, isComplete: false, repaired };
  } catch {
    return { value: undefined, isComplete: false, repaired: '' };
  }
}
