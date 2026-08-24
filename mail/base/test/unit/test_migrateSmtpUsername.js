/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test migrating Latin-1 encoded SMTP usernames to UTF-8.
 */

var { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

// [raw bytes stored by the old code, expected username after migration]
var gUsernames = [
  ["ascii", "ascii"],
  // "üser" in Latin-1, which the migration can recover.
  ["\xfcser", "üser"],
  // "påss€" as the old code stored it: the euro sign didn't fit into Latin-1
  // and was truncated to U+00AC on write, so it is already lost. The migration
  // can only preserve what is there.
  ["p\xe5ss\xac", "påss¬"],
  // Already UTF-8, so must be left alone.
  ["\xc3\xbcser\xe2\x82\xac", "üser€"],
];

var gServerKeys = [];

add_setup(async () => {
  for (let i = 0; i < gUsernames.length; i++) {
    const server = localAccountUtils.create_outgoing_server(
      "smtp",
      "placeholder",
      "password",
      { port: 1234 + i, hostname: `smtp${i}.invalid` }
    );
    gServerKeys.push(server.key);
    // Write the raw bytes the way the old code did, bypassing the setter.
    Services.prefs.setCharPref(
      `mail.smtpserver.${server.key}.username`,
      gUsernames[i][0]
    );
  }
});

/**
 * Without the migration the Latin-1 bytes don't survive being read as UTF-8,
 * which is what makes the migration necessary.
 */
add_task(async function test_unmigratedUsernameIsBroken() {
  const server = MailServices.outgoingServer.getServerByKey(gServerKeys[1]);
  Assert.notEqual(
    server.username,
    "üser",
    "Latin-1 username should not read back correctly before migrating"
  );
});

add_task(async function test_migrateSmtpUsername() {
  Services.prefs.setIntPref("mail.ui-rdf.version", 62);
  MailMigrator._migrateUI();

  for (let i = 0; i < gServerKeys.length; i++) {
    const server = MailServices.outgoingServer.getServerByKey(gServerKeys[i]);
    Assert.equal(
      server.username,
      gUsernames[i][1],
      `username of server ${i} should be readable as UTF-8 after migration`
    );
  }
});

/**
 * Running the migration again must not double encode anything.
 */
add_task(async function test_migrateSmtpUsernameIdempotent() {
  const before = gServerKeys.map(key =>
    Services.prefs.getCharPref(`mail.smtpserver.${key}.username`)
  );

  Services.prefs.setIntPref("mail.ui-rdf.version", 62);
  MailMigrator._migrateUI();

  for (let i = 0; i < gServerKeys.length; i++) {
    Assert.equal(
      Services.prefs.getCharPref(`mail.smtpserver.${gServerKeys[i]}.username`),
      before[i],
      `username of server ${i} should be unchanged by a second migration`
    );
  }
});
