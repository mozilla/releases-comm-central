/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["CustomizableWidgets"];

const { CustomizableUI } = ChromeUtils.import(
  "resource:///modules/CustomizableUI.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  RecentlyClosedTabsAndWindowsMenuUtils:
    "resource:///modules/sessionstore/RecentlyClosedTabsAndWindowsMenuUtils.jsm",
  ShortcutUtils: "resource://gre/modules/ShortcutUtils.jsm",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.jsm",
});

const kPrefCustomizationDebug = "browser.uiCustomization.debug";

XPCOMUtils.defineLazyGetter(this, "log", () => {
  let scope = {};
  ChromeUtils.import("resource://gre/modules/Console.jsm", scope);
  let debug = Services.prefs.getBoolPref(kPrefCustomizationDebug, false);
  let consoleOptions = {
    maxLogLevel: debug ? "all" : "log",
    prefix: "CustomizableWidgets",
  };
  return new scope.ConsoleAPI(consoleOptions);
});

function setAttributes(aNode, aAttrs) {
  let doc = aNode.ownerDocument;
  for (let [name, value] of Object.entries(aAttrs)) {
    if (!value) {
      if (aNode.hasAttribute(name)) {
        aNode.removeAttribute(name);
      }
    } else {
      if (name == "shortcutId") {
        continue;
      }
      if (name == "label" || name == "tooltiptext") {
        let stringId = typeof value == "string" ? value : name;
        let additionalArgs = [];
        if (aAttrs.shortcutId) {
          let shortcut = doc.getElementById(aAttrs.shortcutId);
          if (shortcut) {
            additionalArgs.push(ShortcutUtils.prettifyShortcut(shortcut));
          }
        }
        value = CustomizableUI.getLocalizedProperty(
          { id: aAttrs.id },
          stringId,
          additionalArgs
        );
      }
      aNode.setAttribute(name, value);
    }
  }
}

const CustomizableWidgets = [
  {
    id: "history-panelmenu",
    type: "view",
    viewId: "PanelUI-history",
    shortcutId: "key_gotoHistory",
    tooltiptext: "history-panelmenu.tooltiptext2",
    recentlyClosedTabsPanel: "appMenu-library-recentlyClosedTabs",
    recentlyClosedWindowsPanel: "appMenu-library-recentlyClosedWindows",
    handleEvent(event) {
      switch (event.type) {
        case "PanelMultiViewHidden":
          this.onPanelMultiViewHidden(event);
          break;
        case "ViewShowing":
          this.onSubViewShowing(event);
          break;
        default:
          throw new Error(`Unsupported event for '${this.id}'`);
      }
    },
    onViewShowing(event) {
      if (this._panelMenuView) {
        return;
      }

      let panelview = event.target;
      let document = panelview.ownerDocument;
      let window = document.defaultView;

      // We restrict the amount of results to 42. Not 50, but 42. Why? Because 42.
      let query =
        "place:queryType=" +
        Ci.nsINavHistoryQueryOptions.QUERY_TYPE_HISTORY +
        "&sort=" +
        Ci.nsINavHistoryQueryOptions.SORT_BY_DATE_DESCENDING +
        "&maxResults=42&excludeQueries=1";

      this._panelMenuView = new window.PlacesPanelview(
        document.getElementById("appMenu_historyMenu"),
        panelview,
        query
      );
      // When either of these sub-subviews show, populate them with recently closed
      // objects data.
      document
        .getElementById(this.recentlyClosedTabsPanel)
        .addEventListener("ViewShowing", this);
      document
        .getElementById(this.recentlyClosedWindowsPanel)
        .addEventListener("ViewShowing", this);
      // When the popup is hidden (thus the panelmultiview node as well), make
      // sure to stop listening to PlacesDatabase updates.
      panelview.panelMultiView.addEventListener("PanelMultiViewHidden", this);
    },
    onViewHiding(event) {
      log.debug("History view is being hidden!");
    },
    onPanelMultiViewHidden(event) {
      let panelMultiView = event.target;
      let document = panelMultiView.ownerDocument;
      if (this._panelMenuView) {
        this._panelMenuView.uninit();
        delete this._panelMenuView;
        document
          .getElementById(this.recentlyClosedTabsPanel)
          .removeEventListener("ViewShowing", this);
        document
          .getElementById(this.recentlyClosedWindowsPanel)
          .removeEventListener("ViewShowing", this);
      }
      panelMultiView.removeEventListener("PanelMultiViewHidden", this);
    },
    onSubViewShowing(event) {
      let panelview = event.target;
      let document = event.target.ownerDocument;
      let window = document.defaultView;
      let viewType =
        panelview.id == this.recentlyClosedTabsPanel ? "Tabs" : "Windows";

      this._panelMenuView.clearAllContents(panelview);

      let utils = RecentlyClosedTabsAndWindowsMenuUtils;
      let method = `get${viewType}Fragment`;
      let fragment = utils[method](window, "toolbarbutton", true);
      let elementCount = fragment.childElementCount;
      this._panelMenuView._setEmptyPopupStatus(panelview, !elementCount);
      if (!elementCount) {
        return;
      }

      let body = document.createXULElement("vbox");
      body.className = "panel-subview-body";
      body.appendChild(fragment);
      let footer;
      while (--elementCount >= 0) {
        let element = body.children[elementCount];
        CustomizableUI.addShortcut(element);
        element.classList.add("subviewbutton");
        if (element.classList.contains("restoreallitem")) {
          footer = element;
          element.classList.add("panel-subview-footer");
        } else {
          element.classList.add("subviewbutton-iconic", "bookmark-item");
        }
      }
      panelview.appendChild(body);
      panelview.appendChild(footer);
    },
  },
  {
    id: "save-page-button",
    shortcutId: "key_savePage",
    tooltiptext: "save-page-button.tooltiptext3",
    onCommand(aEvent) {
      let win = aEvent.target.ownerGlobal;
      win.saveBrowser(win.gBrowser.selectedBrowser);
    },
  },
  {
    id: "find-button",
    shortcutId: "key_find",
    tooltiptext: "find-button.tooltiptext3",
    onCommand(aEvent) {
      let win = aEvent.target.ownerGlobal;
      if (win.gLazyFindCommand) {
        win.gLazyFindCommand("onFindCommand");
      }
    },
  },
  {
    id: "open-file-button",
    shortcutId: "openFileKb",
    tooltiptext: "open-file-button.tooltiptext3",
    onCommand(aEvent) {
      let win = aEvent.target.ownerGlobal;
      win.BrowserOpenFileWindow();
    },
  },
  {
    id: "sidebar-button",
    tooltiptext: "sidebar-button.tooltiptext2",
    onCommand(aEvent) {
      let win = aEvent.target.ownerGlobal;
      win.SidebarUI.toggle();
    },
    onCreated(aNode) {
      // Add an observer so the button is checked while the sidebar is open
      let doc = aNode.ownerDocument;
      let obChecked = doc.createXULElement("observes");
      obChecked.setAttribute("element", "sidebar-box");
      obChecked.setAttribute("attribute", "checked");
      let obPosition = doc.createXULElement("observes");
      obPosition.setAttribute("element", "sidebar-box");
      obPosition.setAttribute("attribute", "positionend");

      aNode.appendChild(obChecked);
      aNode.appendChild(obPosition);
    },
  },
  {
    id: "add-ons-button",
    shortcutId: "key_openAddons",
    tooltiptext: "add-ons-button.tooltiptext3",
    onCommand(aEvent) {
      let win = aEvent.target.ownerGlobal;
      win.BrowserOpenAddonsMgr();
    },
  },
  {
    id: "zoom-controls",
    type: "custom",
    tooltiptext: "zoom-controls.tooltiptext2",
    onBuild(aDocument) {
      let buttons = [
        {
          id: "zoom-out-button",
          command: "cmd_fullZoomReduce",
          label: true,
          closemenu: "none",
          tooltiptext: "tooltiptext2",
          shortcutId: "key_fullZoomReduce",
          class: "toolbarbutton-1 toolbarbutton-combined",
        },
        {
          id: "zoom-reset-button",
          command: "cmd_fullZoomReset",
          closemenu: "none",
          tooltiptext: "tooltiptext2",
          shortcutId: "key_fullZoomReset",
          class: "toolbarbutton-1 toolbarbutton-combined",
        },
        {
          id: "zoom-in-button",
          command: "cmd_fullZoomEnlarge",
          closemenu: "none",
          label: true,
          tooltiptext: "tooltiptext2",
          shortcutId: "key_fullZoomEnlarge",
          class: "toolbarbutton-1 toolbarbutton-combined",
        },
      ];

      let node = aDocument.createXULElement("toolbaritem");
      node.setAttribute("id", "zoom-controls");
      node.setAttribute(
        "label",
        CustomizableUI.getLocalizedProperty(this, "label")
      );
      node.setAttribute(
        "title",
        CustomizableUI.getLocalizedProperty(this, "tooltiptext")
      );
      // Set this as an attribute in addition to the property to make sure we can style correctly.
      node.setAttribute("removable", "true");
      node.classList.add("chromeclass-toolbar-additional");
      node.classList.add("toolbaritem-combined-buttons");

      buttons.forEach(function(aButton, aIndex) {
        if (aIndex != 0) {
          node.appendChild(aDocument.createXULElement("separator"));
        }
        let btnNode = aDocument.createXULElement("toolbarbutton");
        setAttributes(btnNode, aButton);
        node.appendChild(btnNode);
      });
      return node;
    },
  },
  {
    id: "edit-controls",
    type: "custom",
    tooltiptext: "edit-controls.tooltiptext2",
    onBuild(aDocument) {
      let buttons = [
        {
          id: "cut-button",
          command: "cmd_cut",
          label: true,
          tooltiptext: "tooltiptext2",
          shortcutId: "key_cut",
          class: "toolbarbutton-1 toolbarbutton-combined",
        },
        {
          id: "copy-button",
          command: "cmd_copy",
          label: true,
          tooltiptext: "tooltiptext2",
          shortcutId: "key_copy",
          class: "toolbarbutton-1 toolbarbutton-combined",
        },
        {
          id: "paste-button",
          command: "cmd_paste",
          label: true,
          tooltiptext: "tooltiptext2",
          shortcutId: "key_paste",
          class: "toolbarbutton-1 toolbarbutton-combined",
        },
      ];

      let node = aDocument.createXULElement("toolbaritem");
      node.setAttribute("id", "edit-controls");
      node.setAttribute(
        "label",
        CustomizableUI.getLocalizedProperty(this, "label")
      );
      node.setAttribute(
        "title",
        CustomizableUI.getLocalizedProperty(this, "tooltiptext")
      );
      // Set this as an attribute in addition to the property to make sure we can style correctly.
      node.setAttribute("removable", "true");
      node.classList.add("chromeclass-toolbar-additional");
      node.classList.add("toolbaritem-combined-buttons");

      buttons.forEach(function(aButton, aIndex) {
        if (aIndex != 0) {
          node.appendChild(aDocument.createXULElement("separator"));
        }
        let btnNode = aDocument.createXULElement("toolbarbutton");
        setAttributes(btnNode, aButton);
        node.appendChild(btnNode);
      });

      let listener = {
        onWidgetInstanceRemoved: (aWidgetId, aDoc) => {
          if (aWidgetId != this.id || aDoc != aDocument) {
            return;
          }
          CustomizableUI.removeListener(listener);
        },
        onWidgetOverflow(aWidgetNode) {
          if (aWidgetNode == node) {
            node.ownerGlobal.updateEditUIVisibility();
          }
        },
        onWidgetUnderflow(aWidgetNode) {
          if (aWidgetNode == node) {
            node.ownerGlobal.updateEditUIVisibility();
          }
        },
      };
      CustomizableUI.addListener(listener);

      return node;
    },
  },
  {
    id: "characterencoding-button",
    l10nId: "repair-text-encoding-button",
    onCommand(aEvent) {
      aEvent.view.BrowserSetForcedCharacterSet("_autodetect_all");
    },
  },
  {
    id: "email-link-button",
    tooltiptext: "email-link-button.tooltiptext3",
    onCommand(aEvent) {
      let win = aEvent.view;
      win.MailIntegration.sendLinkForBrowser(win.gBrowser.selectedBrowser);
    },
  },
];

let preferencesButton = {
  id: "preferences-button",
  onCommand(aEvent) {
    let win = aEvent.target.ownerGlobal;
    win.openPreferences(undefined);
  },
};
if (AppConstants.platform == "win") {
  preferencesButton.label = "preferences-button.labelWin";
  preferencesButton.tooltiptext = "preferences-button.tooltipWin2";
} else if (AppConstants.platform == "macosx") {
  preferencesButton.tooltiptext = "preferences-button.tooltiptext.withshortcut";
  preferencesButton.shortcutId = "key_preferencesCmdMac";
} else {
  preferencesButton.tooltiptext = "preferences-button.tooltiptext2";
}
CustomizableWidgets.push(preferencesButton);

if (PrivateBrowsingUtils.enabled) {
  CustomizableWidgets.push({
    id: "privatebrowsing-button",
    shortcutId: "key_privatebrowsing",
    onCommand(e) {
      let win = e.target.ownerGlobal;
      win.OpenBrowserWindow({ private: true });
    },
  });
}
