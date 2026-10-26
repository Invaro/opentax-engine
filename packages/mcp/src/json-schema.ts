import { z } from "zod";

/**
 * The JSON Schema agents see in tools/list, kept exactly as it was under
 * zod 3 so a dependency upgrade never changes a published contract.
 *
 * The MCP SDK converts zod 4 schemas with zod's own toJSONSchema, which
 * differs from the zod 3 converter in three ways for our schemas:
 *
 *   - a schema used in several places is written out in full each time,
 *     where zod 3 wrote it once and pointed later uses at it with
 *     { "$ref": "#/path/of/first/use" }
 *   - integers gain minimum/maximum of ±Number.MAX_SAFE_INTEGER
 *   - records gain "propertyNames": { "type": "string" }
 *
 * legacyJsonSchema() undoes all three. It plugs into zod's per-schema
 * override (`_zod.toJSONSchema`), which zod's converter, and so the SDK,
 * uses as the schema's JSON. test/json-schema.test.ts pins the result.
 */

type Json = Record<string, unknown>;
type Def = { type: string; [k: string]: unknown };

const defOf = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

/** zod 4's output, minus the two keywords zod 3 never wrote. */
function convert(schema: z.ZodType): Json {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    override: ({ jsonSchema: j }) => {
      const json = j as Json;
      if (json.type === "integer") {
        if (json.minimum === Number.MIN_SAFE_INTEGER) delete json.minimum;
        if (json.maximum === Number.MAX_SAFE_INTEGER) delete json.maximum;
      }
      const names = json.propertyNames as Json | undefined;
      if (names && Object.keys(names).length === 1 && names.type === "string") delete json.propertyNames;
    },
  }) as Json;
}

/**
 * Walk the schema and its JSON together, in the order zod 3's converter did.
 * The first use of each schema object records its JSON pointer; any later
 * use is replaced by a $ref to it. Wrappers (optional, default) share their
 * inner schema's node, so the inner schema is registered at the same path.
 */
function addRefs(schema: z.ZodType, json: Json, path: string, seen: Map<z.ZodType, string>): Json {
  const first = seen.get(schema);
  if (first !== undefined) return { $ref: first };
  seen.set(schema, path);
  const def = defOf(schema);
  switch (def.type) {
    case "optional": {
      const inner = addRefs(def.innerType as z.ZodType, json, path, seen);
      return inner === json ? json : withOwn(schema, inner);
    }
    case "default": {
      const inner = addRefs(def.innerType as z.ZodType, json, path, seen);
      return inner === json ? json : { ...withOwn(schema, inner), default: json.default };
    }
    case "object": {
      const props = json.properties as Json | undefined;
      if (!props) return json;
      for (const [key, child] of Object.entries(def.shape as Record<string, z.ZodType>)) {
        if (props[key]) props[key] = addRefs(child, props[key] as Json, `${path}/properties/${key}`, seen);
      }
      return json;
    }
    case "array": {
      if (!json.items) return json;
      // zod 3 wrote items before the length bounds
      const { type, items, ...bounds } = json;
      return { type, items: addRefs(def.element as z.ZodType, items as Json, `${path}/items`, seen), ...bounds };
    }
    case "record":
      if (json.additionalProperties && typeof json.additionalProperties === "object") {
        json.additionalProperties = addRefs(def.valueType as z.ZodType, json.additionalProperties as Json, `${path}/additionalProperties`, seen);
      }
      return json;
    case "union": {
      // zod 3 wrote a type array only when no option had checks; with one
      // (z.number().int()) it wrote anyOf, one node per option
      const options = def.options as z.ZodType[];
      if (Array.isArray(json.type) && options.some((o) => ((defOf(o).checks as unknown[] | undefined)?.length ?? 0) > 0)) {
        const { type: _type, ...rest } = json;
        json = { anyOf: options.map((o) => strip$schema(convert(o))), ...rest };
      }
      // a union of plain primitives is written as a type array, with no node per option
      const anyOf = json.anyOf as Json[] | undefined;
      if (anyOf) (def.options as z.ZodType[]).forEach((o, i) => (anyOf[i] = addRefs(o, anyOf[i], `${path}/anyOf/${i}`, seen)));
      return json;
    }
    default:
      return json;
  }
}

/** zod 3 added a node's description after its other keywords; keep that order. */
function descriptionLast(node: unknown): any {
  if (Array.isArray(node)) return node.map(descriptionLast);
  if (!node || typeof node !== "object") return node;
  const { description, ...rest } = node as Json;
  const out: Json = {};
  for (const [k, v] of Object.entries(rest)) out[k] = descriptionLast(v);
  if (description !== undefined) out.description = description;
  return out;
}

function strip$schema({ $schema: _s, ...rest }: Json): Json {
  return rest;
}

/**
 * A wrapper whose inner schema became a $ref keeps its description. In zod 3
 * .optional() and .default() copied the inner description onto the wrapper,
 * so an undescribed wrapper still carried it.
 */
function withOwn(wrapper: z.ZodType, ref: Json): Json {
  const description = descriptionOf(wrapper);
  return description ? { ...ref, description } : ref;
}

function descriptionOf(schema: z.ZodType): string | undefined {
  const own = z.globalRegistry.get(schema)?.description;
  if (own) return own;
  const def = defOf(schema);
  return def.type === "optional" || def.type === "default" ? descriptionOf(def.innerType as z.ZodType) : undefined;
}

/** Mark a tool's input schema so tools/list publishes the zod 3 shape of it. */
export function legacyJsonSchema<T extends z.ZodType>(schema: T): T {
  const internals = (schema as unknown as { _zod: { toJSONSchema?: () => unknown } })._zod;
  let converting = false;
  internals.toJSONSchema = () => {
    // zod calls this hook again for the root while we convert; let it fall through
    if (converting) return undefined;
    converting = true;
    try {
      return descriptionLast(addRefs(schema, convert(schema), "#", new Map()));
    } finally {
      converting = false;
    }
  };
  return schema;
}
