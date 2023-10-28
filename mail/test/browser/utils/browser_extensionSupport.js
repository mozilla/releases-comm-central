/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests ExtensionSupport.sys.mjs functions.
 */

var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { promise_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

/**
 * Bug 1450288
 * Test ExtensionSupport.registerWindowListener and ExtensionSupport.unregisterWindowListener.
 */
add_task(async function test_windowListeners() {
  // There may be some pre-existing listeners already set up, e.g. mozmill ones.
  const originalListenerCount = ExtensionSupport.registeredWindowListenerCount;

  const addonRunCount = [];
  addonRunCount.load = new Map();
  addonRunCount.unload = new Map();

  function addonListener(aAddon, aEvent) {
    if (!addonRunCount[aEvent].has(aAddon)) {
      addonRunCount[aEvent].set(aAddon, 0);
    }
    addonRunCount[aEvent].set(aAddon, addonRunCount[aEvent].get(aAddon) + 1);
  }

  function addonCount(aAddon, aEvent) {
    if (!addonRunCount[aEvent].has(aAddon)) {
      return 0;
    }

    return addonRunCount[aEvent].get(aAddon);
  }

  // Extension listening to all windows and all events.
  Assert.ok(
    ExtensionSupport.registerWindowListener("test-addon1", {
      onLoadWindow() {
        addonListener("test-addon1", "load");
      },
      onUnloadWindow() {
        addonListener("test-addon1", "unload");
      },
    })
  );

  Assert.equal(addonCount("test-addon1", "load"), 2);

  // Extension listening to compose window only.
  Assert.ok(
    ExtensionSupport.registerWindowListener("test-addon2", {
      chromeURLs: [
        "chrome://messenger/content/messengercompose/messengercompose.xhtml",
      ],
      onLoadWindow() {
        addonListener("test-addon2", "load");
      },
      onUnloadWindow() {
        addonListener("test-addon2", "unload");
      },
    })
  );

  let cwc = await open_compose_new_mail();

  Assert.equal(addonCount("test-addon1", "load"), 3);
  Assert.equal(addonCount("test-addon2", "load"), 1);

  // Extension listening to compose window once while it is already open.
  Assert.ok(
    ExtensionSupport.registerWindowListener("test-addon3", {
      chromeURLs: [
        "chrome://messenger/content/messengercompose/messengercompose.xhtml",
      ],
      onLoadWindow() {
        addonListener("test-addon3", "load");
        ExtensionSupport.unregisterWindowListener("test-addon3");
      },
    })
  );

  Assert.equal(addonCount("test-addon3", "load"), 1);

  // Extension listening to compose window while it is already open.
  Assert.ok(
    ExtensionSupport.registerWindowListener("test-addon4", {
      chromeURLs: [
        "chrome://messenger/content/messengercompose/messengercompose.xhtml",
      ],
      onLoadWindow() {
        addonListener("test-addon4", "load");
      },
      onUnloadWindow() {
        addonListener("test-addon4", "unload");
        ExtensionSupport.unregisterWindowListener("test-addon4");
      },
    })
  );

  Assert.equal(addonCount("test-addon4", "load"), 1);

  await close_compose_window(cwc);

  Assert.equal(addonCount("test-addon1", "unload"), 1);
  Assert.equal(addonCount("test-addon2", "unload"), 1);
  Assert.equal(addonCount("test-addon3", "unload"), 0);
  Assert.equal(addonCount("test-addon4", "unload"), 1);

  cwc = await open_compose_new_mail();

  Assert.equal(addonCount("test-addon1", "load"), 4);
  // Addon3 didn't listen to the new compose window, addon2 did.
  Assert.equal(addonCount("test-addon2", "load"), 2);
  Assert.equal(addonCount("test-addon3", "load"), 1);

  await close_compose_window(cwc);

  Assert.equal(addonCount("test-addon1", "unload"), 2);
  Assert.equal(addonCount("test-addon2", "unload"), 2);
  Assert.equal(addonCount("test-addon3", "unload"), 0);

  const activityManagerPromise = promise_new_window("Activity:Manager");
  window.openActivityMgr();
  const amWin = await activityManagerPromise;

  // Only Addon1 listens to any window.
  Assert.equal(addonCount("test-addon1", "load"), 5);
  Assert.equal(addonCount("test-addon2", "load"), 2);
  Assert.equal(addonCount("test-addon3", "load"), 1);
  Assert.equal(addonCount("test-addon4", "load"), 1);

  await BrowserTestUtils.closeWindow(amWin);
  await TestUtils.waitForTick();

  Assert.equal(addonCount("test-addon1", "unload"), 3);
  Assert.equal(addonCount("test-addon2", "unload"), 2);
  Assert.equal(addonCount("test-addon3", "unload"), 0);
  Assert.equal(addonCount("test-addon4", "unload"), 1);

  // Registering with some invalid data should fail.
  Assert.ok(!ExtensionSupport.registerWindowListener("", {}));
  Assert.ok(!ExtensionSupport.registerWindowListener("test-addon1", {}));
  Assert.ok(!ExtensionSupport.registerWindowListener("test-addon5", {}));
  Assert.ok(!ExtensionSupport.unregisterWindowListener(""));
  Assert.ok(!ExtensionSupport.unregisterWindowListener("test-addon5"));

  // Clean up addon registrations. addon3 unregistered itself already.
  Assert.ok(ExtensionSupport.unregisterWindowListener("test-addon1"));
  Assert.ok(ExtensionSupport.unregisterWindowListener("test-addon2"));
  Assert.ok(!ExtensionSupport.unregisterWindowListener("test-addon3"));
  Assert.equal(
    ExtensionSupport.registeredWindowListenerCount,
    originalListenerCount
  );
});
