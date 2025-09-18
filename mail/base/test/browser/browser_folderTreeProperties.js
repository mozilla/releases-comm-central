/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);
var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const FOLDER_COLORS = [
  "inbox",
  "draft",
  "sent",
  "archive",
  "spam",
  "trash",
  "template",
  "newsletter",
  "rss",
  "outbox",
  "folder",
  "folder-filter",
  "folder-rss",
  "warning",
];

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const { accountCentralBrowser, folderPane, folderTree, threadTree } =
  about3Pane;
let rootFolder,
  trashFolder,
  trashFolderRows,
  virtualFolder,
  virtualFolderRows,
  darkTheme,
  lightTheme;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.prefersReducedMotion", 1]],
  });
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

  virtualFolder = VirtualFolderHelper.createNewVirtualFolder(
    "folderTreePropsVirtual",
    rootFolder,
    [trashFolder],
    "ALL",
    false
  ).virtualFolder;
  virtualFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

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

  // Account central must load (for the first account we just added) before
  // we start changing the theme or a large memory leak happens.
  await TestUtils.waitForCondition(() => {
    return (
      accountCentralBrowser.contentDocument.readyState == "complete" &&
      accountCentralBrowser.currentURI.spec.includes(
        account.incomingServer.username
      )
    );
  }, "waiting for account central to load");
  lightTheme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  darkTheme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );

  registerCleanupFunction(async () => {
    folderPane.activeModes = ["all"];
    MailServices.accounts.removeAccount(account, false);
    FolderTreeProperties.resetColors();
  });
});

add_task(async function testFolderColorCustomProperties() {
  const rootStyle = getComputedStyle(about3Pane.document.body);
  for (const color of FOLDER_COLORS) {
    const colorValue = rootStyle.getPropertyValue(`--folder-color-${color}`);
    Assert.stringMatches(
      colorValue,
      /^light-dark\(#[a-f0-9]{6}, #[a-f0-9]{6}\)$/,
      `--folder-color-${color} should have a valid color value`
    );
  }
});

add_task(async function testNormalFolderColors() {
  await testInLightAndDarkMode(dark =>
    subtestColors(trashFolderRows, getFolderColorVariable("trash", dark))
  );
});

add_task(async function testVirtualFolderColors() {
  await testInLightAndDarkMode(dark =>
    subtestColors(
      virtualFolderRows,
      getFolderColorVariable("folder-filter", dark)
    )
  );
});

/**
 * Run a subtest with the light and the dark theme applied.
 *
 * @param {Function} subtest - Callback that runs the subtest. Get a boolean as
 *   its first argument, indicating if it's being run in dark mode. Can return
 *   a promise.
 */
async function testInLightAndDarkMode(subtest) {
  info("Light theme");
  await toggleTheme(lightTheme, true);
  await subtest(false);
  info("Dark theme");
  await toggleTheme(darkTheme, true);
  await subtest(true);
  await toggleTheme(darkTheme, false);
}

async function subtestColors(rows, defaultHex) {
  const defaultRGB = hexToRgb(defaultHex);
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

  info("Resetting colors");
  dialog = await openFolderProperties(rows.all);
  dialog.resetColor();
  dialog.assertColor(defaultHex);
  await dialog.accept();

  assertRowColors(rows, defaultRGB);
}

async function openFolderProperties(row) {
  const folderPaneContext =
    about3Pane.document.getElementById("folderPaneContext");
  const folderPaneContextProperties = about3Pane.document.getElementById(
    "folderPaneContext-properties"
  );

  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".name"),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(folderPaneContext, "shown");

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
      // Wait for removing 'inert' attribute taking effect.
      await new Promise(resolve => requestAnimationFrame(resolve));
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
      // Wait for removing 'inert' attribute taking effect.
      await new Promise(resolve => requestAnimationFrame(resolve));
    },
  };
}

function assertRowColors(rows, rgb) {
  // Always move the focus away from the row otherwise we might get the selected
  // state which turns the icon white.
  threadTree.table.body.focus();
  for (const row of Object.values(rows)) {
    Assert.equal(
      getComputedStyle(row.querySelector(".icon")).stroke,
      rgb,
      `${row.querySelector(".name").textContent} folder color`
    );
  }
}

/**
 * Get the folder color variable from CSS.
 *
 * @param {string} color - Which color to get. Gets prepended with "--folder-color-".
 * @param {boolean} dark - If the dark variant should be returned.
 * @returns {string} Color value from CSS.
 */
function getFolderColorVariable(color, dark = false) {
  const rootStyle = getComputedStyle(about3Pane.document.body);
  const colorValue = rootStyle.getPropertyValue(
    `--folder-color-${color.toLowerCase()}`
  );
  if (colorValue.startsWith("light-dark(")) {
    const splitValue = colorValue.split(",");
    if (dark) {
      return splitValue.at(-1).trim().slice(0, -1);
    }
    return splitValue[0].trim().slice(11);
  }
  return colorValue;
}

/**
 * @param {Addon} theme - The Theme to modify the state of.
 * @param {boolean} enable - If it should be enabled after.
 */
async function toggleTheme(theme, enable) {
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    enable ? theme.enable() : theme.disable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
}

/**
 * Convert a HEX CSS color to an RGB CSS color.
 *
 * @param {string} hexColor - Color in the HEX notation.
 * @returns {string} RGB notation of the HEX color.
 */
function hexToRgb(hexColor) {
  const r = Number.parseInt(hexColor.slice(1, 3), 16);
  const g = Number.parseInt(hexColor.slice(3, 5), 16);
  const b = Number.parseInt(hexColor.slice(5), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
