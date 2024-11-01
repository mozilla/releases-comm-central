/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { QRExport } = ChromeUtils.importESModule(
  "resource:///modules/QRExport.sys.mjs"
);
const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

const DATA_URI_REGEXP = /^data:image\/bmp;base64,[a-zA-Z0-9%-.\/]+=*$/;

/**
 * Create a mail account with an incoming server, an outgoing server, and an
 * identity.
 *
 * @param {string} name - Username on the incoming server
 * @param {string} emailLocalPart - Local part of the email of the default
 *   identity.
 * @param {"pop3"|"imap"} protocol - Protocol of the incoming server.
 * @returns {nsIMsgAccount} Created account with associated default identity and
 *   servers.
 */
async function createMailAccount(name, emailLocalPart, protocol) {
  const server = MailServices.accounts.createIncomingServer(
    name,
    "foo.invalid",
    protocol
  );
  server.password = "password";
  const identity = MailServices.accounts.createIdentity();
  identity.email = `${emailLocalPart}@foo.invalid`;
  identity.fullName = name;
  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity);
  const outgoing = MailServices.outgoingServer.createServer("smtp");
  outgoing.QueryInterface(Ci.nsISmtpServer);
  outgoing.username = name;
  outgoing.hostname = "foo.invalid";
  outgoing.port = 587;
  identity.smtpServerKey = outgoing.key;
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  login.init(
    "smtp://foo.invalid",
    null,
    "smtp://foo.invalid",
    name,
    "smtppass",
    "",
    ""
  );
  await Services.logins.addLoginAsync(login);
  // Setting password last since setting other things might clear it.
  outgoing.password = "smtppass";
  return account;
}

add_task(async function test_getEligibleAccounts() {
  const emptyEligibleAccounts = QRExport.getEligibleAccounts();

  Assert.deepEqual(
    emptyEligibleAccounts,
    [],
    "Should return no results without any accounts configured"
  );

  // Eligible accounts
  const imapAccount = await createMailAccount(
    "imap@foo.invalid",
    "imap",
    "imap"
  );
  const popAccount = await createMailAccount("pop", "tinderbox", "pop3");

  // Ineligible accounts
  const unsupportedIncomingAuthAccount = await createMailAccount(
    "incomingauth",
    "incomingauth",
    "imap"
  );
  unsupportedIncomingAuthAccount.incomingServer.authMethod =
    Ci.nsMsgAuthMethod.GSSAPI;

  const unsupportedOutgoingAuthAccount = await createMailAccount(
    "outgoingauth",
    "outgoingauth",
    "imap"
  );
  const unspoortedAuthOutgoingServer = MailServices.outgoingServer.servers.find(
    s => s.key == unsupportedOutgoingAuthAccount.defaultIdentity.smtpServerKey
  );
  unspoortedAuthOutgoingServer.authMethod = Ci.nsMsgAuthMethod.GSSAPI;

  const noOutgoingServerAccount = await createMailAccount(
    "nooutgoing",
    "nooutgoing",
    "imap"
  );
  noOutgoingServerAccount.defaultIdentity.smtpServerKey = null;

  const otherAccounts = [
    unsupportedIncomingAuthAccount,
    unsupportedOutgoingAuthAccount,
    noOutgoingServerAccount,
    // Non-ASCII email
    await createMailAccount("nonascii", "unüblich", "imap"),
    // Different account types
    MailServices.accounts.createLocalMailAccount(),
    FeedUtils.createRssAccount("qrExport"),
  ];

  const eligibleAccounts = QRExport.getEligibleAccounts();

  Assert.equal(eligibleAccounts.length, 2, "Should find an eligible account");
  Assert.ok(
    eligibleAccounts.includes(imapAccount),
    "Should return eligible IMAP account"
  );
  Assert.ok(
    eligibleAccounts.includes(popAccount),
    "Should return eligible POP account"
  );

  MailServices.accounts.removeAccount(popAccount, false);
  MailServices.accounts.removeAccount(imapAccount, false);
  for (const account of otherAccounts) {
    MailServices.accounts.removeAccount(account, false);
  }
});

add_task(async function test_getAccountData() {
  const account = await createMailAccount("encode", "encode", "imap");

  const dataWithoutPasswords = QRExport.getAccountData(account.key, false);

  Assert.deepEqual(
    dataWithoutPasswords,
    [
      [
        0,
        "foo.invalid",
        143,
        0,
        1,
        "encode",
        "Mail for encode@foo.invalid",
        "",
      ],
      [
        [
          [0, "foo.invalid", 587, 0, 1, "encode", ""],
          ["encode@foo.invalid", "encode"],
        ],
      ],
    ],
    "Should contain expected account data without passwords"
  );

  const dataWithPasswords = QRExport.getAccountData(account.key, true);

  Assert.deepEqual(
    dataWithPasswords,
    [
      [
        0,
        "foo.invalid",
        143,
        0,
        1,
        "encode",
        "Mail for encode@foo.invalid",
        "password",
      ],
      [
        [
          [0, "foo.invalid", 587, 0, 1, "encode", "smtppass"],
          ["encode@foo.invalid", "encode"],
        ],
      ],
    ],
    "Should contain expected account data with passwords"
  );

  MailServices.accounts.removeAccount(account, false);
});

add_task(async function test_getAccountData_nonASCII() {
  const account = await createMailAccount("ascii", "ascii", "imap");
  const identity = MailServices.accounts.createIdentity();
  identity.email = `Ŧé⅞↑@foo.invalid`;
  identity.fullName = "test with various characters";
  account.addIdentity(identity);

  const dataWithoutPasswords = QRExport.getAccountData(account.key, false);

  Assert.deepEqual(
    dataWithoutPasswords,
    [
      [0, "foo.invalid", 143, 0, 1, "ascii", "Mail for ascii@foo.invalid", ""],
      [
        [
          [0, "foo.invalid", 587, 0, 1, "ascii", ""],
          ["ascii@foo.invalid", "ascii"],
        ],
      ],
    ],
    "Should not contain the extra identity"
  );

  MailServices.accounts.removeAccount(account, false);
});

add_task(function test_getQRData() {
  const chunk = QRExport.getQRData(["foo", "bar"], 3, 9);

  Assert.deepEqual(
    chunk,
    [1, [3, 9], "foo", "bar"],
    "Should match data format v1"
  );
});

add_task(function test_renderQR() {
  const loremQR = QRExport.renderQR("lorem ipsum");

  // Using Assert.ok for these assertions, so we don't log 7KB+ of data URI for
  // every assertion.

  Assert.ok(
    DATA_URI_REGEXP.test(loremQR),
    "Result should be a data URI for an BMP"
  );
  Assert.ok(
    QRExport.renderQR("foo bar") != loremQR,
    "Result should vary by input"
  );
  Assert.ok(
    QRExport.renderQR("lorem ipsum") == loremQR,
    "Should return consistent result"
  );
});

add_task(async function test_getQRCode_single() {
  const account = await createMailAccount("getcode", "getcode", "imap");

  const qrCodes = QRExport.getQRCodes([account.key], true);

  Assert.ok(Array.isArray(qrCodes), "Should get an array");
  Assert.equal(
    qrCodes.length,
    1,
    "Should only get a single chunk for one account"
  );
  Assert.ok(
    DATA_URI_REGEXP.test(qrCodes[0]),
    "QR code should be a data URI for an BMP"
  );

  MailServices.accounts.removeAccount(account, false);
});

add_task(async function test_getQRCode_multipleChunks() {
  const accounts = [
    await createMailAccount("accountone", "firstaccount", "imap"),
    await createMailAccount("accounttwo", "secondaccount", "pop3"),
    await createMailAccount(
      "accountthree@foo.invalid",
      "thirdaccountbutthisonewithalongmail",
      "imap"
    ),
    await createMailAccount("accountfour", "fourthaccount", "imap"),
  ];

  const qrCodes = QRExport.getQRCodes(
    accounts.map(account => account.key),
    true
  );

  Assert.ok(Array.isArray(qrCodes), "Should get an array");
  Assert.equal(qrCodes.length, 2, "Should get two QR codes for four accounts");
  Assert.ok(
    DATA_URI_REGEXP.test(qrCodes[0]),
    "QR code 1 should be a data URI for a BMP"
  );
  Assert.ok(
    DATA_URI_REGEXP.test(qrCodes[1]),
    "QR code 2 should be a data URI for a BMP"
  );

  // Snapshot test to ensure the data format encoded in the QR code is
  // consistent, since we can't check the full encoded JSON blob without
  // decoding the QR code. Instead we assume that someone tested the current
  // implementation and accepted it as correct.

  // In case the snapshot needs to be updated, uncomment this line for a test
  // run.
  // await IOUtils.writeJSON(do_get_file("resources/qrdata.txt").path, qrCodes);
  const qrCodeSnapshot = await IOUtils.readUTF8(
    do_get_file("resources/qrdata.txt").path
  );
  Assert.ok(
    JSON.stringify(qrCodes) === qrCodeSnapshot,
    "Snapshot should match generated QR codes"
  );

  for (const account of accounts) {
    MailServices.accounts.removeAccount(account, false);
  }
});

add_task(async function test_getAccountOAuthUsage() {
  const passwordAccount = await createMailAccount(
    "password",
    "password",
    "imap"
  );
  const incomingOAuthAccount = await createMailAccount(
    "incomingOauth",
    "incomingOauth",
    "imap"
  );
  const outgoingOAuthAccount = await createMailAccount(
    "outgoingOauth",
    "outgoingOauth",
    "imap"
  );
  const oauthAccount = await createMailAccount("oauth", "oauth", "imap");

  incomingOAuthAccount.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  MailServices.outgoingServer.getServerByKey(
    outgoingOAuthAccount.defaultIdentity.smtpServerKey
  ).authMethod = Ci.nsMsgAuthMethod.OAuth2;
  oauthAccount.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  MailServices.outgoingServer.getServerByKey(
    oauthAccount.defaultIdentity.smtpServerKey
  ).authMethod = Ci.nsMsgAuthMethod.OAuth2;

  Assert.deepEqual(
    QRExport.getAccountOAuthUsage(passwordAccount),
    { incoming: false, outgoing: false },
    "Should not report any OAuth usage for password authenticated account"
  );
  Assert.deepEqual(
    QRExport.getAccountOAuthUsage(incomingOAuthAccount),
    { incoming: true, outgoing: false },
    "Should report incoming server to use OAuth"
  );
  Assert.deepEqual(
    QRExport.getAccountOAuthUsage(outgoingOAuthAccount),
    { incoming: false, outgoing: true },
    "Should report outgoing server to use OAuth"
  );
  Assert.deepEqual(
    QRExport.getAccountOAuthUsage(oauthAccount),
    { incoming: true, outgoing: true },
    "Should report all servers using OAuth"
  );

  MailServices.accounts.removeAccount(passwordAccount, false);
  MailServices.accounts.removeAccount(incomingOAuthAccount, false);
  MailServices.accounts.removeAccount(outgoingOAuthAccount, false);
  MailServices.accounts.removeAccount(oauthAccount, false);
});

add_task(async function test_encodesMultiByteCharactersToQR() {
  const testData = "⅝⅜⅝⅞™⅛";
  const qrData = QRExport.renderQR(testData);

  // In case the snapshot needs to be updated, uncomment this line for a test
  // run.
  // await IOUtils.writeUTF8(do_get_file("resources/qrdata_utfbytes.txt").path, qrData);
  const qrCodeSnapshot = await IOUtils.readUTF8(
    do_get_file("resources/qrdata_utfbytes.txt").path
  );
  Assert.ok(
    qrData === qrCodeSnapshot,
    "Snapshot should match generated QR data"
  );
});
