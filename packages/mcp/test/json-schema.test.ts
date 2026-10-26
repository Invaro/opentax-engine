/**
 * Pins the JSON Schema agents see to the shape zod 3 published.
 *
 * Moving to zod 4 changed how the MCP SDK writes tool schemas: shared
 * schemas inlined instead of $ref'd, integers with safe-integer bounds,
 * records with propertyNames, int-or-string unions as type arrays. None of
 * that changes what an input means, but it changes the published contract,
 * so legacyJsonSchema() writes the old form. These cases are the ones our
 * tools hit; docs/api/tools.json pins every real tool on top of this.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { legacyJsonSchema } from "../src/json-schema.js";

const json = (s: z.ZodType) => z.toJSONSchema(legacyJsonSchema(s), { target: "draft-7", io: "input" }) as Record<string, any>;

describe("legacyJsonSchema", () => {
  it("writes a reused schema once and points later uses at its first path", () => {
    const usd = z.union([z.number(), z.string()]).describe("dollars");
    const out = json(z.object({ a: usd.optional(), b: z.object({ c: usd, d: usd.optional().describe("withheld") }) }).strict());
    expect(out.properties.a).toEqual({ type: ["number", "string"], description: "dollars" });
    expect(out.properties.b.properties.c).toEqual({ $ref: "#/properties/a" });
    expect(out.properties.b.properties.d).toEqual({ $ref: "#/properties/a", description: "withheld" });
  });

  it("keeps an inner description on an undescribed optional wrapper", () => {
    const dob = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("date of birth");
    const out = json(z.object({ you: dob.optional().describe("yours"), spouse: dob.optional() }).strict());
    expect(out.properties.spouse).toEqual({ $ref: "#/properties/you", description: "date of birth" });
  });

  it("writes an int-or-string union as anyOf, and integers without safe-integer bounds", () => {
    const out = json(z.object({ kids: z.union([z.number().int(), z.string()]), limit: z.number().int().min(1).max(20) }).strict());
    expect(out.properties.kids).toEqual({ anyOf: [{ type: "integer" }, { type: "string" }] });
    expect(out.properties.limit).toEqual({ type: "integer", minimum: 1, maximum: 20 });
  });

  it("writes a record without propertyNames", () => {
    const out = json(z.object({ facts: z.record(z.string(), z.unknown()) }).strict());
    expect(out.properties.facts).toEqual({ type: "object", additionalProperties: {} });
  });

  it("changes only the JSON, not what the schema accepts", () => {
    const s = legacyJsonSchema(z.object({ n: z.number().int() }).strict());
    expect(s.safeParse({ n: 2 }).success).toBe(true);
    expect(s.safeParse({ n: 2.5 }).success).toBe(false);
    expect(s.safeParse({ n: 2, extra: 1 }).success).toBe(false);
  });
});
