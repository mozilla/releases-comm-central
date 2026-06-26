/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import initialSchema from "./policies-schema.json" with { type: "json" };

// The schema shares definitions (url, origin, ...) via $ref. Policies are
// validated one at a time against their own subschema, which would not carry
// the root "definitions", so resolve all internal $refs into a self-contained
// schema once here. The on-disk file stays DRY for other tooling (e.g. the
// enterprise console); the runtime schema is fully inlined.
function refName(ref) {
  for (let prefix of ["#/definitions/", "#/$defs/"]) {
    if (ref.startsWith(prefix)) {
      return ref.slice(prefix.length);
    }
  }
  return null;
}

// `seen` holds the names being resolved on the current path so a self- or
// mutually-recursive definition fails loudly instead of overflowing the stack
// (such a definition cannot be inlined; it would need the validator to resolve
// it lazily). It is not a problem today: no definition references another.
function dereference(node, definitions, seen = new Set()) {
  if (Array.isArray(node)) {
    return node.map(item => dereference(item, definitions, seen));
  }
  if (!node || typeof node != "object") {
    return node;
  }

  if (typeof node.$ref == "string") {
    let name = refName(node.$ref);
    if (name === null || !Object.hasOwn(definitions, name)) {
      throw new Error(`Unresolvable schema $ref "${node.$ref}".`);
    }
    if (seen.has(name)) {
      throw new Error(`Cyclic schema $ref "${node.$ref}" cannot be inlined.`);
    }
    let resolved = dereference(
      definitions[name],
      definitions,
      new Set(seen).add(name)
    );
    // Preserve any keywords that sit next to the $ref (e.g. description).
    let siblings = {};
    for (let [key, value] of Object.entries(node)) {
      if (key != "$ref") {
        siblings[key] = dereference(value, definitions, seen);
      }
    }
    return { ...resolved, ...siblings };
  }

  let result = {};
  for (let [key, value] of Object.entries(node)) {
    if (key == "definitions") {
      continue;
    }
    result[key] = dereference(value, definitions, seen);
  }
  return result;
}

const resolvedSchema = dereference(
  initialSchema,
  initialSchema.definitions || {}
);

export let schema = resolvedSchema;

export function modifySchemaForTests(customSchema) {
  if (customSchema) {
    schema = customSchema;
  } else {
    schema = resolvedSchema;
  }
}
