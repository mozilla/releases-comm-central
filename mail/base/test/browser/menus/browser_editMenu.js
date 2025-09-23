/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load common setup code shared by all browser_editMenu* tests.
Services.scriptloader.loadSubScript(
  new URL("head_editMenu.js", gTestPath).href,
  this
);

/** @type {MenuData} */
const editMenuData = {
  menu_undo: { disabled: true },
  menu_redo: { disabled: true },
  menu_cut: { disabled: true },
  menu_copy: { disabled: true },
  menu_paste: { disabled: true },
  menu_delete: { disabled: true, l10nID: "text-action-delete" },
  menu_select: {},
  menu_SelectAll: {},
  menu_selectThread: { disabled: true },
  menu_selectFlagged: { disabled: true },
  menu_find: {},
  menu_findCmd: { disabled: true },
  menu_findAgainCmd: { disabled: true },
  searchMailCmd: {},
  glodaSearchCmd: {},
  searchAddressesCmd: {},
  menu_favoriteFolder: { disabled: true },
  menu_properties: { disabled: true },
  "calendar-properties-menuitem": { disabled: true },
};
if (AppConstants.platform == "linux") {
  editMenuData.menu_preferences = {};
  editMenuData.menu_accountmgr = {};
}
const helper = new MenuTestHelper("menu_Edit", editMenuData);

add_task(async function test3PaneTab() {
  await helper.testAllItems("mail3PaneTab");
});
