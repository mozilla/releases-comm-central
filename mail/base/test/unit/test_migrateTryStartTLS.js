/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test migrating away from insecure trySTARTTLS.
 */

var { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var gAccountList = [
  {
    type: "pop3",
    port: 1234,
    user: "pop3user",
    password: "pop3password",
    hostname: "pop3.mail.yahoo.com",
    socketType: Ci.nsMsgSocketType.plain,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 3456,
        user: "imapout",
        password: "imapoutpassword",
        isDefault: true,
        hostname: "smtp.mail.yahoo.com",
        socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
        expectedSocketTypeAFter: Ci.nsMsgSocketType.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
      },
    ],
  },
  {
    type: "imap",
    port: 2345,
    user: "imapuser",
    password: "imappassword",
    hostname: "imap.mail.yahoo.com",
    socketType: 1, // former trySTARTTLS,
    expectedSocketTypeAFter: Ci.nsMsgSocketType.alwaysSTARTTLS,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 3456,
        user: "imapout",
        password: "imapoutpassword",
        isDefault: false,
        hostname: "smtp.gmail.com",
        socketType: 1, // former trySTARTTLS,
        expectedSocketTypeAFter: Ci.nsMsgSocketType.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
      },
    ],
  },
];

// An array of the incoming servers during setup.
var gIncomingServers = [];

// An array of the outgoing servers created during setup.
var gOutgoingServers = [];

add_setup(async () => {
  for (const details of gAccountList) {
    const server = localAccountUtils.create_incoming_server(
      details.type,
      details.port,
      details.user,
      details.password,
      details.hostname
    );
    server.socketType = details.socketType;
    server.authMethod = details.authMethod;

    // Add the newly created server to the array for testing.
    gIncomingServers.push(server);

    const account = MailServices.accounts.findAccountForServer(server);
    for (const smtpDetails of details.smtpServers) {
      const outgoing = localAccountUtils.create_outgoing_server(
        "smtp",
        smtpDetails.user,
        smtpDetails.password,
        { port: smtpDetails.port, hostname: smtpDetails.hostname }
      );
      outgoing.socketType = smtpDetails.socketType;
      outgoing.authMethod = smtpDetails.authMethod;
      localAccountUtils.associate_servers(
        account,
        outgoing,
        smtpDetails.isDefault
      );

      // Add the newly created server to the array for testing.
      gOutgoingServers.push(outgoing);
    }
  }
});

add_task(async function test_migrateTryStartTLS() {
  Services.prefs.setIntPref("mail.ui-rdf.version", 43);

  const inTypesBefore = gIncomingServers.map(s => s.socketType);
  const outTypesBefore = gOutgoingServers.map(s => s.socketType);
  MailMigrator._migrateUI();

  let i = 0;
  for (const server of gIncomingServers) {
    if (inTypesBefore[i] == 1) {
      Assert.equal(server.socketType, Ci.nsMsgSocketType.alwaysSTARTTLS);
    } else {
      Assert.equal(server.socketType, inTypesBefore[i]);
    }
    i++;
  }

  i = 0;
  for (const server of gOutgoingServers) {
    if (outTypesBefore[i] == 1) {
      Assert.equal(server.socketType, Ci.nsMsgSocketType.alwaysSTARTTLS);
    } else {
      Assert.equal(server.socketType, outTypesBefore[i]);
    }
    i++;
  }
});
