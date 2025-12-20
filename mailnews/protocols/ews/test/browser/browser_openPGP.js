/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var ewsServer;
var incomingServer;

add_setup(async function () {
  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer({
    version: "Exchange2013",
    username: "user",
    password: "password",
  });
  ewsServer.start();

  // Create a new account and connect it to the mock EWS server.
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );

  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = incomingServer;

  // Store the account's credentials into the login manager so we're not
  // prompted for a password when trying to sync messages.
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "ews://127.0.0.1",
    null,
    "ews://127.0.0.1",
    "user",
    "password",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(ewsAccount, false);
    Services.logins.removeAllLogins();
  });

  // Import and accept the public key of Alice
  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../../../../../mail/test/browser/openpgp/data/keys/alice@openpgp.example-0xf231550c4f47e38e-pub.asc"
      )
    )
  );
});

/**
 * Test that a message with an OpenPGP signature is properly picked up and
 * showed to the user.
 */
add_task(async function test_openpgp_signed() {
  // Create a new folder for our test on the server.
  const folderName = "openPGPSigned";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  const rfc5322Msg = await IOUtils.readUTF8(
    new FileUtils.File(
      getTestFilePath(
        "../../../../../mail/test/browser/openpgp/data/eml/alice-signed.eml"
      )
    ).path
  );

  const msgBody = rfc5322Msg.substring(
    rfc5322Msg.indexOf("-----BEGIN PGP SIGNED MESSAGE-----")
  );
  const msgGen = new MessageGenerator();
  const msg = msgGen.makeMessage({
    from: ["Alice Lovelace", "alice@openpgp.example"],
    to: [["Alice Lovelace", "alice@openpgp.example>"]],
    subject: "Hello world",
    date: new Date("2025-12-10T13:30:23.000+01:00"),
    body: { body: msgBody },
  });

  ewsServer.addMessages(folderName, [msg]);

  // Sync the new folder and its message locally.
  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, null);

  const folder = await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderName),
    "waiting for folder to exist"
  );
  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) == 1,
    "waiting for the message to exist"
  );

  const tabmail = window.document.getElementById("tabmail");

  // Navigate to the folder.
  const about3Pane = tabmail.currentAbout3Pane;
  const displayPromise = BrowserTestUtils.waitForEvent(
    about3Pane,
    "folderURIChanged"
  );
  about3Pane.displayFolder(folder.URI);
  await displayPromise;

  const { gDBView, messageBrowser } = about3Pane;
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  // Display the message.
  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;

  // Check that the message's signature is properly picked up by the OpenPGP
  // integration.
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "message should be shown as containing a signature"
  );
});
