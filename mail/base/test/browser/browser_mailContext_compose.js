/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that composition items on the mail context menu work.
 */

requestLongerTimeout(3);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { NNTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/NNTPServer.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { displayFolder, messageBrowser, threadTree } = about3Pane;

let testMessages, draftMessage, templateMessage, nntpMessage;

add_setup(async function () {
  const generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  const testFolder = rootFolder
    .createLocalSubfolder("mailContext compose")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5, msgsPerThread: 5 })
      .map(message => message.toMessageString())
  );
  testFolder.addMessage(
    generator
      .makeMessage({
        clobberHeaders: { "List-Post": "<mailto:list@example.com>" },
      })
      .toMessageString()
  );
  testMessages = [...testFolder.messages];

  const draftsFolder = rootFolder
    .createLocalSubfolder("mailContext composeDrafts")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  draftsFolder.setFlag(Ci.nsMsgFolderFlags.Drafts);
  draftsFolder.addMessage(generator.makeMessage().toMessageString());
  draftMessage = draftsFolder.messages.getNext();

  const templatesFolder = rootFolder
    .createLocalSubfolder("mailContext composeTemplates")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  templatesFolder.setFlag(Ci.nsMsgFolderFlags.Templates);
  templatesFolder.addMessage(generator.makeMessage().toMessageString());
  templateMessage = templatesFolder.messages.getNext();

  const nntpServer = new NNTPServer();
  nntpServer.addGroup("mailContext.compose");
  nntpServer.addMessages("mailContext.compose", [generator.makeMessage()]);
  const nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpAccount.incomingServer.port = nntpServer.port;
  const nntpRootFolder = nntpAccount.incomingServer.rootFolder;
  nntpRootFolder.createSubfolder("mailContext.compose", null);
  const nntpFolder = nntpRootFolder.getChildNamed("mailContext.compose");
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  nntpAccount.incomingServer.getNewMessages(
    nntpFolder,
    window.msgWindow,
    urlListener
  );
  await urlListener.promise;
  nntpMessage = nntpFolder.messages.getNext();

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    Services.prefs.clearUserPref("mail.tabs.loadInBackground");
    Services.prefs.clearUserPref("mail.forward_message_mode");
  });
});

/**
 * Tests the mailContext menu on the thread tree.
 */
add_task(async function testThreadPane() {
  const mailContext = about3Pane.document.getElementById("mailContext");

  async function openMenu() {
    EventUtils.synthesizeMouseAtCenter(
      threadTree.getRowAtIndex(threadTree.currentIndex),
      { type: "contextmenu" },
      about3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
    return mailContext;
  }

  await subtestSingleMessage({
    async openMessage(message) {
      displayFolder(message.folder);
      threadTree.selectedIndex = about3Pane.gDBView.findIndexOfMsgHdr(
        message,
        true
      );
      await messageLoadedIn(messageBrowser);
    },
    openMenu,
    closeMessage() {},
  });

  displayFolder(testMessages[0].folder);
  goDoCommand("cmd_expandAllThreads");
  threadTree.selectedIndices = [0, 5];
  await promiseComposeWindow(
    openMenu,
    "mailContext-multiForwardAsAttachment",
    Ci.nsIMsgCompType.ForwardAsAttachment,
    {
      attachments: [testMessages[0].subject, testMessages[5].subject],
    }
  );
});

/**
 * Tests the mailContext menu on the message pane.
 */
add_task(async function testMessagePane() {
  const aboutMessage = messageBrowser.contentWindow;
  const mailContext = about3Pane.document.getElementById("mailContext");

  await subtestSingleMessage({
    async openMessage(message) {
      displayFolder(message.folder);
      threadTree.selectedIndex = about3Pane.gDBView.findIndexOfMsgHdr(
        message,
        true
      );
      await messageLoadedIn(messageBrowser);
    },
    async openMenu() {
      BrowserTestUtils.synthesizeMouseAtCenter(
        "body",
        { type: "contextmenu" },
        aboutMessage.getMessagePaneBrowser()
      );
      await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
      return mailContext;
    },
    closeMessage() {},
  });
});

/**
 * Tests the mailContext menu on the message pane of a message in a tab.
 */
add_task(async function testMessageTab() {
  await subtestSingleMessage({
    async openMessage(message) {
      const tabPromise = BrowserTestUtils.waitForEvent(
        tabmail.tabContainer,
        "TabOpen"
      );
      window.OpenMessageInNewTab(message, { background: false });
      const {
        detail: { tabInfo },
      } = await tabPromise;
      await messageLoadedIn(tabInfo.chromeBrowser);

      this.tabInfo = tabInfo;
    },
    async openMenu() {
      const aboutMessage = tabmail.currentAboutMessage;
      const mailContext = aboutMessage.document.getElementById("mailContext");

      BrowserTestUtils.synthesizeMouseAtCenter(
        "body",
        { type: "contextmenu" },
        aboutMessage.getMessagePaneBrowser()
      );
      await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
      return mailContext;
    },
    closeMessage() {
      tabmail.closeTab(this.tabInfo);
    },
  });
});

/**
 * Tests the mailContext menu on the message pane of a message in a window.
 */
add_task(async function testMessageWindow() {
  await subtestSingleMessage({
    async openMessage(message) {
      const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
      window.MsgOpenNewWindowForMessage(message);
      const win = await winPromise;
      await messageLoadedIn(win.messageBrowser);
      await SimpleTest.promiseFocus(win);

      this.win = win;
    },
    async openMenu() {
      const aboutMessage = this.win.messageBrowser.contentWindow;
      const mailContext = aboutMessage.document.getElementById("mailContext");

      BrowserTestUtils.synthesizeMouseAtCenter(
        "body",
        { type: "contextmenu" },
        aboutMessage.getMessagePaneBrowser()
      );
      await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
      return mailContext;
    },
    async closeMessage() {
      await BrowserTestUtils.closeWindow(this.win);
    },
  });
});

async function promiseComposeWindow(
  openMenuCallback,
  itemId,
  expectedType,
  { to = [], replyTo = [], attachments = [] } = {}
) {
  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win =>
      win.document.documentURI ===
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
  const mailContext = await openMenuCallback();
  const item = mailContext.querySelector("#" + itemId);
  if (item.parentNode != mailContext) {
    item.closest("menu").openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(
      item.closest("menupopup"),
      "shown"
    );
  }
  mailContext.activateItem(item);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  const composeWindow = await composeWindowPromise;
  await SimpleTest.promiseFocus(composeWindow);
  await TestUtils.waitForCondition(() => composeWindow.gLoadingComplete);

  Assert.equal(composeWindow.gComposeType, expectedType);

  const toPills = composeWindow.document.querySelectorAll(
    "#toAddrContainer > mail-address-pill"
  );
  Assert.equal(toPills.length, to.length);
  for (let i = 0; i < to.length; i++) {
    Assert.equal(
      toPills[i].label,
      MailServices.headerParser.parseEncodedHeader(to[i])[0].toString()
    );
  }
  const replyToPills = composeWindow.document.querySelectorAll(
    "#replyAddrContainer > mail-address-pill"
  );
  Assert.equal(replyToPills.length, replyTo.length);
  for (let i = 0; i < replyTo.length; i++) {
    Assert.equal(
      replyToPills[i].label,
      MailServices.headerParser.parseEncodedHeader(replyTo[i])[0].toString()
    );
  }

  Assert.equal(composeWindow.gAttachmentBucket.itemCount, attachments.length);
  for (let i = 0; i < attachments.length; i++) {
    Assert.equal(
      composeWindow.gAttachmentBucket.getItemAtIndex(i).getAttribute("name"),
      attachments[i] + ".eml"
    );
  }

  await BrowserTestUtils.closeWindow(composeWindow);
  await SimpleTest.promiseFocus(mailContext.ownerGlobal.top);
}

async function subtestSingleMessage(callbacks) {
  const openMessage = callbacks.openMessage.bind(callbacks);
  const openMenu = callbacks.openMenu.bind(callbacks);
  const closeMessage = callbacks.closeMessage.bind(callbacks);

  await openMessage(testMessages[0]);
  await promiseComposeWindow(
    openMenu,
    "mailContext-replySender",
    Ci.nsIMsgCompType.ReplyToSender,
    { to: [testMessages[0].author] }
  );
  await promiseComposeWindow(
    openMenu,
    "mailContext-replyAll",
    Ci.nsIMsgCompType.ReplyAll,
    { to: [testMessages[0].author, testMessages[0].recipients] }
  );

  Services.prefs.setIntPref("mail.forward_message_mode", 0);
  await promiseComposeWindow(
    openMenu,
    "mailContext-forward",
    Ci.nsIMsgCompType.ForwardAsAttachment,
    { attachments: [testMessages[0].subject] }
  );
  await promiseComposeWindow(
    openMenu,
    "mailContext-forwardAsInline",
    Ci.nsIMsgCompType.ForwardInline
  );

  Services.prefs.setIntPref("mail.forward_message_mode", 1);
  await promiseComposeWindow(
    openMenu,
    "mailContext-forward",
    Ci.nsIMsgCompType.ForwardInline
  );
  await promiseComposeWindow(
    openMenu,
    "mailContext-forwardAsAttachment",
    Ci.nsIMsgCompType.ForwardAsAttachment,
    { attachments: [testMessages[0].subject] }
  );

  await promiseComposeWindow(
    openMenu,
    "mailContext-redirect",
    Ci.nsIMsgCompType.Redirect,
    { replyTo: [testMessages[0].author] }
  );

  await promiseComposeWindow(
    openMenu,
    "mailContext-editAsNew",
    Ci.nsIMsgCompType.EditAsNew,
    { to: [testMessages[0].recipients] }
  );
  await closeMessage();

  await openMessage(testMessages[5]);
  await promiseComposeWindow(
    openMenu,
    "mailContext-replyList",
    Ci.nsIMsgCompType.ReplyToList,
    { to: ["list@example.com"] }
  );
  await closeMessage();

  await openMessage(draftMessage);
  await promiseComposeWindow(
    openMenu,
    "mailContext-editDraftMsg",
    Ci.nsIMsgCompType.Draft,
    { to: [draftMessage.recipients] }
  );
  await closeMessage();

  await openMessage(templateMessage);
  await promiseComposeWindow(
    openMenu,
    "mailContext-newMsgFromTemplate",
    Ci.nsIMsgCompType.Template,
    { to: [templateMessage.recipients] }
  );
  await promiseComposeWindow(
    openMenu,
    "mailContext-editTemplateMsg",
    Ci.nsIMsgCompType.EditTemplate,
    { to: [templateMessage.recipients] }
  );
  await closeMessage();

  await openMessage(nntpMessage);
  await promiseComposeWindow(
    openMenu,
    "mailContext-replyNewsgroup",
    Ci.nsIMsgCompType.ReplyToGroup
  );
  await closeMessage();
}
