/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the calender-itip-identity dialog.
 */

"use-strict";

var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { be_in_folder, get_special_folder, select_click_row } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

let receiverAcct;
let receiverIdentity;
let gInbox;
let calendar;

registerCleanupFunction(() => {
  CalendarTestUtils.removeProxyCalendar(calendar);
  MailServices.accounts.removeIncomingServer(receiverAcct.incomingServer, true);
  MailServices.accounts.removeAccount(receiverAcct);
});

/**
 * Initialize account, identity and calendar.
 */
add_task(async function setUp() {
  receiverAcct = MailServices.accounts.createAccount();
  receiverAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "receiver",
    "example.com",
    "imap"
  );
  receiverIdentity = MailServices.accounts.createIdentity();
  receiverIdentity.email = "receiver@example.com";
  receiverIdentity.fullAddress = `Receiver <${receiverIdentity.email}>`;
  receiverAcct.addIdentity(receiverIdentity);

  gInbox = get_special_folder(Ci.nsMsgFolderFlags.Inbox, true);
  calendar = CalendarTestUtils.createProxyCalendar("Test");
});

/**
 * Tests that the identity prompt shows when accepting an invitation to an
 * event with an identity no calendar is configured to use.
 */
add_task(async function testInvitationIdentityPrompt() {
  be_in_folder(gInbox);

  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    new FileUtils.File(getTestFilePath("data/meet-meeting-invite.eml")),
    gInbox,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
  await copyListener.promise;

  select_click_row(0);

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-itip-identity-dialog.xhtml",
    {
      async callback(win) {
        // Select the identity we want to use.
        let menulist = win.document.getElementById("identity-menu");
        for (let i = 0; i < menulist.itemCount; i++) {
          let target = menulist.getItemAtIndex(i);
          if (target.value == receiverIdentity.fullAddress) {
            menulist.selectedIndex = i;
          }
        }

        win.document
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );

  // Override this function to intercept the attempt to send the email out.
  let sendItemsArgs = [];
  let getImipTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => ({
    scheme: "mailto",
    type: "email",
    sendItems(receipientArray, item, sender) {
      sendItemsArgs = [receipientArray, item, sender];
      return true;
    },
  });

  let acceptButton = document.getElementById("imipAcceptButton");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.is_visible(acceptButton),
    "waiting for accept button to become visible"
  );
  EventUtils.synthesizeMouseAtCenter(acceptButton, {});
  await dialogPromise;

  let events;
  await TestUtils.waitForCondition(async () => {
    events = await calendar.getItem("65m17hsdolmotv3kvmrtg40ont@google.com");
    return events.length && sendItemsArgs.length;
  });

  // Restore this function.
  cal.itip.getImipTransport = getImipTransport;

  let id = `mailto:${receiverIdentity.email}`;
  let [event] = events;
  Assert.ok(event, "event was added to the calendar successfully");
  Assert.ok(event.getAttendeeById(id), "selected identity was added to the attendee list");
  Assert.equal(
    event.getProperty("X-MOZ-INVITED-ATTENDEE"),
    id,
    "X-MOZ-INVITED-ATTENDEE is set to the selected identity"
  );

  let [recipientArray, , sender] = sendItemsArgs;
  Assert.equal(recipientArray.length, 1, "one receipient for the reply");
  Assert.equal(recipientArray[0].id, "mailto:example@gmail.com", "recipient is event organizer");
  Assert.equal(sender.id, id, "sender is the identity selected");
});
