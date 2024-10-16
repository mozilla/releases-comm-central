/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});
let browser, win;

add_setup(async () => {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/customElementUtils.html",
  });
  browser = tab.browser;
  win = browser.contentWindow;

  await BrowserTestUtils.browserLoaded(browser, undefined, uri =>
    uri.endsWith("customElementUtils.html")
  );
  await SimpleTest.promiseFocus(win);
});

/**
 * Test the CustomElementUtils module.
 */

add_task(async function test_defineLazyCustomElement() {
  Assert.ok(
    !win.customElements.get("test-element"),
    "test-element should not be defined"
  );

  // Not awaiting here, since we then await whenDefined.
  win.callDefineElement(
    "test-element",
    "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/test-element.mjs"
  );

  const testElement = win.document.createElement("test-element");
  win.document.body.append(testElement);
  await win.customElements.whenDefined("test-element");

  const testElementFactory = win.customElements.get("test-element");
  Assert.ok(
    testElementFactory,
    "test-element should be defined after instatiating one"
  );
  Assert.ok(
    testElement instanceof testElementFactory,
    "Created element should be instance of the registered factory"
  );

  await win.callDefineElement(
    "test-element",
    "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/other-element.mjs"
  );

  const anotherTestElement = win.document.createElement("test-element");
  win.document.body.append(anotherTestElement);

  Assert.ok(
    anotherTestElement instanceof testElementFactory,
    "Should still use initial factory"
  );
  Assert.strictEqual(
    win.customElements.get("test-element"),
    testElementFactory,
    "Should not have modified custom elements registration"
  );

  testElement.remove();
  anotherTestElement.remove();
});

add_task(async function test_defineLazyCustomElement_overrideExisting() {
  const existingElementFactory = win.customElements.get("existing-element");
  Assert.ok(
    existingElementFactory,
    "Should already have existing-element registered"
  );

  await win.callDefineElement(
    "existing-element",
    "chrome://mochitests/content/browser/comm/mail/base/test/browser/files/override-element.mjs"
  );
  const existingElement = win.document.createElement("existing-element");
  win.document.body.append(existingElement);

  Assert.ok(
    existingElement instanceof existingElementFactory,
    "Should instantiate already registered custom element"
  );
  Assert.strictEqual(
    win.customElements.get("existing-element"),
    existingElementFactory,
    "Should not have modified custom element registration"
  );

  existingElement.remove();
});
