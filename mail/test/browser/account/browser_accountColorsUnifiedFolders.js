/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountManagerUtils } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/modules/AccountManagerUtils.sys.mjs"
);

const {
  click_account_tree_row,
  get_account_tree_listitem,
  open_advanced_settings,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
);

const { content_tab_e } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);

const { expand_folder, get_special_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

const { add_message_to_folder, create_message, make_message_sets_in_folders } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
  );

const { ensure_cards_view, ensure_table_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
// Hardcoded colors from the --color-primary-default Bolt token.
const defaultColor = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "#58c9ff"
  : "#1373d9";
// Collect all added accounts to be cleaned up at the end.
const addedAccounts = [];

add_setup(async function () {
  // There may be pre-existing accounts from other tests.
  const originalAccountCount = MailServices.accounts.allServers.length;

  const NUM_ACCOUNTS = 3;
  const colors = ["#1373d9", "#bbffbb", "#f00"];

  // Create other 3 IMAP accounts.
  for (let i = 0; i < NUM_ACCOUNTS; i++) {
    const account = MailServices.accounts.createAccount();
    account.incomingServer = MailServices.accounts.createIncomingServer(
      `user${i}`,
      "localhost",
      "none"
    );
    account.incomingServer.prettyName = `Test account ${i}`;
    const identity = MailServices.accounts.createIdentity();
    identity.email = "john.doe@example.com";
    account.addIdentity(identity);

    const rootFolder = account.incomingServer.rootFolder.QueryInterface(
      Ci.nsIMsgLocalMailFolder
    );
    const inbox = rootFolder.createLocalSubfolder("Inbox");
    inbox.setFlag(Ci.nsMsgFolderFlags.Inbox);

    // Add a message to the inbox.
    await make_message_sets_in_folders([inbox], [{ count: 1 }]);

    // Customize the color of the newly created account.
    const amu = new AccountManagerUtils(account);
    amu.updateServerColor(colors[i]);

    info(
      `Created server color ${amu.serverColor} for ${account.incomingServer.rootFolder.URI}`
    );

    // Keep track of the added accounts.
    addedAccounts.push(account);
  }

  Assert.equal(
    MailServices.accounts.allServers.length,
    originalAccountCount + NUM_ACCOUNTS,
    "There should be three more accounts"
  );

  // Enable unified folder mode.
  about3Pane.folderPane.activeModes = ["smart", "all"];

  registerCleanupFunction(() => {
    // Remove our test account to leave the profile clean.
    for (const account of addedAccounts) {
      MailServices.accounts.removeAccount(account);
    }
    Assert.equal(
      MailServices.accounts.allServers.length,
      originalAccountCount,
      "There should be only the original accounts left."
    );
    // Reset folder mode.
    about3Pane.folderPane.activeModes = ["all"];
  });
});

add_task(async function test_custom_account_colors_in_folder_pane() {
  about3Pane.folderTree.selectedIndex = 0;
  let row = about3Pane.folderTree.getRowAtIndex(0);
  const folder = MailServices.folderLookup.getFolderForURL(row.uri);
  expand_folder(folder);

  info("Test first account without any custom color");
  let account = addedAccounts.at(0);
  row = about3Pane.folderTree.getRowAtIndex(2);
  subtest_check_account_indicator_variable(account, row);
  subtest_check_account_indicator_color(account, row, true);

  info("Test second account with custom color.");
  account = addedAccounts.at(1);
  row = about3Pane.folderTree.getRowAtIndex(3);
  subtest_check_account_indicator_variable(account, row);
  subtest_check_account_indicator_color(account, row);

  info("Test third account with custom color.");
  account = addedAccounts.at(2);
  row = about3Pane.folderTree.getRowAtIndex(4);
  subtest_check_account_indicator_variable(account, row);
  subtest_check_account_indicator_color(account, row);
});

/**
 * Check if the account indicator is visible and the variable is correctly set
 * on the folder list item.
 *
 * @param {nsIMsgAccount} account
 * @param {HTMLLIElement} row
 */
function subtest_check_account_indicator_variable(account, row) {
  const indicator = row.querySelector(".account-indicator");
  Assert.ok(
    BrowserTestUtils.isVisible(indicator),
    `The account indicator for ${row.uri} should be visible`
  );
  Assert.equal(
    row
      .querySelector(".account-indicator")
      .style.getPropertyValue(`--account-color`),
    `var(--server-${CSS.escape(account.incomingServer.key)}-color)`,
    "The account color variable should match the account indicator color variable"
  );
}

/**
 * Check if the account indicator matches the expected color on the folder list
 * item.
 *
 * @param {nsIMsgAccount} account
 * @param {HTMLLIElement} row
 * @param {boolean} [isEmpty=false]
 */
function subtest_check_account_indicator_color(account, row, isEmpty = false) {
  if (isEmpty) {
    const indicator = row.querySelector(".account-indicator");
    Assert.equal(
      getComputedStyle(indicator).backgroundColor,
      hexToRgb(defaultColor),
      "The account color should match the default for non customized colors"
    );
    return;
  }

  const amu = new AccountManagerUtils(account);
  Assert.equal(
    about3Pane.document.documentElement.style.getPropertyValue(
      `--server-${CSS.escape(account.incomingServer.key)}-color`
    ),
    amu.serverColor,
    "The account color should match the account indicator color"
  );
}

add_task(async function test_custom_account_colors_in_message_list() {
  info("Test first message without any custom color");
  let row = await TestUtils.waitForCondition(() =>
    about3Pane.threadTree.getRowAtIndex(0)
  );
  EventUtils.synthesizeMouseAtCenter(row, {}, about3Pane);

  info("Test first message without any custom color");
  let account = addedAccounts.at(0);
  row = about3Pane.threadTree.getRowAtIndex(2);
  subtest_check_message_indicator_variable(account, row, ".account-indicator");
  subtest_check_message_indicator_color(
    account,
    row,
    ".account-indicator",
    false,
    true
  );

  info("Test second message with custom color.");
  account = addedAccounts.at(1);
  row = about3Pane.threadTree.getRowAtIndex(1);
  subtest_check_message_indicator_variable(account, row, ".account-indicator");
  subtest_check_message_indicator_color(account, row, ".account-indicator");

  info("Test third message with custom color.");
  account = addedAccounts.at(2);
  row = about3Pane.threadTree.getRowAtIndex(0);
  subtest_check_message_indicator_variable(account, row, ".account-indicator");
  subtest_check_message_indicator_color(account, row, ".account-indicator");

  // Switch to table view.
  await ensure_table_view(document);
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));

  // Enable the account column.
  const colPicker = about3Pane.document.querySelector(
    "#threadTree .last-column .button-column-picker"
  );
  const colPickerPopup = about3Pane.document.querySelector(
    "#threadTree .menupopup-column-picker"
  );

  EventUtils.synthesizeMouseAtCenter(colPicker, {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(colPickerPopup, "shown");

  const menuItem = colPickerPopup.querySelector(`[value="accountCol"]`);
  const checkedState = menuItem.hasAttribute("checked");
  const checkedStateChanged = TestUtils.waitForCondition(
    () => checkedState != menuItem.hasAttribute("checked"),
    "The checked status changed"
  );
  const columnsChangedEvent = BrowserTestUtils.waitForEvent(
    about3Pane.document,
    "columns-changed"
  );
  colPickerPopup.activateItem(menuItem);
  await checkedStateChanged;
  await columnsChangedEvent;

  // The column picker menupopup doesn't close automatically on purpose.
  EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(colPickerPopup, "hidden");
  await new Promise(about3Pane.requestAnimationFrame);
  await TestUtils.waitForTick();

  // Test account colors in table view.
  info("Test first message without any custom color");
  account = addedAccounts.at(0);
  row = about3Pane.threadTree.getRowAtIndex(2);
  subtest_check_message_indicator_variable(
    account,
    row,
    "td.accountcol-column"
  );
  subtest_check_message_indicator_color(
    account,
    row,
    "td.accountcol-column",
    true,
    true
  );

  info("Test second message with custom color.");
  account = addedAccounts.at(1);
  row = about3Pane.threadTree.getRowAtIndex(1);
  subtest_check_message_indicator_variable(
    account,
    row,
    "td.accountcol-column"
  );
  subtest_check_message_indicator_color(
    account,
    row,
    "td.accountcol-column",
    true
  );

  info("Test third message with custom color.");
  account = addedAccounts.at(2);
  row = about3Pane.threadTree.getRowAtIndex(0);
  subtest_check_message_indicator_variable(
    account,
    row,
    "td.accountcol-column"
  );
  subtest_check_message_indicator_color(
    account,
    row,
    "td.accountcol-column",
    true
  );

  await ensure_cards_view(document);
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
});

/**
 * Check if the account indicator is visible and the variable is correctly set
 * on the message row item.
 *
 * @param {nsIMsgAccount} account
 * @param {HTMLTableRowElement} message
 * @param {string} selector
 */
function subtest_check_message_indicator_variable(account, message, selector) {
  const indicator = message.querySelector(selector);
  Assert.ok(
    BrowserTestUtils.isVisible(indicator),
    "The account indicator for the message should be visible"
  );
  Assert.equal(
    message.querySelector(selector).style.getPropertyValue(`--account-color`),
    `var(--server-${CSS.escape(account.incomingServer.key)}-color)`,
    "The account color variable should match the account indicator color variable"
  );
  Assert.equal(
    indicator.title,
    account.incomingServer.prettyName,
    "The account name should be used as the indicator title"
  );
}

/**
 * Check if the account indicator matches the expected color on the message row
 * item.
 *
 * @param {nsIMsgAccount} account
 * @param {HTMLTableRowElement} message
 * @param {string} selector
 * @param {boolean} [isPseudo=false]
 * @param {boolean} [isEmpty=false]
 */
function subtest_check_message_indicator_color(
  account,
  message,
  selector,
  isPseudo = false,
  isEmpty = false
) {
  const indicator = message.querySelector(selector);
  const backgroundColor = isPseudo
    ? getComputedStyle(indicator, "::before").backgroundColor
    : getComputedStyle(indicator).backgroundColor;
  if (isEmpty) {
    Assert.equal(
      backgroundColor,
      hexToRgb(defaultColor),
      "The account color should match the default for non customized colors"
    );
    return;
  }

  const amu = new AccountManagerUtils(account);
  Assert.equal(
    backgroundColor,
    hexToRgb(amu.serverColor),
    "The account color should match the account indicator color"
  );

  Assert.equal(
    about3Pane.document.documentElement.style.getPropertyValue(
      `--server-${CSS.escape(account.incomingServer.key)}-color`
    ),
    amu.serverColor,
    "The account color should match the injected CSS variable"
  );
}

/**
 * Convert a HEX CSS color to an RGB CSS color.
 *
 * @param {string} hexColor - Color in the HEX notation.
 * @returns {string} RGB notation of the HEX color.
 */
function hexToRgb(hexColor) {
  // Ensure we always deal with a full 7 chars hex value.
  // Expand shorthand hex like #f00 to #ff0000.
  if (hexColor.length == 4) {
    hexColor = `#${hexColor.at(1)}${hexColor.at(1)}${hexColor.at(2)}${hexColor.at(2)}${hexColor.at(3)}${hexColor.at(3)}`;
  }
  const r = Number.parseInt(hexColor.slice(1, 3), 16);
  const g = Number.parseInt(hexColor.slice(3, 5), 16);
  const b = Number.parseInt(hexColor.slice(5), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

add_task(async function test_account_indicator_hidden() {
  info("Test that the account indicator is hidden in regular folder mode");
  about3Pane.folderTree.selectedIndex = 18;
  Assert.ok(
    BrowserTestUtils.isHidden(
      about3Pane.folderTree
        .getRowAtIndex(18)
        .querySelector(".account-indicator")
    ),
    "The account indicator for the single folder should be hidden"
  );

  info(
    "Test that the account indicator is hidden on messages in single folders"
  );
  const row = await TestUtils.waitForCondition(() =>
    about3Pane.threadTree.getRowAtIndex(0)
  );
  EventUtils.synthesizeMouseAtCenter(row, {}, about3Pane);

  Assert.ok(
    BrowserTestUtils.isHidden(
      about3Pane.threadTree.getRowAtIndex(0).querySelector(".account-indicator")
    ),
    "The account indicator for the standalone message should be hidden"
  );
});
