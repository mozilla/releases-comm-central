/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

// For the purposes of this test, it doesn't matter that `searchFolder` isn't an
// actual virtual folder, it just needs to exist and have a URL.
let folder, searchFolder;
let messages;
const generator = new MessageGenerator();

add_setup(function () {
  do_get_profile();
  loadExistingDB();
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder = rootFolder.createLocalSubfolder("testSearchFolderHitCache");
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  folder.addMessageBatch(
    generator
      .makeMessages({
        count: 5,
      })
      .map(message => message.toMessageString())
  );
  messages = [...folder.messages];

  searchFolder = rootFolder.createLocalSubfolder("dummySearchFolder");
});

/**
 * Tests that the database is capable of correctly managing the cache of results
 * for a search folder.
 */
add_task(async function test_searchHitCache() {
  const db = folder.msgDatabase;

  Assert.ok(
    !db.getCachedHits(searchFolder.URI),
    "there should be no recorded hits for now"
  );

  // Test that `refreshCache` returns the correct stale results.
  let stale = db.refreshCache(searchFolder.URI, [
    messages[0].messageKey,
    messages[1].messageKey,
    messages[2].messageKey,
  ]);
  Assert.equal(stale.length, 0, "there should be no stale hits for now");

  stale = db.refreshCache(searchFolder.URI, [
    messages[2].messageKey,
    messages[3].messageKey,
    messages[4].messageKey,
  ]);
  Assert.deepEqual(
    stale,
    [messages[0].messageKey, messages[1].messageKey],
    "the two first messages should be marked as stale"
  );

  // Test that after our calls to `refreshCache` the recorded hits are correct.
  let hits = [...db.getCachedHits(searchFolder.URI)];
  Assert.deepEqual(
    hits.map(message => message.messageKey),
    [messages[2].messageKey, messages[3].messageKey, messages[4].messageKey],
    "the last 3 messages should be recorded as hits"
  );

  // Test that we can use `updateHdrInCache` to add a hit for the folder.
  db.updateHdrInCache(searchFolder.URI, messages[0], true);
  hits = [...db.getCachedHits(searchFolder.URI)];
  Assert.equal(hits.length, 4, "there should be 4 recorded hits");
  Assert.equal(
    hits[0].messageKey,
    messages[0].messageKey,
    "the first hit should be the first message"
  );

  // Test that we can use `updateHdrInCache` to remove a hit.
  db.updateHdrInCache(searchFolder.URI, messages[0], false);
  hits = [...db.getCachedHits(searchFolder.URI)];
  Assert.equal(hits.length, 3, "we should be back to 3 recorded hits");

  // Test that we can check the presence of an individual message in the cache
  // with `hdrIsInCache`.
  Assert.ok(
    !db.hdrIsInCache(searchFolder.URI, messages[0]),
    "the first message should not be in the cache"
  );
  Assert.ok(
    db.hdrIsInCache(searchFolder.URI, messages[2]),
    "the third message should be in the cache"
  );
});
