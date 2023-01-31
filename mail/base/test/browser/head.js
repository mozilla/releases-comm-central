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
  await focusWindow(win);

  let actionButton = await TestUtils.waitForCondition(
    () => win.document.getElementById(buttonId),
    "waiting for the action button to exist"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.is_visible(actionButton),
    "waiting for action button to be visible"
  );
  EventUtils.synthesizeMouseAtCenter(actionButton, {}, win);

  let panel = win.document.getElementById("webextension-remote-preload-panel");
  let browser = panel.querySelector("browser");
  await TestUtils.waitForCondition(
    () => browser.clientWidth > 100,
    "waiting for browser to resize"
  );

  return { actionButton, panel, browser };
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
  }

  /**
   * Checks every item in the menu and submenus against the expected states.
   *
   * @param {string} mode - The current mode, used to select the right expected
   *   values from `baseData`.
   */
  async testAllItems(mode) {
    let iterate = async popup => {
      if (popup.state != "open") {
        await BrowserTestUtils.waitForEvent(popup, "popupshown");
      }

      for (let item of popup.children) {
        if (!item.id || item.localName == "menuseparator") {
          continue;
        }

        Assert.ok(item.id in data, `${item.id} in data`);
        let itemData = data[item.id];
        this.checkItem(item, itemData);
        delete data[item.id];

        if (item.localName == "menu") {
          item.openMenu(true);
          await iterate(item.menupopup, data);
        }
      }

      popup.hidePopup();
    };

    // Get the data for just this mode.
    let data = {};
    for (let [id, itemData] of Object.entries(this.baseData)) {
      data[id] = {
        hidden: itemData.hidden === true || itemData.hidden?.includes(mode),
        disabled:
          itemData.disabled === true || itemData.disabled?.includes(mode),
      };
    }

    // Open the menu and all submenus and check the items.
    EventUtils.synthesizeMouseAtCenter(this.menu, {});
    await iterate(this.menu.menupopup, data);

    // Report any unexpected items.
    for (let id of Object.keys(data)) {
      Assert.report(true, undefined, undefined, `extra item ${id} in data`);
    }
  }

  /**
   * Checks specific items in the menu.
   * @note This function doesn't yet go into submenus.
   *
   * @param {MenuData} - The expected values to test against.
   */
  async testItems(data) {
    let shownPromise = BrowserTestUtils.waitForEvent(
      this.menu.menupopup,
      "popupshown"
    );
    EventUtils.synthesizeMouseAtCenter(this.menu, {});
    await shownPromise;

    for (let [id, itemData] of Object.entries(data)) {
      let item = document.getElementById(id);
      this.checkItem(item, itemData);
      delete data[item.id];
    }

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
registerCleanupFunction(function() {
  registerCleanupFunction(function() {
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
  });
});
