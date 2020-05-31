/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that reply messages use the correct identity and sender dependent
 * on the catchAll setting.
 */

"use strict";

var {
  close_compose_window,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  mc,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  assert_notification_displayed,
  wait_for_notification_to_show,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);

var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var i = 0;

var myIdentityEmail1 = "me@example.com";
var myIdentityEmail2 = "otherme@example.net";
var myAdditionalEmail3 = "alsome@example.net";
var notMyEmail = "otherme@example.org";

var identity1;
var identity2;

var gAccount;
var gFolder;

add_task(function setupModule(module) {
  requestLongerTimeout(4);

  // Now set up an account with some identities.
  let acctMgr = MailServices.accounts;
  gAccount = acctMgr.createAccount();
  gAccount.incomingServer = acctMgr.createIncomingServer(
    "nobody",
    "Reply Identity Testing",
    "pop3"
  );

  gFolder = gAccount.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("Msgs4Reply");

  identity1 = acctMgr.createIdentity();
  identity1.email = myIdentityEmail1;
  gAccount.addIdentity(identity1);

  identity2 = acctMgr.createIdentity();
  identity2.email = myIdentityEmail2;
  gAccount.addIdentity(identity2);
});

/**
 * Create and select a new message to do a reply with.
 */
function create_replyMsg(aTo, aEnvelopeTo) {
  let msg0 = create_message({
    from: "Tester <test@example.com>",
    to: aTo,
    subject: "test",
    clobberHeaders: {
      "envelope-to": aEnvelopeTo
    },
  });
  add_message_to_folder(gFolder, msg0);

  be_in_folder(gFolder);
  let msg = select_click_row(i++);
  assert_selected_and_displayed(mc, msg);
}

/**
 * all the tests
 */
add_task(function test_reply_identity_selection() {

  let tests = [
    // No catchAll, 'From' will be set to recipient.
    {
      to: myIdentityEmail2, envelopeTo: myIdentityEmail2,
      catchAllId1: false, catchAllId2: false,
      replyIdKey: identity2.key, replyIdFrom: myIdentityEmail2, warning: false
    },
    // No catchAll, 'From' will be set to second id's email (without name).
    {
      to: "Mr.X <" + myIdentityEmail2 + ">", envelopeTo: "",
      catchAllId1: false, catchAllId2: false,
      replyIdKey: identity2.key, replyIdFrom: myIdentityEmail2, warning: false
    },
    // With catchAll, 'From' will be set to senders address (with name).
    {
      to: "Mr.X <" + myIdentityEmail2 + ">", envelopeTo: "",
      catchAllId1: false, catchAllId2: true,
      replyIdKey: identity2.key, replyIdFrom: "Mr.X <" + myIdentityEmail2 + ">",
      warning: false
    },
    // With catchAll, 'From' will be set to senders address (with name).
    {
      to: myIdentityEmail2, envelopeTo: "Mr.X <" + myIdentityEmail2 + ">",
      catchAllId1: false, catchAllId2: true,
      replyIdKey: identity2.key, replyIdFrom: "Mr.X <" + myIdentityEmail2 + ">",
      warning: false
    },
    // With catchAll, 'From' will be set to second id's email.
    {
      to: myIdentityEmail2, envelopeTo: myAdditionalEmail3,
      catchAllId1: false, catchAllId2: true,
      replyIdKey: identity2.key, replyIdFrom: myIdentityEmail2, warning: false
    },
    // With catchAll, 'From' will be set to myAdditionalEmail3.
    {
      to: notMyEmail, envelopeTo: myAdditionalEmail3,
      catchAllId1: false, catchAllId2: true,
      replyIdKey: identity2.key, replyIdFrom: myAdditionalEmail3,
      warning: true
    },
    // Without catchAll, mail to another recipient.
    {
      to: notMyEmail, envelopeTo: "",
      catchAllId1: false, catchAllId2: false,
      replyIdKey: identity1.key, replyIdFrom: myIdentityEmail1,
      warning: false
    },
    // With catchAll, mail to another recipient (domain not matching).
    {
      to: notMyEmail, envelopeTo: "",
      catchAllId1: true, catchAllId2: true,
      replyIdKey: identity1.key, replyIdFrom: myIdentityEmail1,
      warning: false
    },
  ];

  for (let test of tests) {
    test.replyIndex = create_replyMsg(test.to, test.envelopeTo);

    identity1.catchAll = test.catchAllId1;
    identity2.catchAll = test.catchAllId2;

    let cwc = open_compose_with_reply();

    checkCompIdentity(
      cwc,
      test.replyIdKey,
      test.replyIdFrom
    );

    if (test.warning) {
      wait_for_notification_to_show(
        cwc,
        "compose-notification-bottom",
        "identityWarning"
      );
    } else {
      assert_notification_displayed(
        cwc,
        "compose-notification-bottom",
        "identityWarning",
        false
      );
    }

    close_compose_window(cwc, false);
  }
});

/**
 * Helper to check that a suitable From identity was set up in the given
 * composer window.
 *
 * @param cwc             Compose window controller.
 * @param aIdentityKey    The key of the expected identity.
 * @param aFrom           The expected displayed From address.
 */
function checkCompIdentity(cwc, aIdentityKey, aFrom) {
  Assert.equal(
    cwc.window.getCurrentIdentityKey(),
    aIdentityKey,
    "The From identity is not correctly selected"
  );
  Assert.equal(
    cwc.window.document.getElementById("msgIdentity").value,
    aFrom,
    "The From value was initialized to an unexpected value"
  );
}

registerCleanupFunction(function teardownModule(module) {
  be_in_folder(gFolder);
  let count;
  while ((count = gFolder.getTotalMessages(false)) > 0) {
    press_delete();
    mc.waitFor(() => gFolder.getTotalMessages(false) < count);
  }

  gAccount.removeIdentity(identity2);

  // The last identity of an account can't be removed so clear all its prefs
  // which effectively destroys it.
  identity1.clearAllValues();
  MailServices.accounts.removeAccount(gAccount);
  gAccount = null;
});
