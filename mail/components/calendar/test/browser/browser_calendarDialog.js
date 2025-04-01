/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let dialog;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialog.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialog.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  // This test misbehaves if started immediately.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  browser = tab.browser;
  dialog = browser.contentWindow.document.querySelector("dialog");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_dialogStructure() {
  dialog.show();
  const titlebar = dialog.querySelectorAll(".titlebar");
  const closeButton = dialog.querySelectorAll(".titlebar .close-button");

  Assert.equal(titlebar.length, 1, "Contains 1 titlebar");
  Assert.equal(closeButton.length, 1, "Titlebar contains 1 close button");
  Assert.equal(
    dialog.querySelectorAll(".footer").length,
    1,
    "Contains 1 footer bar"
  );
  Assert.equal(
    dialog.querySelectorAll(".content").length,
    1,
    "Contains 1 content container"
  );
});

add_task(async function test_dialogOpenAndClose() {
  dialog.show();

  Assert.ok(dialog.open, "Dialog is updated to open");
  EventUtils.synthesizeMouseAtCenter(
    dialog.querySelector(".close-button"),
    {},
    browser.contentWindow
  );
  Assert.ok(!dialog.open, "Dialog is closed");
});

add_task(async function test_dialogSubviewNavigation() {
  dialog.show();
  const subviewManager = dialog.querySelector(
    "calendar-dialog-subview-manager"
  );
  const backButton = dialog.querySelector(".back-button");
  const mainSubview = dialog.querySelector("#calendarDialogMainSubview");
  const otherSubview = dialog.querySelector("#calendarDialogOtherSubview");

  Assert.ok(
    BrowserTestUtils.isHidden(backButton),
    "Back button should be hidden initially"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(mainSubview),
    "Main subview should be visible initially"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(otherSubview),
    "Other subview should be hidden initially"
  );

  subviewManager.showSubview(otherSubview.id);

  Assert.ok(
    BrowserTestUtils.isVisible(backButton),
    "Back button should be visible on other subview"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(mainSubview),
    "Main subview should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(otherSubview),
    "Other subview should be visible now"
  );

  EventUtils.synthesizeMouseAtCenter(backButton, {}, browser.contentWindow);

  Assert.ok(
    BrowserTestUtils.isHidden(backButton),
    "Back button should be hidden again"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(mainSubview),
    "Main subview should be visible again"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(otherSubview),
    "Other subview should be hidden again"
  );
});

add_task(async function test_dialogTitle() {
  dialog.show();

  Assert.equal(
    dialog.querySelector(".calendar-dialog-title").textContent,
    "",
    "The dialog title has no text before data is set"
  );

  dialog.updateDialogData({ title: "foobar" });

  Assert.equal(
    dialog.querySelector(".calendar-dialog-title").textContent,
    "foobar",
    "The dialog title has correct title after setting data"
  );

  dialog.updateDialogData({});

  Assert.equal(
    dialog.querySelector(".calendar-dialog-title").textContent,
    "",
    "The dialog title text is cleared"
  );
});

add_task(async function test_dialogLocation() {
  dialog.show();
  const locationLink = dialog.querySelector("#locationLink");
  const locationText = dialog.querySelector("#locationText");

  Assert.ok(
    BrowserTestUtils.isHidden(locationLink),
    "Location link should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(locationText),
    "Location text should be hidden"
  );

  dialog.updateDialogData({ eventLocation: "foobar" });
  Assert.ok(
    BrowserTestUtils.isHidden(locationLink),
    "Location link should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(locationText),
    "Location text should be visible"
  );
  Assert.equal(locationText.textContent, "foobar", "Should set location text");

  dialog.updateDialogData({
    eventLocation: "https://www.thunderbird.net/",
  });
  Assert.ok(
    BrowserTestUtils.isVisible(locationLink),
    "Location link should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(locationText),
    "Location text should be hidden"
  );
  Assert.equal(
    locationLink.textContent,
    "https://www.thunderbird.net/",
    "Link text should update"
  );
  Assert.equal(
    locationLink.href,
    "https://www.thunderbird.net/",
    "Link href should update"
  );

  Assert.equal(locationText.textContent, "", "Location text should be empty");
});
