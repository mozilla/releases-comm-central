/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function toNavigator()
{
  if (!CycleWindow("navigator:browser"))
    OpenBrowserWindow();
}

function ExpirePassword()
{
  // Queries the HTTP Auth Manager and clears all sessions
  Cc['@mozilla.org/network/http-auth-manager;1']
    .getService(Ci.nsIHttpAuthManager)
    .clearAll();

  // Expires the master password
  Cc["@mozilla.org/security/pk11tokendb;1"]
    .createInstance(Ci.nsIPK11TokenDB)
    .getInternalKeyToken()
    .checkPassword("");
}

function toDownloadManager()
{
  Cc["@mozilla.org/suite/suiteglue;1"]
    .getService(Ci.nsISuiteGlue)
    .showDownloadManager();
}

function toDataManager(aView)
{
  var useDlg = Services.prefs.getBoolPref("suite.manager.dataman.openAsDialog");

  if (useDlg) {
    var url = "chrome://communicator/content/dataman/dataman.xul";
    var win = toOpenWindowByType("data:manager", url, "", aView);
    if (win && aView)
      win.gDataman.loadView(aView);
    return;
  }

  switchToTabHavingURI("about:data", true, {
    browserCallback: function(browser) {
      if (aView) {
        browser.contentWindow.wrappedJSObject.gDataman.loadView(aView);
      }
    }
  });
}

function toEM(aView)
{
  var useDlg = Services.prefs.getBoolPref("suite.manager.addons.openAsDialog");

  if (useDlg) {
    var view = aView ? { view: aView } : null;
    var url = "chrome://mozapps/content/extensions/extensions.xul";
    var win = toOpenWindowByType("Addons:Manager", url, "", view);
    if (win && aView)
      win.loadView(aView);
    return;
  }

  switchToTabHavingURI("about:addons", true, {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    browserCallback: function(browser) {
      if (aView) {
        browser.contentWindow.wrappedJSObject.loadView(aView);
      }
    }
  });

}

function toBookmarksManager()
{
  toOpenWindowByType("Places:Organizer",
                     "chrome://communicator/content/places/places.xul");
}

function toJavaScriptConsole()
{
    toOpenWindowByType("suite:console", "chrome://communicator/content/console/console.xul");
}

function toOpenWindow( aWindow )
{
  try {
    // Try to focus the previously focused window e.g. message compose body
    aWindow.document.commandDispatcher.focusedWindow.focus();
  } catch (e) {
    // e.g. non-XUL document; just raise the top window
    aWindow.focus();
  }
}

function toOpenWindowByType(inType, uri, features, args)
{
  // don't do several loads in parallel
  if (uri in window)
    return;

  var topWindow = Services.wm.getMostRecentWindow(inType);
  if ( topWindow )
  {
    toOpenWindow( topWindow );
    return topWindow;
  }
  else
  {
    // open the requested window, but block it until it's fully loaded
    function newWindowLoaded(event)
    {
      // make sure that this handler is called only once
      window.removeEventListener("unload", newWindowLoaded);
      window[uri].removeEventListener("load", newWindowLoaded);
      delete window[uri];
    }

    // Remember the newly loading window until it's fully loaded
    // or until the current window passes away.
    // Only pass args if they exist and have a value (see Bug 1279738).
    if (typeof args != "undefined" && args) {
      window[uri] = openDialog(uri, "",
                               features || "non-private,all,dialog=no",
                               args || null);
    }
    else {
      window[uri] = openDialog(uri, "",
                               features || "non-private,all,dialog=no");
    }

    window[uri].addEventListener("load", newWindowLoaded);
    window.addEventListener("unload", newWindowLoaded);
  }
  return;
}

function OpenBrowserWindow()
{
  var win = Services.wm.getMostRecentWindow("navigator:browser");
  if (document.documentElement.getAttribute("windowtype") ==
      "navigator:browser" && window.content && window.content.document)
  {
    // if and only if the current window is a browser window and
    // it has a document with a character set, then extract the
    // current charset menu setting from the current document
    // and use it to initialize the new browser window
    return window.openDialog(getBrowserURL(), "_blank",
                             "chrome,all,dialog=no,non-private", null,
                             "charset=" + window.content.document.characterSet);
  }

  if (win) {
    // if a browser window already exists then set startpage to null so
    // navigator.js can check pref for how new window should be opened
    return win.openDialog(getBrowserURL(), "_blank",
                          "chrome,all,dialog=no,non-private", null);
  }

  // open the first browser window as if we were starting up
  var cmdLine = {
    handleFlagWithParam: function handleFlagWithParam(flag, caseSensitive) {
      return flag == "remote" ? "xfeDoCommand(openBrowser)" : null;
    },
    handleFlag: function handleFlag(flag, caseSensitive) {
      return false;
    },
    preventDefault: true
  };
  const clh_prefix = "@mozilla.org/commandlinehandler/general-startup;1";
  Cc[clh_prefix + "?type=browser"]
    .getService(Ci.nsICommandLineHandler)
    .handle(cmdLine);
  return null;
}

function CycleWindow(aType) {
  let topWindowOfType = Services.wm.getMostRecentWindow(aType);
  if (topWindowOfType == null)
    return null;

  let topWindow = Services.wm.getMostRecentWindow(null);
  if (topWindowOfType != topWindow) {
    toOpenWindow(topWindowOfType);
    return topWindowOfType;
  }

  let topFound = false;
  let enumerator = Services.wm.getEnumerator(aType);
  let iWindow;
  let firstWindow;

  while (enumerator.hasMoreElements()) {
    iWindow = enumerator.getNext();
    if (!iWindow.closed) {
      if (!firstWindow) {
        firstWindow = iWindow;
      }
      if (topFound) {
        toOpenWindow(iWindow);
        return iWindow;
      }
      if (iWindow == topWindow) {
        topFound = true;
      }
    }
  }

  if (firstWindow == topWindow) // Only one window
    return null;

  toOpenWindow(firstWindow);
  return firstWindow;
}

function windowMenuDidHide()
{
  let sep = document.getElementById("sep-window-list");
  // Clear old items
  while (sep.nextElementSibling) {
    sep.nextElementSibling.remove();
  }
}

function checkFocusedWindow()
{
  let windows = Services.wm.getEnumerator("");
  let frag = document.createDocumentFragment();
  while (windows.hasMoreElements()) {
    let win = windows.getNext();
    if (win.closed || win.document.documentElement.getAttribute("inwindowmenu") == "false") {
      continue;
    }
    let item = document.createElement("menuitem");
    item.setAttribute("label", win.document.title);
    item.setAttribute("type", "radio");
    if (win == window) {
      item.setAttribute("checked", "true");
    }
    item.addEventListener("command", () => {
      if (win.windowState == window.STATE_MINIMIZED) {
        win.restore();
      }
      win.focus();
    });
    frag.appendChild(item);
  }
  document.getElementById("windowPopup").appendChild(frag);
}

function toProfileManager()
{
  var promgrWin = Services.wm.getMostRecentWindow("mozilla:profileSelection");
  if (promgrWin) {
    promgrWin.focus();
  } else {
    var params = Cc["@mozilla.org/embedcomp/dialogparam;1"]
                 .createInstance(Ci.nsIDialogParamBlock);

    params.SetNumberStrings(1);
    params.SetString(0, "menu");
    window.openDialog("chrome://communicator/content/profile/profileSelection.xul",
                "",
                "centerscreen,chrome,titlebar,resizable",
                params);
  }
  // Here, we don't care about the result code
  // that was returned in the param block.
}

// This function is only used by macs.
function ZoomCurrentWindow()
{
  if (window.windowState == STATE_NORMAL)
    window.maximize();
  else
    window.restore();
}
