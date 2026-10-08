---
name: thunderbird-frontend-testing-guidelines
description: >-
  Use when writing, reviewing, or modifying Thunderbird frontend tests,
  especially browser mochitests, UI fixtures, chrome/content interaction,
  EventUtils usage, async waits, assertions, manifests, or cleanup.
---

# Thunderbird Frontend Testing Guidelines

## Overview

Use these conventions for Thunderbird frontend tests. Prefer nearby, recently
updated Thunderbird tests as examples before copying older patterns; the tree
contains both current and out-of-date styles.

## Running tests

If working from the 'comm' directory, to run tests, execute:

```
$ ../mach test --headless [file paths...]
```

Do NOT include the 'comm' directory in the path in this instance.

Also, note that on some systems, some tests don't execute properly in headless
mode. For example, dragging on Linux will fail if run headlessly. If a test is 
continously failing, try running without the 'headless' flag, to see if it still
fails. Confirm with the user before taking this approach. 

## Test Verification

When writing a new test, prove the test can fail before treating it as useful:

- Break the code, fixture, or assertion in a targeted way and confirm the new
  test fails for the expected reason.
- Restore the code and confirm the test passes again.
- If you did not do this earlier, do it before finishing the test work.

After the test passes normally and is in a good state, periodically run the same
test with `--verify` to check for intermittent failures, race conditions, and
jankiness. `--verify` can take a long time, so use it after the focused test run
is already green, and confirm with the user before running.

## Local Pattern Check

Before writing or reviewing a frontend test:

- Inspect tests in the same directory or component first.
- Prefer newer files and recently modified patterns over older examples.
- Keep the test style consistent with the target directory unless this skill
  explicitly says to avoid an older pattern.
- Add new tests to the relevant manifest and preserve existing manifest
  defaults.

## Reference Documentation

Use the Firefox Source Docs browser chrome documentation to understand available
test helpers, command flags, and recommended mochitest structure. Thunderbird
tests can differ in local conventions, so use these docs as API and framework
reference, then apply Thunderbird-specific guidance from this skill and nearby
tests.

- Browser chrome mochitests:
  https://firefox-source-docs.mozilla.org/testing/browser-chrome/index.html
- Writing new browser mochitests:
  https://firefox-source-docs.mozilla.org/testing/browser-chrome/writing.html
- BrowserTestUtils:
  https://firefox-source-docs.mozilla.org/testing/browser-chrome/
- Assert:
  https://firefox-source-docs.mozilla.org/testing/assert.html
- TestUtils:
  https://firefox-source-docs.mozilla.org/testing/testutils.html
- SimpleTest:
  https://firefox-source-docs.mozilla.org/testing/simpletest.html
- EventUtils:
  https://firefox-source-docs.mozilla.org/testing/eventutils.html
- Test Verification:
  https://firefox-source-docs.mozilla.org/testing/test-verification/index.html

## Browser Test Shape

Browser tests usually use `browser_*.js`, `add_setup` for shared setup, and
`add_task(async function test_nameCamelCase() {})` for test cases. Tests that
open UI in a tab should close it in cleanup.

Common tab fixture shape:

```js
"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let view;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/path/to/files/fixture.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  browser = tab.browser;
  view = browser.contentWindow.document.querySelector("custom-element-name");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});
```

Guidelines:

- Put `"use strict";` at the top of every test file, immediately after the
  license header and before declarations.
- Use `add_setup` for shared fixture, service, or window setup.
- Use named `add_task` functions.
- Store stable fixture-wide references in module-level variables.
- Re-query elements after rerendering, insertion, navigation, or DOM
  replacement.
- Close opened tabs, windows, popups, dialogs, and panels in fail-safe cleanup.

## Test Naming

Use names that describe the tested behavior or state transition. Use the
standard `test_` prefix with lower camel case after the underscore. Apply this
rule when adding or renaming tests, even if nearby older tests use snake case.

Guidelines:

- Use named `add_task` functions:
  `add_task(async function test_captureState() {})`.
- Flag new or renamed snake-case test names. Do not preserve them only to match
  older local tests.
- Name method-contract tests after the public API being exercised:
  `test_setState`, `test_captureState`, `test_setErrorState`.
- Add the tested condition after the base behavior:
  `test_captureStateWithUsername`.
- Use `With...` for enabled conditions or additional state:
  `test_captureStateWithRememberPasswordPref`.
- Use `No...` for disabled or absent condition variants:
  `test_switchBetweenIMAPAndEWSNoPref`.
- Use `ByPref` for behavior controlled by a preference:
  `test_graphIsEnabledByPref`.
- Use `switchBetweenXAndY` for bidirectional UI transition scenarios:
  `test_switchBetweenIMAPAndGraph`.
- Use outcome-focused names for DOM wiring, localization, and accessibility
  checks: `test_correctlyAppliesL10nAttributes`,
  `test_idsCorrectlyAppliedToElements`.
- Do not repeat the component or filename context in every test name when the
  file already provides that scope.
- Avoid `smoke` unless the test is intentionally broad contract coverage.

Example renames:

| Avoid                                      | Prefer                                |
| ------------------------------------------ | ------------------------------------- |
| `test_tb_banner_loads_fixture`             | `test_loadsFixture`                   |
| `test_tb_banner_smoke_default_and_variant` | `test_defaultVariantAndUpdateVariant` |
| `test_tb_banner_smoke_expand_and_collapse` | `test_expandAndCollapse`              |

## Fixtures

Frontend fixtures should be focused but production-like:

- Use `<!DOCTYPE html>` and the XHTML namespace for XHTML fixtures.
- Include the CSS and Fluent localization links needed by the UI under test.
- Import custom element modules with `<script type="module">`.
- Define templates expected by the component when the production component needs
  them.
- Instantiate the element or UI under test in the fixture body.
- Keep fixture simplification honest: omit unrelated product UI, not
  dependencies that affect behavior under test.

## Element Access

Use content document access for content-loaded fixtures:

```js
const doc = browser.contentWindow.document;
const view = doc.querySelector("custom-element-name");
const input = view.querySelector("input");
```

Guidelines:

- Use `browser.contentWindow.document.querySelector(...)` or
  `browser.contentWindow.document.getElementById(...)` for content documents.
- Use `element.querySelector(...)` for light DOM inside the tested element.
- Use `element.shadowRoot.querySelector(...)` when the component's public test
  surface includes shadow DOM or when no light-DOM API exists.
- Prefer public component APIs for behavior when practical.
- Re-query dynamic nodes after UI updates that may replace DOM.

## Implementation Goal Patterns

Use these concrete patterns when they match the test's purpose:

| Goal                                                                   | Implementation                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Access the fixture content window                                      | `const { contentWindow } = tab.browser;`                                                            |
| Access the fixture document from the content window                    | `const { document } = contentWindow;`                                                               |
| Select the top-level component under test                              | `const subview = document.querySelector("email-authentication-form");`                              |
| Select an element for interaction and assertion                        | `const password = subview.querySelector("#authenticationPassword");`                                |
| Query controls from the component root, not the whole document         | `const protocolSelector = subview.querySelector("#incomingProtocol");`                              |
| Query popup menu items after the popup is open                         | `const items = popup.querySelectorAll("menuitem");`                                                 |
| Initialize component state before interaction                          | `subview.setState(config);`                                                                         |
| Reset component state after mutation-heavy tests                       | `subview.resetState();`                                                                             |
| Capture public component state for assertions                          | `const state = subview.captureState();`                                                             |
| Wait for component state updates                                       | `const update = BrowserTestUtils.waitForEvent(subview, "config-updated");`                          |
| Wait for a specific completed form update                              | `BrowserTestUtils.waitForEvent(subview, "config-updated", false, event => event.detail.completed);` |
| Wait for input-driven updates using an observable condition            | `BrowserTestUtils.waitForEvent(subview, "config-updated", false, () => password.value === "test");` |
| Target synthetic input to fixture-owned content                        | `EventUtils.sendString("test", contentWindow);`                                                     |
| Target synthetic keyboard navigation to fixture-owned content          | `EventUtils.synthesizeKey("KEY_Tab", {}, contentWindow);`                                           |
| Target synthetic mouse interaction to fixture-owned content            | `EventUtils.synthesizeMouseAtCenter(protocolSelector, {}, contentWindow);`                          |
| Wait for a select popup before reading menu items                      | `const popup = await BrowserTestUtils.waitForSelectPopupShown(window);`                             |
| Select a popup item after opening the select                           | `popup.activateItem(popup.querySelectorAll("menuitem")[2]);`                                        |
| Wait for popup cleanup after selection                                 | `await BrowserTestUtils.waitForPopupEvent(popup, "hidden");`                                        |
| Wait for mutation-driven rendering                                     | `await BrowserTestUtils.waitForMutationCondition(node, options, condition);`                        |
| Stabilize semantic state only when no event or mutation can observe it | `await TestUtils.waitForCondition(() => condition, "condition should have been met");`                            |
| Prefer event/render waits over arbitrary delays                        | `await BrowserTestUtils.waitForEvent(subview, "config-updated");`                                   |
| Temporarily enable prefs for one test                                  | `await SpecialPowers.pushPrefEnv({ set: [["mail.graph.enabled", true]] });`                         |
| Restore test-specific prefs                                            | `await SpecialPowers.popPrefEnv();`                                                                 |
| Verify visible rendered state                                          | `Assert.ok(BrowserTestUtils.isVisible(exchangeURLField), "Exchange URL should be visible");`        |
| Verify hidden rendered state                                           | `Assert.ok(BrowserTestUtils.isHidden(exchangeURLField), "Exchange URL should be hidden");`          |
| Check localized attributes                                             | `document.l10n.getAttributes(label).id;`                                                            |
| Check ARIA element linkage                                             | `Assert.deepEqual(input.ariaLabelledByElements, [label]);`                                          |
| Assert serialized component state                                      | `Assert.deepEqual(subview.captureState(), expectedState);`                                          |
| Assert event payload state                                             | `Assert.ok(configUpdatedEvent.completed, "Should have a complete form");`                           |
| Assert exact selected values                                           | `Assert.equal(incomingAuthMethod.value, Ci.nsMsgAuthMethod.OAuth2);`                                |
| Avoid mutation leakage between tests                                   | `subview.resetState(); await SpecialPowers.popPrefEnv();`                                           |
| Close content-tab fixtures from shared setup cleanup                   | `registerCleanupFunction(() => tabmail.closeOtherTabs(tabmail.tabInfo[0]));`                        |
| Clean up UI or state at task end                                       | `registerCleanupFunction(() => cleanup());`                                                         |

## Interaction

Use `EventUtils` with the correct content global:

```js
EventUtils.synthesizeMouseAtCenter(element, {}, browser.contentWindow);
EventUtils.sendString("test", browser.contentWindow);
EventUtils.synthesizeKey("KEY_Tab", {}, element.ownerGlobal);
```

Guidelines:

- Pass a content global for content element clicks, key events, and typing.
- Avoid the chrome `window` unless intentionally interacting with chrome UI.
- Focus the relevant browser, document, or input before focus-sensitive typing.
- For headless-sensitive user-like clicks, wait for visible/enabled state and
  call `scrollIntoView()` before clicking.
- Programmatic `.click()` is acceptable for known controls when the test does
  not need native pointer behavior.

## Async Waiting

Create event wait promises before triggering the action when the event could
fire synchronously or quickly:

```js
const update = BrowserTestUtils.waitForEvent(target, "updated");
EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
const event = await update;
```

Use deterministic waits:

- `BrowserTestUtils.browserLoaded(browser)` for page load.
- `BrowserTestUtils.waitForEvent(target, eventName, false, condition)` for DOM
  or custom events.
- `BrowserTestUtils.waitForAttribute(...)` and
  `BrowserTestUtils.waitForAttributeRemoval(...)` for attribute transitions.
- `BrowserTestUtils.waitForMutationCondition(node, options, condition)` for DOM
  mutation-driven state.
- Prefer `BrowserTestUtils.waitForMutationCondition(...)` over
  `TestUtils.waitForCondition(...)` when a DOM mutation can express the wait.
- `TestUtils.waitForCondition(() => condition, "message")` only for semantic
  state that is not observable as an event, attribute change, or DOM mutation.
- `TestUtils.waitForTick()` or `requestAnimationFrame` only when a specific
  event, mutation, or condition is unavailable and the tested behavior depends
  on a later tick or frame.

Avoid arbitrary sleeps. If a delay is unavoidable, document why, keep it local,
and prefer replacing it with a specific event, mutation, or state condition.
Do not add a tick, `requestAnimationFrame`, or layout wait before reading
`getBoundingClientRect()` when the element is already in the document and CSS is
already loaded.

## Selects, Popups, And Panels

Use native popup helpers for `<select>`-style popups:

```js
const popupPromise = BrowserTestUtils.waitForSelectPopupShown(window);
EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
const popup = await popupPromise;

popup.activateItem(popup.querySelectorAll("menuitem")[2]);
await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
```

Guidelines:

- Create popup wait promises before opening popups.
- Always wait for popups, panels, and dialogs to hide after selection or closing
  when later assertions depend on that state.
- Use the chrome `window` for native select popup helpers and content globals
  for content element interaction.
- Directly setting `.value` and dispatching a `change` event is fine when the
  test does not need to exercise native dropdown behavior.

## Visibility And Assertions

Prefer rendered visibility helpers for rendered element visibility:

```js
Assert.ok(BrowserTestUtils.isVisible(element), "Element should be visible");
Assert.ok(BrowserTestUtils.isHidden(element), "Element should be hidden");
```

Use `Assert` APIs consistently. Do not use mochitest assertion globals in new or
modified Thunderbird frontend tests, even though they are available.

| Avoid                                | Use                                            |
| ------------------------------------ | ---------------------------------------------- |
| `ok(condition, message)`             | `Assert.ok(condition, message)`                |
| `is(actual, expected, message)`      | `Assert.equal(actual, expected, message)`      |
| `isnot(actual, unexpected, message)` | `Assert.notEqual(actual, unexpected, message)` |

Common assertion APIs:

- `Assert.equal(actual, expected, message)`
- `Assert.notEqual(actual, unexpected, message)`
- `Assert.strictEqual(actual, expected, message)` when exact type matters
- `Assert.deepEqual(actual, expected, message)`
- `Assert.ok(condition, message)`
- `Assert.rejects(promise, matcher, message)`
- `Assert.throws(fn, matcher, message)`

Assertion guidelines:

- Messages should describe expected behavior and match the assertion polarity.
- `ok`, `is`, and `isnot` are valid mochitest globals, but they are older style
  here. Do not introduce or preserve them when touching Thunderbird frontend
  tests; convert touched assertions to `Assert`.
- Assert public behavior before implementation details when practical.
- Assert emitted event details when custom events are part of the contract.
- For accessibility, assert ARIA relationships, labels, roles, and focus
  behavior that the UI owns.
- Use `Assert.deepEqual(...)` for full object/state capture when comparing the
  complete state is the point of the test.
- When a selected element is required by the fixture or component contract,
  assert that the element exists before reading its properties. Avoid optional
  chaining in these assertions because it turns a missing required element into
  a less-specific `undefined` value comparison.

```js
const title = banner.querySelector("[slot='title']");
Assert.ok(title, "Fixture provides a title slot element");
Assert.equal(
  title.textContent,
  "Test banner",
  "Fixture title should be available through the title slot",
);
```

## Localization

When a test must verify that an element has the correct Fluent ID, attributes,
or arguments, check those Fluent attributes instead of checking the translated
text.

```js
document.l10n.getAttributes(element).id;
component.l10n.getAttributes(element).args;
```

Guidelines:

- Use `document.l10n` for document-level localization state.
- Use a custom element's localization object when localized nodes belong to that
  component.
- Check literal text only when rendered text is intentionally the test contract.
- Prefer `getAttributes(...)` over raw `data-l10n-id` reads for Fluent wiring:
  use `document.l10n.getAttributes(actionText).id`, not
  `actionText.getAttribute("data-l10n-id")`.
- Include localization links in fixtures that depend on localization behavior.

## Cleanup

Use fail-safe cleanup for shared or persisted state:

- Tabs, windows, dialogs, popups, and panels.
- Prefs, preferably with `SpecialPowers.pushPrefEnv` for scoped pref changes.
- Mocked services, servers, proxy mappings, and registered handlers.
- Accounts, servers, address books, logins, OAuth objects, cert overrides, and
  telemetry state when the test mutates them.
- Focus or window state when tests open additional windows.

Register cleanup as soon as practical after creating state, before assertions
that could throw. Prefer `registerCleanupFunction` for UI or state that should
be cleaned up at task end. The cleanup function must perform the cleanup action;
if cleanup is async, trigger cleanup first and then wait for the stable closed
or restored state.

```js
add_task(async function test_opensPanel() {
  panel.openPopup(anchor);

  registerCleanupFunction(() => {
    panel.hidePopup();
  });

  Assert.ok(BrowserTestUtils.isVisible(panel), "Panel should be visible");
});
```

Use local `try/finally` only for temporary state that must be undone before the
task continues past the local block. Do not use `try/finally` only for task-end
cleanup that `registerCleanupFunction` can express.

## Manifests

Guidelines:

- Add browser tests to the nearest relevant `browser.toml` or specialized
  browser manifest.
- Preserve existing `[DEFAULT]` prefs and `support-files` conventions.
- Add support files explicitly when the manifest does not already include a
  broad fixture pattern.
- Use tags and `skip-if` only with precise reasons.
- Keep test names specific to the behavior under test.

## Common Pitfalls

- Copying old tests without checking newer local patterns.
- Waiting for an event after triggering it.
- Clicking or typing into content elements with the chrome window global.
- Forgetting to wait for popups or panels to hide.
- Assuming `.hidden` means rendered hidden; use `BrowserTestUtils.isHidden` for
  rendered visibility.
- Keeping stale references to elements that may be removed or recreated.
- Relying on arbitrary sleeps instead of event, mutation, or condition waits.
- Using `TestUtils.waitForCondition` when `waitForMutationCondition` can observe
  the DOM update directly.
- Adding `TestUtils.waitForTick()` or `requestAnimationFrame` before layout
  reads when no async rendering signal or local pattern requires it.
- Finishing a new test without proving it fails when the tested behavior is
  broken.
- Running `--verify` before the focused test is already passing, or never
  running `--verify` on a new test that is otherwise ready, or running
  `--verify` without first confirming from the user they want it run.
- Using `try/finally` for task-end cleanup when `registerCleanupFunction` can
  express that cleanup more clearly.
- Registering a cleanup function that only waits for cleanup instead of doing
  the cleanup.
- Leaving prefs, windows, tabs, popups, services, proxies, accounts, address
  books, logins, OAuth objects, cert overrides, or telemetry state behind.
- Testing localized text when the real contract is the Fluent ID or args.
- Introducing `ok`, `is`, or `isnot` instead of `Assert` APIs.
- Introducing too much complexity in tests. Keeping tests DRY is not a major
  goal. It's better to repeat the same code in a test, if it avoids adding
  conditional logic. Avoid needing to have tests for our test's logic.
