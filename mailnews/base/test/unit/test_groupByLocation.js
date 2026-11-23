/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

add_task(async function test_groupByLocation() {
  const generator = new MessageGenerator();
  const injection = new MessageInjection({ mode: "local" });
  const folders = [
    await injection.makeEmptyFolder("locationA"),
    await injection.makeEmptyFolder("locationB"),
  ];
  for (const folder of folders) {
    await injection.addSetsToFolders(
      [folder],
      [new SyntheticMessageSet(generator.makeMessages({ count: 3 }))]
    );
  }
  const virtualFolder = injection.makeVirtualFolder(folders, {});
  const viewTypes = ["search", "xfvf"];
  const sortOrders = [
    Ci.nsMsgViewSortOrder.ascending,
    Ci.nsMsgViewSortOrder.descending,
  ];

  for (const viewType of viewTypes) {
    info(`Testing Location groups in ${viewType}`);
    const view = Cc[
      `@mozilla.org/messenger/msgdbview;1?type=${viewType}`
    ].createInstance(Ci.nsIMsgDBView);
    view.init(false, null);
    view.open(
      viewType == "search" ? null : virtualFolder,
      Ci.nsMsgViewSortType.byLocation,
      Ci.nsMsgViewSortOrder.ascending,
      Ci.nsMsgViewFlagsType.kGroupBySort |
        Ci.nsMsgViewFlagsType.kThreadedDisplay |
        Ci.nsMsgViewFlagsType.kExpandAll
    );
    registerCleanupFunction(() => view.close());
    const tree = view.QueryInterface(Ci.nsITreeView);

    const searchNotify = view.QueryInterface(Ci.nsIMsgSearchNotify);
    searchNotify.onNewSearch();
    for (const folder of folders.toReversed()) {
      for (const header of folder.msgDatabase.enumerateMessages()) {
        searchNotify.onSearchHit(header, folder);
      }
    }
    searchNotify.onSearchDone(Cr.NS_OK);

    Assert.equal(
      tree.rowCount,
      8,
      "Both groups and all messages should appear"
    );
    for (const sortOrder of sortOrders) {
      view.sort(Ci.nsMsgViewSortType.byLocation, sortOrder);
      view.doCommand(Ci.nsMsgViewCommandType.expandAll);
      Assert.equal(
        tree.rowCount,
        8,
        "Sorting should retain both groups and all messages"
      );

      const expectedFolders =
        sortOrder == Ci.nsMsgViewSortOrder.ascending
          ? folders
          : folders.toReversed();
      for (const [index, folder] of expectedFolders.entries()) {
        const groupRow = index * 4;
        Assert.equal(
          tree.getLevel(groupRow),
          0,
          "The group header should be at the top level"
        );
        Assert.equal(
          view.cellTextForColumn(groupRow, "subjectCol"),
          folder.localizedName,
          "The group header should show the folder name"
        );
        const messageIds = [];
        for (let row = groupRow + 1; row < groupRow + 4; row++) {
          Assert.equal(
            tree.getLevel(row),
            1,
            "Messages should be children of the group header"
          );
          const header = view.getMsgHdrAt(row);
          Assert.equal(
            header.folder,
            folder,
            "Each message should belong to its group's folder"
          );
          messageIds.push(header.messageId);
        }
        const expectedIds = Array.from(
          folder.msgDatabase.enumerateMessages(),
          header => header.messageId
        );
        Assert.deepEqual(
          messageIds.sort(),
          expectedIds.sort(),
          "The group should contain every message from its folder exactly once"
        );
      }
    }
  }
});
