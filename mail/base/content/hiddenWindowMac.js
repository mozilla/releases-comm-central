/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.addEventListener("load", hiddenWindowStartup);

function hiddenWindowStartup() {
  // Disable menus which are not appropriate
  const disabledItems = [
    "menu_newFolder",
    "newMailAccountMenuItem",
    "newNewsgroupAccountMenuItem",
    "menu_close",
    "menu_saveAs",
    "menu_saveAsFile",
    "menu_newVirtualFolder",
    "menu_find",
    "menu_findCmd",
    "menu_findAgainCmd",
    "menu_sendunsentmsgs",
    "menu_subscribe",
    "menu_deleteFolder",
    "menu_renameFolder",
    "menu_select",
    "menu_selectAll",
    "menu_selectThread",
    "menu_favoriteFolder",
    "menu_properties",
    "menu_Toolbars",
    "menu_MessagePaneLayout",
    "menu_showMessage",
    "menu_toggleThreadPaneHeader",
    "menu_showFolderPane",
    "menu_FolderViews",
    "viewSortMenu",
    "groupBySort",
    "viewMessageViewMenu",
    "viewMessagesMenu",
    "menu_expandAllThreads",
    "collapseAllThreads",
    "viewheadersmenu",
    "viewBodyMenu",
    "viewAttachmentsInlineMenuitem",
    "viewFullZoomMenu",
    "goNextMenu",
    "menu_nextMsg",
    "menu_nextUnreadMsg",
    "menu_nextUnreadThread",
    "goPreviousMenu",
    "menu_prevMsg",
    "menu_prevUnreadMsg",
    "menu_goForward",
    "menu_goBack",
    "goStartPage",
    "newMsgCmd",
    "replyMainMenu",
    "replySenderMainMenu",
    "replyNewsgroupMainMenu",
    "menu_replyToAll",
    "menu_replyToList",
    "menu_forwardMsg",
    "forwardAsMenu",
    "menu_editMsgAsNew",
    "openMessageWindowMenuitem",
    "openConversationMenuitem",
    "moveMenu",
    "copyMenu",
    "moveToFolderAgain",
    "tagMenu",
    "markMenu",
    "markReadMenuItem",
    "menu_markThreadAsRead",
    "menu_markReadByDate",
    "menu_markAllRead",
    "markFlaggedMenuItem",
    "menu_markAsJunk",
    "menu_markAsNotJunk",
    "createFilter",
    "killThread",
    "killSubthread",
    "watchThread",
    "applyFilters",
    "runJunkControls",
    "deleteJunk",
    "menu_import",
    "searchMailCmd",
    "searchAddressesCmd",
    "filtersCmd",
    "cmd_close",
    "minimizeWindow",
    "zoomWindow",
    "appmenu_newFolder",
    "appmenu_newMailAccountMenuItem",
    "appmenu_newNewsgroupAccountMenuItem",
    "appmenu_saveAs",
    "appmenu_saveAsFile",
    "appmenu_newVirtualFolder",
    "appmenu_findAgainCmd",
    "appmenu_favoriteFolder",
    "appmenu_properties",
    "appmenu_MessagePaneLayout",
    "appmenu_showMessage",
    "appmenu_toggleThreadPaneHeader",
    "appmenu_showFolderPane",
    "appmenu_FolderViews",
    "appmenu_groupBySort",
    "appmenu_findCmd",
    "appmenu_find",
    "appmenu_openMessageWindowMenuitem",
  ];

  let element;
  for (const id of disabledItems) {
    element = document.getElementById(id);
    if (element) {
      element.setAttribute("disabled", "true");
    }
  }

  // Also hide the window-list separator if it exists.
  element = document.getElementById("sep-window-list");
  if (element) {
    element.setAttribute("hidden", "true");
  }

  // Unhide tasksMenuMail to enable the CMD + 1 key.
  var openMail3Pane_menuitem = document.getElementById("tasksMenuMail");
  if (openMail3Pane_menuitem) {
    openMail3Pane_menuitem.removeAttribute("hidden");
  }
}
