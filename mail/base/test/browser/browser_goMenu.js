/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/** @type MenuData */
const goMenuData = {
  goNextMenu: {},
  menu_nextMsg: { disabled: true },
  menu_nextUnreadMsg: { disabled: true },
  menu_nextFlaggedMsg: { disabled: true },
  menu_nextUnreadThread: { disabled: true },
  "calendar-go-menu-next": { hidden: true },
  goPreviousMenu: {},
  menu_prevMsg: { disabled: true },
  menu_prevUnreadMsg: { disabled: true },
  menu_prevFlaggedMsg: { disabled: true },
  "calendar-go-menu-previous": { hidden: true },
  menu_goForward: { disabled: true },
  menu_goBack: { disabled: true },
  "calendar-go-to-today-menuitem": { hidden: true },
  menu_goChat: {},
  goFolderMenu: {},
  goRecentlyClosedTabs: { disabled: true },
  goStartPage: {},
};
const helper = new MenuTestHelper("menu_Go", goMenuData);

add_setup(async function () {
  document.getElementById("tabmail").clearRecentlyClosedTabs();
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
});

add_task(async function test3PaneTab() {
  await helper.testAllItems("mail3PaneTab");
});
