/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

async function focusWindow(win) {
  win.focus();
  await TestUtils.waitForCondition(
    () => Services.focus.focusedWindow?.browsingContext.topChromeWindow == win,
    "waiting for window to be focused"
  );
}

async function openExtensionPopup(win, buttonId) {
  await focusWindow(win.top);

  let actionButton = await TestUtils.waitForCondition(
    () =>
      win.document.querySelector(
        `#${buttonId}, [item-id="${buttonId}"] button`
      ),
    "waiting for the action button to exist"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.is_visible(actionButton),
    "waiting for action button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, win);

  let panel = win.top.document.getElementById(
    "webextension-remote-preload-panel"
  );
  let browser = panel.querySelector("browser");
  await TestUtils.waitForCondition(
    () => browser.clientWidth > 100,
    "waiting for browser to resize"
  );

  return { actionButton, panel, browser };
}

function getSmartServer() {
  return MailServices.accounts.findServer("nobody", "smart mailboxes", "none");
}

function resetSmartMailboxes() {
  let oldServer = getSmartServer();
  // Clean up any leftover server from an earlier test.
  if (oldServer) {
    let oldAccount = MailServices.accounts.FindAccountForServer(oldServer);
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
   * Check that an item matches the expected state.
   *
   * @param {XULElement} actual - A <menu> or <menuitem>.
   * @param {MenuItemData} expected
   */
  checkItem(actual, expected) {
    Assert.equal(
      BrowserTestUtils.is_hidden(actual),
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
      let attributes = actual.ownerDocument.l10n.getAttributes(actual);
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

    for (let item of popup.children) {
      if (!item.id || item.localName == "menuseparator") {
        continue;
      }

      if (!(item.id in data)) {
        if (itemsMustBeInData) {
          Assert.report(true, undefined, undefined, `${item.id} in data`);
        }
        continue;
      }
      let itemData = data[item.id];
      this.checkItem(item, itemData);
      delete data[item.id];

      if (item.localName == "menu") {
        if (BrowserTestUtils.is_visible(item) && !item.disabled) {
          item.openMenu(true);
          await this.iterate(item.menupopup, data, itemsMustBeInData);
        } else {
          for (let hiddenItem of item.querySelectorAll("menu, menuitem")) {
            delete data[hiddenItem.id];
          }
        }
      }
    }

    popup.hidePopup();
  }

  /**
   * Checks every item in the menu and submenus against the expected states.
   *
   * @param {string} mode - The current mode, used to select the right expected
   *   values from `baseData`.
   */
  async testAllItems(mode) {
    // Get the data for just this mode.
    let data = {};
    for (let [id, itemData] of Object.entries(this.baseData)) {
      data[id] = {
        ...itemData,
        hidden: itemData.hidden === true || itemData.hidden?.includes(mode),
        disabled:
          itemData.disabled === true || itemData.disabled?.includes(mode),
        checked: itemData.checked === true || itemData.checked?.includes(mode),
      };
    }

    // Open the menu and all submenus and check the items.
    EventUtils.synthesizeMouseAtCenter(this.menu, {});
    await this.iterate(this.menu.menupopup, data, true);

    // Report any unexpected items.
    for (let id of Object.keys(data)) {
      Assert.report(true, undefined, undefined, `extra item ${id} in data`);
    }
  }

  /**
   * Checks specific items in the menu.
   *
   * @param {MenuData} data - The expected values to test against.
   */
  async testItems(data) {
    let shownPromise = BrowserTestUtils.waitForEvent(
      this.menu.menupopup,
      "popupshown"
    );
    EventUtils.synthesizeMouseAtCenter(this.menu, {});
    await shownPromise;

    await this.iterate(this.menu.menupopup, data);

    for (let id of Object.keys(data)) {
      Assert.report(true, undefined, undefined, `extra item ${id} in data`);
    }

    this.menu.menupopup.hidePopup();
  }
}

// Report and remove any remaining accounts/servers. If we register a cleanup
// function here, it will run before any other cleanup function has had a
// chance to run. Instead, when it runs register another cleanup function
// which will run last.
registerCleanupFunction(function () {
  registerCleanupFunction(function () {
    let tabmail = document.getElementById("tabmail");
    if (tabmail.tabInfo.length > 1) {
      Assert.report(
        true,
        undefined,
        undefined,
        "Unexpected tab(s) open at the end of the test run"
      );
      tabmail.closeOtherTabs(0);
    }

    for (let server of MailServices.accounts.allServers) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found ${server} at the end of the test run`
      );
      MailServices.accounts.removeIncomingServer(server, false);
    }
    for (let account of MailServices.accounts.accounts) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Found ${account} at the end of the test run`
      );
      MailServices.accounts.removeAccount(account, false);
    }

    resetSmartMailboxes();

    // Some tests that open new windows don't return focus to the main window
    // in a way that satisfies mochitest, and the test times out.
    Services.focus.focusedWindow = window;
    // Focus an element in the main window, then blur it again to avoid it
    // hijacking keypresses.
    let mainWindowElement = document.getElementById("button-appmenu");
    mainWindowElement.focus();
    mainWindowElement.blur();
  });
});
