/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test migrating Yahoo/AOL users to OAuth2, since "normal password" is going away
 * on October 20, 2020.
 */

var { MailMigrator } = ChromeUtils.import(
  "resource:///modules/MailMigrator.jsm"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);

var gAccountList = [
  // POP Yahoo account + Yahoo Server.
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
        authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
      },
    ],
  },
  // IMAP Yahoo account + Google Server.
  {
    type: "imap",
    port: 2345,
    user: "imapuser",
    password: "imappassword",
    hostname: "imap.mail.yahoo.com",
    socketType: Ci.nsMsgSocketType.trySTARTTLS,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 3456,
        user: "imapout",
        password: "imapoutpassword",
        isDefault: false,
        hostname: "smtp.gmail.com",
        socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
      },
    ],
  },
  // IMAP Google account + Yahoo Server.
  {
    type: "imap",
    port: 2345,
    user: "imap2user",
    password: "imap2password",
    hostname: "imap.gmail.com",
    socketType: Ci.nsMsgSocketType.trySTARTTLS,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 3456,
        user: "imapout",
        password: "imapoutpassword",
        isDefault: false,
        hostname: "smtp.mail.yahoo.com",
        socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
      },
    ],
  },
  // IMAP Invalid account + Invalid Server.
  {
    type: "imap",
    port: 2345,
    user: "imap2user",
    password: "imap2password",
    hostname: "imap.mail.foo.invalid",
    socketType: Ci.nsMsgSocketType.trySTARTTLS,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 3456,
        user: "imapout",
        password: "imapoutpassword",
        isDefault: false,
        hostname: "smtp.mail.foo.invalid",
        socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
      },
    ],
  },
  // AOL IMAP account.
  {
    type: "imap",
    port: 993,
    user: "aolimap",
    password: "imap2password",
    hostname: "imap.aol.com",
    socketType: Ci.nsMsgSocketType.SSL,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 465,
        user: "imapout2",
        password: "imapoutpassword2",
        isDefault: false,
        hostname: "smtp.aol.com",
        socketType: Ci.nsMsgSocketType.SSL,
        authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
      },
    ],
  },
  // AOL POP3 account.
  {
    type: "pop3",
    port: 995,
    user: "aolpop3",
    password: "abc",
    hostname: "pop.aol.com",
    socketType: Ci.nsMsgSocketType.SSL,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 465,
        user: "popout",
        password: "aaa",
        isDefault: false,
        hostname: "smtp.aol.com",
        socketType: Ci.nsMsgSocketType.SSL,
        authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
      },
    ],
  },
  // Google POP3 account.
  {
    type: "pop3",
    port: 995,
    user: "gmailpop3",
    password: "abc",
    hostname: "pop.gmail.com",
    socketType: Ci.nsMsgSocketType.trySTARTTLS,
    authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
    smtpServers: [
      {
        port: 465,
        user: "gmailpopout",
        password: "aaa",
        isDefault: true,
        hostname: "smtp.gmail.com",
        socketType: Ci.nsMsgAuthMethod.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
      },
    ],
  },
  // Microsoft IMAP account
  {
    type: "imap",
    port: 993,
    user: "msimap",
    password: "abc",
    hostname: "outlook.office365.com",
    socketType: Ci.nsMsgSocketType.SSL,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    smtpServers: [
      {
        port: 587,
        user: "msimap",
        password: "abc",
        isDefault: true,
        hostname: "smtp.office365.com",
        socketType: Ci.nsMsgAuthMethod.alwaysSTARTTLS,
        authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
      },
    ],
  },
];

// An array of the incoming servers created from the setup_accounts() method.
var gIncomingServers = [];

// An array of the outgoing servers created from the setup_accounts() method.
var gOutgoingServers = [];

// An array of the accounts created from the setup_accounts() method.
var gAccounts = [];

/**
 * Set up accounts based on the given data.
 */
function setup_accounts() {
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
        smtpDetails.port,
        smtpDetails.user,
        smtpDetails.password,
        smtpDetails.hostname
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

      // Add the newly created account to the array for cleanup.
      gAccounts.push(account);
    }
  }
}

add_task(function test_oauth_migration() {
  setup_accounts();

  for (const server of gIncomingServers) {
    // Confirm all the incoming servers are not using OAuth2 after the setup.
    Assert.notEqual(
      server.authMethod,
      Ci.nsMsgAuthMethod.OAuth2,
      "Incoming server should not use OAuth2"
    );
  }

  for (const server of gOutgoingServers) {
    // Confirm all the outgoing servers are not using OAuth2 after the setup.
    Assert.notEqual(
      server.authMethod,
      Ci.nsMsgAuthMethod.OAuth2,
      "Outgoing server should not use OAuth2"
    );
  }

  // Run the migration.
  Services.prefs.setIntPref("mail.ui-rdf.version", 21);
  MailMigrator._migrateUI();

  for (const server of gIncomingServers) {
    // Confirm only the correct incoming servers are using OAuth2 after migration.
    if (
      !server.hostName.endsWith("mail.yahoo.com") &&
      !server.hostName.endsWith("aol.com") &&
      !server.hostName.endsWith("gmail.com") &&
      !server.hostName.endsWith("office365.com")
    ) {
      Assert.notEqual(
        server.authMethod,
        Ci.nsMsgAuthMethod.OAuth2,
        `Incoming server ${server.hostName} should not use OAuth2 after migration`
      );
      continue;
    }

    Assert.equal(
      server.authMethod,
      Ci.nsMsgAuthMethod.OAuth2,
      `Incoming server ${server.hostName} should use OAuth2 after migration`
    );
  }

  for (const server of gOutgoingServers) {
    // Confirm only the correct outgoing servers are using OAuth2 after migration.
    if (
      !server.hostname.endsWith("mail.yahoo.com") &&
      !server.hostname.endsWith("aol.com") &&
      !server.hostname.endsWith("gmail.com") &&
      !server.hostname.endsWith("office365.com")
    ) {
      Assert.notEqual(
        server.authMethod,
        Ci.nsMsgAuthMethod.OAuth2,
        `Outgoing server ${server.hostname} should not use OAuth2 after migration`
      );
      continue;
    }

    Assert.equal(
      server.authMethod,
      Ci.nsMsgAuthMethod.OAuth2,
      `Outgoing server ${server.hostname} should use OAuth2 after migration`
    );
  }

  // Remove our test accounts and servers to leave the profile clean.
  for (const account of gAccounts) {
    MailServices.accounts.removeAccount(account);
  }

  for (const server of gOutgoingServers) {
    MailServices.smtp.deleteServer(server);
  }
});
