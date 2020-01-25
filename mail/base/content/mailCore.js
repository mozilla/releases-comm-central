/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Core mail routines used by all of the major mail windows (address book,
 * 3-pane, compose and stand alone message window).
 * Routines to support custom toolbars in mail windows, opening up a new window
 * of a particular type all live here.
 * Before adding to this file, ask yourself, is this a JS routine that is going
 * to be used by all of the main mail windows?
 */

/* import-globals-from ../../../common/src/customizeToolbar.js */
/* import-globals-from ../../extensions/mailviews/content/msgViewPickerOverlay.js */
/* import-globals-from commandglue.js */
/* import-globals-from mailWindow.js */
/* import-globals-from utilityOverlay.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { CharsetMenu } = ChromeUtils.import(
  "resource://gre/modules/CharsetMenu.jsm"
);

XPCOMUtils.defineLazyGetter(this, "gViewSourceUtils", function() {
  let scope = {};
  Services.scriptloader.loadSubScript(
    "chrome://global/content/viewSourceUtils.js",
    scope
  );
  scope.gViewSourceUtils.viewSource = async function(aArgs) {
    // Check if external view source is enabled. If so, try it. If it fails,
    // fallback to internal view source.
    if (Services.prefs.getBoolPref("view_source.editor.external")) {
      try {
        await this.openInExternalEditor(aArgs);
        return;
      } catch (ex) {}
    }

    window.openDialog(
      "chrome://messenger/content/viewSource.xhtml",
      "_blank",
      "all,dialog=no",
      aArgs
    );
  };
  return scope.gViewSourceUtils;
});

Services.obs.addObserver(
  {
    observe(win) {
      win.addEventListener(
        "load",
        function() {
          if (
            this.location.href !=
            "chrome://devtools/content/webconsole/index.html"
          ) {
            return;
          }

          this.setTimeout(() => {
            this.gViewSourceUtils = {
              async viewSource(aArgs) {
                // Check if external view source is enabled. If so, try it. If it fails,
                // fallback to internal view source.
                if (Services.prefs.getBoolPref("view_source.editor.external")) {
                  try {
                    await this.openInExternalEditor(aArgs);
                    return;
                  } catch (ex) {}
                }

                window.openDialog(
                  "chrome://messenger/content/viewSource.xhtml",
                  "_blank",
                  "all,dialog=no",
                  aArgs
                );
              },
            };
          });
        },
        { capture: false, once: true }
      );
    },
  },
  "chrome-document-global-created"
);

var gCustomizeSheet = false;

function overlayRestoreDefaultSet() {
  let toolbox = null;
  if ("arguments" in window && window.arguments[0]) {
    toolbox = window.arguments[0];
  } else if (window.frameElement && "toolbox" in window.frameElement) {
    toolbox = window.frameElement.toolbox;
  }

  let mode = toolbox.getAttribute("defaultmode");
  let align = toolbox.getAttribute("defaultlabelalign");
  let menulist = document.getElementById("modelist");

  if (mode == "full" && align == "end") {
    toolbox.setAttribute("mode", "textbesideicon");
    toolbox.setAttribute("labelalign", align);
    overlayUpdateToolbarMode("textbesideicon");
  } else if (mode == "full" && align == "") {
    toolbox.setAttribute("mode", "full");
    toolbox.removeAttribute("labelalign");
    overlayUpdateToolbarMode(mode);
  }

  restoreDefaultSet();

  if (mode == "full" && align == "end") {
    menulist.value = "textbesideicon";
  }
}

function overlayUpdateToolbarMode(aModeValue) {
  let toolbox = null;
  if ("arguments" in window && window.arguments[0]) {
    toolbox = window.arguments[0];
  } else if (window.frameElement && "toolbox" in window.frameElement) {
    toolbox = window.frameElement.toolbox;
  }

  // If they chose a mode of textbesideicon or full,
  // then map that to a mode of full, and a labelalign of true or false.
  if (aModeValue == "textbesideicon" || aModeValue == "full") {
    var align = aModeValue == "textbesideicon" ? "end" : "bottom";
    toolbox.setAttribute("labelalign", align);
    Services.xulStore.persist(toolbox, "labelalign");
    aModeValue = "full";
  }
  updateToolbarMode(aModeValue);
}

function overlayOnLoad() {
  let restoreButton = document
    .getElementById("main-box")
    .querySelector("[oncommand*='restore']");
  restoreButton.setAttribute("oncommand", "overlayRestoreDefaultSet();");

  // Add the textBesideIcon menu item if it's not already there.
  let menuitem = document.getElementById("textbesideiconItem");
  if (!menuitem) {
    let menulist = document.getElementById("modelist");
    let label = document
      .getElementById("iconsBesideText.label")
      .getAttribute("value");
    menuitem = menulist.appendItem(label, "textbesideicon");
    menuitem.id = "textbesideiconItem";
  }

  // If they have a mode of full and a labelalign of true,
  // then pretend the mode is textbesideicon when populating the popup.
  let toolbox = null;
  if ("arguments" in window && window.arguments[0]) {
    toolbox = window.arguments[0];
  } else if (window.frameElement && "toolbox" in window.frameElement) {
    toolbox = window.frameElement.toolbox;
  }

  let toolbarWindow = document.getElementById("CustomizeToolbarWindow");
  toolbarWindow.setAttribute("toolboxId", toolbox.id);
  toolbox.setAttribute("doCustomization", "true");

  let mode = toolbox.getAttribute("mode");
  let align = toolbox.getAttribute("labelalign");
  if (mode == "full" && align == "end") {
    toolbox.setAttribute("mode", "textbesideicon");
  }

  onLoad();
  overlayRepositionDialog();

  // Re-set and re-persist the mode, if we changed it above.
  if (mode == "full" && align == "end") {
    toolbox.setAttribute("mode", mode);
    Services.xulStore.persist(toolbox, "mode");
  }
}

function overlayRepositionDialog() {
  // Position the dialog so it is fully visible on the screen
  // (if possible)

  // Seems to be necessary to get the correct dialog height/width
  window.sizeToContent();
  var wH = window.outerHeight;
  var wW = window.outerWidth;
  var sH = window.screen.height;
  var sW = window.screen.width;
  var sX = window.screenX;
  var sY = window.screenY;
  var sAL = window.screen.availLeft;
  var sAT = window.screen.availTop;

  var nX = Math.max(Math.min(sX, sW - wW), sAL);
  var nY = Math.max(Math.min(sY, sH - wH), sAT);
  window.moveTo(nX, nY);
}

function CustomizeMailToolbar(toolboxId, customizePopupId) {
  // Disable the toolbar context menu items
  var menubar = document.getElementById("mail-menubar");
  for (var i = 0; i < menubar.children.length; ++i) {
    menubar.children[i].setAttribute("disabled", true);
  }

  var customizePopup = document.getElementById(customizePopupId);
  customizePopup.setAttribute("disabled", "true");

  var toolbox = document.getElementById(toolboxId);

  var customizeURL = "chrome://messenger/content/customizeToolbar.xhtml";
  gCustomizeSheet = Services.prefs.getBoolPref(
    "toolbar.customization.usesheet"
  );

  let externalToolbars = [];
  if (toolbox.getAttribute("id") == "mail-toolbox") {
    if (document.getElementById("tabbar-toolbar")) {
      externalToolbars.push(document.getElementById("tabbar-toolbar"));
    }
    if (
      AppConstants.platform != "macosx" &&
      document.getElementById("mail-toolbar-menubar2")
    ) {
      externalToolbars.push(document.getElementById("mail-toolbar-menubar2"));
    }
    if (document.getElementById("folderPane-toolbar")) {
      externalToolbars.push(document.getElementById("folderPane-toolbar"));
    }
  }

  if (gCustomizeSheet) {
    var sheetFrame = document.getElementById("customizeToolbarSheetIFrame");
    var panel = document.getElementById("customizeToolbarSheetPopup");
    sheetFrame.hidden = false;
    sheetFrame.toolbox = toolbox;
    sheetFrame.panel = panel;
    if (externalToolbars.length > 0) {
      sheetFrame.externalToolbars = externalToolbars;
    }

    // The document might not have been loaded yet, if this is the first time.
    // If it is already loaded, reload it so that the onload initialization code
    // re-runs.
    if (sheetFrame.getAttribute("src") == customizeURL) {
      sheetFrame.contentWindow.location.reload();
    } else {
      sheetFrame.setAttribute("src", customizeURL);
    }

    // Open the panel, but make it invisible until the iframe has loaded so
    // that the user doesn't see a white flash.
    panel.style.visibility = "hidden";
    toolbox.addEventListener(
      "beforecustomization",
      function() {
        panel.style.removeProperty("visibility");
      },
      { capture: false, once: true }
    );
    panel.openPopup(toolbox, "after_start", 0, 0);
  } else {
    var wintype = document.documentElement.getAttribute("windowtype");
    wintype = wintype.replace(/:/g, "");

    window.openDialog(
      customizeURL,
      "CustomizeToolbar" + wintype,
      "chrome,all,dependent",
      toolbox,
      externalToolbars
    );
  }
}

function MailToolboxCustomizeDone(aEvent, customizePopupId) {
  if (gCustomizeSheet) {
    document.getElementById("customizeToolbarSheetIFrame").hidden = true;
    document.getElementById("customizeToolbarSheetPopup").hidePopup();
  }

  // Update global UI elements that may have been added or removed

  // Re-enable parts of the UI we disabled during the dialog
  var menubar = document.getElementById("mail-menubar");
  for (var i = 0; i < menubar.children.length; ++i) {
    menubar.children[i].setAttribute("disabled", false);
  }

  // make sure the mail views search box is initialized
  if (document.getElementById("mailviews-container")) {
    ViewPickerOnLoad();
  }

  // make sure the folder location picker is initialized
  if (document.getElementById("folder-location-container")) {
    FolderPaneSelectionChange();
  }

  var customizePopup = document.getElementById(customizePopupId);
  customizePopup.removeAttribute("disabled");

  // make sure our toolbar buttons have the correct enabled state restored to them...
  if (this.UpdateMailToolbar != undefined) {
    UpdateMailToolbar(focus);
  }

  let toolbox = document.querySelector('[doCustomization="true"]');
  if (toolbox) {
    toolbox.removeAttribute("doCustomization");

    // The GetMail button is stuck in a strange state right now, since the
    // customization wrapping preserves its children, but not its initialized
    // state. Fix that here.
    // That is also true for the File -> "Get new messages for" menuitems in both
    // menus (old and new App menu). And also Go -> Folder.
    // TODO bug 904223: try to fix folderWidgets.xml to not do this.
    // See Bug 520457 and Bug 534448 and Bug 709733.
    // Fix Bug 565045: Only treat "Get Message Button" if it is in our toolbox
    for (let popup of [
      toolbox.querySelector("#button-getMsgPopup"),
      document.getElementById("menu_getAllNewMsgPopup"),
      document.getElementById("appmenu_getAllNewMsgPopup"),
      document.getElementById("menu_GoFolderPopup"),
      document.getElementById("appmenu_GoFolderPopup"),
    ]) {
      if (!popup) {
        continue;
      }

      // .teardown() is only available here if the menu has its frame
      // otherwise the folderWidgets.xml::folder-menupopup binding is not
      // attached to the popup. So if it is not available, remove the items
      // explicitly. Only remove elements that were generated by the binding.
      if ("_teardown" in popup) {
        popup._teardown();
      } else {
        for (let i = popup.children.length - 1; i >= 0; i--) {
          let child = popup.children[i];
          if (child.getAttribute("generated") != "true") {
            continue;
          }
          if ("_teardown" in child) {
            child._teardown();
          }
          child.remove();
        }
      }
    }
  }
}

/**
 * Sets up the menu popup that lets the user hide or display toolbars. For
 * example, in the appmenu / Preferences view.  Adds toolbar items to the popup
 * and sets their attributes.
 *
 * @param {Event} event                 Event causing the menu popup to appear.
 * @param {string|string[]} toolboxIds  IDs of toolboxes that contain toolbars.
 * @param {Element} insertPoint         Where to insert menu items.
 * @param {string} [elementName]        What kind of menu item element to use.
 *                                      E.g. "toolbarbutton" for the appmenu.
 * @param {string} [classes]            Classes to set on menu items.
 */
function onViewToolbarsPopupShowing(
  event,
  toolboxIds,
  insertPoint,
  elementName = "menuitem",
  classes
) {
  if (!Array.isArray(toolboxIds)) {
    toolboxIds = [toolboxIds];
  }

  const popup =
    event.target.querySelector(".panel-subview-body") || event.target;

  // Remove all collapsible nodes from the menu.
  for (let i = popup.children.length - 1; i >= 0; --i) {
    const deadItem = popup.children[i];

    if (deadItem.hasAttribute("iscollapsible")) {
      deadItem.remove();
    }
  }

  // We insert menuitems before the first child if no insert point is given.
  const firstMenuItem = insertPoint || popup.firstElementChild;

  for (const toolboxId of toolboxIds) {
    const toolbox = document.getElementById(toolboxId);

    // We consider child nodes that have a toolbarname attribute.
    const toolbars = Array.from(toolbox.querySelectorAll("[toolbarname]"));

    // Add the folder pane toolbar to the list of toolbars that can be shown and
    // hidden.
    if (toolbox.getAttribute("id") === "mail-toolbox") {
      if (
        AppConstants.platform != "macosx" &&
        document.getElementById("mail-toolbar-menubar2")
      ) {
        toolbars.push(document.getElementById("mail-toolbar-menubar2"));
      }
      if (document.getElementById("folderPane-toolbar")) {
        toolbars.push(document.getElementById("folderPane-toolbar"));
      }
    }

    for (const toolbar of toolbars) {
      const toolbarName = toolbar.getAttribute("toolbarname");
      if (toolbarName) {
        const menuItem = document.createXULElement(elementName);

        const hidingAttribute =
          toolbar.getAttribute("type") == "menubar" ? "autohide" : "collapsed";

        menuItem.setAttribute("type", "checkbox");
        // Mark this menuitem with an iscollapsible attribute, so we
        // know we can wipe it out later on.
        menuItem.setAttribute("iscollapsible", true);
        menuItem.setAttribute("toolbarid", toolbar.id);
        menuItem.setAttribute("label", toolbarName);
        menuItem.setAttribute("accesskey", toolbar.getAttribute("accesskey"));
        menuItem.setAttribute(
          "checked",
          toolbar.getAttribute(hidingAttribute) != "true"
        );
        if (classes) {
          menuItem.setAttribute("class", classes);
        }
        popup.insertBefore(menuItem, firstMenuItem);

        menuItem.addEventListener("command", () => {
          const hidden = toolbar.getAttribute(hidingAttribute) != "true";

          if (hidden) {
            toolbar.setAttribute(hidingAttribute, "true");
          } else {
            toolbar.removeAttribute(hidingAttribute);
          }
          Services.xulStore.persist(toolbar, hidingAttribute);
        });
      }
    }
  }
}

function toJavaScriptConsole() {
  BrowserConsoleManager.openBrowserConsoleOrFocus();
}

function openAboutDebugging(hash) {
  let url = "about:debugging" + (hash ? "#" + hash : "");
  document
    .getElementById("tabmail")
    .openTab("contentTab", { contentPage: url });
}

function toOpenWindowByType(inType, uri) {
  var topWindow = Services.wm.getMostRecentWindow(inType);
  if (topWindow) {
    topWindow.focus();
  } else {
    window.open(
      uri,
      "_blank",
      "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar"
    );
  }
}

function toMessengerWindow() {
  toOpenWindowByType(
    "mail:3pane",
    "chrome://messenger/content/messenger.xhtml"
  );
}

function focusOnMail(tabNo, event) {
  // this is invoked by accel-<number>
  // if the window isn't visible or focused, make it so
  var topWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (topWindow) {
    if (topWindow != window) {
      topWindow.focus();
    } else {
      document.getElementById("tabmail").selectTabByIndex(event, tabNo);
    }
  } else {
    window.open(
      "chrome://messenger/content/messenger.xhtml",
      "_blank",
      "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar"
    );
  }
}

function toAddressBook() {
  toOpenWindowByType(
    "mail:addressbook",
    "chrome://messenger/content/addressbook/addressbook.xhtml"
  );
}

function showChatTab() {
  let tabmail = document.getElementById("tabmail");
  if (gChatTab) {
    tabmail.switchToTab(gChatTab);
  } else {
    tabmail.openTab("chat", {});
  }
}

function toImport() {
  window.openDialog(
    "chrome://messenger/content/importDialog.xhtml",
    "importDialog",
    "chrome, modal, titlebar, centerscreen"
  );
}

function toSanitize() {
  Cc["@mozilla.org/mail/mailglue;1"]
    .getService(Ci.nsIMailGlue)
    .sanitize(window);
}

/**
 * Opens the Preferences (Options) dialog.
 *
 * @param aPaneID       ID of prefpane to select automatically.
 * @param aScrollPaneTo ID of the element to scroll into view.
 * @param aOtherArgs    other prefpane specific arguments
 */
function openOptionsDialog(aPaneID, aScrollPaneTo, aOtherArgs) {
  openPreferencesTab(aPaneID, aScrollPaneTo, aOtherArgs);
}

function openAddonsMgr(aView) {
  return new Promise(resolve => {
    let emWindow;
    let browserWindow;

    let receivePong = function(aSubject, aTopic, aData) {
      let browserWin = aSubject.docShell.rootTreeItem.domWindow;
      if (!emWindow || browserWin == window /* favor the current window */) {
        emWindow = aSubject;
        browserWindow = browserWin;
      }
    };
    Services.obs.addObserver(receivePong, "EM-pong");
    Services.obs.notifyObservers(null, "EM-ping");
    Services.obs.removeObserver(receivePong, "EM-pong");

    if (emWindow) {
      if (aView) {
        emWindow.loadView(aView);
      }
      let tabmail = browserWindow.document.getElementById("tabmail");
      tabmail.switchToTab(tabmail.getBrowserForDocument(emWindow));
      emWindow.focus();
      resolve(emWindow);
      return;
    }

    // This must be a new load, else the ping/pong would have
    // found the window above.
    let addonSiteRegExp = Services.prefs.getCharPref(
      "extensions.getAddons.siteRegExp"
    );
    let tab = openContentTab("about:addons", "tab", addonSiteRegExp);
    // Also in `contentTabType.restoreTab` in specialTabs.js.
    tab.browser.droppedLinkHandler = event =>
      tab.browser.contentWindow.gDragDrop.onDrop(event);

    Services.obs.addObserver(function observer(aSubject, aTopic, aData) {
      Services.obs.removeObserver(observer, aTopic);
      if (aView) {
        aSubject.loadView(aView);
      }
      aSubject.focus();
      resolve(aSubject);
    }, "EM-loaded");
  });
}

/**
 * Open a dialog with addon preferences.
 *
 * @option aURL  Chrome URL for the preferences XUL file of the addon.
 */
function openAddonPrefs(aURL, aOptionsType) {
  if (aOptionsType == "addons") {
    openAddonsMgr(aURL);
  } else if (aOptionsType == "tab") {
    switchToTabHavingURI(aURL, true);
  } else {
    let instantApply = Services.prefs.getBoolPref(
      "browser.preferences.instantApply"
    );
    let features =
      "chrome,titlebar,toolbar,centerscreen" +
      (instantApply ? ",dialog=no" : ",modal");

    window.openDialog(aURL, "addonPrefs", features);
  }
}

function openActivityMgr() {
  Cc["@mozilla.org/activity-manager-ui;1"]
    .getService(Ci.nsIActivityManagerUI)
    .show(window);
}

function openIMAccountMgr() {
  var win = Services.wm.getMostRecentWindow("Messenger:Accounts");
  if (win) {
    win.focus();
  } else {
    win = Services.ww.openWindow(
      null,
      "chrome://messenger/content/chat/imAccounts.xhtml",
      "Accounts",
      "chrome,resizable,centerscreen",
      null
    );
  }
  return win;
}

function openIMAccountWizard() {
  const kFeatures = "chrome,centerscreen,modal,titlebar";
  const kUrl = "chrome://messenger/content/chat/imAccountWizard.xhtml";
  const kName = "IMAccountWizard";

  if (AppConstants.platform == "macosx") {
    // On Mac, avoid using the hidden window as a parent as that would
    // make it visible.
    let hiddenWindowUrl = Services.prefs.getCharPref(
      "browser.hiddenWindowChromeURL"
    );
    if (window.location.href == hiddenWindowUrl) {
      Services.ww.openWindow(null, kUrl, kName, kFeatures, null);
      return;
    }
  }

  window.openDialog(kUrl, kName, kFeatures);
}

function openSavedFilesWnd() {
  let tabmail = document.getElementById("tabmail");
  let downloadsBrowser = tabmail.getBrowserForDocumentId("aboutDownloads");
  if (downloadsBrowser) {
    tabmail.switchToTab(downloadsBrowser);
  } else {
    tabmail.openTab("chromeTab", {
      chromePage: "about:downloads",
      clickHandler: "specialTabs.aboutClickHandler(event);",
    });
  }
}

function SetBusyCursor(window, enable) {
  // setCursor() is only available for chrome windows.
  // However one of our frames is the start page which
  // is a non-chrome window, so check if this window has a
  // setCursor method
  if ("setCursor" in window) {
    if (enable) {
      window.setCursor("progress");
    } else {
      window.setCursor("auto");
    }
  }

  var numFrames = window.frames.length;
  for (var i = 0; i < numFrames; i++) {
    SetBusyCursor(window.frames[i], enable);
  }
}

function openAboutDialog() {
  for (let win of Services.wm.getEnumerator("Mail:About")) {
    // Only open one about window
    win.focus();
    return;
  }

  let features;
  if (AppConstants.platform == "win") {
    features = "chrome,centerscreen,dependent";
  } else if (AppConstants.platform == "macosx") {
    features = "chrome,resizable=no,minimizable=no";
  } else {
    features = "chrome,centerscreen,dependent,dialog=no";
  }

  window.openDialog(
    "chrome://messenger/content/aboutDialog.xhtml",
    "About",
    features
  );
}

/**
 * Opens the support page based on the app.support.baseURL pref.
 */
function openSupportURL() {
  openFormattedURL("app.support.baseURL");
}

/**
 *  Fetches the url for the passed in pref name, formats it and then loads it in the default
 *  browser.
 *
 *  @param aPrefName - name of the pref that holds the url we want to format and open
 */
function openFormattedURL(aPrefName) {
  var urlToOpen = Services.urlFormatter.formatURLPref(aPrefName);

  var uri = Services.io.newURI(urlToOpen);

  var protocolSvc = Cc[
    "@mozilla.org/uriloader/external-protocol-service;1"
  ].getService(Ci.nsIExternalProtocolService);
  protocolSvc.loadURI(uri);
}

/**
 * Opens the Troubleshooting page in a new tab.
 */
function openAboutSupport() {
  let tabmail = document.getElementById("tabmail");
  tabmail.openTab("contentTab", {
    contentPage: "about:support",
    clickHandler: "specialTabs.aboutClickHandler(event);",
  });
}

/**
 * Prompt the user to restart the browser in safe mode.
 */
function safeModeRestart() {
  // Is TB in safe mode?
  if (Services.appinfo.inSafeMode) {
    let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    Services.obs.notifyObservers(
      cancelQuit,
      "quit-application-requested",
      "restart"
    );

    if (cancelQuit.data) {
      return;
    }

    Services.startup.quit(
      Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit
    );
    return;
  }
  // prompt the user to confirm
  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  let promptTitle = bundle.GetStringFromName("safeModeRestartPromptTitle");
  let promptMessage = bundle.GetStringFromName("safeModeRestartPromptMessage");
  let restartText = bundle.GetStringFromName("safeModeRestartButton");
  let buttonFlags =
    Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
    Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
    Services.prompt.BUTTON_POS_0_DEFAULT;

  let rv = Services.prompt.confirmEx(
    window,
    promptTitle,
    promptMessage,
    buttonFlags,
    restartText,
    null,
    null,
    null,
    {}
  );
  if (rv == 0) {
    let environment = Cc["@mozilla.org/process/environment;1"].getService(
      Ci.nsIEnvironment
    );
    environment.set("MOZ_SAFE_MODE_RESTART", "1");
    let { BrowserUtils } = ChromeUtils.import(
      "resource://gre/modules/BrowserUtils.jsm"
    );
    BrowserUtils.restartApplication();
  }
}

function getMostRecentMailWindow() {
  let win = null;

  win = Services.wm.getMostRecentWindow("mail:3pane", true);

  // If we're lucky, this isn't a popup, and we can just return this.
  if (win && win.document.documentElement.getAttribute("chromehidden")) {
    win = null;
    // This is oldest to newest, so this gets a bit ugly.
    for (let nextWin of Services.wm.getEnumerator("mail:3pane", true)) {
      if (!nextWin.document.documentElement.getAttribute("chromehidden")) {
        win = nextWin;
      }
    }
  }

  return win;
}

/**
 * Create a sanitized display name for an attachment in order to help prevent
 * people from hiding malicious extensions behind a run of spaces, etc. To do
 * this, we strip leading/trailing whitespace and collapse long runs of either
 * whitespace or identical characters. Windows especially will drop trailing
 * dots and whitespace from filename extensions.
 *
 * @param aAttachment the AttachmentInfo object
 * @return a sanitized display name for the attachment
 */
function SanitizeAttachmentDisplayName(aAttachment) {
  let displayName = aAttachment.name.trim().replace(/\s+/g, " ");
  if (AppConstants.platform == "win") {
    displayName = displayName.replace(/[ \.]+$/, "");
  }
  return displayName.replace(/(.)\1{9,}/g, "$1…$1");
}

/**
 * Appends a dataTransferItem to the associated event for message attachments,
 * either from the message reader or the composer.
 *
 * @param {Event} event - The associated event.
 * @param {nsIMsgAttachment[]} attachments - The attachments to setup
 */
function setupDataTransfer(event, attachments) {
  // For now, disallow drag-and-drop on cloud attachments. In the future, we
  // should allow this.
  let index = 0;
  for (let attachment of attachments) {
    if (
      attachment.contentType == "text/x-moz-deleted" ||
      attachment.sendViaCloud
    ) {
      return;
    }

    let name = attachment.name || attachment.displayName;

    if (!attachment.url || !name) {
      continue;
    }

    // Only add type/filename info for non-file URLs that don't already
    // have it.
    let info;
    if (/(^file:|&filename=)/.test(attachment.url)) {
      info = attachment.url;
    } else {
      info =
        attachment.url +
        "&type=" +
        attachment.contentType +
        "&filename=" +
        encodeURIComponent(name);
    }

    event.dataTransfer.mozSetDataAt(
      "text/x-moz-url",
      info + "\n" + name + "\n" + attachment.size,
      index
    );
    event.dataTransfer.mozSetDataAt(
      "text/x-moz-url-data",
      attachment.url,
      index
    );
    event.dataTransfer.mozSetDataAt("text/x-moz-url-desc", name, index);
    event.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-url",
      attachment.url,
      index
    );
    event.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise",
      new nsFlavorDataProvider(),
      index
    );
    index++;
  }
}

function nsFlavorDataProvider() {}

nsFlavorDataProvider.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

  getFlavorData(aTransferable, aFlavor, aData) {
    // get the url for the attachment
    if (aFlavor == "application/x-moz-file-promise") {
      var urlPrimitive = {};
      aTransferable.getTransferData(
        "application/x-moz-file-promise-url",
        urlPrimitive
      );

      var srcUrlPrimitive = urlPrimitive.value.QueryInterface(
        Ci.nsISupportsString
      );

      // now get the destination file location from kFilePromiseDirectoryMime
      var dirPrimitive = {};
      aTransferable.getTransferData(
        "application/x-moz-file-promise-dir",
        dirPrimitive
      );
      var destDirectory = dirPrimitive.value.QueryInterface(Ci.nsIFile);

      // now save the attachment to the specified location
      // XXX: we need more information than just the attachment url to save it,
      // fortunately, we have an array of all the current attachments so we can
      // cheat and scan through them

      var attachment = null;
      for (let index of currentAttachments.keys()) {
        attachment = currentAttachments[index];
        if (attachment.url == srcUrlPrimitive) {
          break;
        }
      }

      // call our code for saving attachments
      if (attachment) {
        var name = attachment.name || attachment.displayName;
        var destFilePath = messenger.saveAttachmentToFolder(
          attachment.contentType,
          attachment.url,
          encodeURIComponent(name),
          attachment.uri,
          destDirectory
        );
        aData.value = destFilePath.QueryInterface(Ci.nsISupports);
      }
    }
  },
};

function UpdateCharsetMenu(aCharset, aNode) {
  var bundle = document.getElementById("charsetBundle");
  CharsetMenu.update(aNode, bundle.getString(aCharset.toLowerCase()));
}
