/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests ExtensionSupport.jsm functions.
 */

var {
  close_address_book_window,
  open_address_book_window,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { assert_equals, assert_false, assert_true } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);

/**
 * Bug 1450288
 * Test ExtensionSupport.registerWindowListener and ExtensionSupport.unregisterWindowListener.
 */
function test_windowListeners() {
  // There may be some pre-existing listeners already set up, e.g. mozmill ones.
  let originalListenerCount = ExtensionSupport.registeredWindowListenerCount;

  let addonRunCount = [];
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
  assert_true(
    ExtensionSupport.registerWindowListener("test-addon1", {
      onLoadWindow() {
        addonListener("test-addon1", "load");
      },
      onUnloadWindow() {
        addonListener("test-addon1", "unload");
      },
    })
  );

  assert_equals(addonCount("test-addon1", "load"), 1);

  // Extension listening to compose window only.
  assert_true(
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

  let cwc = open_compose_new_mail();

  assert_equals(addonCount("test-addon1", "load"), 2);
  assert_equals(addonCount("test-addon2", "load"), 1);

  // Extension listening to compose window once while it is already open.
  assert_true(
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

  assert_equals(addonCount("test-addon3", "load"), 1);

  // Extension listening to compose window while it is already open.
  assert_true(
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

  assert_equals(addonCount("test-addon4", "load"), 1);

  close_compose_window(cwc);

  assert_equals(addonCount("test-addon1", "unload"), 1);
  assert_equals(addonCount("test-addon2", "unload"), 1);
  assert_equals(addonCount("test-addon3", "unload"), 0);
  assert_equals(addonCount("test-addon4", "unload"), 1);

  cwc = open_compose_new_mail();

  assert_equals(addonCount("test-addon1", "load"), 3);
  // Addon3 didn't listen to the new compose window, addon2 did.
  assert_equals(addonCount("test-addon2", "load"), 2);
  assert_equals(addonCount("test-addon3", "load"), 1);

  close_compose_window(cwc);

  assert_equals(addonCount("test-addon1", "unload"), 2);
  assert_equals(addonCount("test-addon2", "unload"), 2);
  assert_equals(addonCount("test-addon3", "unload"), 0);

  let abc = open_address_book_window();
  // Only Addon1 listens to any window.
  assert_equals(addonCount("test-addon1", "load"), 4);
  assert_equals(addonCount("test-addon2", "load"), 2);
  assert_equals(addonCount("test-addon3", "load"), 1);
  assert_equals(addonCount("test-addon4", "load"), 1);

  close_address_book_window(abc);

  assert_equals(addonCount("test-addon1", "unload"), 3);
  assert_equals(addonCount("test-addon2", "unload"), 2);
  assert_equals(addonCount("test-addon3", "unload"), 0);
  assert_equals(addonCount("test-addon4", "unload"), 1);

  // Registering with some invalid data should fail.
  assert_false(ExtensionSupport.registerWindowListener("", {}));
  assert_false(ExtensionSupport.registerWindowListener("test-addon1", {}));
  assert_false(ExtensionSupport.registerWindowListener("test-addon5", {}));
  assert_false(ExtensionSupport.unregisterWindowListener(""));
  assert_false(ExtensionSupport.unregisterWindowListener("test-addon5"));

  // Clean up addon registrations. addon3 unregistered itself already.
  assert_true(ExtensionSupport.unregisterWindowListener("test-addon1"));
  assert_true(ExtensionSupport.unregisterWindowListener("test-addon2"));
  assert_false(ExtensionSupport.unregisterWindowListener("test-addon3"));
  assert_equals(
    ExtensionSupport.registeredWindowListenerCount,
    originalListenerCount
  );
}
