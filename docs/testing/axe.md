# Axe Accessibility Checks

Thunderbird browser-chrome tests can run [axe-core](https://github.com/dequelabs/axe-core)
against content browsers and chrome windows through `AxeHelpers.sys.mjs`. Use
these helpers to add automated accessibility checks to normal functional tests.

```js
const { checkAxe, startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);
```

Axe checks are ordinary test assertions. A failure is reported in the normal test
output with the failing rule id, impact, axe help text, help URL, and target
selector. There is no separate report to collect.

## One-shot checks

Use `checkAxe` when the test reaches a stable UI state and you want to scan a
content browser once.

```js
await checkAxe(tab.browser, {
  context: "#settingsPane",
  message: "Settings pane has no axe violations",
  specialPowers: SpecialPowers,
});
```

Use `checkAxeInWindow` for chrome windows.

```js
const { checkAxeInWindow } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

await checkAxeInWindow(window, {
  context: document.querySelector("#toolbar-context-menu"),
  message: "Toolbar context menu has no axe violations",
});
```

The `context` option is passed to `axe.run`. Keep it as small as the UI under
test allows, such as a dialog, pane, notification, or fixture root.

## Watching DOM Mutations

Use a mutation observer when a functional test drives UI changes over time and
you want axe to check the states produced by those changes. The watcher runs
once when it starts, then runs again after observed DOM mutations while the test
continues.

For content tabs, use `startAxeMutationObserver`.

```js
const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let tab;

add_setup(async function () {
  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/path/to/test.xhtml",
  });
  await BrowserTestUtils.browserLoaded(tab.browser);
  browser = tab.browser;

  await startAxeMutationObserver(tab.browser, {
    container: "#fixtureRoot",
    message: "Content tab stayed axe-clean while the test mutated the DOM",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    tabmail.closeTab(tab);
  });
});

add_task(async function test_content_tab_ui() {
  // Run the functional test steps that mutate #fixtureRoot.
  EventUtils.synthesizeMouseAtCenter(
    browser.contentWindow.document.querySelector("button"),
    {},
    browser.contentWindow
  );
});
```

For chrome windows, use `startAxeMutationObserverInWindow`.

```js
const { startAxeMutationObserverInWindow } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let axeWatcher;
let dialog;

add_setup(async function () {
  dialog = await openTestDialog();

  axeWatcher = await startAxeMutationObserverInWindow(window, {
    autoFinish: false,
    container: dialog,
    message: "Dialog stayed axe-clean while the test mutated it",
  });

  registerCleanupFunction(async () => {
    await axeWatcher.finish();
    await closeTestDialog(dialog);
  });
});

add_task(async function test_chrome_window_ui() {
  // Run the functional test steps that mutate the dialog.
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector("button"),
    {},
    window
  );
});
```

By default the watcher registers a cleanup function and finishes automatically.
This is what the content-tab example uses. In browser-chrome tests that need to
tear down chrome UI in the same cleanup path, set `autoFinish` to `false` and
finish the watcher before closing or navigating the window or dialog under
observation, as shown in the chrome-window example. `finish()` stops observing,
runs a final check, and asserts that no watcher errors or axe violations were
collected. Use `flush()` to force any pending check to run and inspect the
current report before the end of the test.

The watcher uses a throttle, not a debounce. While mutations continue, checks
are scheduled at most once per `throttleMs` interval. The default is 10 ms.

## Context and Container

`context` controls what axe scans. `container` controls what the mutation
observer watches. If `context` is omitted for a mutation watcher, the helper uses
the watched container as the axe context.

For content browsers, pass selector strings because the observer runs in the
content process. If no content-browser container or string context is provided,
the observer watches `document.body`, falling back to `documentElement`.

For chrome windows, `container` may be either an element or a selector string.
If no chrome-window container or string context is provided, the observer watches
the document root.

## Content Browser Defaults

Content tabs in browser tests are often fixtures or partial documents. They are
not expected to have full page-level landmarks, so content-browser helpers
disable these axe rules by default:

- `landmark-one-main`
- `region`

Chrome-window helpers do not apply those defaults. A test can still override any
axe rule through `axeOptions`.

```js
await checkAxe(tab.browser, {
  axeOptions: {
    rules: {
      "landmark-one-main": { enabled: true },
    },
  },
  specialPowers: SpecialPowers,
});
```

## Fluent and Build Skips

The helpers wait for Fluent localization before every axe run. When a document
has `document.l10n`, the helper waits for `l10n.ready`, calls
`translateRoots()`, and waits for a frame so translated strings are present in
the DOM before axe scans it.

Axe checks are skipped on debug, ASan, TSan, and code coverage builds. The
helpers return empty skipped results in those configurations so the same test can
still run.

## SpecialPowers

Content-browser helpers use `SpecialPowers.spawn` to inject and run axe in the
content process. If the helper cannot find `SpecialPowers` from the test global
or browser owner, pass it explicitly:

```js
await checkAxe(tab.browser, {
  specialPowers: SpecialPowers,
});
```

Chrome-window helpers run in the current process and do not need
`SpecialPowers.spawn`.

## Vendored axe-core

The axe browser bundle is vendored under `third_party/axe-core`. The build
exposes `third_party/axe-core/axe.min.js` as
`resource://testing-common/mail/axe.min.js`, which `AxeHelpers.sys.mjs` injects
into the target document. Tests should import and use the helper module instead
of loading `axe.min.js` directly.

The vendoring metadata is in `third_party/axe-core/moz.yaml`. The custom vendor
script downloads the published npm package, verifies the npm integrity hash, and
copies the files Thunderbird keeps.

To update axe-core, run mach vendor with the desired npm package version:

```sh
../mach vendor -r 4.12.1 third_party/axe-core/moz.yaml
```

Use the new version number in place of `4.12.1`.
