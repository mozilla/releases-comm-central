/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  injectAxe,
  observeAxeMutations,
  startAxeMutationObserver,
  startAxeMutationObserverInWindow,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const watchers = [];
let browser;

add_setup(async function () {
  registerCleanupFunction(async () => {
    for (const watcher of watchers) {
      await watcher.finish({ assert: false });
    }

    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });

  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/test/browser/utils/html/axeHelpers.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  browser = tab.browser;
});

/**
 * Checks automatic shadow mutation runs through either public watcher API.
 *
 * @param {boolean} inContent - Whether to use the spawned content watcher.
 * @returns {Promise<void>} Resolves after checking the final watcher report.
 */
async function checkWatcher(inContent) {
  const win = browser.contentWindow;
  const doc = win.document;
  const fixture = doc.getElementById("fixture");

  Assert.ok(doc.l10n, "The fixture should have Fluent localization");

  fixture.replaceChildren();

  /**
   * Creates a shadow host containing a named button.
   *
   * @param {Element|ShadowRoot} parent - Parent for the new host.
   * @returns {object} The host, open root, and button.
   */
  function addHost(parent) {
    const host = doc.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const button = doc.createElement("button");

    button.textContent = "Named button";
    root.append(button);
    parent.append(host);

    return { host, root, button };
  }

  const existing = addHost(fixture);
  const nested = addHost(existing.root);
  const lateHost = doc.createElement("div");
  let watcher = null;

  watchers.push({
    async finish() {
      if (watcher) {
        await watcher.finish({ assert: false });
      }

      doc.l10n.disconnectRoot(existing.root);
    },
  });

  const [initialMessage, updatedMessage] = await doc.l10n.formatMessages([
    { id: "tb-banner-show-more" },
    { id: "tb-banner-show-less" },
  ]);

  doc.l10n.connectRoot(existing.root);
  doc.l10n.setAttributes(existing.button, "tb-banner-show-more");

  nested.root.append(lateHost);
  await injectAxe(browser, { specialPowers: SpecialPowers });

  const axe = win.wrappedJSObject.axe;
  const originalRun = axe.run;
  const checkedLabels = [];
  let completedRuns = 0;

  watchers.push({
    finish() {
      axe.run = originalRun;
    },
  });

  axe.run = async (...args) => {
    checkedLabels.push(existing.button.textContent);
    const result = await originalRun.apply(axe, args);
    completedRuns++;

    return result;
  };

  const options = {
    autoFinish: false,
    container: "#fixture",
    axeOptions: { runOnly: ["button-name"] },
    throttleMs: 500,
  };
  watcher = inContent
    ? await startAxeMutationObserver(browser, {
        ...options,
        specialPowers: SpecialPowers,
      })
    : await startAxeMutationObserverInWindow(win, options);

  const initial = await watcher.flush();

  if (initial.skipped) {
    Assert.ok(initial.skippedReason, "Skipped builds should report a reason");
    await watcher.finish({ assert: false });
    axe.run = originalRun;
    doc.l10n.disconnectRoot(existing.root);

    return;
  }

  Assert.ok(
    checkedLabels.length,
    "Initial checks should scan the shadow button"
  );

  Assert.ok(
    checkedLabels.every(label => label == initialMessage.value),
    "Initial checks should wait for the translated shadow button label"
  );

  // With no DOM changes, flushing must not start another translation cycle.
  const settled = await watcher.flush();

  Assert.equal(
    settled.mutationCount,
    initial.mutationCount,
    "Checks should not create mutations by translating unchanged shadow text"
  );
  Assert.equal(
    settled.runCount,
    initial.runCount + 1,
    "An idle flush should run only its explicitly requested check"
  );

  const beforeTranslation = completedRuns;

  checkedLabels.length = 0;
  doc.l10n.setAttributes(existing.button, "tb-banner-show-less");

  await TestUtils.waitForCondition(
    () => completedRuns > beforeTranslation,
    "A Fluent label change should trigger an automatic axe run"
  );

  Assert.ok(
    checkedLabels.every(label => label == updatedMessage.value),
    "Automatic checks should wait for the updated shadow button translation"
  );

  await watcher.flush();

  /**
   * Waits for an automatic axe run after changing a shadow button's label.
   *
   * @param {HTMLButtonElement} button - Button inside an observed shadow root.
   * @returns {Promise<void>} Resolves after an automatic axe run completes.
   */
  async function changeLabel(button) {
    const before = completedRuns;

    button.firstChild.data = "Updated label";
    await TestUtils.waitForCondition(
      () => completedRuns > before,
      "A shadow mutation should trigger an automatic axe run"
    );
  }

  const beforeBurst = completedRuns;

  existing.button.textContent = "First change";
  existing.button.textContent = "Second change";
  await TestUtils.waitForTick();

  Assert.equal(
    completedRuns,
    beforeBurst,
    "The throttle should defer a burst immediately after a flush"
  );

  await TestUtils.waitForCondition(
    () => completedRuns > beforeBurst,
    "The throttled burst should eventually trigger an automatic check"
  );

  await changeLabel(existing.button);
  await changeLabel(nested.button);

  const added = addHost(doc.createElement("div"));
  fixture.append(added.host.parentNode);
  await watcher.flush();
  await changeLabel(added.button);

  const lateRoot = lateHost.attachShadow({ mode: "open" });
  const lateButton = doc.createElement("button");
  const beforeAttachment = completedRuns;

  lateButton.textContent = "Late button";
  lateRoot.append(lateButton);

  await TestUtils.waitForCondition(
    () => completedRuns > beforeAttachment,
    "A later shadow attachment should trigger an automatic axe run"
  );
  await changeLabel(lateButton);

  const beforeViolation = completedRuns;

  lateButton.textContent = "";

  await TestUtils.waitForCondition(
    () => completedRuns > beforeViolation,
    "An unnamed shadow button should trigger an automatic axe run"
  );

  const report = await watcher.finish({ assert: false });

  Assert.equal(report.errors.length, 0, "The watcher should have no errors");

  Assert.ok(
    report.failures.some(
      failure =>
        failure.reason == "mutation" &&
        failure.violations.some(violation => violation.id == "button-name")
    ),
    "Automatic checks should record the unnamed shadow button"
  );

  const finishedRuns = completedRuns;

  lateButton.textContent = "Named again";
  addHost(fixture);
  await TestUtils.waitForTick();
  const finishedReport = await watcher.flush();

  Assert.deepEqual(
    finishedReport,
    report,
    "Finished reports should stay fixed"
  );
  Assert.equal(
    completedRuns,
    finishedRuns,
    "Finished watchers should stop runs"
  );

  axe.run = originalRun;
  doc.l10n.disconnectRoot(existing.root);
}

add_task(async function test_windowShadowMutations() {
  await checkWatcher(false);
});

add_task(async function test_contentShadowMutations() {
  await checkWatcher(true);
});

add_task(async function test_observationScopeAndCleanup() {
  const win = browser.contentWindow;
  const doc = win.document;
  const fixture = doc.getElementById("fixture");

  fixture.replaceChildren();
  const options = { attributes: true, childList: true, subtree: true };
  const originalEnabled = doc.devToolsAnonymousAndShadowEventsEnabled;
  let firstCount = 0;
  let secondCount = 0;
  const first = observeAxeMutations(win, fixture, options, count => {
    firstCount += count;
  });

  const second = observeAxeMutations(win, fixture, options, count => {
    secondCount += count;
  });

  watchers.push({ finish: () => first.disconnect() });
  watchers.push({ finish: () => second.disconnect() });

  const host = doc.createElement("div");

  fixture.append(host);
  await TestUtils.waitForCondition(
    () => firstCount && secondCount,
    "Both observers should see the inserted host"
  );

  first.disconnect();
  const firstStoppedCount = firstCount;
  const beforeSecond = secondCount;
  const root = host.attachShadow({ mode: "open" });

  root.append(doc.createElement("button"));

  await TestUtils.waitForCondition(
    () => secondCount > beforeSecond,
    "The remaining observer should see a later shadow root"
  );

  Assert.equal(firstCount, firstStoppedCount, "The first observer should stop");

  const closedHost = doc.createElement("div");
  const closedInserted = secondCount;

  fixture.append(closedHost);

  await TestUtils.waitForCondition(
    () => secondCount > closedInserted,
    "The observer should see the closed root's host insertion"
  );

  const eventTarget = win.docShell.chromeEventHandler;
  const attached = BrowserTestUtils.waitForEvent(
    eventTarget,
    "shadowrootattached",
    true,
    event => event.target == closedHost
  );

  const closedRoot = closedHost.attachShadow({ mode: "closed" });

  await attached;

  const beforeExcluded = secondCount;

  closedRoot.append(doc.createElement("button"));
  doc.getElementById("outside").append(doc.createElement("button"));
  host.setAttribute("aria-label", "Mutation delivery barrier");

  await TestUtils.waitForCondition(
    () => secondCount > beforeExcluded,
    "The observer should deliver the in-scope attribute change"
  );

  Assert.equal(
    secondCount,
    beforeExcluded + 1,
    "Closed roots and nodes outside the container should be excluded"
  );

  second.disconnect();

  Assert.equal(
    doc.devToolsAnonymousAndShadowEventsEnabled,
    originalEnabled,
    "The final observer should restore shadow event enablement"
  );
});

add_task(async function test_attributeOnlyDiscovery() {
  const win = browser.contentWindow;
  const doc = win.document;
  const fixture = doc.getElementById("fixture");
  const host = doc.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const button = doc.createElement("button");

  root.append(button);
  let count = 0;
  const observer = observeAxeMutations(
    win,
    fixture,
    { attributes: true, subtree: true },
    changes => {
      count += changes;
    }
  );

  watchers.push({ finish: () => observer.disconnect() });
  fixture.append(host);
  // Mutation delivery must discover the inserted root before its next change.
  await TestUtils.waitForTick();
  button.setAttribute("aria-label", "Named button");

  await TestUtils.waitForCondition(
    () => count,
    "Attribute-only observers should discover roots in inserted hosts"
  );

  Assert.equal(count, 1, "Discovery-only child changes should not be reported");

  const lateHost = doc.createElement("div");

  fixture.append(lateHost);

  const attached = BrowserTestUtils.waitForEvent(
    win.docShell.chromeEventHandler,
    "shadowrootattached",
    true,
    event => event.originalTarget == lateHost
  );

  const lateRoot = lateHost.attachShadow({ mode: "open" });

  await attached;

  Assert.equal(
    count,
    1,
    "Attribute-only observers should exclude shadow attachments"
  );

  const lateButton = doc.createElement("button");

  lateRoot.append(lateButton);
  lateButton.setAttribute("aria-label", "Late button");

  await TestUtils.waitForCondition(
    () => count > 1,
    "Attribute-only observers should observe changes inside later roots"
  );

  Assert.equal(
    count,
    2,
    "Only the requested attribute changes should be reported"
  );

  observer.disconnect();
});

add_task(async function test_chromeWindowAttachment() {
  const host = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  let count = 0;
  const observer = observeAxeMutations(
    window,
    host,
    { childList: true, subtree: true },
    changes => {
      count += changes;
    }
  );

  watchers.push({
    finish() {
      observer.disconnect();
      host.remove();
    },
  });

  document.documentElement.append(host);
  host.attachShadow({ mode: "open" });

  await TestUtils.waitForCondition(
    () => count,
    "The top-level chrome window should report a shadow attachment"
  );

  Assert.equal(
    count,
    1,
    "The chrome window should report one shadow attachment"
  );

  observer.disconnect();
  host.remove();
});
