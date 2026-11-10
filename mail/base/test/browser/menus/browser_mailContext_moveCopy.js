/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests context menu items that move or copy messages.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const threadTree = about3Pane.threadTree;
const mailContext = about3Pane.document.getElementById("mailContext");
const moveAgainItem = about3Pane.document.getElementById(
  "mailContext-moveToFolderAgain"
);
const moveMenu = about3Pane.document.getElementById("mailContext-moveMenu");
const copyMenu = about3Pane.document.getElementById("mailContext-copyMenu");

let sourceFolder, destFolder;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;

  sourceFolder = await rootFolder.createSubfolderAsync("mailContextSource");
  sourceFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  sourceFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  destFolder = await rootFolder.createSubfolderAsync("mailContextDest");

  about3Pane.restoreState({
    folderURI: sourceFolder.URI,
    messagePaneVisible: false,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Perform a move or copy operation and check that it happened correctly.
 *
 * @param {Function} callback - A callback that triggers the operation.
 * @param {boolean} isMove - If this is a move operation (not a copy).
 * @param {number} count - The number of messages to be moved/copied.
 */
async function subtest(callback, isMove, count) {
  const sourceCount = sourceFolder.getTotalMessages(false);
  const destCount = destFolder.getTotalMessages(false);
  destFolder.setStringProperty("MRMTime", "1234567890");
  const notification = PromiseTestUtils.promiseFolderNotification(
    destFolder,
    "msgsMoveCopyCompleted"
  );

  await callback();

  const [opIsMove, sourceMessages, opDestFolder, destMessages] =
    await notification;
  Assert.equal(opIsMove, isMove, "operation type");
  Assert.equal(sourceMessages.length, count, "source message count");
  Assert.equal(opDestFolder, destFolder, "dest folder");
  Assert.equal(destMessages.length, count, "dest message count");

  await new Promise(resolve => setTimeout(resolve));
  Assert.equal(
    sourceFolder.getTotalMessages(false),
    isMove ? sourceCount - count : sourceCount,
    "messages remaining in source folder"
  );
  Assert.equal(
    destFolder.getTotalMessages(false),
    destCount + count,
    "messages in dest folder"
  );

  Assert.equal(
    Services.prefs.getStringPref("mail.last_msg_movecopy_target_uri"),
    destFolder.URI,
    "dest folder URI should have been saved to prefs"
  );
  Assert.equal(
    Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move"),
    isMove,
    "operation type should have been saved to prefs"
  );
  Assert.greater(
    parseInt(destFolder.getStringProperty("MRMTime"), 10),
    1234567890,
    "dest folder modification time should have been updated"
  );
}

/**
 * Perform a move/copy operation by picking a folder from the context menu.
 *
 * @param {XULMenuElement} menu - Which submenu to use.
 * @param {boolean} isMove - If this is a move operation (not a copy).
 * @param {number} count - The number of messages to be moved/copied.
 */
async function subtestFolderPicker(menu, isMove, count) {
  async function selectFolder(submenu, folder) {
    if (folder.parent) {
      submenu = await selectFolder(submenu, folder.parent);
    }

    const popup = submenu.menupopup;
    await BrowserTestUtils.waitForPopupEvent(popup, "shown");
    const item = [...popup.children].find(c => c._folder == folder);
    if (item.localName == "menu") {
      item.openMenu(true);
      return item;
    }

    popup.activateItem(item);
    return null;
  }

  await SpecialPowers.pushPrefEnv({
    clear: [
      "mail.last_msg_movecopy_target_uri",
      "mail.last_msg_movecopy_was_move",
    ],
  });
  await subtest(
    async function () {
      EventUtils.synthesizeMouseAtCenter(
        threadTree.getRowAtIndex(threadTree.selectedIndex),
        { type: "contextmenu" },
        about3Pane
      );

      await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
      menu.openMenu(true);
      await selectFolder(menu, destFolder);
      await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
    },
    isMove,
    count
  );
  await SpecialPowers.popPrefEnv();
}

/**
 * Test a move operation by picking a folder from the context menu.
 */
add_task(async function testMove() {
  threadTree.selectedIndices = [0, 3, 9];
  await subtestFolderPicker(moveMenu, true, 3);
});

/**
 * Test a copy operation by picking a folder from the context menu.
 */
add_task(async function testCopy() {
  threadTree.selectedIndices = [4, 6];
  await subtestFolderPicker(copyMenu, false, 2);
});

/**
 * Test the "move/copy to ... again" menu item.
 *
 * @param {string} fluentID - The Fluent string the menu item should have.
 * @param {boolean} isMove - If this is a move operation (not a copy).
 */
async function subtestAgainItem(fluentID, isMove) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.last_msg_movecopy_target_uri", destFolder.URI],
      ["mail.last_msg_movecopy_was_move", isMove],
    ],
  });
  await subtest(
    async function () {
      EventUtils.synthesizeMouseAtCenter(
        threadTree.getRowAtIndex(2),
        { type: "contextmenu" },
        about3Pane
      );

      await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
      Assert.ok(
        BrowserTestUtils.isVisible(moveAgainItem),
        "move again item should be visible"
      );
      mailContext.activateItem(moveAgainItem);
      Assert.deepEqual(
        mailContext.ownerDocument.l10n.getAttributes(moveAgainItem),
        {
          id: fluentID,
          args: { folderName: "mailContextDest" },
        },
        "move again item should have the right label"
      );
      await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
    },
    isMove,
    1
  );
  await SpecialPowers.popPrefEnv();
}

/**
 * Test a move operation using the "Move to ... again" menu item.
 */
add_task(async function testMoveAgain() {
  await subtestAgainItem("menu-move-to-folder-again", true);
});

/**
 * Test a copy operation using the "Copy to ... again" menu item.
 */
add_task(async function testCopyAgain() {
  await subtestAgainItem("menu-copy-to-folder-again", false);
});
