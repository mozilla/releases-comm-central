/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  be_in_folder,
  create_folder,
  create_virtual_folder,
  get_about_3pane,
  get_about_message,
  select_click_row,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
const { GlodaSyntheticView } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaSyntheticView.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const command = "cmd_applyFiltersToSelection";
let sourceAccount, source, other, target, singleVirtual, multiVirtual;

add_setup(async function () {
  sourceAccount = MailServices.accounts.createAccount();
  sourceAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "filterMessages",
    "localhost",
    "pop3"
  );
  source = sourceAccount.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("FilterMessagesSource");
  other = await create_folder("FilterMessagesOther");
  target = await create_folder("FilterMessagesTarget");
  await make_message_sets_in_folders([source], [{ count: 6 }]);
  await make_message_sets_in_folders([other], [{ count: 2 }]);
  singleVirtual = create_virtual_folder("FilterMessagesSingle", [source]);
  multiVirtual = create_virtual_folder("FilterMessagesMulti", [source, other]);

  const filterList = source.getFilterList(window.msgWindow);
  const filter = filterList.createFilter("Move selected messages");
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.Manual;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MoveToFolder;
  action.targetFolderUri = target.URI;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);

  registerCleanupFunction(async () => {
    const tabmail = document.getElementById("tabmail");
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    await be_in_folder(other.parent);
    filterList.removeFilter(filter);
    for (const folder of [singleVirtual, multiVirtual, source, other, target]) {
      folder.deleteSelf(null);
    }
    MailServices.accounts.removeAccount(sourceAccount, false);
  });
});

async function runFiltersOnSelection() {
  const win = get_about_3pane();
  Assert.ok(
    win.commandController.isCommandEnabled(command),
    "Run Filters on Message should be enabled for the selection"
  );
  const selectedMessages = win.gDBView.getSelectedMsgHdrs();
  const selectedMessageIds = selectedMessages.map(message => message.messageId);
  const folder = selectedMessages[0].folder;
  const sourceCount = folder.getTotalMessages(false);
  const targetCount = target.getTotalMessages(false);

  win.commandController.doCommand(command);
  await TestUtils.waitForCondition(
    () =>
      folder.getTotalMessages(false) == sourceCount - selectedMessages.length &&
      target.getTotalMessages(false) == targetCount + selectedMessages.length,
    "The filter should move only the selected messages from their real folder"
  );
  const targetMessageIds = [...target.messages].map(
    message => message.messageId
  );
  for (const messageId of selectedMessageIds) {
    Assert.ok(
      targetMessageIds.includes(messageId),
      "Each selected message should reach the filter destination"
    );
  }
}

add_task(async function test_runFiltersInSingleFolderViews() {
  for (const folder of [source, singleVirtual]) {
    await be_in_folder(folder);
    const win = get_about_3pane();
    win.threadTree.selectedIndex = -1;
    Assert.ok(
      !win.commandController.isCommandEnabled(command),
      "Run Filters on Message should be disabled without a selection"
    );

    await select_click_row(0);
    await select_shift_click_row(1);
    await runFiltersOnSelection();
  }
});

add_task(async function test_disableFolderFiltersInSavedSearch() {
  await be_in_folder(singleVirtual);
  const win = get_about_3pane();
  Assert.ok(
    !win.commandController.isCommandEnabled("cmd_applyFilters"),
    "Run Filters on Folder should be disabled in a single-folder saved search"
  );
  await select_click_row(0);
  Assert.ok(
    !get_about_message().commandController.isCommandEnabled("cmd_applyFilters"),
    "Run Filters on Folder should also be disabled in the saved-search message pane"
  );
});

add_task(async function test_runFiltersInMultiFolderView() {
  await be_in_folder(multiVirtual);
  const win = get_about_3pane();
  const [header] = source.messages;
  await select_click_row(win.gDBView.findIndexOfMsgHdr(header, true));
  Assert.ok(
    get_about_message().commandController.isCommandEnabled(command),
    "Run Filters on Message should be enabled for one message in the multi-folder message pane"
  );
  await runFiltersOnSelection();
  Assert.ok(
    !win.commandController.isCommandEnabled("cmd_applyFilters"),
    "Run Filters on Folder should be disabled in a multi-folder saved search"
  );

  await select_click_row(0);
  await select_shift_click_row(1);
  Assert.ok(
    !win.commandController.isCommandEnabled(command),
    "Run Filters on Message should be disabled for multiple messages in a multi-folder saved search"
  );
  await select_click_row(0);
});

add_task(async function test_messageTabFromMultiFolderView() {
  const tabmail = document.getElementById("tabmail");
  const win = get_about_3pane();
  const tab = tabmail.openTab("mailMessageTab", {
    messageURI: win.gDBView.URIForFirstSelectedMessage,
    viewWrapper: win.gViewWrapper,
  });
  await BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded");
  Assert.ok(
    tab.chromeBrowser.contentWindow.commandController.isCommandEnabled(command),
    "Run Filters on Message should remain enabled for a message opened from a multi-folder view"
  );
  tabmail.closeTab(tab);
});

add_task(async function test_runFiltersInSyntheticView() {
  const tabmail = document.getElementById("tabmail");
  const headers = [...source.messages, ...other.messages];
  const loaded = BrowserTestUtils.waitForEvent(window, "aboutMessageLoaded");
  const tab = tabmail.openTab("mail3PaneTab", {
    syntheticView: new GlodaSyntheticView({
      collection: {
        items: headers.map(folderMessage => ({ folderMessage })),
      },
    }),
    title: "Filter messages search results",
  });
  await loaded;
  await TestUtils.waitForCondition(
    () => tab.chromeBrowser.contentWindow.gDBView?.rowCount == headers.length,
    "The synthetic view should display the search results"
  );
  const win = get_about_3pane();
  await select_click_row(win.gDBView.findIndexOfMsgHdr(headers[0], true));
  Assert.ok(
    get_about_message().commandController.isCommandEnabled(command),
    "Run Filters on Message should be enabled for one message in the synthetic message pane"
  );
  await runFiltersOnSelection();
  Assert.ok(
    !win.commandController.isCommandEnabled("cmd_applyFilters"),
    "Run Filters on Folder should be disabled in a synthetic view"
  );

  await select_click_row(0);
  await select_shift_click_row(1);
  Assert.ok(
    !win.commandController.isCommandEnabled(command),
    "Run Filters on Message should be disabled for multiple messages in a synthetic view"
  );

  tabmail.closeTab(tab);
  await be_in_folder(other);
  await select_click_row(0);
  Assert.ok(
    get_about_3pane().commandController.isCommandEnabled(command),
    "Run Filters on Message should be enabled again in a real folder"
  );
});

add_task(async function test_runFiltersOnRealFolder() {
  await make_message_sets_in_folders([source], [{ count: 2 }]);
  await be_in_folder(source);
  await select_click_row(0);
  const win = get_about_3pane();
  const sourceCount = source.getTotalMessages(false);
  const targetCount = target.getTotalMessages(false);
  Assert.ok(
    win.commandController.isCommandEnabled("cmd_applyFilters"),
    "Run Filters on Folder should be enabled in a real folder"
  );

  win.commandController.doCommand("cmd_applyFilters");
  await TestUtils.waitForCondition(
    () =>
      source.getTotalMessages(false) == 0 &&
      target.getTotalMessages(false) == targetCount + sourceCount,
    "Run Filters on Folder should filter all messages, including unselected ones"
  );
});
