/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that reply messages use the correct identity and sender dependent
 * on the catchAll setting.
 */

"use strict";

var { close_compose_window, open_compose_with_reply } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  empty_folder,
  create_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { assert_notification_displayed, wait_for_notification_to_show } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
  );

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var id1Domain = "example.com";
var id2Domain = "example.net";
var myIdentityEmail1 = "me@example.com";
var myIdentityEmail2 = "otherme@example.net";
var envelopeToAddr = "envelope@example.net";
var notMyEmail = "otherme@example.org";

var identity1;
var identity2;

var gAccount;
var gFolder;

add_setup(function () {
  requestLongerTimeout(4);

  // Now set up an account with some identities.
  gAccount = MailServices.accounts.createAccount();
  gAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "ReplyIdentityTesting",
    "pop3"
  );

  gFolder = gAccount.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("Msgs4Reply");

  identity1 = MailServices.accounts.createIdentity();
  identity1.email = myIdentityEmail1;
  gAccount.addIdentity(identity1);
  info(`Added identity1; key=${identity1.key}, email=${identity1.email}`);

  identity2 = MailServices.accounts.createIdentity();
  identity2.email = myIdentityEmail2;
  gAccount.addIdentity(identity2);
  info(`Added identity2; key=${identity2.key}, email=${identity2.email}`);
});

/**
 * Create and select a new message to do a reply with.
 */
async function create_replyMsg(aTo, aEnvelopeTo) {
  const msg0 = create_message({
    from: "Tester <test@example.com>",
    to: aTo,
    subject: "test",
    clobberHeaders: {
      "envelope-to": aEnvelopeTo,
    },
  });
  await add_message_to_folder([gFolder], msg0);

  await be_in_folder(gFolder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);
}

/**
 * The tests.
 */
add_task(async function test_reply_identity_selection() {
  const tests = [
    {
      desc: "No catchAll, 'From' will be set to recipient",
      to: myIdentityEmail2,
      envelopeTo: myIdentityEmail2,
      catchAllId1: false,
      catchAllHintId1: "",
      catchAllId2: false,
      catchAllHintId2: "",
      replyIdKey: identity2.key,
      replyIdFrom: myIdentityEmail2,
      warning: false,
    },
    {
      desc: "No catchAll, 'From' will be set to second id's email (without name).",
      to: "Mr.X <" + myIdentityEmail2 + ">",
      envelopeTo: "",
      catchAllId1: false,
      catchAllHintId1: "",
      catchAllId2: false,
      catchAllHintId2: "",
      replyIdKey: identity2.key,
      replyIdFrom: myIdentityEmail2,
      warning: false,
    },
    {
      desc: "With catchAll, 'From' will be set to senders address (with name).",
      to: "Mr.X <" + myIdentityEmail2 + ">",
      envelopeTo: "",
      catchAllId1: false,
      catchAllHintId1: "",
      catchAllId2: true,
      catchAllHintId2: "*@" + id2Domain,
      replyIdKey: identity2.key,
      replyIdFrom: "Mr.X <" + myIdentityEmail2 + ">",
      warning: false,
    },
    {
      desc: "With catchAll #2, 'From' will be set to senders address (with name).",
      to: myIdentityEmail2,
      envelopeTo: "Mr.X <" + myIdentityEmail2 + ">",
      catchAllId1: false,
      catchAllHintId1: "",
      catchAllId2: true,
      catchAllHintId2: "*@" + id2Domain,
      replyIdKey: identity2.key,
      replyIdFrom: "Mr.X <" + myIdentityEmail2 + ">",
      warning: false,
    },
    {
      desc: "With catchAll, 'From' will be set to second id's email.",
      to: myIdentityEmail2,
      envelopeTo: envelopeToAddr,
      catchAllId1: false,
      catchAllId2: true,
      replyIdKey: identity2.key,
      replyIdFrom: myIdentityEmail2,
      warning: false,
    },
    {
      desc: `With catchAll, 'From' will be set to ${envelopeToAddr}`,
      to: notMyEmail,
      envelopeTo: envelopeToAddr,
      catchAllId1: false,
      catchAllHintId1: "",
      catchAllId2: true,
      catchAllHintId2: "*@" + id2Domain,
      replyIdKey: identity2.key,
      replyIdFrom: envelopeToAddr,
      warning: true,
    },
    {
      desc: "Without catchAll, mail to another recipient.",
      to: notMyEmail,
      envelopeTo: "",
      catchAllId1: false,
      catchAllHintId1: "",
      catchAllId2: false,
      catchAllHintId2: "",
      replyIdKey: identity1.key,
      replyIdFrom: myIdentityEmail1,
      warning: false,
    },
    {
      desc: " With catchAll, mail to another recipient (domain not matching).",
      to: notMyEmail,
      envelopeTo: "",
      catchAllId1: true,
      catchAllHintId1: "*@" + id1Domain,
      catchAllId2: true,
      catchAllHintId2: "*@" + id2Domain,
      replyIdKey: identity1.key,
      replyIdFrom: myIdentityEmail1,
      warning: false,
    },
  ];

  for (const test of tests) {
    info(`Running test: ${test.desc}`);
    test.replyIndex = await create_replyMsg(test.to, test.envelopeTo);

    identity1.catchAll = test.catchAllId1;
    identity1.catchAllHint = test.catchAllHintId1;
    info(
      `... identity1.catchAll=${identity1.catchAll}, identity1.catchAllHint=${identity1.catchAllHint}`
    );

    identity2.catchAll = test.catchAllId2;
    identity2.catchAllHint = test.catchAllHintId2;
    info(
      `... identity2.catchAll=${identity2.catchAll}, identity2.catchAllHint=${identity2.catchAllHint}`
    );

    const cwc = await open_compose_with_reply();

    info("Checking reply identity: " + JSON.stringify(test, null, 2));
    checkCompIdentity(cwc, test.replyIdKey, test.replyIdFrom);

    if (test.warning) {
      await wait_for_notification_to_show(
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

    await close_compose_window(cwc, false);
  }
});

/**
 * Helper to check that a suitable From identity was set up in the given
 * composer window.
 *
 * @param {Window} cwc - Compose window.
 * @param {string} aIdentityKey - The key of the expected identity.
 * @param {string} aFrom - The expected displayed From address.
 */
function checkCompIdentity(cwc, identityKey, from) {
  Assert.equal(
    cwc.document.getElementById("msgIdentity").value,
    from,
    "msgIdentity value should be as expected."
  );
  Assert.equal(
    cwc.getCurrentIdentityKey(),
    identityKey,
    "The From identity should be correctly selected."
  );
}

registerCleanupFunction(async function () {
  await empty_folder(gFolder);

  gAccount.removeIdentity(identity2);

  // The last identity of an account can't be removed so clear all its prefs
  // which effectively destroys it.
  identity1.clearAllValues();
  MailServices.accounts.removeAccount(gAccount);
  gAccount = null;
});
