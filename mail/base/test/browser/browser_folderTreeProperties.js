/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);

const TRASH_COLOR_HEX = "#52507c";
const TRASH_COLOR_RGB = "rgb(82, 80, 124)";
const VIRTUAL_COLOR_HEX = "#cd26a5";
const VIRTUAL_COLOR_RGB = "rgb(205, 38, 165)";

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { folderPane, folderTree, threadTree } = about3Pane;
let rootFolder, trashFolder, trashFolderRows, virtualFolder, virtualFolderRows;

add_setup(async function () {
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  FolderTreeProperties.resetColors();

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  trashFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

  virtualFolder = rootFolder.createLocalSubfolder("folderTreePropsVirtual");
  virtualFolder.flags |=
    Ci.nsMsgFolderFlags.Virtual | Ci.nsMsgFolderFlags.Favorite;
  const virtualFolderInfo = virtualFolder.msgDatabase.dBFolderInfo;
  virtualFolderInfo.setCharProperty("searchStr", "ALL");
  virtualFolderInfo.setCharProperty("searchFolderUri", trashFolder.URI);

  // Test the colours change in all folder modes, not just the current one.
  folderPane.activeModes = ["all", "favorite"];
  await new Promise(resolve => setTimeout(resolve));
  for (const row of folderTree.querySelectorAll(".collapsed")) {
    folderTree.expandRow(row);
  }

  trashFolderRows = {
    all: folderPane.getRowForFolder(trashFolder, "all"),
    favorite: folderPane.getRowForFolder(trashFolder, "favorite"),
  };
  virtualFolderRows = {
    all: folderPane.getRowForFolder(virtualFolder, "all"),
    favorite: folderPane.getRowForFolder(virtualFolder, "favorite"),
  };

  registerCleanupFunction(async () => {
    folderPane.activeModes = ["all"];
    MailServices.accounts.removeAccount(account, false);
    FolderTreeProperties.resetColors();
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

add_task(async function testNormalFolderColors() {
  await subtestColors(trashFolderRows, TRASH_COLOR_HEX, TRASH_COLOR_RGB);
});

add_task(async function testVirtualFolderColors() {
  await subtestColors(virtualFolderRows, VIRTUAL_COLOR_HEX, VIRTUAL_COLOR_RGB);
});

async function subtestColors(rows, defaultHex, defaultRGB) {
  assertRowColors(rows, defaultRGB);

  // Accept the dialog without changing anything.
  let dialog = await openFolderProperties(rows.all);
  dialog.assertColor(defaultHex);
  await dialog.accept();
  assertRowColors(rows, defaultRGB);

  // Cancel the dialog without changing anything.
  dialog = await openFolderProperties(rows.favorite);
  dialog.assertColor(defaultHex);
  await dialog.cancel();
  assertRowColors(rows, defaultRGB);

  // Set a non-default color.
  dialog = await openFolderProperties(rows.all);
  dialog.assertColor(defaultHex);
  await dialog.setColor("#ff6600");
  assertRowColors(rows, "rgb(255, 102, 0)");
  await dialog.accept();
  assertRowColors(rows, "rgb(255, 102, 0)");

  // Reset to the default color.
  dialog = await openFolderProperties(rows.favorite);
  dialog.assertColor("#ff6600");
  dialog.resetColor();
  dialog.assertColor(defaultHex);
  assertRowColors(rows, defaultRGB);
  await dialog.accept();
  assertRowColors(rows, defaultRGB);

  // Set a color, but cancel the dialog.
  dialog = await openFolderProperties(rows.all);
  dialog.assertColor(defaultHex);
  await dialog.setColor("#ffcc00");
  assertRowColors(rows, "rgb(255, 204, 0)");
  await dialog.cancel();
  assertRowColors(rows, defaultRGB);

  // Set a color, but reset it and accept the dialog.
  dialog = await openFolderProperties(rows.favorite);
  dialog.assertColor(defaultHex);
  await dialog.setColor("#00cc00");
  assertRowColors(rows, "rgb(0, 204, 0)");
  dialog.resetColor();
  dialog.assertColor(defaultHex);
  assertRowColors(rows, defaultRGB);
  await dialog.accept();
  assertRowColors(rows, defaultRGB);

  // Set a non-default color.
  dialog = await openFolderProperties(rows.all);
  dialog.assertColor(defaultHex);
  await dialog.setColor("#0000cc");
  assertRowColors(rows, "rgb(0, 0, 204)");
  await dialog.accept();
  assertRowColors(rows, "rgb(0, 0, 204)");

  // Accept the dialog without changing anything.
  dialog = await openFolderProperties(rows.favorite);
  dialog.assertColor("#0000cc");
  await dialog.accept();
  assertRowColors(rows, "rgb(0, 0, 204)");

  // Cancel the dialog without changing anything.
  dialog = await openFolderProperties(rows.all);
  dialog.assertColor("#0000cc");
  await dialog.cancel();
  assertRowColors(rows, "rgb(0, 0, 204)");

  // Reset the color and cancel the dialog.
  dialog = await openFolderProperties(rows.favorite);
  dialog.assertColor("#0000cc");
  dialog.resetColor();
  dialog.assertColor(defaultHex);
  assertRowColors(rows, defaultRGB);
  await dialog.cancel();
  assertRowColors(rows, "rgb(0, 0, 204)");

  // Reset the color, pick a new one, and accept the dialog.
  dialog = await openFolderProperties(rows.all);
  dialog.assertColor("#0000cc");
  dialog.resetColor();
  dialog.assertColor(defaultHex);
  assertRowColors(rows, defaultRGB);
  await dialog.setColor("#0066cc");
  assertRowColors(rows, "rgb(0, 102, 204)");
  await dialog.accept();
  assertRowColors(rows, "rgb(0, 102, 204)");
}

async function openFolderProperties(row) {
  const folderPaneContext =
    about3Pane.document.getElementById("folderPaneContext");
  const folderPaneContextProperties = about3Pane.document.getElementById(
    "folderPaneContext-properties"
  );

  const shownPromise = BrowserTestUtils.waitForEvent(
    folderPaneContext,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  const windowOpenedPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  folderPaneContext.activateItem(folderPaneContextProperties);
  const dialogWindow = await windowOpenedPromise;
  const dialogDocument = dialogWindow.document;

  const colorButton = dialogDocument.getElementById("color");
  const resetColorButton = dialogDocument.getElementById("resetColor");
  const folderPropertiesDialog = dialogDocument.querySelector("dialog");

  return {
    assertColor(hex) {
      Assert.equal(colorButton.value, hex);
    },
    async setColor(hex) {
      SpecialPowers.MockColorPicker.init(dialogWindow);
      SpecialPowers.MockColorPicker.returnColor = hex;
      const inputPromise = BrowserTestUtils.waitForEvent(colorButton, "input");
      EventUtils.synthesizeMouseAtCenter(colorButton, {}, dialogWindow);
      await inputPromise;
      SpecialPowers.MockColorPicker.cleanup();
    },
    resetColor() {
      EventUtils.synthesizeMouseAtCenter(resetColorButton, {}, dialogWindow);
    },
    async accept() {
      const windowClosedPromise =
        BrowserTestUtils.domWindowClosed(dialogWindow);
      EventUtils.synthesizeMouseAtCenter(
        folderPropertiesDialog.getButton("accept"),
        {},
        dialogWindow
      );
      await windowClosedPromise;
    },
    async cancel() {
      const windowClosedPromise =
        BrowserTestUtils.domWindowClosed(dialogWindow);
      EventUtils.synthesizeMouseAtCenter(
        folderPropertiesDialog.getButton("cancel"),
        {},
        dialogWindow
      );
      await windowClosedPromise;
    },
  };
}

function assertRowColors(rows, rgb) {
  // Always move the focus away from the row otherwise we might get the selected
  // state which turns the icon white.
  threadTree.table.body.focus();
  for (const row of Object.values(rows)) {
    Assert.equal(getComputedStyle(row.querySelector(".icon")).stroke, rgb);
  }
}
