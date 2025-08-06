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

const signed_body = `
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

àèìòù
-----BEGIN PGP SIGNATURE-----

iQEzBAEBCgAdFiEE0qdgEJpR3689Qr1MDieSjyQbTSAFAmZUSBkACgkQDieSjyQb
TSCUvQgA06lf3Xwhsa7iQrU7kK3COnnoGuRU2OBtLtwjMkV1HEtA/+xNYREqXQgJ
EmApeXgcBGxKRwnWMwkdDSX3q6++i2tXjiSci3dEmdrwsAqj8nAqFvilDfAAGdpX
dOnKawhwK8Lqld0va07Oe9zMeyOfTt/HLMKCnsqB1cORR5M9oj2gtmPz1jFbXGs1
RLP0bPrc1w24ouFM6lBH2lQz5Ldq7mJzc/zraVs4rqr6ddCHj2qmfP1dr4WVV6cz
QLpgDJR/hRbl5IfWJwv6A3Pry5JbfH+YG9caJWB0z8xm/eP6UetUGjbwvo5PYcgX
HPoJ0DZpsU867j+BVbGKshTlOfY2BA==
=zoKi
-----END PGP SIGNATURE-----
`;

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

  // Create a fake message with the signed body and add it to the newly created
  // folder.
  const msgGen = new MessageGenerator();
  const msg = msgGen.makeMessage({
    from: ["Tinderbox", "tinderbox@foo.invalid"],
    to: [["Tinderbox", "tinderbox@foo.invalid"]],
    subject: "Hello world",
    body: { body: signed_body },
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
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "message should be shown as containing a signature"
  );
});
