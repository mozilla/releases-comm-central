/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

const { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

const { open_compose_with_forward } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);

let ewsServer = null;
let incomingServer = null;
let ewsAccount = null;
let testFolder = null;

add_setup(async function () {
  ewsServer = new EwsServer({
    version: "Exchange2013",
    username: "user",
    password: "password",
  });
  ewsServer.start();

  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );

  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  incomingServer.prettyName = "EWS Account";
  incomingServer.password = "password";

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

  ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = incomingServer;

  registerCleanupFunction(async function () {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    await Services.logins.removeAllLoginsAsync();
    MailServices.accounts.removeAccount(ewsAccount, false);
  });

  const folderName = "ForwardTest";
  const remoteFolder = new RemoteFolder(folderName, "root", folderName, null);
  ewsServer.appendRemoteFolder(remoteFolder);

  const msgGen = new MessageGenerator();
  const msg = msgGen.makeMessage({
    from: ["Test Sender", "sender@example.com"],
    to: [["Test Receiver", "receiver@example.com>"]],
    subject: "Test Forward Subject",
    date: new Date("2025-12-10T13:30:23.000+01:00"),
    body: { body: "This is the test message body content." },
  });

  ewsServer.addMessages(folderName, [msg]);

  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, null);

  testFolder = await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderName),
    "waiting for folder to exist"
  );
  await TestUtils.waitForCondition(
    () => testFolder.getTotalMessages(false) == 1,
    "waiting for message to be synced"
  );
});

/**
 * Test that the body content is set properly in the forwarded message content
 * when you forward a message with an EWS account.
 */
add_task(async function test_forward_body_content() {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const displayPromise = BrowserTestUtils.waitForEvent(
    about3Pane,
    "folderURIChanged"
  );
  about3Pane.displayFolder(testFolder.URI);
  await displayPromise;

  const { gDBView, messageBrowser } = about3Pane;
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;

  const compWin = await open_compose_with_forward();

  const messageEditor =
    compWin.document.getElementById("messageEditor").contentDocument;

  // Make sure the subject appears in the forwarded message body.
  const headerTableContent = messageEditor.querySelector("table").textContent;

  Assert.ok(
    headerTableContent.includes("Test Forward Subject"),
    `Subject should be set correctly in header table: ${headerTableContent}`
  );

  // Make sure the body appears in the forwarded message body.
  const bodyContent = messageEditor.querySelector("body").textContent;

  Assert.ok(
    bodyContent.includes("This is the test message body content."),
    `Original message body should be found in forwarded message: ${bodyContent}`
  );

  await BrowserTestUtils.closeWindow(compWin);
});
