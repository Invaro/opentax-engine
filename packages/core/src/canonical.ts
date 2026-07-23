/**
 * Canonical JSON serialization (RFC 8785-style subset).
 *
 * Deterministic: object keys sorted lexicographically at every level, no
 * whitespace, standard JSON string escaping. Because all domain numerics are
 * decimal strings, the hard part of JCS (float serialization) never arises —
 * and we enforce that: non-integer numbers and bigints THROW. A stray float
 * in a hashed structure is a bug, not something to canonicalize.
 */

// Proof trees share subtree OBJECTS (the evaluator memoizes rule nodes), so
// the same object can appear at many tree positions. Its canonical form is
// position-independent — cache it per object. Output is byte-identical;
// serialization drops from O(expanded tree) to O(unique nodes).
const objectCache = new WeakMap<object, string>();

export function canonical(value: unknown): string {
  return serialize(value, "$");
}

function serialize(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(
          `canonical: non-integer number at ${path} (${value}) — numerics must be decimal strings`,
        );
      }
      return String(value);
    case "bigint":
      throw new TypeError(
        `canonical: bigint at ${path} — convert to a decimal string at the boundary`,
      );
    case "undefined":
      throw new TypeError(`canonical: undefined at ${path}`);
    case "object": {
      const cached = objectCache.get(value as object);
      if (cached !== undefined) return cached;
      let out: string;
      if (Array.isArray(value)) {
        out = `[${value.map((v, i) => serialize(v, `${path}[${i}]`)).join(",")}]`;
      } else {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj)
          .filter((k) => obj[k] !== undefined)
          .sort();
        const parts = keys.map(
          (k) => `${JSON.stringify(k)}:${serialize(obj[k], `${path}.${k}`)}`,
        );
        out = `{${parts.join(",")}}`;
      }
      objectCache.set(value as object, out);
      return out;
    }
    default:
      throw new TypeError(`canonical: unsupported ${typeof value} at ${path}`);
  }
}
