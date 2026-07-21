/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test functionality in the message header.
 */

"use strict";

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const MESSENGER_WINDOW = "chrome://messenger/content/messenger.xhtml";

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { multiMessageBrowser, threadPane, threadTree } = about3Pane;
let rootFolder, testFolder, testMessages;

const customizeData = {
  showAvatar: true,
  showBigAvatar: false,
  showFullAddress: true,
  hideLabels: true,
  subjectLarge: true,
  buttonStyle: "default",
};

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.prefersReducedMotion", 1]],
  });
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder = rootFolder
    .createLocalSubfolder("threads")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 20, msgsPerThread: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  about3Pane.displayFolder(testFolder.URI);
  goDoCommand("cmd_collapseAllThreads");

  await new Promise(about3Pane.requestAnimationFrame);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
    Services.xulStore.removeDocument(MESSENGER_WINDOW);
  });
});

add_task(async function testButtonsStyle() {
  info("Test that the header button styles follow the user's customization.");

  about3Pane.threadTree.selectedIndex = 0;
  const row = threadTree.getRowAtIndex(0);
  Assert.ok(
    row.classList.contains("collapsed"),
    "The thread row should be collapsed"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(multiMessageBrowser),
    "The multi message browser should be visible"
  );
  const headerBar =
    multiMessageBrowser.contentDocument.getElementById("headingWrapper");

  info("Check that icons + text is the current configuration.");
  Assert.ok(
    !headerBar.classList.contains("message-header-buttons-only-icons"),
    "The multi message header buttons aren't showing only icons"
  );
  Assert.ok(
    !headerBar.classList.contains("message-header-buttons-only-text"),
    "The multi message header buttons aren't showing only text"
  );

  info("Switch to only icons visible");

  customizeData.buttonStyle = "only-icons";
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    "messageHeader",
    "layout",
    JSON.stringify(customizeData)
  );
  // The multiMessageBrowser doesn't hot reload based on XUL store changes
  // because the user can't change those settings without accessing a single
  // message, so select another message to see the changes reflected.
  about3Pane.threadTree.selectedIndex = 1;
  await new Promise(about3Pane.requestAnimationFrame);
  Assert.ok(
    headerBar.classList.contains("message-header-buttons-only-icons"),
    "The multi message header buttons are showing only icons"
  );

  info("Switch to only text visible");

  customizeData.buttonStyle = "only-text";
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    "messageHeader",
    "layout",
    JSON.stringify(customizeData)
  );
  about3Pane.threadTree.selectedIndex = 2;
  await new Promise(about3Pane.requestAnimationFrame);
  Assert.ok(
    headerBar.classList.contains("message-header-buttons-only-text"),
    "The multi message header buttons are showing only text"
  );

  info("Switch back to default style");

  customizeData.buttonStyle = "default";
  Services.xulStore.setValue(
    MESSENGER_WINDOW,
    "messageHeader",
    "layout",
    JSON.stringify(customizeData)
  );
  about3Pane.threadTree.selectedIndex = 0;
  await new Promise(about3Pane.requestAnimationFrame);

  Assert.ok(
    !headerBar.classList.contains("message-header-buttons-only-icons"),
    "The multi message header buttons aren't showing only icons"
  );
  Assert.ok(
    !headerBar.classList.contains("message-header-buttons-only-text"),
    "The multi message header buttons aren't showing only text"
  );
});

add_task(async function testStarredButtonReactivity() {
  info("Mark thread flagged and see if the icon turns on.");

  let row = threadTree.getRowAtIndex(1);
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".button-star"),
    {},
    about3Pane
  );
  about3Pane.threadTree.selectedIndex = 1;
  await new Promise(about3Pane.requestAnimationFrame);
  const starButton =
    multiMessageBrowser.contentDocument.getElementById("starMessageButton");
  Assert.ok(
    starButton.classList.contains("flagged"),
    "The thread is flagged so the multi message header Star button should be flagged."
  );
  about3Pane.threadTree.selectedIndex = 0;

  info("Mark thread unflagged and see if the icon turns off.");

  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".button-star"),
    {},
    about3Pane
  );
  about3Pane.threadTree.selectedIndex = 1;
  await new Promise(about3Pane.requestAnimationFrame);
  Assert.ok(
    !starButton.classList.contains("flagged"),
    "The thread is unflagged so the multi message header Star button should not be flagged."
  );

  info("Open thread and mark single message flagged, the icon should be off");

  goDoCommand("cmd_expandAllThreads");
  await new Promise(about3Pane.requestAnimationFrame);

  row = threadTree.getRowAtIndex(0);
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".button-star"),
    {},
    about3Pane
  );

  goDoCommand("cmd_collapseAllThreads");
  await new Promise(about3Pane.requestAnimationFrame);
  about3Pane.threadTree.selectedIndex = 0;

  Assert.ok(
    !starButton.classList.contains("flagged"),
    "Only the first message of the thread is flagged so the multi message header Star button should not be flagged."
  );

  info("Test that clicking on the star button in the multi message view works");

  about3Pane.threadTree.selectedIndex = 1;
  EventUtils.synthesizeMouseAtCenter(
    starButton,
    {},
    multiMessageBrowser.contentWindow
  );
  await new Promise(about3Pane.requestAnimationFrame);
  row = threadTree.getRowAtIndex(1);
  Assert.ok(
    row.dataset.properties.includes("flagged"),
    "The thread should have been starred."
  );

  EventUtils.synthesizeMouseAtCenter(
    starButton,
    {},
    multiMessageBrowser.contentWindow
  );
  await new Promise(about3Pane.requestAnimationFrame);
  row = threadTree.getRowAtIndex(1);
  Assert.ok(
    !row.dataset.properties.includes("flagged"),
    "The thread should not be starred."
  );
});
