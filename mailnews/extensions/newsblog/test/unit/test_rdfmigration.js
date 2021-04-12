/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailMigrator } = ChromeUtils.import(
  "resource:///modules/MailMigrator.jsm"
);

/**
 * Tests migration of old .rdf feed config files to the new .json files.
 *
 * @param {String} testDataDir - A directory containing legacy feeds.rdf and
 *                               feeditems.rdf files, along with coressponding
 *                               .json files containing the expected results
 *                               of the migration.
 * @returns {void}
 */
async function migrationTest(testDataDir) {
  // Set up an RSS account/server.
  let account = FeedUtils.createRssAccount("rss_migration_test");
  let rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  // Note, we don't create any folders to hold downloaded feed items,
  // that's OK here, because we're only migrating the config files, not
  // downloading feeds. The migration doesn't check destFolder existence.
  let rootDir = rootFolder.filePath.path;

  // Install legacy feeds.rdf/feeditems.rdf
  for (let f of ["feeds.rdf", "feeditems.rdf"]) {
    await IOUtils.copy(
      PathUtils.join(testDataDir, f),
      PathUtils.join(rootDir, f)
    );
  }

  // Perform the migration
  await MailMigrator._migrateRSSServer(account.incomingServer);

  // Check actual results against expectations.
  for (let f of ["feeds.json", "feeditems.json"]) {
    let got = await IOUtils.readJSON(PathUtils.join(rootDir, f));
    let expected = await IOUtils.readJSON(PathUtils.join(testDataDir, f));
    Assert.deepEqual(got, expected, `match ${testDataDir}/${f}`);
  }

  // Delete the account and all it's files.
  MailServices.accounts.removeAccount(account, true);
}

add_task(async function test_rdfmigration() {
  let testDataDirs = [
    "feeds-simple",
    "feeds-empty",
    "feeds-missing-timestamp",
    "feeds-bad",
  ];
  for (let d of testDataDirs) {
    await migrationTest(do_get_file("resources/" + d).path);
  }
});
