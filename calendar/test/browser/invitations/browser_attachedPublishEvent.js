/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that attached events - NOT invites - works properly.
 * These are attached VCALENDARs that have METHOD:PUBLISH.
 */
"use strict";

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

var gCalendar;

/**
 * Initialize account, identity and calendar.
 */
add_setup(async function () {
  let receiverAcct = MailServices.accounts.createAccount();
  receiverAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "receiver",
    "example.com",
    "imap"
  );
  let receiverIdentity = MailServices.accounts.createIdentity();
  receiverIdentity.email = "john.doe@example.com";
  receiverAcct.addIdentity(receiverIdentity);
  gCalendar = CalendarTestUtils.createCalendar("EventTestCal");

  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(gCalendar);
    MailServices.accounts.removeAccount(receiverAcct, true);
  });
});

/**
 * Test that opening a message containing an event with iTIP method "PUBLISH"
 * shows the correct UI.
 * The party crashing dialog should not show.
 */
add_task(async function test_event_from_eml() {
  let file = new FileUtils.File(getTestFilePath("data/message-non-invite.eml"));

  let win = await openMessageFromFile(file);
  let aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
  let imipBar = aboutMessage.document.getElementById("imip-bar");

  await TestUtils.waitForCondition(() => !imipBar.collapsed);
  info("Ok, iMIP bar is showing");

  let imipAddButton = aboutMessage.document.getElementById("imipAddButton");
  Assert.ok(!imipAddButton.hidden, "Add button should show");

  EventUtils.synthesizeMouseAtCenter(imipAddButton, {}, aboutMessage);

  // Make sure the event got added, without showing the party crashing dialog.
  await TestUtils.waitForCondition(async () => {
    let event = await gCalendar.getItem("1e5fd4e6-bc52-439c-ac76-40da54f57c77@secure.example.com");
    return event;
  });

  await TestUtils.waitForCondition(() => imipAddButton.hidden, "Add button should hide");

  let imipDetailsButton = aboutMessage.document.getElementById("imipDetailsButton");
  Assert.ok(!imipDetailsButton.hidden, "Details button should show");

  await BrowserTestUtils.closeWindow(win);
});
