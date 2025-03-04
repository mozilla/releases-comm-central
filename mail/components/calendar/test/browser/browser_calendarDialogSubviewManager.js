/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subviewManager;

add_setup(async () => {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogSubviewManager.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarDialogSubviewManager.xhtml")
  );
  await SimpleTest.promiseFocus(browser);
  subviewManager = browser.contentWindow.document.querySelector(
    "calendar-dialog-subview-manager"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_elementInit() {
  await TestUtils.waitForCondition(() => subviewManager.isConnected);
  Assert.equal(
    subviewManager.querySelectorAll(":scope > :not([hidden])").length,
    1,
    "Should have exactly one visible child"
  );
  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Visible subview matches the default subview"
  );
  Assert.equal(
    subviewManager.querySelector(":scope > :not([hidden])").id,
    subviewManager.getAttribute("default-subview"),
    "ID of visible subview should match default subview ID"
  );
});

add_task(async function test_showSubview() {
  const mainSubview = subviewManager.querySelector(
    "#calendarDialogMainSubview"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(mainSubview),
    "Should be displaying default subview"
  );
  const boundingRect = subviewManager.getBoundingClientRect();
  Assert.ok(
    !subviewManager.style.height,
    "Subview manager should be able to choose its height freely"
  );
  Assert.ok(
    !subviewManager.style.width,
    "Subview manager should be able to choose its width freely"
  );

  let subviewEventPromise = BrowserTestUtils.waitForEvent(
    subviewManager,
    "subviewchanged"
  );
  subviewManager.showSubview("calendarDialogMassiveSubview");
  const event = await subviewEventPromise;
  Assert.equal(event.detail, "calendarDialogMassiveSubview");
  Assert.ok(
    BrowserTestUtils.isVisible(
      subviewManager.querySelector("#calendarDialogMassiveSubview")
    ),
    "Massive subview should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(mainSubview),
    "Main subview should be hidden"
  );
  Assert.deepEqual(
    subviewManager.getBoundingClientRect(),
    boundingRect,
    "Dimensions should be identical"
  );
  Assert.ok(
    subviewManager.style.height,
    "Height of subview manager should be constrained"
  );
  Assert.ok(
    subviewManager.style.width,
    "Width of subview manager should be constrained"
  );

  subviewEventPromise = BrowserTestUtils.waitForEvent(
    subviewManager,
    "subviewchanged"
  );
  subviewManager.showSubview("calendarDialogAnotherSubview");
  await subviewEventPromise;
  Assert.ok(
    BrowserTestUtils.isVisible(
      subviewManager.querySelector("#calendarDialogAnotherSubview")
    ),
    "Another subview should be visible"
  );
  Assert.deepEqual(
    subviewManager.getBoundingClientRect(),
    boundingRect,
    "Dimensions should be identical"
  );
  Assert.ok(
    subviewManager.style.height,
    "Height of subview manager should still be constrained"
  );
  Assert.ok(
    subviewManager.style.width,
    "Width of subview manager should still be constrained"
  );

  subviewEventPromise = BrowserTestUtils.waitForEvent(
    subviewManager,
    "subviewchanged"
  );
  subviewManager.showSubview("calendarDialogMainSubview");
  await subviewEventPromise;
  Assert.ok(
    BrowserTestUtils.isVisible(
      subviewManager.querySelector("#calendarDialogMainSubview")
    ),
    "Should be displaying default subview again"
  );
  Assert.ok(
    !subviewManager.style.height,
    "Subview manager should be able to choose its height freely again"
  );
  Assert.ok(
    !subviewManager.style.width,
    "Subview manager should be able to choose its width freely again"
  );

  const failListener = failEvent => {
    Assert.ok(false, `Should not get event for ${failEvent.detail}`);
  };
  subviewManager.addEventListener("subviewchanged", failListener);
  subviewManager.showSubview("calendarDialogMainSubview");
  Assert.ok(
    BrowserTestUtils.isVisible(
      subviewManager.querySelector("#calendarDialogMainSubview")
    ),
    "Should still be displaying default subview"
  );
  subviewManager.removeEventListener("subviewchanged", failListener);
});

add_task(async function test_showSubview_error() {
  Assert.throws(
    () => subviewManager.showSubview("fictiveTestSubview"),
    /No subview with the id fictiveTestSubview found\./,
    "Should throw if requesting to show subview that doesn't exist"
  );
});

add_task(async function test_isDefaultSubviewVisible() {
  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Should report the default subview as visible"
  );

  subviewManager.showSubview("calendarDialogAnotherSubview");

  Assert.ok(
    !subviewManager.isDefaultSubviewVisible(),
    "Should not report the default subview as visible"
  );

  subviewManager.showSubview("calendarDialogMainSubview");
});

add_task(async function test_showDefaultSubview() {
  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Should be on default subview"
  );

  subviewManager.showDefaultSubview();
  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Should still be on default subview"
  );

  subviewManager.showSubview("calendarDialogAnotherSubview");
  Assert.ok(
    !subviewManager.isDefaultSubviewVisible(),
    "Should have switched away from default subview"
  );

  subviewManager.showDefaultSubview();
  Assert.ok(
    subviewManager.isDefaultSubviewVisible(),
    "Should be back on default subview"
  );
});
