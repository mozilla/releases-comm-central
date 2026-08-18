/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a folder's color follows the folder when its URI changes, which
 * happens when the folder or one of its ancestors is renamed. Renaming a folder
 * whose name is a prefix of a sibling's name must leave the sibling alone.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { folderPane, folderTree } = about3Pane;

let imapRootFolder, localRootFolder;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["ui.prefersReducedMotion", 1],
      // Temporarily disable the new HTML color picker for this test.
      // See bug 2007435 for adapting the tests to the new picker behavior.
      ["dom.forms.html_color_picker.enabled", false],
    ],
  });
  FolderTreeProperties.resetColors();

  const imapAccount = MailServices.accounts.createAccount();
  const imapServer = new IMAPServer({ username: `${imapAccount.key}user` });
  imapServer.daemon.getMailbox("INBOX").specialUseFlag = "\\Inbox";
  imapServer.daemon.getMailbox("INBOX").subscribed = true;
  for (const name of [
    "dialogRename",
    "contextRename",
    "menuRename",
    "imapMoveSource",
    "imapMoveTarget",
  ]) {
    imapServer.daemon.createMailbox(name, { subscribed: true });
  }

  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.password = "password";
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapAccount.incomingServer.performExpand(window.msgWindow);
  await TestUtils.waitForCondition(
    () => imapRootFolder.getChildNamed("imapMoveTarget"),
    "waiting for the IMAP folders to be discovered"
  );

  const localAccount = MailServices.accounts.createLocalMailAccount();
  localRootFolder = localAccount.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  localRootFolder
    .createLocalSubfolder("renameParent")
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("renameChild");
  localRootFolder.createLocalSubfolder("moveTarget");
  localRootFolder.createLocalSubfolder("clashSource");
  localRootFolder.createLocalSubfolder("clashTarget");
  localRootFolder.createLocalSubfolder("test");
  localRootFolder.createLocalSubfolder("test1");

  const rootRow = folderPane.getRowForFolder(imapRootFolder);
  folderTree.expandRow(rootRow);
  await TestUtils.waitForCondition(
    () =>
      folderPane.getRowForFolder(imapRootFolder.getChildNamed("dialogRename")),
    "waiting for the folder pane rows"
  );

  registerCleanupFunction(async () => {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(imapAccount, false);
    MailServices.accounts.removeAccount(localAccount, false);
    FolderTreeProperties.resetColors();
  });
});

/**
 * Get the folder pane row for a folder, expanding rows as needed.
 *
 * @param {nsIMsgFolder} folder
 * @returns {Promise<Element>}
 */
async function rowForFolder(folder) {
  await TestUtils.waitForCondition(() => {
    for (const row of folderTree.querySelectorAll(".collapsed")) {
      folderTree.expandRow(row);
    }
    return folderPane.getRowForFolder(folder);
  }, `waiting for a folder pane row for ${folder.URI}`);
  return folderPane.getRowForFolder(folder);
}

/**
 * Assert that a folder has a color, that the folder pane agrees, and that
 * nothing is left behind under a URI the folder no longer has.
 *
 * @param {nsIMsgFolder} folder
 * @param {string} color
 * @param {string} abandonedURI
 * @param {string} action - What was done to the folder, for the messages.
 */
async function assertColor(folder, color, abandonedURI, action) {
  Assert.equal(
    FolderTreeProperties.getColor(folder.URI),
    color,
    `After ${action}, the color property should be correct`
  );
  Assert.equal(
    FolderTreeProperties.getColor(abandonedURI),
    undefined,
    `After ${action}, no color property should be left under the previous URI`
  );
  const row = await rowForFolder(folder);
  Assert.equal(
    row.icon.style.getPropertyValue("--icon-color"),
    color,
    `After ${action}, the --icon-color property should be correct`
  );
}

/**
 * Open the folder properties dialog for a folder, via the context menu.
 *
 * @param {nsIMsgFolder} folder
 */
async function openFolderProperties(folder) {
  const row = await rowForFolder(folder);
  const folderPaneContext =
    about3Pane.document.getElementById("folderPaneContext");

  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");
  const windowOpenedPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  await TestUtils.waitForTick();
  folderPaneContext.activateItem(
    about3Pane.document.getElementById("folderPaneContext-properties")
  );
  const popupClose = BrowserTestUtils.waitForPopupEvent(
    folderPaneContext,
    "hidden"
  );
  const dialogWindow = await windowOpenedPromise;
  const dialogDocument = dialogWindow.document;
  const colorInput = dialogDocument.getElementById("color");
  const nameInput = dialogDocument.getElementById("name");

  return {
    async setColor(hex) {
      SpecialPowers.MockColorPicker.init(dialogWindow);
      SpecialPowers.MockColorPicker.returnColor = hex;
      const inputPromise = BrowserTestUtils.waitForEvent(colorInput, "input");
      EventUtils.synthesizeMouseAtCenter(colorInput, {}, dialogWindow);
      await inputPromise;
      SpecialPowers.MockColorPicker.cleanup();
    },
    setName(name) {
      nameInput.value = name;
      nameInput.dispatchEvent(new dialogWindow.Event("input"));
    },
    /**
     * Accept the dialog when the rename is refused. The alert is dismissed and
     * the dialog stays open, so it has to be cancelled afterwards.
     */
    async acceptExpectingRefusal() {
      await SimpleTest.promiseFocus(dialogWindow);
      const alertPromise = BrowserTestUtils.promiseAlertDialog("accept");
      EventUtils.synthesizeMouseAtCenter(
        dialogDocument.querySelector("dialog").getButton("accept"),
        {},
        dialogWindow
      );
      await alertPromise;
      Assert.ok(
        !dialogWindow.closed,
        "The properties dialog should stay open when the rename is refused"
      );
      return this.cancel();
    },
    async cancel() {
      const windowClosedPromise =
        BrowserTestUtils.domWindowClosed(dialogWindow);
      EventUtils.synthesizeMouseAtCenter(
        dialogDocument.querySelector("dialog").getButton("cancel"),
        {},
        dialogWindow
      );
      await windowClosedPromise;
      await BrowserTestUtils.waitForAttributeRemoval(
        "inert",
        about3Pane.document.documentElement
      );
      await popupClose;
      await SimpleTest.promiseFocus(window);
    },
    async accept() {
      await SimpleTest.promiseFocus(dialogWindow);
      const windowClosedPromise =
        BrowserTestUtils.domWindowClosed(dialogWindow);
      EventUtils.synthesizeMouseAtCenter(
        dialogDocument.querySelector("dialog").getButton("accept"),
        {},
        dialogWindow
      );
      await windowClosedPromise;
      await BrowserTestUtils.waitForAttributeRemoval(
        "inert",
        about3Pane.document.documentElement
      );
      await popupClose;
      await SimpleTest.promiseFocus(window);
    },
  };
}

/**
 * Rename a folder with the folder pane context menu.
 *
 * @param {nsIMsgFolder} folder
 * @param {string} newName
 */
async function contextMenuRename(folder, newName) {
  const row = await rowForFolder(folder);
  const folderPaneContext =
    about3Pane.document.getElementById("folderPaneContext");

  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    {},
    about3Pane
  );
  const renameDialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/renameFolderDialog.xhtml",
    {
      callback(dialogWindow) {
        const nameInput = dialogWindow.document.getElementById("name");
        nameInput.value = newName;
        nameInput.dispatchEvent(new dialogWindow.Event("input"));
        dialogWindow.document
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");
  folderPaneContext.activateItem(
    about3Pane.document.getElementById("folderPaneContext-rename")
  );
  await renameDialogPromise;
  await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "hidden");
}

/**
 * Wait for a folder to appear under a parent.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 * @returns {Promise<nsIMsgFolder>}
 */
async function waitForFolder(parent, name) {
  await TestUtils.waitForCondition(
    () => parent.getChildNamed(name),
    `waiting for ${name} to appear under ${parent.name}`
  );
  return parent.getChildNamed(name);
}

/**
 * Copy or move a folder to a new parent.
 *
 * @param {nsIMsgFolder} folder
 * @param {nsIMsgFolder} newParent
 * @param {boolean} isMove
 * @returns {Promise<nsIMsgFolder>} The folder at its new location.
 */
async function copyFolder(folder, newParent, isMove) {
  const name = folder.name;
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(
    folder,
    newParent,
    isMove,
    copyListener,
    window.msgWindow
  );
  await copyListener.promise;
  return waitForFolder(newParent, name);
}

add_task(async function testRenameInPropertiesDialog() {
  const folder = imapRootFolder.getChildNamed("dialogRename");
  const oldURI = folder.URI;

  // Give the folder a color and save.
  let dialog = await openFolderProperties(folder);
  await dialog.setColor("#ff6600");
  await dialog.accept();

  // Reopen the dialog and change only the name.
  dialog = await openFolderProperties(folder);
  dialog.setName("dialogRenamed");
  await dialog.accept();

  const renamed = await waitForFolder(imapRootFolder, "dialogRenamed");
  await assertColor(
    renamed,
    "#ff6600",
    oldURI,
    "the folder was renamed from the properties dialog"
  );
});

add_task(async function testColorAndNameInOneVisit() {
  const folder = imapRootFolder.getChildNamed("contextRename");
  const oldURI = folder.URI;

  // Set the color and the new name in the same visit, so the color is stored
  // under the old URI moments before the rename.
  const dialog = await openFolderProperties(folder);
  await dialog.setColor("#0066cc");
  dialog.setName("contextRenamed");
  await dialog.accept();

  const renamed = await waitForFolder(imapRootFolder, "contextRenamed");
  await assertColor(
    renamed,
    "#0066cc",
    oldURI,
    "the color and the name were changed in one visit"
  );
});

add_task(async function testRenameInContextMenu() {
  const folder = imapRootFolder.getChildNamed("menuRename");
  const oldURI = folder.URI;
  FolderTreeProperties.setColor(folder.URI, "#0066cc");

  // Rename through the context menu instead of the properties dialog.
  await contextMenuRename(folder, "menuRenamed");

  const renamed = await waitForFolder(imapRootFolder, "menuRenamed");
  await assertColor(
    renamed,
    "#0066cc",
    oldURI,
    "the folder was renamed from the context menu"
  );
});

add_task(async function testRenamedParentCarriesSubfolders() {
  const parent = localRootFolder.getChildNamed("renameParent");
  const child = parent.getChildNamed("renameChild");
  const oldParentURI = parent.URI;
  const oldChildURI = child.URI;
  // Color the parent and its subfolder.
  FolderTreeProperties.setColor(parent.URI, "#112233");
  FolderTreeProperties.setColor(child.URI, "#445566");

  // Rename the parent, which changes the subfolder's URI as well.
  await contextMenuRename(parent, "renameParentRenamed");

  const renamedParent = await waitForFolder(
    localRootFolder,
    "renameParentRenamed"
  );
  await assertColor(
    renamedParent,
    "#112233",
    oldParentURI,
    "the parent folder was renamed"
  );
  await assertColor(
    renamedParent.getChildNamed("renameChild"),
    "#445566",
    oldChildURI,
    "the parent of this folder was renamed"
  );
});

add_task(async function testMovedIMAPFolder() {
  const source = imapRootFolder.getChildNamed("imapMoveSource");
  const oldURI = source.URI;
  FolderTreeProperties.setColor(source.URI, "#070809");

  // IMAP moves a folder by renaming it.
  const moved = await copyFolder(
    source,
    imapRootFolder.getChildNamed("imapMoveTarget"),
    true
  );

  await assertColor(
    moved,
    "#070809",
    oldURI,
    "the IMAP folder was moved to another parent"
  );
});

add_task(async function testRenameToAnExistingNameChangesNothing() {
  const source = localRootFolder.getChildNamed("clashSource");
  const target = localRootFolder.getChildNamed("clashTarget");
  const sourceURI = source.URI;
  const targetURI = target.URI;
  FolderTreeProperties.setColor(source.URI, "#131415");
  FolderTreeProperties.setColor(target.URI, "#161718");

  // Ask for a name that is already taken. The rename is refused, so no color
  // may move even though the dialog was accepted.
  const dialog = await openFolderProperties(source);
  dialog.setName("clashTarget");
  await dialog.acceptExpectingRefusal();

  Assert.equal(
    FolderTreeProperties.getColor(sourceURI),
    "#131415",
    "The folder that could not be renamed should keep its color"
  );
  Assert.equal(
    FolderTreeProperties.getColor(targetURI),
    "#161718",
    "The folder holding the wanted name should keep its own color"
  );
  Assert.equal(
    localRootFolder.getChildNamed("clashSource").URI,
    sourceURI,
    "The folder should not have been renamed"
  );
});

add_task(async function testSiblingWithSharedNamePrefix() {
  const test = localRootFolder.getChildNamed("test");
  const test1 = localRootFolder.getChildNamed("test1");
  const oldTestURI = test.URI;
  const test1URI = test1.URI;
  FolderTreeProperties.setColor(test.URI, "#0d0e0f");
  FolderTreeProperties.setColor(test1.URI, "#101112");

  // Rename "test" while "test1" sits next to it.
  await contextMenuRename(test, "test2");

  const renamed = await waitForFolder(localRootFolder, "test2");
  await assertColor(
    renamed,
    "#0d0e0f",
    oldTestURI,
    "the folder was renamed next to a sibling sharing its name prefix"
  );
  Assert.equal(
    FolderTreeProperties.getColor(test1URI),
    "#101112",
    "The sibling sharing the name prefix should keep its own color"
  );
  Assert.equal(
    FolderTreeProperties.getColor(`${renamed.URI}1`),
    undefined,
    "The sibling's color should not have been re-keyed onto a mangled URI"
  );
  Assert.equal(
    localRootFolder.getChildNamed("test1").URI,
    test1URI,
    "The sibling should still exist under its own URI"
  );
});
