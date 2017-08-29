/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that compose new message chooses the correct initial identity when
 * called from the context of an open composer.
 */

// make SOLO_TEST=composition/test-draft-identity.js mozmill-one

var MODULE_NAME = "test-draft-identity";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers",
                       "compose-helpers", "notificationbox-helpers"];

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/iteratorUtils.jsm");

var gDrafts;
var gAccount;

// The first identity should become the default in the account.
var gIdentities = [ { email: "x@example.invalid" },
                    { email: "y@example.invalid", fullname: "User Y" },
                    { email: "y@example.invalid", fullname: "User YY", label: "YY" },
                    { email: "y+y@example.invalid", fullname: "User Y" },
                    { email: "z@example.invalid", fullname: "User Z", label: "Label Z" },
                    { email: "a+b@example.invalid", fullname: "User A" },
                  ];

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  // Now set up an account with some identities.
  let acctMgr = MailServices.accounts;
  gAccount = acctMgr.createAccount();
  gAccount.incomingServer = acctMgr.createIncomingServer(
    "nobody", "Draft Identity Testing", "pop3");

  for (let id of gIdentities) {
    let identity = acctMgr.createIdentity();
    if ("email" in id)
      identity.email = id.email;
    if ("fullname" in id)
      identity.fullName = id.fullname;
    if ("label" in id)
      identity.label = id.label;
    gAccount.addIdentity(identity);
    id.key = identity.key;
    id.name = identity.identityName;
  }

  acctMgr.defaultAccount = gAccount;

  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
}

/**
 * Create a new templated draft message in the drafts folder.
 *
 * @return {integer}  The index (position) of the created message in the drafts folder.
 */
function create_draft(aFrom, aIdKey) {
  let msgCount = gDrafts.getTotalMessages(false);
  let source =
    "From - Wed Mar 01 01:02:03 2017\n"+
    "X-Mozilla-Status: 0000\n" +
    "X-Mozilla-Status2: 00000000\n" +
    "X-Mozilla-Keys:                                                                                 \n" +
    "FCC: mailbox://nobody@Local%20Folders/Sent\n" +
    (aIdKey ?
    `X-Identity-Key: ${aIdKey}\n` +
    `X-Account-Key: ${gAccount.key}\n`:"") +
    `From: ${aFrom}\n` +
    "To: nobody@example.invalid\n" +
    "Subject: test!\n" +
    `Message-ID: <${msgCount}@example.invalid>\n` +
    "Date: Wed, 1 Mar 2017 01:02:03 +0100\n" +
    "X-Mozilla-Draft-Info: internal/draft; vcard=0; receipt=0; DSN=0; uuencode=0;\n" +
    " attachmentreminder=0; deliveryformat=4\n" +
    "MIME-Version: 1.0\n" +
    "Content-Type: text/plain; charset=utf-8\n" +
    "Content-Transfer-Encoding: 8bit\n" +
    "\n" +
    "Testing draft identity.\n";

  gDrafts.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);
  let msgCountNew = gDrafts.getTotalMessages(false);

  assert_equals(msgCountNew, msgCount + 1);
  return msgCountNew - 1;
}

/**
 * Helper to check that a suitable From identity was set up in the given
 * composer window.
 *
 * @param cwc             Compose window controller.
 * @param aIdentityKey    The key of the expected identity.
 * @param aFrom           The expected displayed From address.
 */
function checkCompIdentity(cwc, aIdentityKey, aFrom) {
  assert_equals(cwc.window.getCurrentAccountKey(), gAccount.key,
                "The From account is not correctly selected");
  assert_equals(cwc.window.getCurrentIdentityKey(), aIdentityKey,
                "The From identity is not correctly selected");
  assert_equals(cwc.window.GetMsgIdentityElement().value, aFrom,
                "The From value was initialized to an unexpected value");
}

/**
 * Bug 394216
 * Test that starting a new message from a draft with various combinations
 * of From and X-Identity-Key gets the expected initial identity selected.
 */
function test_draft_identity_selection() {
  let tests = [
    // X-Identity-Key header exists:
    // 1. From header matches X-Identity-Key identity exactly
    { idIndex: 1, warning: false, draftIdKey: gIdentities[1].key,
      draftFrom: gIdentities[1].name },
    // 2. From header similar to X-Identity-Key identity with +suffix appended
    { idIndex: 1, warning: false, draftIdKey: gIdentities[1].key,
      draftFrom: gIdentities[1].name.replace("y@", "y+x@") },
    // 3. X-Identity-Key identity similar to From header with +suffix appended
    { idIndex: 5, warning: false, draftIdKey: gIdentities[5].key,
      draftFrom: gIdentities[5].name.replace("a+b@", "a@") },

    // From header not similar to existing X-Identity-Key identity:
    // 4. From header not even containing an email address
    { idIndex: 5, warning: false, draftIdKey: gIdentities[5].key,
      draftFrom: "User", from: "User <>" },
    // 5. no matching identity exists
    { idIndex: 1, warning: true, draftIdKey: gIdentities[1].key,
      draftFrom: "New User <modified@sender.invalid>" },
    // 6. 1 matching identity exists
    { idIndex: 4, warning: false, draftIdKey: gIdentities[4].key,
      draftFrom: "New User <" + gIdentities[4].email + ">" },
    // 7. 2 or more matching identities exist
    { idIndex: 1, warning: true, draftIdKey: gIdentities[0].key,
      draftFrom: gIdentities[1].name.replace("User Y", "User YZ") },

    // No X-Identity-Key header:
    // 8. no matching identity exists
    // This is a 'foreign draft' in which case we won't preserve the From value
    // and set it from the default identity.
    { idIndex: 0, warning: true,
      draftFrom: "Unknown <unknown@nowhere.invalid>", from: gIdentities[0].name },
    // 9. From header matches default identity
    { idIndex: 0, warning: false,
      draftFrom: gIdentities[0].name },
    // 10. From header matches some other identity
    { idIndex: 5, warning: false,
      draftFrom: gIdentities[5].name },
    // 11. From header matches identity with suffix
    { idIndex: 3, warning: false,
      draftFrom: gIdentities[3].name },
    // 12. From header matches 2 identities
    { idIndex: 1, warning: true,
      draftFrom: gIdentities[1].email, from: gIdentities[1].name },
  ];

  for (let test of tests) {
    test.draftIndex = create_draft(test.draftFrom, test.draftIdKey);
  }

  for (let test of tests) {
    dump("Running draft identity test" + tests.indexOf(test));
    be_in_folder(gDrafts);
    select_click_row(test.draftIndex);

    let cwc = open_compose_from_draft();
    checkCompIdentity(cwc, gIdentities[test.idIndex].key,
                      test.from ? test.from : test.draftFrom);
    if (test.warning) {
      wait_for_notification_to_show(cwc, "attachmentNotificationBox",
                                    "identityWarning");
    } else {
      assert_notification_displayed(cwc, "attachmentNotificationBox",
                                    "identityWarning", false);
    }

    close_compose_window(cwc, false);
  }
/*
  // TODO: fix this in bug 1238264, the identity selector does not properly close.
  // Open a draft again that shows the notification.
  be_in_folder(gDrafts);
  select_click_row(tests[tests.length-1].draftIndex);
  let cwc = open_compose_from_draft();
  wait_for_notification_to_show(cwc, "attachmentNotificationBox",
                                "identityWarning");
  // Notification should go away when another identity is chosen.
  cwc.click(cwc.eid("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"),
                              [ { identitykey: gIdentities[0].key } ]);

  wait_for_notification_to_stop(cwc, "attachmentNotificationBox",
                                "identityWarning");
  close_compose_window(cwc, false);
*/
}

function teardownModule(module) {
  for (let id = 1; id < gIdentities.length; id++) {
    gAccount.removeIdentity(MailServices.accounts.getIdentity(gIdentities[id].key));
  }

  // The last identity of an account can't be removed so clear all its prefs
  // which effectively destroys it.
  MailServices.accounts.getIdentity(gIdentities[0].key).clearAllValues();
  MailServices.accounts.removeAccount(gAccount);

  // Clear our drafts.
  be_in_folder(gDrafts);
  let draftCount;
  while ((draftCount = gDrafts.getTotalMessages(false)) > 0) {
    press_delete();
    mc.waitFor(() => (gDrafts.getTotalMessages(false) < draftCount));
  }
}
