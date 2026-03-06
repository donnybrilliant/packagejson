import { t } from "elysia";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export const JsonValueSchema = t.Recursive((This) =>
  t.Union([
    t.String(),
    t.Number(),
    t.Boolean(),
    t.Null(),
    t.Array(This),
    t.Record(t.String(), This),
  ])
);

export const JsonObjectSchema = t.Record(t.String(), JsonValueSchema);
