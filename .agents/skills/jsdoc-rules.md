# JSDoc Rules

Apply these rules when writing or reviewing JSDoc in JavaScript files.

## Core Rule

Write JSDoc from the implementation outward. The comment must describe what the
code actually does in terms consumers need to use it correctly. Do not describe
what the method ideally should do.

Use ASD-STE100 Simplified Technical English as guidance for comments and
descriptions. This is not a strict compliance requirement. Prefer short, direct
sentences with one instruction or fact per sentence. Use necessary code symbols,
API names, event names, parameter names, and established project terms exactly
as written.

## Simplified Technical English Guidance

- **Sentence length:** Keep summaries and tag descriptions short. Split long
  explanations into separate sentences.
- **Word choice:** Use common, specific words. Avoid idioms, metaphor, vague
  verbs, and filler.
- **Voice:** Prefer active voice when it identifies the actor clearly. Use
  passive voice only when the actor is unimportant or unknown.
- **One meaning:** Make each sentence describe one behavior, constraint, side
  effect, or return value.
- **Technical terms:** Keep exact code names, API terms, event names, attribute
  names, and type names. Do not replace them to satisfy plain-language wording.
- **Noun phrases:** Avoid stacked noun phrases when they can confuse readers.
  Rewrite them as direct relationships, such as "state for the attendee"
  instead of "attendee state" when needed.

## Generated Comment Quality

Generated comments must meet this contract:

- State the exact implemented behavior.
- Include grounded user-facing context when relevant; do not use it instead of
  the code behavior.
- Do not invent workflows, motivations, call sites, or effects.
- Avoid generic value claims, filler, and undefined abstractions.

### Direct Code Descriptions

Write each behavior sentence with an active verb and a concrete target. The
function or method is the implied actor. State a condition only when it changes
the action or result. Use verbs that state the operation, such as `adds`,
`removes`, `updates`, `sets`, or `returns`.

State one action per sentence. Name the value, state field, DOM element, or UI
item that the code changes. If a sentence names several nouns, repeat the
target noun instead of using a pronoun. State what the function does, not only
what exists after it runs.

Bad:

```js
/**
 * Selects the folder record of messages its connection has not accepted, to
 * let the interface deal with them one at a time.
 */
```

This comment has an unclear action: `selects` does not say what the function
changes or returns. The phrase `folder record of messages its connection has
not accepted` has several nouns with unclear relationships. `its connection`
and `them` do not name clear values. It also invents an interface purpose
instead of describing the implemented action.

Good, when the function changes a folder state field:

```js
/**
 * Adds each message rejected by the connection to `folder.rejectedMessages`.
 */
```

Good, when the function filters and returns messages:

```js
/**
 * Returns messages that the connection rejected.
 */
```

Avoid broad verbs such as `marks`, `handles`, `manages`, or `processes` unless
the comment states the exact changed value or result. Do not use undefined
abstractions such as `marker`, or vague references such as `which ones`.

### User Context Without Code Behavior

Bad:

```js
/**
 * Keeps title input tidy by removing accidental space at either end.
 */
```

Good:

```js
/**
 * Removes leading and trailing whitespace from a title.
 *
 * @param {string} value - The title input value.
 * @returns {string} The trimmed title.
 */
```

### Invented Call-Site Context

Bad:

```js
/**
 * Clears the current selection after an item is deleted or the user leaves
 * the current view.
 */
```

Good:

```js
/**
 * Sets `state.selectedId` to `null`.
 *
 * @param {{ selectedId: unknown }} state - The state to update.
 */
```

The assignment does not establish the previous type of `selectedId`.

### Unclear Language

Bad:

```js
/**
 * Coordinates the route-derived event hydration pipeline for the dialog.
 */
```

Good:

```js
/**
 * Loads event data from route attributes into the dialog state.
 */
```

### Generic Value Claims

Bad:

```js
/**
 * Helps ensure a smooth and reliable experience for users by preparing the
 * dialog state.
 */
```

Good:

```js
/**
 * Initializes dialog state from event data for the dialog controls.
 */
```

## Required Checks

- **Coverage:** Add JSDoc for every exported class, shared API, reusable custom
  element, top-level function, workflow-facing method, and non-trivial helper.
- **Private helpers:** Add JSDoc when private helpers contain validation, config
  mutation, normalization, accessibility behavior, event dispatching, async
  behavior, or non-obvious UI state logic.
- **Skip routine code:** Do not add JSDoc for routine lifecycle boilerplate,
  simple event plumbing, obvious one-line helpers, tiny callbacks, or
  conventional `connectedCallback` / `handleEvent` methods unless behavior is
  non-obvious.
- **Consumer usage:** For exported, shared, component, or otherwise
  caller-facing functions, inspect imports, call sites, tests, or component
  consumers before writing or approving JSDoc. Document behavior, fields,
  events, side effects, and invariants consumers rely on.
- **Description accuracy:** The summary says what the function actually does,
  including normalization, mutation, filtering, defaulting, thrown errors,
  async behavior, and side effects that matter to callers.
- **Direct descriptions:** Each sentence states one concrete action that the
  function performs. Use an active verb and name the changed or returned value.
  Avoid unclear noun relationships, pronouns, undefined abstractions, and
  comments that only describe the final result.
- **Structure:** Use a summary, optional explanatory prose, then tags. Keep the
  first line concise. Put rationale, constraints, or consumer notes after a
  blank line when needed.
- **Parameters:** Document caller-provided arguments with `@param`. Each
  documented `@param` name matches the implementation exactly, including
  destructured option names. Optional parameters use bracket syntax, including
  defaults when present.
- **Returns:** Use `@returns` when a method returns meaningful data or a promise
  that resolves meaningful data. Describe returned fields and `null`/empty
  cases consumers must handle. Omit it only when the method returns nothing
  useful to callers.
- **Types:** Prefer precise structural types or existing project symbols over
  broad `object`, `object[]`, `Array`, `Function`, or `*`. Use `unknown` only
  when the implementation truly accepts arbitrary values.
- **`@type` symbol match:** A `@type` must describe the annotated value. Do not
  label a state object, config object, map, or plain record as a domain class
  unless the value has that class or interface shape.
- **Names:** Type aliases, typedefs, and referenced symbols must match names
  that exist in the codebase or are clearly introduced by the JSDoc.
- **Errors and defaults:** Document thrown errors with `@throws` when callers
  can trigger or handle them. Document defaults for optional parameters, config
  objects, and fallback behavior.
- **Side effects:** Document consumer-visible dispatched events, config object
  mutations, validation-state updates, accessibility-attribute changes, value
  normalization, focused controls, and non-obvious UI state changes.
- **Related context:** Add `@see` for related exported symbols, tests, fixtures,
  schemas, stories, or docs when they clarify expected behavior. Prefer symbol
  references for code symbols and file references for non-exported materials.
- **Examples:** Add `@example` for non-trivial exported or shared APIs when
  usage is not obvious from the signature. Keep examples small and include an
  expected output or effect when helpful.
- **Markdown clarity:** Use backticks around parameter names, returned fields,
  events, option names, and code symbols in descriptions.
- **Simplified English:** Use ASD-STE100 Simplified Technical English as
  practical guidance. Prefer short, direct, active sentences with one meaning.
- **Staleness:** Existing JSDoc is suspect after implementation changes.
  Re-read the code before preserving or editing comments.

## Custom Element Class Docs

Each custom element class should have class-level JSDoc describing the element's
public role and contract, not internal setup details.

- **Template:** Include the template ID when the element clones a named
  template.
- **Tag name:** Use `@tagname` for reusable/custom controls or elements likely
  to be consumed from markup.
- **Slots:** Use `@slot` for named or meaningful slots.
- **Attributes:** Use `@attribute` for supported attributes. State whether an
  attribute is observed when that affects usage.
- **Events:** Use `@fires` for custom events consumers are expected to listen
  for. Document event detail fields when they are part of the public contract.

## Field Docs

Add `@type` for fields that hold DOM elements, custom elements, state records,
config objects, counters, timers, observers, proxies, or other values whose type
is not obvious.

Format field docs with a short description, a blank line, then `@type`. Use
`?HTMLElement` when a field can be null. Use `HTMLElement|undefined` when a
field can be undefined. Use readonly getter docs when exposing a derived value
that should not be set directly. Avoid `@type` when it merely repeats an obvious
literal. Make sure `@type` describes the actual value, not a broader domain
concept.

## Typedefs

Put `@typedef` declarations at file scope, after imports/constants and before
the class that uses them. Use method-local typedefs only when the shape is truly
private to one method and unlikely to be reused. Prefer one named typedef when
the same shape appears in multiple annotations. Use inline structural types for
small, one-off return shapes.

Every `@property` should include a useful description. Use exact property names
and optional markers. Prefer precise field types over broad containers.

## Type Precision

Prefer existing project symbols when the value is actually that type. Prefer
structural types when the value is a plain object. Use `Record<string, T>` for
string-keyed maps when keys are dynamic. Use `Array<T>` or `T[]` with a concrete
item type. Use function signatures instead of `Function`, such as
`function(string): void`. Do not invent domain type names unless the typedef is
defined.

## Method Docs

Start with a concise behavior summary, such as "Sets...", "Returns...",
"Updates...", "Clears...", or "Checks whether...". Add explanatory prose only
when it clarifies defaults, invariants, validation, mutation, async behavior,
or consumer-visible effects.

Keep params and returns aligned with what callers need to know:

- **`setState`:** State that is applied and whether it resets, focuses,
  validates, or updates UI.
- **`captureState`:** Returned state shape and any normalization or copies.
- **Validation:** Whether the method updates UI, returns validity, dispatches
  events, or mutates stored state.
- **Config helpers:** Config direction or field that the method changes.
- **Event dispatchers:** Event name and meaningful detail fields when they are
  part of the contract.

## Formatting Preferences

Use a concise first sentence. Insert a blank line before tags. Use this order
when applicable: `@tagname`, `@slot`, `@attribute`, `@fires`, `@param`,
`@returns`, `@throws`.

Use `@param {type} name - Description.` and `@returns {type} Description.`
Wrap long tag descriptions onto continuation lines with indentation. Use periods
consistently. Keep comments factual and short. Do not restate the code line by
line.

## Writing Recipe

1. Read the implementation first.
2. If the function or component is exported, shared, or caller-facing, search
   for imports, call sites, tests, custom-element usage, event listeners, and
   property access.
3. Write the one-sentence summary from implemented behavior and consumer usage.
4. Add `@param` entries for each caller-provided argument using exact
   implementation names and descriptions.
5. Add `@returns` for returned values, including async promise results. Include
   returned fields that consumers read.
6. Add `@throws`, defaults, side effects, custom events, attributes, slots,
   `@see`, and `@example` when implementation behavior or related files make
   them useful to consumers.
7. Add `@type` only when it clarifies a value and the type matches the
   annotated symbol.
8. Review comments and tag descriptions for Simplified Technical English:
   short sentences, direct words, active voice when clear, and one meaning per
   sentence. Check that each sentence describes a concrete action on a named
   target, rather than an abstract result or inferred purpose.
9. Re-check every noun in the comment against the code and consumers: names,
   types, default behavior, filtering, mutation, thrown errors, side effects,
   returned fields, events, attributes, slots, and invariants.
10. Check that every generated comment states exact behavior. Include only
    user-facing context established by the implementation or consumers. Remove
    invented workflows, call sites, motivations, effects, generic value claims,
    filler, and undefined abstractions.

## Good Example

```js
/**
 * Returns a normalized address and display name from `input`.
 * Trims and lowercases the address. Adds `@example.invalid` when the address
 * has no `@`.
 * For an object input, uses the trimmed `name` as `displayName`.
 * Uses `address` as `displayName` for a string input or an object input with a
 * missing or empty `name`.
 *
 * @param {{ address: string, name?: string } | string} input - An address
 *   string or an object with an address and optional name.
 * @returns {{ address: string, displayName: string }} An object with a trimmed,
 *   lowercase `address`. `displayName` is the trimmed object `name`, or
 *   `address` when `input` is a string or `name` is empty.
 */
function normalizeRecipient(input) {
  let address = (typeof input == "string" ? input : input.address)
    .trim()
    .toLowerCase();
  if (!address.includes("@")) {
    address += "@example.invalid";
  }
  return {
    address,
    displayName:
      typeof input == "string" ? address : input.name?.trim() || address,
  };
}

/**
 * @typedef {object} CustomizableItemDetails
 * @property {string} id - The ID of the toolbar item.
 * @property {string} labelId - Fluent ID for the item label.
 * @property {boolean} [allowMultiple] - Whether the item can be added more
 *   than once.
 * @property {string[]} [spaces] - Spaces that can contain the item.
 */

/**
 * Stores the selected space and toolbar items by ID.
 *
 * @type {{
 *   selectedSpace: string,
 *   itemsById: Map<string, CustomizableItemDetails>
 * }}
 */
const toolbarState = {
  selectedSpace: "mail",
  itemsById: new Map([
    [
      "write-message",
      { id: "write-message", labelId: "toolbar-write-message" },
    ],
  ]),
};
```

## Common Mistakes

- **"Formats" hides normalization and structured data:** Name the actual
  behavior and return shape.
- **`@param {string} input` for code that accepts strings or objects:** Use a
  union or structural type matching property access.
- **`@returns {string}` for a function returning an object:** Match the returned
  value exactly.
- **`@param maxCount` when the implementation parameter is `limit`:** Use the
  implementation name.
- **`@param {string} value` with no description:** Add a description that
  explains caller expectations or constraints.
- **Triggerable errors appear only in implementation:** Add `@throws` entries
  for caller-triggerable errors.
- **Optional config defaults are hidden:** Document default values and fallback
  behavior.
- **Custom element docs only describe setup:** Document the public contract:
  role, template ID, tag name, slots, attributes, observed behavior, and events.
- **Consumer-visible side effects are hidden:** Document mutations, validation
  changes, accessibility changes, normalization, focus, async behavior, and
  event details.
- **Related material clarifies behavior but is not referenced:** Add a concise
  `@see` entry.
- **A non-trivial exported API has no usage example:** Add a small `@example`
  with an expected result or effect.
- **`/** @type {Folder} */` annotates a plain folder-state object:** Use a
  structural object type or real state typedef.
- **`Map<*, *>` has visible key and value usage:** Use concrete types, such as
  `Map<string, Message>` or `Map<string, unknown>`.
- **The comment documents only the visible return shape:** Check call sites and
  include fields or semantics consumers rely on.
- **JSDoc was copied from nearby code:** Rebuild the comment from the current
  implementation.
- **Placeholder JSDoc was added for every lifecycle method:** Skip routine
  lifecycle boilerplate unless behavior is non-obvious.
- **Comment text uses idioms, vague verbs, filler, or stacked noun phrases:**
  Rewrite with short, direct sentences that follow Simplified Technical English.
- **Comment uses `marks`, `handles`, `manages`, or `processes` without a
  result:**
  Name the action and the value, field, element, or UI item it changes or
  returns.
- **One sentence joins actions or has ambiguous pronouns:** Split the actions
  into separate sentences and name each value directly.
- **Comment describes content after the function runs:** State the action that
  produces it, such as adding a contact name to the tooltip.
- **Comment uses a vague UI name, such as `marker`:** Name the actual element,
  attribute, state field, event, or returned value from the implementation.
- **User-facing context replaces code behavior:** State behavior, parameters,
  and return value first. Add only grounded context.
- **Comment describes a call site not shown by code or consumers:** Document
  only the proven mutation or effect.
- **Comment uses an undefined abstraction, such as "loading boundary":** Name
  the operation, values, and established abstraction.
- **Comment claims a smooth, reliable, or improved experience:** Replace the
  value claim with the state or effect the function produces.

## Rationalizations

- **"JSDoc is only style":** Wrong JSDoc changes caller understanding and
  editor/type-tool behavior.
- **"The implementation is obvious":** Comments still need exact names,
  return shape, and type shape when they exist.
- **"I can infer enough from this function":** Exported/shared docs are for
  consumers. Inspect how consumers call the API and what they read.
- **"Examples and links are extra":** For non-trivial public APIs, examples
  and related-file links can help consumers and tools use the API correctly.
- **"A plausible domain type is shorter":** Short wrong types are worse than
  structural types that match the value.
- **"This was copied from nearby code":** Nearby comments can be stale.
  Rebuild the comment from this implementation.
- **"Technical comments do not need plain language":** JSDoc is for humans and
  tools. Clear, controlled wording helps callers understand behavior.
- **"The user context explains the function":** Context does not replace the
  implemented behavior, parameters, or return value.
- **"This call site is probably why the function exists":** Do not document a
  workflow, motivation, or call site without proof in code or consumers.
- **"A general benefit makes the comment friendlier":** Generic value claims
  do not tell callers what the function does.

## Red Flags

- The comment could describe several unrelated functions.
- The JSDoc says what the function should do, but not what this implementation
  does.
- The function is exported or shared and no consumer, test, or call-site search
  was performed.
- A type name sounds plausible but is not present in the codebase.
- A parameter name in JSDoc does not appear in the function signature.
- Async functions lack return documentation even though callers await a value.
- Caller-triggerable errors are undocumented.
- Optional parameters or config objects have defaults that are not documented.
- A custom element has no class-level contract, tag name, template ID,
  attribute, slot, or event docs when those are consumer-facing.
- Validation, config mutation, normalization, accessibility changes, event
  dispatching, or non-obvious UI state changes are hidden.
- Related tests, schemas, fixtures, stories, or docs explain behavior but are
  not linked.
- `@type` uses a domain noun for a plain object.
- JSDoc is added only to satisfy coverage and says nothing useful.
- Comment text uses idioms, vague verbs, filler, or stacked noun phrases that
  can confuse callers.
- A sentence does not identify the action or concrete target.
- A condition changes the action or result, but the comment does not state it.
- A comment uses an unclear pronoun, several nouns with unclear relationships,
  an undefined abstraction, or a final result instead of the action that
  produced it.
- User-facing context replaces the exact code behavior.
- The comment invents a workflow, motivation, call site, or effect.
- The comment uses an undefined abstraction or generic value claim.

## Quality Checklist

- The summary matches the actual implementation.
- Every documented parameter exists in the signature.
- Every optional/default parameter is marked correctly.
- Every meaningful return value has `@returns`.
- The return type includes fields consumers read.
- Types are precise and real.
- State shapes use typedefs or clear structural types.
- Side effects and dispatched events are documented when consumer-visible.
- Comments do not promise behavior the code does not implement.
- Comments do not hide normalization, mutation, validation, fallback, or async
  behavior.
- Comments and tag descriptions generally follow Simplified Technical English
  guidance without changing exact code symbols or established technical terms.
- Each comment sentence describes a concrete action on a named target when it
  describes behavior.
- User-facing context is grounded in the implementation or consumers and does
  not replace the code behavior.
- Comments contain no invented workflow, motivation, call site, or effect.
- Comments contain no generic value claim, filler, or undefined abstraction.
