/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function testActionButtonsState() {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const folderPaneHeader = about3Pane.document.getElementById(
    "folderPaneHeaderBar"
  );
  const fetchButton = folderPaneHeader.querySelector("#folderPaneGetMessages");
  const newButton = folderPaneHeader.querySelector("#folderPaneWriteMessage");

  // Confirm that we don't have any account in our test run.
  Assert.equal(
    MailServices.accounts.accounts.length,
    0,
    "No account currently configured"
  );

  Assert.ok(fetchButton.disabled, "The Get Messages button is disabled");
  Assert.ok(newButton.disabled, "The New Message button is disabled");

  // Create a POP server.
  const popServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "pop3")
    .QueryInterface(Ci.nsIPop3IncomingServer);

  const identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@foo.invalid";

  const account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  account.incomingServer = popServer;

  await BrowserTestUtils.waitForCondition(
    () => !fetchButton.disabled,
    "The Get Messages button is enabled"
  );

  await BrowserTestUtils.waitForCondition(
    () => !newButton.disabled,
    "The New Message button is enabled"
  );

  MailServices.accounts.removeAccount(account, false);
});
