ChromeUtils.import("resource://gre/modules/Services.jsm");

function install() {}

function uninstall() {}

var gServerStarted = false;

function startup(data, reason) {
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
        setupServer(domWindow);
      }, { once: true });
    }
    else {
      setupServer(domWindow);
    }
  }
}


function shutdown(data, reason) {
  // Just ignore shutdowns.
}


function setupServer(domWindow) {
  switch (domWindow.document.location.href) {
    case "chrome://messenger/content/messenger.xul":
      loadScript("chrome://jsbridge/content/overlay.js", domWindow);

      // The server used to be started via the command line (cmdarg.js) which
      // doesn't work for a bootstrapped add-on, so let's do it here.
      let server = {};
      ChromeUtils.import('chrome://jsbridge/content/modules/server.js', server);
      if (!gServerStarted) {
        console.log("=== JS Bridge: Starting server");
        server.startServer(24242);
        gServerStarted = true;
      }
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
    domWindow.addEventListener("load", function() {
      setupServer(domWindow);
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
