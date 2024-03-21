/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SmartServerUtils: "resource:///modules/SmartServerUtils.sys.mjs",
});

async function clickExtensionButton(win, buttonId) {
  buttonId = CSS.escape(buttonId);
  const actionButton = await TestUtils.waitForCondition(
    () =>
      win.document.querySelector(
        `#${buttonId}, [item-id="${buttonId}"] button`
      ),
    "waiting for the action button to exist"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(actionButton),
    "waiting for action button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, win);

  return actionButton;
}

async function openExtensionPopup(win, buttonId) {
  const actionButton = await clickExtensionButton(win, buttonId);

  const panel = win.top.document.getElementById(
    "webextension-remote-preload-panel"
  );
  const browser = panel.querySelector("browser");
  await TestUtils.waitForCondition(
    () => browser.clientWidth > 100,
    "waiting for browser to resize"
  );

  return { actionButton, panel, browser };
}
function getSmartServer() {
  return lazy.SmartServerUtils.getSmartServer();
}

function resetSmartMailboxes() {
  const oldServer = getSmartServer();
  // Clean up any leftover server from an earlier test.
  if (oldServer) {
    const oldAccount = MailServices.accounts.findAccountForServer(oldServer);
    MailServices.accounts.removeAccount(oldAccount, false);
  }
}

class MenuTestHelper {
  /** @type {XULMenuElement} */
  menu;

  /**
   * An object describing the state of a <menu> or <menuitem>.
   *
   * @typedef {Object} MenuItemData
   * @property {boolean|string[]} [hidden] - true if the item should be hidden
   *   in all modes, or a list of modes in which it should be hidden.
   * @property {boolean|string[]} [disabled] - true if the item should be
   *   disabled in all modes, or a list of modes in which it should be
   *   disabled. If the item should be hidden this property is ignored.
   * @property {boolean|string[]} [checked] - true if the item should be
   *   checked in all modes, or a list of modes in which it should be
   *   checked. If the item should be hidden this property is ignored.
   * @property {string} [l10nID] - the ID of the Fluent string this item
   *   should be displaying. If specified, `l10nArgs` will be checked.
   * @property {object} [l10nArgs] - the arguments for the Fluent string this
   *   item should be displaying. If not specified, the string should not have
   *   arguments.
   */
  /**
   * An object describing the possible states of a menu's items. Object keys
   * are the item's ID, values describe the item's state.
   *
   * @typedef {Object.<string, MenuItemData>} MenuData
   */

  /** @type {MenuData} */
  baseData;

  constructor(menuID, baseData) {
    this.menu = document.getElementById(menuID);
    this.baseData = baseData;
  }

  /**
   * Clicks on the menu and waits for it to open.
   */
  async openMenu() {
    const shownPromise = BrowserTestUtils.waitForEvent(
      this.menu.menupopup,
      "popupshown"
    );
    EventUtils.synthesizeMouseAtCenter(this.menu, {});
    await shownPromise;
  }

  /**
   * Check that an item matches the expected state.
   *
   * @param {XULElement} actual - A <menu> or <menuitem>.
   * @param {MenuItemData} expected
   */
  checkItem(actual, expected) {
    Assert.equal(
      BrowserTestUtils.isHidden(actual),
      !!expected.hidden,
      `${actual.id} hidden`
    );
    if (!expected.hidden) {
      Assert.equal(
        actual.disabled,
        !!expected.disabled,
        `${actual.id} disabled`
      );
    }
    if (expected.checked) {
      Assert.equal(
        actual.getAttribute("checked"),
        "true",
        `${actual.id} checked`
      );
    } else if (["checkbox", "radio"].includes(actual.getAttribute("type"))) {
      Assert.ok(
        !actual.hasAttribute("checked") ||
          actual.getAttribute("checked") == "false",
        `${actual.id} not checked`
      );
    }
    if (expected.l10nID) {
      const attributes = actual.ownerDocument.l10n.getAttributes(actual);
      Assert.equal(attributes.id, expected.l10nID, `${actual.id} L10n string`);
      Assert.deepEqual(
        attributes.args,
        expected.l10nArgs ?? null,
        `${actual.id} L10n args`
      );
    }
  }

  /**
   * Recurses through submenus performing checks on items.
   *
   * @param {XULPopupElement} popup - The current pop-up to check.
   * @param {MenuData} data - The expected values to test against.
   * @param {boolean} [itemsMustBeInData=false] - If true, all menu items and
   *   menus within `popup` must be specified in `data`. If false, items not
   *   in `data` will be ignored.
   */
  async iterate(popup, data, itemsMustBeInData = false) {
    if (popup.state != "open") {
      await BrowserTestUtils.waitForEvent(popup, "popupshown");
    }

    for (const item of popup.children) {
      if (!item.id || item.localName == "menuseparator") {
        continue;
      }

      if (!(item.id in data)) {
        if (itemsMustBeInData) {
          Assert.report(true, undefined, undefined, `${item.id} in data`);
        }
        continue;
      }
      const itemData = data[item.id];
      this.checkItem(item, itemData);
      delete data[item.id];

      if (item.localName == "menu") {
        if (BrowserTestUtils.isVisible(item) && !item.disabled) {
          item.openMenu(true);
          await this.iterate(item.menupopup, data, itemsMustBeInData);
        } else {
          for (const hiddenItem of item.querySelectorAll("menu, menuitem")) {
            delete data[hiddenItem.id];
          }
        }
      }
    }

    popup.hidePopup();
    await new Promise(resolve => setTimeout(resolve));
  }

  /**
   * Checks every item in the menu and submenus against the expected states.
   *
   * @param {string} mode - The current mode, used to select the right expected
   *   values from `baseData`.
   */
  async testAllItems(mode) {
    // Get the data for just this mode.
    const data = {};
    for (const [id, itemData] of Object.entries(this.baseData)) {
      data[id] = {
        ...itemData,
        hidden: itemData.hidden === true || itemData.hidden?.includes(mode),
        disabled:
          itemData.disabled === true || itemData.disabled?.includes(mode),
        checked: itemData.checked === true || itemData.checked?.includes(mode),
      };
    }

    // Open the menu and all submenus and check the items.
    await this.openMenu();
    await this.iterate(this.menu.menupopup, data, true);

    // Report any unexpected items.
    for (const id of Object.keys(data)) {
      Assert.report(true, undefined, undefined, `extra item ${id} in data`);
    }
  }

  /**
   * Checks specific items in the menu.
   *
   * @param {MenuData} data - The expected values to test against.
   */
  async testItems(data) {
    await this.openMenu();
    await this.iterate(this.menu.menupopup, data);

    for (const id of Object.keys(data)) {
      Assert.report(true, undefined, undefined, `extra item ${id} in data`);
    }

    if (this.menu.menupopup.state != "closed") {
      const hiddenPromise = BrowserTestUtils.waitForEvent(
        this.menu.menupopup,
        "popuphidden"
      );
      this.menu.menupopup.hidePopup();
      await hiddenPromise;
    }
    await new Promise(resolve => setTimeout(resolve));
  }

  /**
   * Activates the item in the menu.
   *
   * @note This currently only works on top-level items.
   * @param {string} menuItemID - The item to activate.
   * @param {MenuData} [data] - If given, the expected state of the menu item
   *   before activation.
   */
  async activateItem(menuItemID, data) {
    await this.openMenu();
    const hiddenPromise = BrowserTestUtils.waitForEvent(
      this.menu.menupopup,
      "popuphidden"
    );
    const item = document.getElementById(menuItemID);
    if (data) {
      this.checkItem(item, data);
    }
    this.menu.menupopup.activateItem(item);
    await hiddenPromise;
    await new Promise(resolve => setTimeout(resolve));
  }
}

/**
 * Helper method to switch to a cards view with vertical layout.
 */
async function ensure_cards_view() {
  const { threadTree, threadPane } =
    document.getElementById("tabmail").currentAbout3Pane;

  Services.prefs.setIntPref("mail.pane_config.dynamic", 2);
  Services.xulStore.setValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view",
    "cards"
  );
  threadPane.updateThreadView("cards");

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-card",
    "The tree view switched to a cards layout"
  );
}

/**
 * Helper method to switch to a table view with classic layout.
 */
async function ensure_table_view() {
  const { threadTree, threadPane } =
    document.getElementById("tabmail").currentAbout3Pane;

  Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
  Services.xulStore.setValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view",
    "table"
  );
  threadPane.updateThreadView("table");

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
}

/**
 * Opens a .eml file in a standalone message window and waits for it to load.
 *
 * @param {nsIFile} file - The file to open.
 */
async function openMessageFromFile(file) {
  const fileURL = Services.io
    .newFileURI(file)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  const win = await winPromise;
  await messageLoadedIn(win.messageBrowser);
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  return win;
}

/**
 * Wait for a message to be fully loaded in the given about:message.
 * @param {browser} aboutMessageBrowser - The browser for the about:message
 *   window displaying the message.
 */
async function messageLoadedIn(aboutMessageBrowser) {
  await TestUtils.waitForCondition(
    () =>
      aboutMessageBrowser.contentDocument.readyState == "complete" &&
      aboutMessageBrowser.currentURI.spec == "about:message"
  );
  await TestUtils.waitForCondition(
    () => aboutMessageBrowser.contentWindow.msgLoaded,
    "waiting for message to be loaded"
  );
  // We need to be sure the ContextMenu actors are ready before trying to open a
  // context menu from the message. I can't find a way to be sure, so let's wait.
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Wait for network connections to become idle.
 *
 * @param {nsIMsgIncomingServer} server - The server with connections to wait for.
 */
async function promiseServerIdle(server) {
  if (server.type == "imap") {
    await TestUtils.waitForCondition(
      () => server.allConnectionsIdle,
      "waiting for IMAP connection to become idle"
    );
    return;
  }
  if (server.type == "pop3") {
    await TestUtils.waitForCondition(
      () => !server.wrappedJSObject.runningClient,
      "waiting for POP3 connection to become idle"
    );
    return;
  }
  if (server.type == "nntp") {
    await TestUtils.waitForCondition(
      () => server.wrappedJSObject._busyConnections.length == 0,
      "waiting for NNTP connection to become idle"
    );
  }
}

// Report and remove any remaining accounts/servers. If we register a cleanup
// function here, it will run before any other cleanup function has had a
// chance to run. Instead, when it runs register another cleanup function
// which will run last.
registerCleanupFunction(function () {
  registerCleanupFunction(async function () {
    Services.prefs.clearUserPref("mail.pane_config.dynamic");
    Services.xulStore.removeValue(
      "chrome://messenger/content/messenger.xhtml",
      "threadPane",
      "view"
    );

    const tabmail = document.getElementById("tabmail");
    if (tabmail.tabInfo.length > 1) {
      Assert.report(
        true,
        undefined,
        undefined,
        "Unexpected tab(s) open at the end of the test run"
      );
      tabmail.closeOtherTabs(0);
    }

    for (const server of MailServices.accounts.allServers) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found server ${server.key} at the end of the test run`
      );
      MailServices.accounts.removeIncomingServer(server, false);
    }
    for (const account of MailServices.accounts.accounts) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found account ${account.key} at the end of the test run`
      );
      MailServices.accounts.removeAccount(account, false);
    }

    resetSmartMailboxes();
    ensure_cards_view();

    // Some tests that open new windows confuse mochitest, which waits for a
    // focus event on the main window, and the test times out. If we focus a
    // different window (browser-harness.xhtml should be the only other window
    // at this point) then mochitest gets its focus event and the test ends.
    await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
  });
});
