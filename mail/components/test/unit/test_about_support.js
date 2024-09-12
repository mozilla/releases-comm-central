/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// mail/components/about-support/content/accounts.js
/* globals AboutSupport, AboutSupportPlatform */

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

/*
 * Test the about:support module.
 */

var gAccountList = [
  {
    type: "pop3",
    port: 1234,
    user: "pop3user",
    password: "pop3password",
    socketType: Ci.nsMsgSocketType.plain,
    authMethod: Ci.nsMsgAuthMethod.old,
    smtpServers: [],
  },
  {
    type: "imap",
    port: 2345,
    user: "imapuser",
    password: "imappassword",
    socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 3456,
        user: "imapout",
        password: "imapoutpassword",
        isDefault: true,
        socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
      },
    ],
  },
  {
    type: "nntp",
    port: 4567,
    user: null,
    password: null,
    socketType: Ci.nsMsgSocketType.SSL,
    authMethod: Ci.nsMsgAuthMethod.GSSAPI,
    smtpServers: [
      {
        port: 5678,
        user: "newsout1",
        password: "newsoutpassword1",
        isDefault: true,
        socketType: Ci.nsMsgSocketType.SSL,
        authMethod: Ci.nsMsgAuthMethod.NTLM,
      },
      {
        port: 6789,
        user: "newsout2",
        password: "newsoutpassword2",
        isDefault: false,
        socketType: Ci.nsMsgSocketType.SSL,
        authMethod: Ci.nsMsgAuthMethod.External,
      },
    ],
  },
];

// A map of account keys to servers. Populated by setup_accounts.
var gAccountMap = new Map();
// A map of SMTP server names to SMTP servers. Populated by setup_accounts.
var gSMTPMap = new Map();

/**
 * A list of sensitive data: it shouldn't be present in the account
 * details. Populated by setup_accounts.
 */
var gSensitiveData = [];

/**
 * Set up accounts based on the given data.
 */
function setup_accounts() {
  // First make sure the local folders account is set up.
  localAccountUtils.loadLocalMailAccount();

  // Now run through the details and set up accounts accordingly.
  for (const details of gAccountList) {
    const server = localAccountUtils.create_incoming_server(
      details.type,
      details.port,
      details.user,
      details.password
    );
    server.socketType = details.socketType;
    server.authMethod = details.authMethod;
    gSensitiveData.push(details.password);
    const account = MailServices.accounts.findAccountForServer(server);
    for (const smtpDetails of details.smtpServers) {
      const outgoing = localAccountUtils.create_outgoing_server(
        "smtp",
        smtpDetails.user,
        smtpDetails.password,
        { port: smtpDetails.port }
      );
      outgoing.socketType = smtpDetails.socketType;
      outgoing.authMethod = smtpDetails.authMethod;
      localAccountUtils.associate_servers(
        account,
        outgoing,
        smtpDetails.isDefault
      );
      gSensitiveData.push(smtpDetails.password);

      // Add the SMTP server to our server name -> server map
      gSMTPMap.set("localhost:" + smtpDetails.port, smtpDetails);
    }

    // Add the server to our account -> server map
    gAccountMap.set(account.key, details);
  }
}

/**
 * Verify that the given account's details match our details for the key.
 */
function verify_account_details(aDetails) {
  const expectedDetails = gAccountMap.get(aDetails.key);
  // All our servers are at localhost
  const expectedHostDetails =
    "(" + expectedDetails.type + ") localhost:" + expectedDetails.port;
  Assert.equal(aDetails.hostDetails, expectedHostDetails);
  Assert.equal(aDetails.socketType, expectedDetails.socketType);
  Assert.equal(aDetails.authMethod, expectedDetails.authMethod);

  const smtpToSee = expectedDetails.smtpServers.map(
    smtpDetails => "localhost:" + smtpDetails.port
  );

  for (const smtpDetails of aDetails.smtpServers) {
    // Check that we're expecting to see this server
    const toSeeIndex = smtpToSee.indexOf(smtpDetails.name);
    Assert.notEqual(toSeeIndex, -1);
    smtpToSee.splice(toSeeIndex, 1);

    const expectedSMTPDetails = gSMTPMap.get(smtpDetails.name);
    Assert.equal(smtpDetails.socketType, expectedSMTPDetails.socketType);
    Assert.equal(smtpDetails.authMethod, expectedSMTPDetails.authMethod);
    Assert.equal(smtpDetails.isDefault, expectedSMTPDetails.isDefault);
  }

  // Check that we saw all the SMTP servers we wanted to see
  Assert.equal(smtpToSee.length, 0);
}

/**
 * Tests the getFileSystemType function. This is more a check to make sure the
 * function returns something meaningful and doesn't throw an exception, since
 * we don't have any information about what sort of file system we're running
 * on.
 */
function test_get_file_system_type() {
  const fsType = AboutSupportPlatform.getFileSystemType(do_get_cwd());
  if ("nsILocalFileMac" in Ci) {
    // Mac should return null
    Assert.equal(fsType, null);
  } else {
    // Windows and Linux should return a string
    Assert.ok(["local", "network", "unknown"].includes(fsType));
  }
}

/**
 * Test the getAccountDetails function.
 */
function test_get_account_details() {
  const accountDetails = AboutSupport.getAccountDetails();
  const accountDetailsText = uneval(accountDetails);
  // The list of accounts we are looking for
  const accountsToSee = [...gAccountMap.keys()];

  // Our first check is to see that no sensitive data has crept in
  for (const data of gSensitiveData) {
    Assert.ok(!accountDetailsText.includes(data));
  }

  for (const details of accountDetails) {
    // We're going to make one exception: for the local folders server. We don't
    // care too much about its details.
    if (details.key == localAccountUtils.msgAccount.key) {
      continue;
    }

    // Check that we're expecting to see this server
    const toSeeIndex = accountsToSee.indexOf(details.key);
    Assert.notEqual(toSeeIndex, -1);
    accountsToSee.splice(toSeeIndex, 1);

    verify_account_details(details);
  }
  // Check that we got all the accounts we wanted to see
  Assert.equal(accountsToSee.length, 0);
}

var tests = [test_get_file_system_type, test_get_account_details];

function run_test() {
  Services.scriptloader.loadSubScript(
    "chrome://messenger/content/about-support/accounts.js"
  );

  setup_accounts();

  for (const test of tests) {
    test();
  }
}
