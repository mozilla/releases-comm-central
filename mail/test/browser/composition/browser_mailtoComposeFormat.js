/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that clicking a mailto: link in the message body chooses the correct
 * identity and format (HTML/plain text) for the compose window.
 */

"use strict";

var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);

var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  get_about_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var accountA, accountB;
var identityA0, identityB0, identityB1;
var inboxA, inboxB;

add_setup(async function () {
  const createTestMessage = async (folder, identity) => {
    await add_message_to_folder(
      [folder],
      create_message({
        from: "Tester <test@example.org>",
        to: identity.email,
        subject: `Mailto Test`,
        body: {
          body: `<!DOCTYPE html>
<html>
<body>
<a href="mailto:mailtoRecipient@example.org" id="mailtolink">Mailto Link</a>
</body>
<hml>`,
          contentType: "text/html",
        },
      })
    );
  };

  accountA = MailServices.accounts.createAccount();
  accountA.incomingServer = MailServices.accounts.createIncomingServer(
    "someone",
    "accountA.invalid",
    "pop3"
  );

  accountB = MailServices.accounts.createAccount();
  accountB.incomingServer = MailServices.accounts.createIncomingServer(
    "someone",
    "accountB.invalid",
    "pop3"
  );

  inboxA = accountA.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  inboxB = accountB.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  identityA0 = MailServices.accounts.createIdentity();
  identityA0.email = "someone@accountA.invalid";
  accountA.addIdentity(identityA0);

  identityB0 = MailServices.accounts.createIdentity();
  identityB0.email = "someone@accountB.invalid";
  accountB.addIdentity(identityB0);

  identityB1 = MailServices.accounts.createIdentity();
  identityB1.email = "someone.else@accountB.invalid";
  accountB.addIdentity(identityB1);

  await createTestMessage(inboxA, identityA0);
  await createTestMessage(inboxB, identityB1);
  await createTestMessage(inboxB, identityB0);

  registerCleanupFunction(() => {
    accountB.removeIdentity(identityB1);
    identityB0.clearAllValues();
    MailServices.accounts.removeAccount(accountB, true);
    identityA0.clearAllValues();
    MailServices.accounts.removeAccount(accountA, true);
  });
});

add_task(async function test_mailto_links() {
  const subTest = async (formatA0, formatB0, formatB1) => {
    const clickMailtoLink = async (folder, identity, row = 0) => {
      await be_in_folder(folder);
      const msg = await select_click_row(row);
      await assert_selected_and_displayed(window, msg);

      const composePromise = promise_new_window("msgcompose");
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#mailtolink",
        {},
        get_about_message().getMessagePaneBrowser()
      );
      const cwc = await compose_window_ready(composePromise);

      Assert.equal(
        cwc.gMsgCompose.identity,
        identity,
        "The correct identity should be selected."
      );
      Assert.equal(
        cwc.gMsgCompose.composeHTML,
        identity.composeHtml,
        "Compose HTML should match the identity's setting."
      );

      await close_compose_window(cwc);
    };

    identityA0.composeHtml = formatA0;
    identityB0.composeHtml = formatB0;
    identityB1.composeHtml = formatB1;
    await clickMailtoLink(inboxA, identityA0);
    await clickMailtoLink(inboxB, identityB0);
    await clickMailtoLink(inboxB, identityB1, 1);
  };

  await subTest(true, false, true);
  await subTest(false, true, false);
});
