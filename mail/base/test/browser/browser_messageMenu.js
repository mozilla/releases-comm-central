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
  replyMainMenu: { disabled: nothingSelected },
  replyNewsgroupMainMenu: { hidden: true },
  replySenderMainMenu: { hidden: true },
  menu_replyToAll: { disabled: nothingSelected },
  menu_replyToList: { disabled: true },
  menu_forwardMsg: { disabled: nothingSelected },
  forwardAsMenu: { disabled: nothingSelected },
  menu_forwardAsInline: { disabled: nothingSelected },
  menu_forwardAsAttachment: { disabled: nothingSelected },
  menu_redirectMsg: { disabled: nothingSelected },
  menu_editMsgAsNew: { disabled: nothingSelected },
  menu_editDraftMsg: { hidden: true },
  menu_newMsgFromTemplate: { hidden: true },
  menu_editTemplate: { hidden: true },
  openMessageWindowMenuitem: {
    disabled: [...nothingSelected, "message", "externalMessage"],
  },
  openConversationMenuitem: {
    disabled: [...nothingOrMultiSelected, "externalMessage"],
  },
  openFeedMessage: { hidden: true },
  menu_openFeedWebPage: { disabled: nothingSelected },
  menu_openFeedSummary: { disabled: nothingSelected },
  menu_openFeedWebPageInMessagePane: {
    disabled: nothingSelected,
  },
  msgAttachmentMenu: { disabled: true },
  tagMenu: { disabled: [...nothingSelected, "externalMessage"] },
  "tagMenu-addNewTag": { disabled: nothingSelected },
  "tagMenu-manageTags": { disabled: nothingSelected },
  "tagMenu-tagRemoveAll": { disabled: nothingSelected },
  markMenu: { disabled: ["rootFolder", "externalMessage", "contentTab"] },
  markReadMenuItem: { disabled: nothingSelected },
  markUnreadMenuItem: { disabled: true },
  menu_markThreadAsRead: { disabled: nothingSelected },
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
const helper = new MenuTestHelper("messageMenu", messageMenuData);

const tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, testMessages;
let draftsFolder, draftsMessages, templatesFolder, templatesMessages;

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("messageMenu", null);
  testFolder = rootFolder
    .getChildNamed("messageMenu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const messages = [
    ...generator.makeMessages({ count: 5 }),
    ...generator.makeMessages({ count: 5, msgsPerThread: 5 }),
  ];
  testFolder.addMessageBatch(
    messages.map(message => message.toMessageString())
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
      .toMessageString()
  );
  testFolder.addMessage(
    "From - Mon Jan 01 00:00:00 2001\n" +
      "To: Mailing List <list@example.com>\n" +
      "Date: Mon, 01 Jan 2001 00:00:00 +0100\n" +
      "List-Help: <https://list.example.com>\n" +
      "List-Post: <mailto:list@example.com>\n" +
      "List-Software: Mailing List Software\n" +
      "List-Subscribe: <https://subscribe.example.com>\n" +
      "Precedence: list\n" +
      "Subject: Mailing List Test Mail\n" +
      `Message-ID: <${Date.now()}@example.com>\n` +
      "From: Mailing List <list@example.com>\n" +
      "List-Unsubscribe: <https://unsubscribe.example.com>,\n" +
      " <mailto:unsubscribe@example.com?subject=Unsubscribe Test>\n" +
      "MIME-Version: 1.0\n" +
      "Content-Type: text/plain; charset=UTF-8\n" +
      "Content-Transfer-Encoding: quoted-printable\n" +
      "\n" +
      "Mailing List Message Body\n"
  );
  testMessages = [...testFolder.messages];

  rootFolder.createSubfolder("messageMenuDrafts", null);
  draftsFolder = rootFolder
    .getChildNamed("messageMenuDrafts")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  draftsFolder.setFlag(Ci.nsMsgFolderFlags.Drafts);
  draftsFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  draftsMessages = [...draftsFolder.messages];
  rootFolder.createSubfolder("messageMenuTemplates", null);
  templatesFolder = rootFolder
    .getChildNamed("messageMenuTemplates")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  templatesFolder.setFlag(Ci.nsMsgFolderFlags.Templates);
  templatesFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  templatesMessages = [...templatesFolder.messages];

  window.OpenMessageInNewTab(testMessages[0], { background: true });
  await BrowserTestUtils.waitForEvent(
    tabmail.tabInfo[1].chromeBrowser,
    "MsgLoaded"
  );

  const messageFile = new FileUtils.File(
    getTestFilePath("files/sampleContent.eml")
  );
  const messageURI =
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
  tabmail.currentAbout3Pane.threadTree.selectedIndex = 6;
  await BrowserTestUtils.browserLoaded(
    tabmail.currentAboutMessage.getMessagePaneBrowser()
  );

  await helper.testItems({
    msgAttachmentMenu: {},
    "menu-openAllAttachments": {},
    "menu-saveAllAttachments": {},
    "menu-detachAllAttachments": {},
    "menu-deleteAllAttachments": {},
  });

  // This message is from a mailing list.
  tabmail.currentAbout3Pane.threadTree.selectedIndex = 7;
  await BrowserTestUtils.browserLoaded(
    tabmail.currentAboutMessage.getMessagePaneBrowser()
  );
  await helper.testItems({
    menu_replyToList: { disabled: false },
  });

  // FIXME: Select another message and wait for it load in order to properly
  // clear about:message.
  tabmail.currentAbout3Pane.threadTree.selectedIndex = 1;
  await BrowserTestUtils.browserLoaded(
    tabmail.currentAboutMessage.getMessagePaneBrowser()
  );
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
    menu_markThreadAsRead: { disabled: false },
    markFlaggedMenuItem: { checked: true },
    tagMenu: {},
    "tagMenu-tagRemoveAll": {},
  });

  // Messages in a collapsed thread.
  tabmail.currentAbout3Pane.threadTree.selectedIndex = 5;
  await helper.testItems({
    replyMainMenu: { disabled: true },
    menu_replyToAll: { disabled: true },
    menu_redirectMsg: { disabled: true },
    menu_editMsgAsNew: { disabled: true },
  });
});

add_task(async function testDraftsFolder() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: draftsFolder,
  });
  await new Promise(resolve => setTimeout(resolve));

  tabmail.currentAbout3Pane.threadTree.selectedIndices = [1, 2, 4];
  await helper.testItems({
    menu_editDraftMsg: { hidden: false },
  });
  tabmail.currentAbout3Pane.threadTree.selectedIndices = [3];
  await helper.testItems({
    menu_editDraftMsg: { hidden: false },
  });
});

add_task(async function testTemplatesFolder() {
  tabmail.currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: templatesFolder,
  });
  await new Promise(resolve => setTimeout(resolve));

  tabmail.currentAbout3Pane.threadTree.selectedIndices = [1, 2, 4];
  await helper.testItems({
    menu_newMsgFromTemplate: { hidden: false },
    menu_editTemplate: { hidden: false },
  });
  tabmail.currentAbout3Pane.threadTree.selectedIndices = [3];
  await helper.testItems({
    menu_newMsgFromTemplate: { hidden: false },
    menu_editTemplate: { hidden: false },
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
