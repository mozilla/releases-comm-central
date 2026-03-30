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
const { clearStatusBar } = ChromeUtils.importESModule(
  "resource://testing-common/mail/CleanupHelpers.sys.mjs"
);

const generator = new MessageGenerator();

/**
 * Sets up a POP3/SMTP account for these tests.
 *
 * @param {string} [incomingType="pop3"] - The type of incoming server to use
 *   this account. Defaults to POP3, as it doesn't need an actual server.
 * @returns {object} - The account, identity, and outgoing server.
 */
function createSMTPAccount(incomingType = "pop3") {
  const smtpAccount = MailServices.accounts.createAccount();
  smtpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    incomingType
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
  const ret = createExchangeAccount(
    "ews",
    "http://test.test/EWS/Exchange.asmx"
  );

  return {
    ewsAccount: ret.account,
    ewsIdentity: ret.identity,
    ewsOutgoingServer: ret.outgoingServer,
  };
}

/**
 * Sets up a Graph account for these tests.
 *
 * @returns {object} - The account, identity, and outgoing server.
 */
function createGraphAccount() {
  // As per `ServerTestUtils.sys.mjs`, the port for the Graph server is 8080.
  const ret = createExchangeAccount("graph", "http://test.test:8080/v1.0");

  return {
    graphAccount: ret.account,
    graphIdentity: ret.identity,
    graphOutgoingServer: ret.outgoingServer,
  };
}

/**
 * Sets up an Exchange account for these tests. When writing tests, you probably
 * want to use either `createEWSAccount` or `createGraphAccount` rather than
 * call this function directly.
 *
 * @param {string} protocol The Exchange protocol to get an account for.
 * @param {string} url The API URL to use by the account's client.
 * @returns {object} - The account, identity, and outgoing server.
 */
function createExchangeAccount(protocol, url) {
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    protocol
  );
  account.incomingServer.setStringValue("ews_url", url);
  account.incomingServer.prettyName = `${protocol} Account`;

  const outgoingServer = MailServices.outgoingServer.createServer(protocol);
  outgoingServer.QueryInterface(Ci.IExchangeOutgoingServer);
  outgoingServer.initialize(url);
  outgoingServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  outgoingServer.username = "user";

  const identity = MailServices.accounts.createIdentity();
  identity.fullName = "test";
  identity.email = "test@test.test";
  identity.smtpServerKey = outgoingServer.key;
  identity.doFcc = false;

  account.addIdentity(identity);
  return { account, identity, outgoingServer };
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
 * @param {string} [realm=hostname]
 */
async function addLoginInfo(hostname, username, password, realm = hostname) {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(hostname, null, realm, username, password, "", "");
  await Services.logins.addLoginAsync(loginInfo);
}

registerCleanupFunction(async function () {
  await clearStatusBar(window);
});
