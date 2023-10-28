/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals OpenOrFocusWindow */ // From mailWindowOverlay.js
/* globals GetSelectedMsgFolders */ // From messenger.js

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailViewConstants } = ChromeUtils.import(
  "resource:///modules/MailViewManager.jsm"
);

// these constants are now authoritatively defined in MailViewManager.jsm (above)
// tag views have kViewTagMarker + their key as value
var kViewItemAll = MailViewConstants.kViewItemAll;
var kViewItemUnread = MailViewConstants.kViewItemUnread;
var kViewItemTags = MailViewConstants.kViewItemTags; // former labels used values 2-6
var kViewItemNotDeleted = MailViewConstants.kViewItemNotDeleted;
// not a real view! a sentinel value to pop up a dialog
var kViewItemVirtual = MailViewConstants.kViewItemVirtual;
// not a real view! a sentinel value to pop up a dialog
var kViewItemCustomize = MailViewConstants.kViewItemCustomize;
var kViewItemFirstCustom = MailViewConstants.kViewItemFirstCustom;

var kViewCurrent = MailViewConstants.kViewCurrent;
var kViewCurrentTag = MailViewConstants.kViewCurrentTag;
var kViewTagMarker = MailViewConstants.kViewTagMarker;

/**
 * A reference to the nsIMsgMailViewList service that tracks custom mail views.
 */
var gMailViewList = null;

// perform the view/action requested by the aValue string
// and set the view picker label to the aLabel string
function ViewChange(aValue) {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const viewWrapper = about3Pane.gViewWrapper;
  if (!viewWrapper) {
    return;
  }

  if (aValue == kViewItemCustomize || aValue == kViewItemVirtual) {
    // restore to the previous view value, in case they cancel
    if (aValue == kViewItemCustomize) {
      LaunchCustomizeDialog();
    } else {
      about3Pane.folderPane.newVirtualFolder(
        ViewPickerBinding.currentViewLabel,
        viewWrapper.search.viewTerms,
        about3Pane.gFolder
      );
    }
    return;
  }

  // tag menuitem values are of the form :<keyword>
  if (isNaN(aValue)) {
    // split off the tag key
    var tagkey = aValue.substr(kViewTagMarker.length);
    viewWrapper.setMailView(kViewItemTags, tagkey);
  } else {
    var numval = Number(aValue);
    viewWrapper.setMailView(numval, null);
  }
}

function ViewChangeByMenuitem(aMenuitem) {
  // Mac View menu menuitems don't have XBL bindings
  ViewChange(aMenuitem.getAttribute("value"));
}

/**
 * Mediates interaction with the #viewPickerPopup.  In theory this should be
 *  an XBL binding, but for the insanity where the view picker may not be
 *  visible at all times (or ever).  No view picker widget, no binding.
 */
var ViewPickerBinding = {
  /**
   * Return true if the view picker is visible.  This is used by the
   *  FolderDisplayWidget to know whether or not to actually use mailviews. (The
   *  idea is that if we are not visible, then it would be confusing to the user
   *  if we filtered their mail since they would have no feedback about this and
   *  no way to change it.)
   */
  get isVisible() {
    return !!document.querySelector("#unifiedToolbarContent .view-picker");
  },

  /**
   * Return the string value representing the current mail view value as
   * understood by the view picker widgets.  The value is the index for
   * everything but tags.  for tags it's the ":"-prefixed tagname.
   */
  get currentViewValue() {
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    const viewWrapper = about3Pane.gViewWrapper;
    if (!viewWrapper) {
      return "";
    }
    if (viewWrapper.mailViewIndex == kViewItemTags) {
      return kViewTagMarker + viewWrapper.mailViewData;
    }
    return viewWrapper.mailViewIndex + "";
  },

  /**
   * @returns The label for the current mail view value.
   */
  get currentViewLabel() {
    return document.querySelector(
      `#toolbarViewPickerPopup [value="${this.currentViewValue}"]`
    )?.label;
  },
};

function LaunchCustomizeDialog() {
  OpenOrFocusWindow(
    {},
    "mailnews:mailviewlist",
    "chrome://messenger/content/mailViewList.xhtml"
  );
}

/**
 * All of these Refresh*ViewPopup* methods have to deal with several menu
 * instances. For example, the "View... Messages" menu, the view picker menu
 * list in the toolbar, in appmenu/View/Messages, etc.
 *
 * @param {Element} viewPopup - A menu popup element.
 */
function RefreshAllViewPopups(viewPopup) {
  RefreshViewPopup(viewPopup);
  const menupopups = viewPopup.getElementsByTagName("menupopup");
  if (menupopups.length > 1) {
    // When we have menupopups, we assume both tags and custom views are there.
    RefreshTagsPopup(menupopups[0]);
    RefreshCustomViewsPopup(menupopups[1]);
  }
}

/**
 * Refresh the view messages popup menu/panel. For example set checked and
 * hidden state on menu items. Used for example for appmenu/View/Messages panel.
 *
 * @param {Element} viewPopup - A menu popup element.
 */
function RefreshViewPopup(viewPopup) {
  // Mark default views if selected.
  const currentViewValue = ViewPickerBinding.currentViewValue;

  const viewAll = viewPopup.querySelector('[value="' + kViewItemAll + '"]');
  viewAll.setAttribute("checked", currentViewValue == kViewItemAll);

  const viewUnread = viewPopup.querySelector(
    '[value="' + kViewItemUnread + '"]'
  );
  viewUnread.setAttribute("checked", currentViewValue == kViewItemUnread);

  const viewNotDeleted = viewPopup.querySelector(
    '[value="' + kViewItemNotDeleted + '"]'
  );

  const folderArray = GetSelectedMsgFolders();
  if (folderArray.length == 0) {
    return;
  }

  // Only show the "Not Deleted" item for IMAP servers that are using the IMAP
  // delete model.
  viewNotDeleted.setAttribute("hidden", true);
  var msgFolder = folderArray[0];
  var server = msgFolder.server;
  if (server.type == "imap") {
    const imapServer = server.QueryInterface(Ci.nsIImapIncomingServer);

    if (imapServer.deleteModel == Ci.nsMsgImapDeleteModels.IMAPDelete) {
      viewNotDeleted.setAttribute("hidden", false);
      viewNotDeleted.setAttribute(
        "checked",
        currentViewValue == kViewItemNotDeleted
      );
    }
  }
}

/**
 * Refresh the contents of the custom views popup menu/panel.
 * Used for example for appmenu/View/Messages/CustomViews panel.
 *
 * @param {Element} parent - Parent element that will receive the menu items.
 * @param {string} [elementName] - Type of menu items to create (e.g. "menuitem", "toolbarbutton").
 * @param {string} [classes] - Classes to set on the menu items.
 */
function RefreshCustomViewsPopup(parent, elementName = "menuitem", classes) {
  if (!gMailViewList) {
    gMailViewList = Cc["@mozilla.org/messenger/mailviewlist;1"].getService(
      Ci.nsIMsgMailViewList
    );
  }

  // Remove all menu items.
  while (parent.hasChildNodes()) {
    parent.lastChild.remove();
  }

  // Rebuild the list.
  const currentView = ViewPickerBinding.currentViewValue;
  const numItems = gMailViewList.mailViewCount;

  for (let i = 0; i < numItems; ++i) {
    const viewInfo = gMailViewList.getMailViewAt(i);
    const item = document.createXULElement(elementName);

    item.setAttribute("label", viewInfo.prettyName);
    item.setAttribute("value", kViewItemFirstCustom + i);
    item.setAttribute("type", "radio");

    if (classes) {
      item.setAttribute("class", classes);
    }
    if (kViewItemFirstCustom + i == currentView) {
      item.setAttribute("checked", true);
    }

    item.addEventListener("command", () =>
      ViewChange(kViewItemFirstCustom + i)
    );

    parent.appendChild(item);
  }
}

/**
 * Refresh the contents of the tags popup menu/panel. For example, used for
 * appmenu/View/Messages/Tags.
 *
 * @param {Element} parent - Parent element that will receive the menu items.
 * @param {string} [elementName] - Type of menu items to create (e.g. "menuitem", "toolbarbutton").
 * @param {string} [classes] - Classes to set on the menu items.
 */
function RefreshTagsPopup(parent, elementName = "menuitem", classes) {
  // Remove all pre-existing menu items.
  while (parent.hasChildNodes()) {
    parent.lastChild.remove();
  }

  // Create tag menu items.
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const viewWrapper = about3Pane.gViewWrapper;
  if (!viewWrapper) {
    return;
  }
  const currentTagKey =
    viewWrapper.mailViewIndex == kViewItemTags ? viewWrapper.mailViewData : "";

  const tagArray = MailServices.tags.getAllTags();

  tagArray.forEach(tagInfo => {
    const item = document.createXULElement(elementName);

    item.setAttribute("label", tagInfo.tag);
    item.setAttribute("value", kViewTagMarker + tagInfo.key);
    item.setAttribute("type", "radio");

    if (tagInfo.key == currentTagKey) {
      item.setAttribute("checked", true);
    }
    if (tagInfo.color) {
      item.setAttribute("style", `color: ${tagInfo.color};`);
    }
    if (classes) {
      item.setAttribute("class", classes);
    }

    item.addEventListener("command", () =>
      ViewChange(kViewTagMarker + tagInfo.key)
    );

    parent.appendChild(item);
  });
}
