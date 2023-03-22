/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const nothingSelected = ["rootFolder", "noSelection", "contentTab"];
const nothingOrMultiSelected = [...nothingSelected, "multiSelection"];

/** @type MenuData */
const messageMenuData = {
  newMsgCmd: {},
  replyMainMenu: { disabled: nothingOrMultiSelected },
  replyNewsgroupMainMenu: { hidden: true },
  replySenderMainMenu: { hidden: true },
  menu_replyToAll: { disabled: nothingOrMultiSelected },
  menu_replyToList: { disabled: nothingOrMultiSelected },
  menu_forwardMsg: { disabled: nothingOrMultiSelected },
  forwardAsMenu: { disabled: nothingSelected },
  menu_forwardAsInline: { disabled: nothingSelected },
  menu_forwardAsAttachment: { disabled: nothingSelected },
  menu_redirectMsg: { disabled: nothingOrMultiSelected },
  menu_editMsgAsNew: { disabled: nothingOrMultiSelected },
  menu_editDraftMsg: { hidden: true },
  menu_newMsgFromTemplate: { hidden: true },
  menu_editTemplate: { hidden: true },
  openMessageWindowMenuitem: {
    disabled: [...nothingSelected, "message", "externalMessage"],
  },
  openConversationMenuitem: {
    disabled: [...nothingSelected, "externalMessage"],
  },
  openFeedMessage: { hidden: true },
  menu_openFeedWebPage: { disabled: nothingSelected },
  menu_openFeedSummary: { disabled: nothingSelected },
  menu_openFeedWebPageInMessagePane: {
    disabled: nothingSelected,
  },
  msgAttachmentMenu: { disabled: true }, // Bug 1819005.
  tagMenu: { disabled: [...nothingSelected, "externalMessage"] },
  "tagMenu-addNewTag": { disabled: nothingSelected },
  "tagMenu-manageTags": { disabled: nothingSelected },
  "tagMenu-tagRemoveAll": { disabled: nothingSelected },
  markMenu: { disabled: ["rootFolder", "externalMessage", "contentTab"] },
  markReadMenuItem: { disabled: nothingSelected },
  markUnreadMenuItem: { disabled: true },
  menu_markThreadAsRead: { disabled: nothingOrMultiSelected },
  menu_markReadByDate: { disabled: nothingSelected },
  menu_markAllRead: { disabled: ["rootFolder"] },
  markFlaggedMenuItem: { disabled: nothingSelected },
  menu_markAsJunk: { disabled: nothingSelected },
  menu_markAsNotJunk: { disabled: nothingSelected },
  menu_recalculateJunkScore: {
    disabled: [...nothingSelected, "message"],
  },
  archiveMainMenu: { disabled: [...nothingSelected, "externalMessage"] },
  menu_cancel: { hidden: true },
  moveMenu: { disabled: [...nothingSelected, "externalMessage"] },
  copyMenu: { disabled: nothingSelected },
  moveToFolderAgain: { disabled: true },
  createFilter: { disabled: [...nothingOrMultiSelected, "externalMessage"] },
  killThread: { disabled: [...nothingSelected, "message", "externalMessage"] },
  killSubthread: {
    disabled: [...nothingSelected, "message", "externalMessage"],
  },
  watchThread: { disabled: [...nothingSelected, "externalMessage"] },
};
let helper = new MenuTestHelper("messageMenu", messageMenuData);

let tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, testMessages;

add_setup(async function() {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  let generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("message menu", null);
  testFolder = rootFolder
    .getChildNamed("message menu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  testFolder.addMessage(
    generator
      .makeMessage({
        attachments: [
          {
            body: "an attachment",
            contentType: "text/plain",
            filename: "attachment.txt",
          },
        ],
      })
      .toMboxString()
  );
  testMessages = [...testFolder.messages];

  window.OpenMessageInNewTab(testMessages[0], { background: true });
  await BrowserTestUtils.waitForEvent(
    tabmail.tabInfo[1].chromeBrowser,
    "MsgLoaded"
  );

  let messageFile = new FileUtils.File(
    getTestFilePath("files/sampleContent.eml")
  );
  let messageURI =
    Services.io.newFileURI(messageFile).spec +
    "?type=application/x-message-display";
  tabmail.openTab("mailMessageTab", { background: true, messageURI });

  window.openTab("contentTab", {
    url: "https://example.com/",
    background: true,
  });

  await TestUtils.waitForCondition(
    () => !GlodaIndexer.indexing,
    "waiting for Gloda to finish indexing",
    500
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(0);
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
  });
});

add_task(async function testRootFolder() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: rootFolder,
  });
  await new Promise(resolve => setTimeout(resolve));
  await helper.testAllItems("rootFolder");
});

add_task(async function testNoSelection() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: testFolder,
  });
  await new Promise(resolve => setTimeout(resolve));
  await helper.testAllItems("noSelection");
});

add_task(async function testSingleSelection() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: testFolder,
  });
  await new Promise(resolve => setTimeout(resolve));

  // This message is not marked as read.
  tabmail.currentAbout3Pane.threadTree.selectedIndex = 1;
  await helper.testAllItems("singleSelection");

  // Mark it as read.
  testMessages[1].markRead(true);
  await helper.testItems({
    markMenu: {},
    markReadMenuItem: { disabled: true },
    markUnreadMenuItem: {},
    menu_markThreadAsRead: { disabled: true },
  });

  // Mark it as starred.
  testMessages[1].markFlagged(true);
  await helper.testItems({
    markMenu: {},
    markFlaggedMenuItem: { checked: true },
  });

  testFolder.addKeywordsToMessages([testMessages[1]], "$label1");
  await helper.testItems({
    tagMenu: {},
    "tagMenu-tagRemoveAll": {},
  });

  // This message has an attachment.
  // Bug 1819005.
  // tabmail.currentAbout3Pane.threadTree.selectedIndex = 5;
  // await helper.testItems({
  //   msgAttachmentMenu: { disabled: false },
  //   (plus the four items inside)
  // });
});

add_task(async function testMultiSelection() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: testFolder,
  });
  await new Promise(resolve => setTimeout(resolve));

  // These messages aren't marked as read or flagged, or have a tag.
  tabmail.currentAbout3Pane.threadTree.selectedIndices = [2, 4];
  await helper.testAllItems("multiSelection");

  // ONE of these messages IS marked as read and flagged, and it has a tag.
  tabmail.currentAbout3Pane.threadTree.selectedIndices = [1, 2, 4];
  await helper.testItems({
    markMenu: {},
    markReadMenuItem: {},
    markUnreadMenuItem: {},
    menu_markThreadAsRead: { disabled: true },
    markFlaggedMenuItem: { checked: true },
    tagMenu: {},
    "tagMenu-tagRemoveAll": {},
  });
});

add_task(async function testMessageTab() {
  tabmail.switchToTab(1);
  await helper.testAllItems("message");
});

add_task(async function testExternalMessageTab() {
  tabmail.switchToTab(2);
  await helper.testAllItems("externalMessage");
});

add_task(async function testContentTab() {
  tabmail.switchToTab(3);
  await helper.testAllItems("contentTab");
});
