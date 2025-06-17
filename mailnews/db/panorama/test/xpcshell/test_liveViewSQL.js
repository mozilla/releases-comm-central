/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that live views use the correct SQL clauses and parameters.
 */

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

let rootFolder, folderA, folderB, folderC;

add_setup(async function () {
  installDB();

  const account = MailServices.accounts.createLocalMailAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderA = rootFolder.createLocalSubfolder("folderA");
  folderB = rootFolder.createLocalSubfolder("folderB");
  folderC = rootFolder.createLocalSubfolder("folderC");
});

add_task(function testVirtualFolder() {
  const wrapper = VirtualFolderHelper.createNewVirtualFolder(
    "virtual",
    rootFolder,
    [folderA, folderC],
    "ALL",
    false
  );

  const virtualFolder = folders.getFolderByPath("server1/virtual");
  const folderSubclause = `folderId IN (SELECT searchFolderId FROM virtualFolder_folders WHERE virtualFolderId = ${virtualFolder.id})`;

  for (const [searchString, expectedClause, expectedParams] of [
    // Matches all messages.
    ["ALL", "(1)", []],

    // Date.
    [
      "AND (date,is,24-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') = ?)",
      ["2025-06-24"],
    ],
    [
      "AND (date,isn't,24-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') != ?)",
      ["2025-06-24"],
    ],
    [
      "AND (date,is before,24-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') < ?)",
      ["2025-06-24"],
    ],
    [
      "AND (date,is after,24-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') > ?)",
      ["2025-06-24"],
    ],

    // Contact fields.
    // TODO: Match names and/or addresses properly.
    ["AND (from,is,foo)", "(sender = ?)", ["foo"]],
    ["AND (to,is,foo)", "(recipients = ?)", ["foo"]],
    ["AND (cc,is,foo)", "(ccList = ?)", ["foo"]],

    // Text fields.
    ["AND (subject,contains,foo)", "(subject LIKE ? ESCAPE '/')", ["%foo%"]],
    [
      "AND (subject,doesn't contain,foo)",
      "(subject NOT LIKE ? ESCAPE '/')",
      ["%foo%"],
    ],
    ["AND (subject,is,foo)", "(subject = ?)", ["foo"]],
    ["AND (subject,isn't,foo)", "(subject != ?)", ["foo"]],
    ["AND (subject,begins with,foo)", "(subject LIKE ? ESCAPE '/')", ["foo%"]],
    ["AND (subject,ends with,foo)", "(subject LIKE ? ESCAPE '/')", ["%foo"]],

    // Text fields with values that need escaping because we're using LIKE.
    // From test_like_escape.js.
    [
      "AND (subject,contains,oo/bar_baz%20chees)",
      "(subject LIKE ? ESCAPE '/')",
      ["%oo//bar/_baz/%20chees%"],
    ],
    [
      "AND (subject,doesn't contain,oo%20\xc6/_ba)",
      "(subject NOT LIKE ? ESCAPE '/')",
      ["%oo/%20\xc6///_ba%"],
    ],
    [
      "AND (subject,begins with,oo/bar_baz%20chees)",
      "(subject LIKE ? ESCAPE '/')",
      ["oo//bar/_baz/%20chees%"],
    ],
    [
      "AND (subject,ends with,oo/bar_baz%20chees)",
      "(subject LIKE ? ESCAPE '/')",
      ["%oo//bar/_baz/%20chees"],
    ],

    // Text fields with values that don't need escaping because we're not using LIKE.
    [
      "AND (subject,is,oo/bar_baz%20chees)",
      "(subject = ?)",
      ["oo/bar_baz%20chees"],
    ],

    // Flags.
    [
      "AND (has attachment status,is,true)",
      "(flags & 268435456 = ?)",
      [Ci.nsMsgMessageFlags.Attachment],
    ],
    [
      "AND (has attachment status,isn't,true)",
      "(flags & 268435456 != ?)",
      [Ci.nsMsgMessageFlags.Attachment],
    ],

    // Tags.
    ["AND (tag,contains,$label1)", "(TAGS_INCLUDE(tags, ?))", ["$label1"]],
    [
      "AND (tag,doesn't contain,$label1)",
      "(TAGS_EXCLUDE(tags, ?))",
      ["$label1"],
    ],
    ["AND (tag,is,$label1)", "(tags = ?)", ["$label1"]],
    ["AND (tag,isn't,$label1)", "(tags != ?)", ["$label1"]],
    ["AND (tag,is empty,)", "(tags = '')", []],
    ["AND (tag,isn't empty,)", "(tags != '')", []],

    // Multiple terms.
    [
      "OR (date,is,24-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') = ?)",
      ["2025-06-24"],
    ],
    [
      "OR (date,is before,23-Jun-2025) OR (date,is after,25-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') < ? OR DATE(date / 1000000, 'unixepoch', 'localtime') > ?)",
      ["2025-06-23", "2025-06-25"],
    ],
    [
      "AND (date,is before,23-Jun-2025) AND (date,is after,25-Jun-2025)",
      "(DATE(date / 1000000, 'unixepoch', 'localtime') < ? AND DATE(date / 1000000, 'unixepoch', 'localtime') > ?)",
      ["2025-06-23", "2025-06-25"],
    ],
  ]) {
    wrapper.searchString = searchString;
    const liveView = new LiveView();
    liveView.initWithFolder(virtualFolder);
    const clause = liveView.sqlClauseForTests;
    Assert.ok(clause.startsWith(folderSubclause));
    Assert.equal(clause.replace(/^.* AND (\(.*\))$/, "$1"), expectedClause);
    Assert.deepEqual(liveView.sqlParamsForTests, expectedParams);
  }
});
