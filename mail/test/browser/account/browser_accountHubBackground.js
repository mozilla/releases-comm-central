/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
  Ci.nsIMsgDBService
);

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let testFolder;

add_setup(async function () {
  const generator = new MessageGenerator();
  const rootFolder =
    MailServices.accounts.localFoldersServer.rootFolder.QueryInterface(
      Ci.nsIMsgLocalMailFolder
    );

  testFolder = rootFolder
    .createLocalSubfolder("Test Mail")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );

  about3Pane.displayFolder(testFolder);

  about3Pane.threadTree.selectedIndex = 0;

  await TestUtils.waitForCondition(
    () =>
      about3Pane.messageBrowser.contentDocument.readyState == "complete" &&
      about3Pane.messageBrowser.currentURI.spec == "about:message"
  );

  if (!about3Pane.messageBrowser.contentWindow.msgLoaded) {
    await BrowserTestUtils.waitForEvent(
      about3Pane.messageBrowser.contentWindow,
      "MsgLoaded"
    );
  }

  registerCleanupFunction(() => {
    about3Pane.messagePane.clearAll();
    MailServices.junk.resetTrainingData();
    testFolder.deleteSelf(null);
    rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash).emptyTrash(null);
  });
});

async function toggleSpam(card) {
  const button = card.querySelector(".button-spam");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(button),
    "spam icon should be hidden"
  );

  EventUtils.sendChar("j", window);

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(button),
    "spam icon should be visible"
  );

  EventUtils.sendChar("J", window);

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(button),
    "spam icon should be hidden"
  );
}

async function checkAccountHubInteraction(card, closeMethod) {
  EventUtils.synthesizeMouseAtCenter(card, {}, about3Pane);

  await window.openAccountHub();

  EventUtils.synthesizeMouseAtCenter(
    document
      .querySelector("account-hub-container")
      .shadowRoot.querySelector("account-hub-footer"),
    {},
    window
  );

  EventUtils.sendChar("j", window);

  // Because marking as junk is async, takes actual time, and we are waiting
  // to make sure it does NOT happen, all we can do is wait a set amount of time
  // and check that it has still not happened.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  Assert.ok(
    BrowserTestUtils.isHidden(card.querySelector(".button-spam")),
    "spam icon should be hidden"
  );

  const dialog = document
    .querySelector("account-hub-container")
    .shadowRoot.querySelector("dialog");

  const dialogCloseEvent = BrowserTestUtils.waitForEvent(dialog, "close");

  if (closeMethod === "ESCAPE") {
    EventUtils.sendKey("ESCAPE", window);
  } else if (closeMethod === "button") {
    EventUtils.synthesizeMouseAtCenter(
      document
        .querySelector("account-hub-container")
        .shadowRoot.querySelector(".account-hub-step:not([hidden])")
        .shadowRoot.querySelector("account-hub-header")
        .shadowRoot.getElementById("closeButton"),
      {},
      window
    );
  } else if (closeMethod === "close") {
    document.querySelector("account-hub-container").modal.close();
  } else {
    const closeEvent = new CustomEvent("request-close", {
      bubbles: true,
      composed: true,
    });
    document
      .querySelector("account-hub-container")
      .modal.dispatchEvent(closeEvent);
  }

  await dialogCloseEvent;
}

add_task(async function testBackgroundKeyboardCommands() {
  const card = about3Pane.threadTree.querySelector(`tr[is="thread-card"]`);
  // Ensure keyboard commands are enabled.
  await toggleSpam(card);

  // Ensure keyboard commands are disabled when account hub opens.
  await checkAccountHubInteraction(card, "ESCAPE");

  // Ensure keyboard commands are re-enabled after close via escape key.
  await toggleSpam(card);

  // Ensure keyboard commands are disabled again when re-openings.
  await checkAccountHubInteraction(card, "button");

  // Ensure keyboard commands are re-enabled after close via close button.
  await toggleSpam(card);

  // Ensure keyboard commands are disabled again when re-openings.
  await checkAccountHubInteraction(card, "request-close");

  // Ensure keyboard commands are re-enabled after close via request-close event.
  await toggleSpam(card);

  // Ensure keyboard commands are disabled again when re-openings.
  await checkAccountHubInteraction(card, "close");

  // Ensure keyboard commands are re-enabled after close via close method.
  await toggleSpam(card);
});
