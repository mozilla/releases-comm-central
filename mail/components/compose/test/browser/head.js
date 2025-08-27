/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable @microsoft/sdl/no-insecure-url */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const generator = new MessageGenerator();

/**
 * Sets up a POP3/SMTP account for these tests.
 *
 * @returns {object} - The account, identity, and outgoing server.
 */
function createSMTPAccount() {
  const smtpAccount = MailServices.accounts.createAccount();
  smtpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  smtpAccount.incomingServer.prettyName = "SMTP Account";

  const smtpOutgoingServer = MailServices.outgoingServer.createServer("smtp");
  smtpOutgoingServer.QueryInterface(Ci.nsISmtpServer);
  smtpOutgoingServer.hostname = "test.test";
  smtpOutgoingServer.port = 587;
  smtpOutgoingServer.username = "user";

  const smtpIdentity = MailServices.accounts.createIdentity();
  smtpIdentity.fullName = "test";
  smtpIdentity.email = "test@test.test";
  smtpIdentity.smtpServerKey = smtpOutgoingServer.key;
  smtpIdentity.doFcc = false;

  smtpAccount.addIdentity(smtpIdentity);
  return { smtpAccount, smtpIdentity, smtpOutgoingServer };
}

/**
 * Sets up an EWS account for these tests.
 *
 * @returns {object} - The account, identity, and outgoing server.
 */
function createEWSAccount() {
  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "ews"
  );
  ewsAccount.incomingServer.setStringValue(
    "ews_url",
    "http://test.test/EWS/Exchange.asmx"
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";

  const ewsOutgoingServer = MailServices.outgoingServer.createServer("ews");
  ewsOutgoingServer.QueryInterface(Ci.nsIEwsServer);
  ewsOutgoingServer.initialize("http://test.test/EWS/Exchange.asmx");
  ewsOutgoingServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  ewsOutgoingServer.username = "user";

  const ewsIdentity = MailServices.accounts.createIdentity();
  ewsIdentity.fullName = "test";
  ewsIdentity.email = "test@test.test";
  ewsIdentity.smtpServerKey = ewsOutgoingServer.key;
  ewsIdentity.doFcc = false;

  ewsAccount.addIdentity(ewsIdentity);
  return { ewsAccount, ewsIdentity, ewsOutgoingServer };
}

/**
 * Open a compose window with generated content and wait for it to be ready.
 *
 * @param {nsIMsgIdentity} [identity] - The identity to use, otherwise the
 *   default identity of the default account will be used.
 * @param {string} [body] - The message body. If not provided a body is
 *   generated.
 * @returns {object} Details of the opened compose window.
 */
async function newComposeWindow(identity, body) {
  if (!identity) {
    Assert.ok(
      MailServices.accounts.defaultAccount?.defaultIdentity,
      "there should be a default account and default identity"
    );
  }
  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.identity = identity;
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  const [name, address] = generator.makeNameAndAddress();
  const subject = generator.makeSubject();
  params.composeFields.to = `"${name}" <${address}>`;
  params.composeFields.subject = subject;
  params.composeFields.body = body || `Hello ${name}!`;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  if (!composeWindow.composeEditorReady) {
    await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  }
  await SimpleTest.promiseFocus(composeWindow);

  return { composeWindow, subject };
}

/**
 * Helper to add logins to the login manager.
 *
 * @param {string} hostname
 * @param {string} username
 * @param {string} password
 */
async function addLoginInfo(hostname, username, password) {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(hostname, null, hostname, username, password, "", "");
  await Services.logins.addLoginAsync(loginInfo);
}
