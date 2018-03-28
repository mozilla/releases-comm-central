ChromeUtils.import("resource://gre/modules/Services.jsm");

function install() {}

function uninstall() {}

function startup(data, reason) {
  loadDefaultPrefs();

  // Wait for any new windows to open.
  Services.wm.addListener(WindowListener);

  // Get the list of windows already open.
  let windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);

    if (domWindow.document.location.href === "about:blank") {
      // A window is available, but it's not yet fully loaded.
      // Add an event listener to fire when the window is completely loaded.

      domWindow.addEventListener("load", function() {
        setupUI(domWindow);
      }, { once: true });
    }
    else {
      setupUI(domWindow);
    }
  }
}

function loadDefaultPrefs() {
  let defaultBranch = Services.prefs.getDefaultBranch(null);

  // Debugging prefs
  defaultBranch.setBoolPref("browser.dom.window.dump.enabled", true);
  defaultBranch.setBoolPref("javascript.options.showInConsole", true);
}

function shutdown(data, reason) {
  // Just ignore shutdowns.
}


function setupUI(domWindow) {
  var document = domWindow.document;

  function createMozmillMenu() {
    let m = document.createElement("menuitem");
    m.setAttribute("id", "mozmill-mozmill");
    m.setAttribute("label", "Mozmill");
    m.setAttribute("oncommand", "MozMill.onMenuItemCommand(event);");

    return m;
  }

  console.log("=== Mozmill: Seen window " + domWindow.document.location.href);
  switch (document.location.href) {
    case "chrome://messenger/content/messenger.xul":
      document.getElementById("taskPopup").appendChild(createMozmillMenu());
      loadScript("chrome://mozmill/content/overlay.js", domWindow);
      break;
  }
}


var WindowListener = {
  tearDownUI: function(window) {
  },

  // nsIWindowMediatorListener functions
  onOpenWindow: function(xulWindow) {
    // A new window has opened.
    let domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
    // Wait for it to finish loading.
    domWindow.addEventListener("load", function listener() {
      setupUI(domWindow);
    }, { once: true });
  },

  onCloseWindow: function(xulWindow) {},

  onWindowTitleChange: function(xulWindow, newTitle) {}
};


function loadScript(url, targetWindow) {
  let loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
  loader.loadSubScript(url, targetWindow);
}

function logException(exc) {
  try {
    Services.console.logStringMessage(exc.toString() + "\n" + exc.stack);
  }
  catch (x) {}
}
