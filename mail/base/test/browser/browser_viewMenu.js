/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

/** @type MenuData */
const viewMenuData = {
  menu_Toolbars: {},
  view_toolbars_popup_quickFilterBar: { checked: true },
  viewToolbarsPopupSpacesToolbar: { checked: true },
  menu_showTaskbar: { checked: true },
  customizeMailToolbars: {},
  menu_MessagePaneLayout: {},
  messagePaneClassic: {},
  messagePaneWide: {},
  messagePaneVertical: { checked: true },
  menu_showFolderPane: { checked: true },
  menu_toggleThreadPaneHeader: { disabled: true, checked: true },
  menu_showMessage: {},
  menu_FolderViews: {},
  menu_toggleFolderHeader: { checked: true },
  menu_allFolders: { disabled: true, checked: true },
  menu_smartFolders: {},
  menu_unreadFolders: {},
  menu_favoriteFolders: {},
  menu_recentFolders: {},
  menu_tags: {},
  menu_compactMode: { disabled: true },
  menu_uiDensity: {},
  uiDensityCompact: {},
  uiDensityNormal: { checked: true },
  uiDensityTouch: {},
  viewFullZoomMenu: {},
  menu_fullZoomEnlarge: { disabled: true },
  menu_fullZoomReduce: { disabled: true },
  menu_fullZoomReset: { disabled: true },
  menu_fullZoomToggle: { disabled: true },
  menu_uiFontSize: {},
  menu_fontSizeEnlarge: {},
  menu_fontSizeReduce: {},
  menu_fontSizeReset: {},
  calTodayPaneMenu: { hidden: true },
  "calShowTodayPane-2": {},
  calTodayPaneDisplayMiniday: {},
  calTodayPaneDisplayMinimonth: {},
  calTodayPaneDisplayNone: {},
  calCalendarMenu: { hidden: true },
  calChangeViewDay: {},
  calChangeViewWeek: {},
  calChangeViewMultiweek: {},
  calChangeViewMonth: {},
  calCalendarPaneMenu: {},
  calViewCalendarPane: {},
  calTasksViewMinimonth: {},
  calTasksViewCalendarlist: {},
  calCalendarCurrentViewMenu: {},
  calWorkdaysOnlyMenuitem: {},
  calTasksInViewMenuitem: {},
  calShowCompletedInViewMenuItem: {},
  calViewRotated: {},
  calTasksMenu: { hidden: true },
  calTasksViewFilterTasks: {},
  calTasksViewFilterCurrent: {},
  calTasksViewFilterToday: {},
  calTasksViewFilterNext7days: {},
  calTasksViewFilterNotstartedtasks: {},
  calTasksViewFilterOverdue: {},
  calTasksViewFilterCompleted: {},
  calTasksViewFilterOpen: {},
  calTasksViewFilterAll: {},
  viewSortMenu: { disabled: true },
  sortByDateMenuitem: {},
  sortByReceivedMenuitem: {},
  sortByFlagMenuitem: {},
  sortByOrderReceivedMenuitem: {},
  sortByPriorityMenuitem: {},
  sortByFromMenuitem: {},
  sortByRecipientMenuitem: {},
  sortByCorrespondentMenuitem: {},
  sortBySizeMenuitem: {},
  sortByStatusMenuitem: {},
  sortBySubjectMenuitem: {},
  sortByUnreadMenuitem: {},
  sortByTagsMenuitem: {},
  sortByJunkStatusMenuitem: {},
  sortByAttachmentsMenuitem: {},
  sortAscending: {},
  sortDescending: {},
  sortThreaded: {},
  sortUnthreaded: {},
  groupBySort: {},
  viewMessageViewMenu: { hidden: true },
  viewMessageAll: {},
  viewMessageUnread: {},
  viewMessageNotDeleted: {},
  viewMessageTags: {},
  viewMessageCustomViews: {},
  viewMessageVirtualFolder: {},
  viewMessageCustomize: {},
  viewMessagesMenu: { disabled: true },
  viewAllMessagesMenuItem: { disabled: true, checked: true },
  viewUnreadMessagesMenuItem: { disabled: true },
  viewThreadsWithUnreadMenuItem: { disabled: true },
  viewWatchedThreadsWithUnreadMenuItem: { disabled: true },
  viewIgnoredThreadsMenuItem: { disabled: true },
  menu_expandAllThreads: { disabled: true },
  collapseAllThreads: { disabled: true },
  viewheadersmenu: {},
  viewallheaders: {},
  viewnormalheaders: { checked: true },
  viewBodyMenu: {},
  bodyAllowHTML: { checked: true },
  bodySanitized: {},
  bodyAsPlaintext: {},
  bodyAllParts: { hidden: true },
  viewFeedSummary: { hidden: true },
  bodyFeedGlobalWebPage: {},
  bodyFeedGlobalSummary: {},
  bodyFeedPerFolderPref: {},
  bodyFeedSummaryAllowHTML: {},
  bodyFeedSummarySanitized: {},
  bodyFeedSummaryAsPlaintext: {},
  viewAttachmentsInlineMenuitem: { checked: true },
  pageSourceMenuItem: { disabled: true },
};
const helper = new MenuTestHelper("menu_View", viewMenuData);

const tabmail = document.getElementById("tabmail");
let inboxFolder, rootFolder, testMessages;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  inboxFolder = rootFolder
    .createLocalSubfolder("view menu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  inboxFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...inboxFolder.messages];

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(0);
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function test3PaneTab() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: rootFolder,
  });
  await new Promise(resolve => setTimeout(resolve));
  await helper.testAllItems("mail3PaneTab");

  tabmail.currentAbout3Pane.displayFolder(inboxFolder);
  await helper.testItems({
    menu_Toolbars: {},
    view_toolbars_popup_quickFilterBar: { checked: true },
    menu_MessagePaneLayout: {},
    menu_showFolderPane: { checked: true },
    menu_toggleThreadPaneHeader: { checked: true },
    menu_showMessage: { checked: true },
    viewSortMenu: { disabled: false },
    viewMessagesMenu: { disabled: false },
  });

  goDoCommand("cmd_toggleQuickFilterBar");
  await helper.testItems({
    menu_Toolbars: {},
    view_toolbars_popup_quickFilterBar: { checked: false },
  });

  goDoCommand("cmd_toggleFolderPane");
  await helper.testItems({
    menu_MessagePaneLayout: {},
    menu_showFolderPane: { checked: false },
    menu_showMessage: { checked: true },
  });

  goDoCommand("cmd_toggleThreadPaneHeader");
  await helper.testItems({
    menu_MessagePaneLayout: {},
    menu_toggleThreadPaneHeader: { checked: false },
  });

  goDoCommand("cmd_toggleMessagePane");
  await helper.testItems({
    menu_MessagePaneLayout: {},
    menu_showFolderPane: { checked: false },
    menu_showMessage: { checked: false },
  });

  goDoCommand("cmd_toggleQuickFilterBar");
  goDoCommand("cmd_toggleFolderPane");
  goDoCommand("cmd_toggleThreadPaneHeader");
  goDoCommand("cmd_toggleMessagePane");
  await helper.testItems({
    menu_Toolbars: {},
    view_toolbars_popup_quickFilterBar: { checked: true },
    menu_MessagePaneLayout: {},
    menu_showFolderPane: { checked: true },
    menu_toggleThreadPaneHeader: { checked: true },
    menu_showMessage: { checked: true },
  });
});
