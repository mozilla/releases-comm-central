/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A half-finished filter - no destination folder for its move action, and
 * possibly an empty condition value - must not match every message, and must
 * leave the messages it does match where they are. See bug 2069938.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const TARGET_URI = "mailbox://nobody@Local%20Folders/target";

/**
 * Each entry describes one filter to write to msgFilterRules.dat, how many
 * search terms it should end up with, and the subjects of the test messages it
 * is expected to match. The filters that match a message have no destination
 * folder. The filters with a destination folder must not match either message.
 */
const FILTERS = [
  // The bug 2069938 case: nothing filled in at all.
  {
    name: "no-value-no-target",
    condition: "AND (subject,contains,)",
    actionValue: "",
    terms: 1,
    expectedMatches: [],
  },
  // Empty value, but a destination folder was picked.
  {
    name: "no-value-with-target",
    condition: "AND (subject,contains,)",
    actionValue: TARGET_URI,
    terms: 1,
    expectedMatches: [],
  },
  // An empty value in a "Match any" filter used to make the whole filter
  // match everything.
  {
    name: "any-with-empty-value",
    condition: "OR (subject,contains,) (subject,contains,nothing at all)",
    actionValue: TARGET_URI,
    terms: 2,
    expectedMatches: [],
  },
  // An empty "doesn't contain" value matches everything, by design.
  {
    name: "doesnt-contain-no-value",
    condition: "AND (subject,doesn't contain,)",
    actionValue: "",
    terms: 1,
    expectedMatches: ["needle in a haystack", "nothing of interest here"],
  },
  // A usable condition, but still no destination folder.
  {
    name: "usable-value-no-target",
    condition: "AND (subject,contains,needle)",
    actionValue: "",
    terms: 1,
    expectedMatches: ["needle in a haystack"],
  },
];

const SUBJECTS = ["needle in a haystack", "nothing of interest here"];

function buildRules() {
  let rules = 'version="9"\nlogging="no"\n';
  for (const { name, condition, actionValue } of FILTERS) {
    rules +=
      `name="${name}"\n` +
      'enabled="yes"\n' +
      'type="17"\n' +
      'action="Move to folder"\n' +
      `actionValue="${actionValue}"\n` +
      `condition="${condition.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
  }
  return rules;
}

function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}

let filterList;

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();
  localAccountUtils.rootFolder.createLocalSubfolder("target");

  for (const [index, subject] of SUBJECTS.entries()) {
    localAccountUtils.inboxFolder.addMessage(
      "From: sender@test.invalid\r\n" +
        "To: recipient@test.invalid\r\n" +
        `Subject: ${subject}\r\n` +
        `Message-ID: <${index}@test.invalid>\r\n` +
        "\r\n" +
        "body\r\n"
    );
  }

  const file = do_get_profile().clone();
  file.append("msgFilterRules.dat");
  await IOUtils.writeUTF8(file.path, buildRules());
  filterList = MailServices.filters.OpenFilterList(
    file,
    localAccountUtils.incomingServer.rootFolder,
    null
  );
  Assert.equal(
    filterList.filterCount,
    FILTERS.length,
    "all filters should have been loaded"
  );
});

add_task(function testMatching() {
  const inbox = localAccountUtils.inboxFolder;
  for (const [index, { name, terms, expectedMatches }] of FILTERS.entries()) {
    const filter = filterList.getFilterAt(index);
    Assert.equal(filter.filterName, name, "filters should be in file order");
    Assert.ok(filter.enabled, `filter "${name}" should be enabled`);
    Assert.equal(
      filter.searchTerms.length,
      terms,
      `filter "${name}" should have its search terms`
    );
    const matched = [...inbox.messages]
      .filter(msgHdr => filter.MatchHdr(msgHdr, inbox, inbox.msgDatabase, ""))
      .map(msgHdr => msgHdr.subject);
    Assert.deepEqual(
      matched.toSorted(),
      expectedMatches.toSorted(),
      `filter "${name}" should match only the expected messages`
    );
  }
});

add_task(async function testApplyingLeavesMessagesInPlace() {
  const inbox = localAccountUtils.inboxFolder;
  const target = localAccountUtils.rootFolder.getChildNamed("target");

  const filterListener = new PromiseTestUtils.PromiseMsgOperationListener();
  MailServices.filters.applyFiltersToFolders(
    filterList,
    [inbox],
    null,
    filterListener
  );
  // The move actions can't run without a destination folder, and that is
  // reported as a failure rather than silently swallowed.
  await Assert.rejects(
    filterListener.promise,
    new RegExp(0x80004005),
    "filtering should report the failing move action"
  );

  Assert.equal(
    folderCount(target),
    0,
    "no message should have been filed into the target folder"
  );
  Assert.equal(
    folderCount(inbox),
    SUBJECTS.length,
    "all messages should still be in the inbox"
  );
});
