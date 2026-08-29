/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gMailInit */

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { SessionStoreManager } = ChromeUtils.importESModule(
  "resource:///modules/SessionStoreManager.sys.mjs"
);

Services.scriptloader.loadSubScript(
  "chrome://mochikit/content/tests/SimpleTest/MockObjects.js",
  this
);

const hideWindow = sinon.spy();

add_setup(() => {
  class MockOSIntegration {
    QueryInterface = ChromeUtils.generateQI(["nsIMessengerWindowsIntegration"]);
    hideWindow = hideWindow;
  }
  const osIntegration = new MockObjectRegisterer(
    "@mozilla.org/messenger/osintegration;1",
    MockOSIntegration
  );

  osIntegration.register();
  registerCleanupFunction(() => {
    osIntegration.unregister();
  });
});

async function enableStartInTray(
  prefs = { closeToTray: true, startInTray: true }
) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.closeToTray", prefs.closeToTray],
      ["mail.closeToTray.startInTray", prefs.startInTray],
    ],
  });
}

/**
 * Run gMailInit.onBeforeInitialXULLayout and only resolve once start in tray
 * has finished.
 */
function runOnBeforeInitialXULLayout() {
  return new Promise(resolve => {
    const oldStartInTray = gMailInit._startInTray.bind(gMailInit);

    gMailInit._startInTray = async (...args) => {
      await oldStartInTray(...args);
      gMailInit._startInTray = oldStartInTray;
      resolve();
    };

    gMailInit.onBeforeInitialXULLayout();
  });
}

add_task(async function test_noStartInTray() {
  await enableStartInTray({ closeToTray: false, startInTray: false });

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.notCalled,
    "Should not hide window when start in tray is off"
  );
});

add_task(async function test_onlyCloseToTray() {
  await enableStartInTray({ closeToTray: true, startInTray: false });

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.notCalled,
    "Should not hide window when close to tray is on but start in tray is off"
  );
});

add_task(async function test_onlyStartInTray() {
  await enableStartInTray({ closeToTray: false, startInTray: true });

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.notCalled,
    "Should not hide window when start in tray is on but close to tray is off"
  );
});

add_task(async function test_firstWindowNoState() {
  await enableStartInTray();
  const initialized = sinon
    .stub(SessionStoreManager, "initialized")
    .get(() => false);
  const loadingWindow = sinon
    .stub(SessionStoreManager, "loadingWindow")
    .returns(null);

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.calledOnce,
    "Should hide window when loading the first window and there is no initial state"
  );

  initialized.restore();
  loadingWindow.restore();
  hideWindow.resetHistory();
});

add_task(async function test_firstWindowWithState() {
  await enableStartInTray();
  const initialized = sinon
    .stub(SessionStoreManager, "initialized")
    .get(() => false);
  const loadingWindow = sinon
    .stub(SessionStoreManager, "loadingWindow")
    .returns({});

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.calledOnce,
    "Should hide window when loading the first window and initial state is present"
  );

  initialized.restore();
  loadingWindow.restore();
  hideWindow.resetHistory();
});

add_task(async function test_reopenedWindowRestored() {
  await enableStartInTray();
  const initialized = sinon
    .stub(SessionStoreManager, "initialized")
    .get(() => true);
  const loadingWindow = sinon
    .stub(SessionStoreManager, "loadingWindow")
    .returns({});

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.calledOnce,
    "Should hide window when loading windows opened by the SessionStoreManager"
  );

  initialized.restore();
  loadingWindow.restore();
  hideWindow.resetHistory();
});

add_task(async function test_reopenedWindowNotRestored() {
  await enableStartInTray();
  const initialized = sinon
    .stub(SessionStoreManager, "initialized")
    .get(() => true);
  const loadingWindow = sinon
    .stub(SessionStoreManager, "loadingWindow")
    .returns(null);

  await runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.notCalled,
    "Should not hide window when loading windows opened after startup"
  );

  initialized.restore();
  loadingWindow.restore();
  hideWindow.resetHistory();
});

add_task(async function test_firstWindowAsap() {
  await enableStartInTray();
  const initialized = sinon
    .stub(SessionStoreManager, "initialized")
    .get(() => false);
  const loadingWindow = sinon
    .stub(SessionStoreManager, "loadingWindow")
    .returns({});

  const startInTrayFinished = runOnBeforeInitialXULLayout();

  Assert.ok(hideWindow.calledOnce, "Should hide the first window immediately");

  await startInTrayFinished;

  Assert.ok(
    hideWindow.calledOnce,
    "Should not hide the first window again once its state is known"
  );

  initialized.restore();
  loadingWindow.restore();
  hideWindow.resetHistory();
});

add_task(async function test_reopenedWindowAsap() {
  await enableStartInTray();
  const initialized = sinon
    .stub(SessionStoreManager, "initialized")
    .get(() => true);
  const loadingWindow = sinon
    .stub(SessionStoreManager, "loadingWindow")
    .returns({});

  const startInTrayFinished = runOnBeforeInitialXULLayout();

  Assert.ok(
    hideWindow.notCalled,
    "Should not hide subsequent window immediately"
  );

  await startInTrayFinished;

  Assert.ok(
    hideWindow.calledOnce,
    "Should hide subsequent window as soon as its state is known"
  );

  initialized.restore();
  loadingWindow.restore();
  hideWindow.resetHistory();
});

add_task(async function test_delayedStartupDelayed() {
  await enableStartInTray({ closeToTray: false, startInTray: false });
  const mock = sinon.mock(gMailInit);
  mock.expects("_delayedStartup").never();

  gMailInit.onLoad();

  mock.verify();
  Assert.ok(
    true,
    "Should not immediately call _delayedStartup when start to tray is off"
  );
});

add_task(async function test_delayedStartupImmediate() {
  await enableStartInTray();
  const mock = sinon.mock(gMailInit);
  mock.expects("_delayedStartup").once();

  gMailInit.onLoad();

  mock.verify();
  Assert.ok(
    true,
    "Should immediately call _delayedStartup when start to tray is on"
  );
});
