/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "click_menus_in_sequence",
  "close_popup_sequence",
  "click_through_appmenu",
  "plan_for_new_window",
  "wait_for_new_window",
  "async_plan_for_new_window",
  "plan_for_modal_dialog",
  "wait_for_modal_dialog",
  "plan_for_window_close",
  "wait_for_window_close",
  "close_window",
  "wait_for_existing_window",
  "wait_for_window_focused",
  "wait_for_browser_load",
  "wait_for_frame_load",
  "resize_to",
];

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var { Assert } = ChromeUtils.importESModule(
  "resource://testing-common/Assert.sys.mjs"
);
var { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);
var { NetUtil } = ChromeUtils.import("resource://gre/modules/NetUtil.jsm");

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

/**
 * Timeout to use when waiting for the first window ever to load.  This is
 *  long because we are basically waiting for the entire app startup process.
 */
var FIRST_WINDOW_EVER_TIMEOUT_MS = 30000;
/**
 * Interval to check if the window has shown up for the first window ever to
 *  load.  The check interval is longer because it's less likely the window
 *  is going to show up quickly and there is a cost to the check.
 */
var FIRST_WINDOW_CHECK_INTERVAL_MS = 300;

/**
 * Timeout for opening a window.
 */
var WINDOW_OPEN_TIMEOUT_MS = 10000;
/**
 * Check interval for opening a window.
 */
var WINDOW_OPEN_CHECK_INTERVAL_MS = 100;

/**
 * Timeout for closing a window.
 */
var WINDOW_CLOSE_TIMEOUT_MS = 10000;
/**
 * Check interval for closing a window.
 */
var WINDOW_CLOSE_CHECK_INTERVAL_MS = 100;

/**
 * Timeout for focusing a window.  Only really an issue on linux.
 */
var WINDOW_FOCUS_TIMEOUT_MS = 10000;

function getWindowTypeOrId(aWindowElem) {
  let windowType = aWindowElem.getAttribute("windowtype");
  // Ignore types that start with "prompt:". This prefix gets added in
  // toolkit/components/prompts/src/CommonDialog.jsm since bug 1388238.
  if (windowType && !windowType.startsWith("prompt:")) {
    return windowType;
  }

  return aWindowElem.getAttribute("id");
}

/**
 * Return the "windowtype" or "id" for the given app window if it is available.
 * If not, return null.
 */
function getWindowTypeForAppWindow(aAppWindow, aBusyOk) {
  // Sometimes we are given HTML windows, for which the logic below will
  //  bail.  So we use a fast-path here that should work for HTML and should
  //  maybe also work with XUL.  I'm not going to go into it...
  if (
    aAppWindow.document &&
    aAppWindow.document.documentElement &&
    aAppWindow.document.documentElement.hasAttribute("windowtype")
  ) {
    return getWindowTypeOrId(aAppWindow.document.documentElement);
  }

  let docshell = aAppWindow.docShell;
  // we need the docshell to exist...
  if (!docshell) {
    return null;
  }

  // we can't know if it's the right document until it's not busy
  if (!aBusyOk && docshell.busyFlags) {
    return null;
  }

  // it also needs to have content loaded (it starts out not busy with no
  //  content viewer.)
  if (docshell.contentViewer == null) {
    return null;
  }

  // now we're cooking! let's get the document...
  let outerDoc = docshell.contentViewer.DOMDocument;
  // and make sure it's not blank.  that's also an intermediate state.
  if (outerDoc.location.href == "about:blank") {
    return null;
  }

  // finally, we can now have a windowtype!
  let windowType = getWindowTypeOrId(outerDoc.documentElement);

  if (windowType) {
    return windowType;
  }

  // As a last resort, use the name given to the DOM window.
  let domWindow = aAppWindow.docShell.domWindow;

  return domWindow.name;
}

var WindowWatcher = {
  _inited: false,
  _firstWindowOpened: false,
  ensureInited() {
    if (this._inited) {
      return;
    }

    // Add ourselves as an nsIWindowMediatorListener so we can here about when
    //  windows get registered with the window mediator.  Because this
    //  generally happens
    // Another possible means of getting this info would be to observe
    //  "xul-window-visible", but it provides no context and may still require
    //  polling anyways.
    Services.wm.addListener(this);

    // Clean up any references to windows at the end of each test, and clean
    // up the listeners/observers as the end of the session.
    let observer = {
      observe(subject, topic) {
        WindowWatcher.monitoringList.length = 0;
        WindowWatcher.waitingList.clear();
        if (topic == "quit-application-granted") {
          Services.wm.removeListener(this);
          Services.obs.removeObserver(this, "test-complete");
          Services.obs.removeObserver(this, "quit-application-granted");
        }
      },
    };
    Services.obs.addObserver(observer, "test-complete");
    Services.obs.addObserver(observer, "quit-application-granted");

    this._inited = true;
  },

  /**
   * Track the windowtypes we are waiting on.  Keys are windowtypes.  When
   *  watching for new windows, values are initially null, and are set to an
   *  nsIAppWindow when we actually find the window.  When watching for closing
   *  windows, values are nsIAppWindows.  This symmetry lets us have windows
   *  that appear and dis-appear do so without dangerously confusing us (as
   *  long as another one comes along...)
   */
  waitingList: new Map(),
  /**
   * Note that we will be looking for a window with the given window type
   *  (ex: "mailnews:search").  This allows us to be ready if an event shows
   *  up before waitForWindow is called.
   */
  planForWindowOpen(aWindowType) {
    this.waitingList.set(aWindowType, null);
  },

  /**
   * Like planForWindowOpen but we check for already-existing windows.
   */
  planForAlreadyOpenWindow(aWindowType) {
    this.waitingList.set(aWindowType, null);
    // We need to iterate over all the app windows and consider them all.
    //  We can't pass the window type because the window might not have a
    //  window type yet.
    // because this iterates from old to new, this does the right thing in that
    //  side-effects of consider will pick the most recent window.
    for (let appWindow of Services.wm.getAppWindowEnumerator(null)) {
      if (!this.consider(appWindow)) {
        this.monitoringList.push(appWindow);
      }
    }
  },

  /**
   * The current windowType we are waiting to open.  This is mainly a means of
   *  communicating the desired window type to monitorize without having to
   *  put the argument in the eval string.
   */
  waitingForOpen: null,
  /**
   * Wait for the given windowType to open and finish loading.
   *
   * @returns The window wrapped in a MozMillController.
   */
  waitForWindowOpen(aWindowType) {
    this.waitingForOpen = aWindowType;
    utils.waitFor(
      () => this.monitorizeOpen(),
      "Timed out waiting for window open!",
      this._firstWindowOpened
        ? WINDOW_OPEN_TIMEOUT_MS
        : FIRST_WINDOW_EVER_TIMEOUT_MS,
      this._firstWindowOpened
        ? WINDOW_OPEN_CHECK_INTERVAL_MS
        : FIRST_WINDOW_CHECK_INTERVAL_MS
    );

    this.waitingForOpen = null;
    let appWindow = this.waitingList.get(aWindowType);
    let domWindow = appWindow.docShell.domWindow;
    this.waitingList.delete(aWindowType);
    // spin the event loop to make sure any setTimeout 0 calls have gotten their
    //  time in the sun.
    utils.sleep(0);
    this._firstWindowOpened = true;
    return new controller.MozMillController(domWindow);
  },

  /**
   * Because the modal dialog spins its own event loop, the mozmill idiom of
   *  spinning your own event-loop as performed by waitFor is no good.  We use
   *  this timer to generate our events so that we can have a waitFor
   *  equivalent.
   *
   * We only have one timer right now because modal dialogs that spawn modal
   *  dialogs are not tremendously likely.
   */
  _timer: null,
  _timerRuntimeSoFar: 0,
  /**
   * The test function to run when the modal dialog opens.
   */
  subTestFunc: null,
  planForModalDialog(aWindowType, aSubTestFunc) {
    if (this._timer == null) {
      this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    }
    this.waitingForOpen = aWindowType;
    this.subTestFunc = aSubTestFunc;
    this.waitingList.set(aWindowType, null);

    this._timerRuntimeSoFar = 0;
    this._timer.initWithCallback(
      this,
      WINDOW_OPEN_CHECK_INTERVAL_MS,
      Ci.nsITimer.TYPE_REPEATING_SLACK
    );
  },

  /**
   * This is the nsITimer notification we receive...
   */
  notify() {
    if (this.monitorizeOpen()) {
      // okay, the window is opened, and we should be in its event loop now.
      let appWindow = this.waitingList.get(this.waitingForOpen);
      let domWindow = appWindow.docShell.domWindow;
      let troller = new controller.MozMillController(domWindow);

      this._timer.cancel();

      let self = this;
      async function startTest() {
        self.planForWindowClose(troller.window);
        try {
          await self.subTestFunc(troller);
        } finally {
          self.subTestFunc = null;
        }

        // if the test failed, make sure we force the window closed...
        // except I'm not sure how to easily figure that out...
        // so just close it no matter what.
        troller.window.close();
        self.waitForWindowClose();

        self.waitingList.delete(self.waitingForOpen);
        // now we are waiting for it to close...
        self.waitingForClose = self.waitingForOpen;
        self.waitingForOpen = null;
      }

      let targetFocusedWindow = {};
      Services.focus.getFocusedElementForWindow(
        domWindow,
        true,
        targetFocusedWindow
      );
      targetFocusedWindow = targetFocusedWindow.value;

      let focusedWindow = {};
      if (Services.focus.activeWindow) {
        Services.focus.getFocusedElementForWindow(
          Services.focus.activeWindow,
          true,
          focusedWindow
        );

        focusedWindow = focusedWindow.value;
      }

      if (focusedWindow == targetFocusedWindow) {
        startTest();
      } else {
        function onFocus(event) {
          targetFocusedWindow.setTimeout(startTest, 0);
        }
        targetFocusedWindow.addEventListener("focus", onFocus, {
          capture: true,
          once: true,
        });
        targetFocusedWindow.focus();
      }
    }
    // notify is only used for modal dialogs, which are never the first window,
    //  so we can always just use this set of timeouts/intervals.
    this._timerRuntimeSoFar += WINDOW_OPEN_CHECK_INTERVAL_MS;
    if (this._timerRuntimeSoFar >= WINDOW_OPEN_TIMEOUT_MS) {
      this._timer.cancel();
      throw new Error("Timeout while waiting for modal dialog.\n");
    }
  },

  /**
   * Symmetry for planForModalDialog; conceptually provides the waiting.  In
   *  reality, all we do is potentially soak up the event loop a little to
   */
  waitForModalDialog(aWindowType, aTimeout) {
    // did the window already come and go?
    if (this.subTestFunc == null) {
      return;
    }
    // spin the event loop until we the window has come and gone.
    utils.waitFor(
      () => {
        return this.waitingForOpen == null && this.monitorizeClose();
      },
      "Timeout waiting for modal dialog to open.",
      aTimeout || WINDOW_OPEN_TIMEOUT_MS,
      WINDOW_OPEN_CHECK_INTERVAL_MS
    );
    this.waitingForClose = null;
  },

  planForWindowClose(aAppWindow) {
    let windowType = getWindowTypeOrId(aAppWindow.document.documentElement);
    this.waitingList.set(windowType, aAppWindow);
    this.waitingForClose = windowType;
  },

  /**
   * The current windowType we are waiting to close.  Same deal as
   *  waitingForOpen, this makes the eval less crazy.
   */
  waitingForClose: null,
  waitForWindowClose() {
    utils.waitFor(
      () => this.monitorizeClose(),
      "Timeout waiting for window to close!",
      WINDOW_CLOSE_TIMEOUT_MS,
      WINDOW_CLOSE_CHECK_INTERVAL_MS
    );
    let didDisappear = this.waitingList.get(this.waitingForClose) == null;
    let windowType = this.waitingForClose;
    this.waitingList.delete(windowType);
    this.waitingForClose = null;
    if (!didDisappear) {
      throw new Error(windowType + " window did not disappear!");
    }
  },

  /**
   * Used by waitForWindowOpen to check all of the windows we are monitoring and
   *  then check if we have any results.
   *
   * @returns true if we found what we were |waitingForOpen|, false otherwise.
   */
  monitorizeOpen() {
    for (let iWin = this.monitoringList.length - 1; iWin >= 0; iWin--) {
      let appWindow = this.monitoringList[iWin];
      if (this.consider(appWindow)) {
        this.monitoringList.splice(iWin, 1);
      }
    }

    return (
      this.waitingList.has(this.waitingForOpen) &&
      this.waitingList.get(this.waitingForOpen) != null
    );
  },

  /**
   * Used by waitForWindowClose to check if the window we are waiting to close
   *  actually closed yet.
   *
   * @returns true if it closed.
   */
  monitorizeClose() {
    return this.waitingList.get(this.waitingForClose) == null;
  },

  /**
   * A list of app windows to monitor because they are loading and it's not yet
   *  possible to tell whether they are something we are looking for.
   */
  monitoringList: [],
  /**
   * Monitor the given window's loading process until we can determine whether
   *  it is what we are looking for.
   */
  monitorWindowLoad(aAppWindow) {
    this.monitoringList.push(aAppWindow);
  },

  /**
   * nsIWindowMediatorListener notification that a app window was opened.  We
   *  check out the window, and if we were not able to fully consider it, we
   *  add it to our monitoring list.
   */
  onOpenWindow(aAppWindow) {
    // note: we would love to add our window activation/deactivation listeners
    //  and poke our unique id, but there is no contentViewer at this point
    //  and so there's no place to poke our unique id.  (aAppWindow does not
    //  let us put expandos on; it's an XPCWrappedNative and explodes.)
    // There may be nuances about outer window/inner window that make it
    //  feasible, but I have forgotten any such nuances I once knew.
    if (!this.consider(aAppWindow)) {
      this.monitorWindowLoad(aAppWindow);
    }
  },

  /**
   * Consider if the given window is something in our |waitingList|.
   *
   * @returns true if we were able to fully consider the object, false if we were
   *     not and need to be called again on the window later.  This has no
   *     relation to whether the window was one in our waitingList or not.
   *     Check the waitingList structure for that.
   */
  consider(aAppWindow) {
    let windowType = getWindowTypeForAppWindow(aAppWindow);
    if (windowType == null) {
      return false;
    }

    // stash the window if we were watching for it
    if (this.waitingList.has(windowType)) {
      this.waitingList.set(windowType, aAppWindow);
    }

    return true;
  },

  /**
   * Closing windows have the advantage of having to already have been loaded,
   *  so things like their windowtype are immediately available.
   */
  onCloseWindow(aAppWindow) {
    let domWindow = aAppWindow.docShell.domWindow;
    let windowType = getWindowTypeOrId(domWindow.document.documentElement);
    if (this.waitingList.has(windowType)) {
      this.waitingList.set(windowType, null);
    }
  },
};

/**
 * Call this if the window you want to get may already be open.  What we
 *  provide above just directly grabbing the window yourself is:
 * - We wait for it to finish loading.
 *
 * @param aWindowType the window type that will be created.  This is literally
 *     the value of the "windowtype" attribute on the window.  The values tend
 *     to look like "app:windowname", for example "mailnews:search".
 *
 * @returns {MozmillController}
 */
function wait_for_existing_window(aWindowType) {
  WindowWatcher.ensureInited();
  WindowWatcher.planForAlreadyOpenWindow(aWindowType);
  return WindowWatcher.waitForWindowOpen(aWindowType);
}

/**
 * Call this just before you trigger the event that will cause a window to be
 *  displayed.
 * In theory, we don't need this and could just do a sweep of existing windows
 *  when you call wait_for_new_window, or we could always just keep track of
 *  the most recently seen window of each type, but this is arguably more
 *  resilient in the face of multiple windows of the same type as long as you
 *  don't try and open them all at the same time.
 *
 * @param aWindowType the window type that will be created.  This is literally
 *     the value of the "windowtype" attribute on the window.  The values tend
 *     to look like "app:windowname", for example "mailnews:search".
 */
function plan_for_new_window(aWindowType) {
  WindowWatcher.ensureInited();
  WindowWatcher.planForWindowOpen(aWindowType);
}

/**
 * Wait for the loading of the given window type to complete (that you
 *  previously told us about via |plan_for_new_window|), returning it wrapped
 *  in a MozmillController.
 *
 * @returns {MozmillController}
 */
function wait_for_new_window(aWindowType) {
  let c = WindowWatcher.waitForWindowOpen(aWindowType);
  // A nested event loop can get spun inside the Controller's constructor
  //  (which is arguably not a great idea), so it's important that we denote
  //  when we're actually leaving this function in case something crazy
  //  happens.
  return c;
}

async function async_plan_for_new_window(aWindowType) {
  let domWindow = await BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentElement.getAttribute("windowtype") == aWindowType
    );
  });

  await new Promise(r => domWindow.setTimeout(r));
  await new Promise(r => domWindow.setTimeout(r));

  let domWindowController = new controller.MozMillController(domWindow);
  return domWindowController;
}

/**
 * Plan for the imminent display of a modal dialog.  Modal dialogs spin their
 *  own event loop which means that either that control flow will not return
 *  to the caller until the modal dialog finishes running.  This means that
 *  you need to provide a sub-test function to be run inside the modal dialog
 *  (and it should not start with "test" or mozmill will also try and run it.)
 *
 * @param aWindowType The window type that you expect the modal dialog to have
 *                    or the id of the window if there is no window type
 *                    available.
 * @param aSubTestFunction The sub-test function that will be run once the modal
 *     dialog appears and is loaded.  This function should take one argument,
 *     a MozmillController against the modal dialog.
 */
function plan_for_modal_dialog(aWindowType, aSubTestFunction) {
  WindowWatcher.ensureInited();
  WindowWatcher.planForModalDialog(aWindowType, aSubTestFunction);
}
/**
 * In case the dialog might be stuck for a long time, you can pass an optional
 *  timeout.
 *
 * @param aTimeout Your custom timeout (default is WINDOW_OPEN_TIMEOUT_MS)
 */
function wait_for_modal_dialog(aWindowType, aTimeout) {
  WindowWatcher.waitForModalDialog(aWindowType, aTimeout);
}

/**
 * Call this just before you trigger the event that will cause the provided
 *  controller's window to disappear.  You then follow this with a call to
 *  |wait_for_window_close| when you want to block on verifying the close.
 *
 * @param aController The MozmillController, potentially returned from a call to
 *     wait_for_new_window, whose window should be disappearing.
 */
function plan_for_window_close(aController) {
  WindowWatcher.ensureInited();
  WindowWatcher.planForWindowClose(aController.window);
}

/**
 * Wait for the closure of the window you noted you would listen for its close
 *  in plan_for_window_close.
 */
function wait_for_window_close() {
  WindowWatcher.waitForWindowClose();
}

/**
 * Close a window by calling window.close() on the controller.
 *
 * @param aController the controller whose window is to be closed.
 */
function close_window(aController) {
  plan_for_window_close(aController);
  aController.window.close();
  wait_for_window_close();
}

/**
 * Wait for the window to be focused.
 *
 * @param aWindow the window to be focused.
 */
function wait_for_window_focused(aWindow) {
  let targetWindow = {};

  Services.focus.getFocusedElementForWindow(aWindow, true, targetWindow);
  targetWindow = targetWindow.value;

  let focusedWindow = {};
  if (Services.focus.activeWindow) {
    Services.focus.getFocusedElementForWindow(
      Services.focus.activeWindow,
      true,
      focusedWindow
    );
    focusedWindow = focusedWindow.value;
  }

  let focused = false;
  if (focusedWindow == targetWindow) {
    focused = true;
  } else {
    targetWindow.addEventListener("focus", () => (focused = true), {
      capture: true,
      once: true,
    });
    targetWindow.focus();
  }

  utils.waitFor(
    () => focused,
    "Timeout waiting for window to be focused.",
    WINDOW_FOCUS_TIMEOUT_MS,
    100,
    this
  );
}

/**
 * Given a <browser>, waits for it to completely load.
 *
 * @param aBrowser The <browser> element to wait for.
 * @param aURLOrPredicate The URL that should be loaded (string) or a predicate
 *                        for the URL (function).
 * @returns The browser's content window wrapped in a MozMillController.
 */
function wait_for_browser_load(aBrowser, aURLOrPredicate) {
  // aBrowser has all the fields we need already.
  return _wait_for_generic_load(aBrowser, aURLOrPredicate);
}

/**
 * Given an HTML <frame> or <iframe>, waits for it to completely load.
 *
 * @param aFrame The element to wait for.
 * @param aURLOrPredicate The URL that should be loaded (string) or a predicate
 *                        for the URL (function).
 * @returns The frame wrapped in a MozMillController.
 */
function wait_for_frame_load(aFrame, aURLOrPredicate) {
  return _wait_for_generic_load(aFrame, aURLOrPredicate);
}

/**
 * Generic function to wait for some sort of document to load. We expect
 * aDetails to have three fields:
 * - webProgress: an nsIWebProgress associated with the contentWindow.
 * - currentURI: the currently loaded page (nsIURI).
 */
function _wait_for_generic_load(aDetails, aURLOrPredicate) {
  let predicate;
  if (typeof aURLOrPredicate == "string") {
    let expectedURL = NetUtil.newURI(aURLOrPredicate);
    predicate = url => expectedURL.equals(url);
  } else {
    predicate = aURLOrPredicate;
  }

  function isLoadedChecker() {
    if (aDetails.webProgress?.isLoadingDocument) {
      return false;
    }
    if (
      aDetails.contentDocument &&
      aDetails.contentDocument.readyState != "complete"
    ) {
      return false;
    }

    return predicate(
      aDetails.currentURI ||
        NetUtil.newURI(aDetails.contentWindow.location.href)
    );
  }

  try {
    utils.waitFor(isLoadedChecker);
  } catch (e) {
    if (e instanceof utils.TimeoutError) {
      Assert.report(
        true,
        undefined,
        undefined,
        `Timeout waiting for content page to load. Current URL is: ${aDetails.currentURI.spec}`
      );
    } else {
      throw e;
    }
  }

  // Lie to mozmill to convince it to not explode because these frames never
  // get a mozmillDocumentLoaded attribute (bug 666438).
  let contentWindow = aDetails.contentWindow;
  if (contentWindow) {
    return new controller.MozMillController(contentWindow);
  }
  return null;
}

/**
 * Resize given window to new dimensions.
 *
 * @param aController  window controller
 * @param aWidth       the requested window width
 * @param aHeight      the requested window height
 */
function resize_to(aController, aWidth, aHeight) {
  aController.window.resizeTo(aWidth, aHeight);
  // Give the event loop a spin in order to let the reality of an asynchronously
  // interacting window manager have its impact. This still may not be
  // sufficient.
  utils.sleep(0);
  utils.waitFor(
    () =>
      aController.window.outerWidth == aWidth &&
      aController.window.outerHeight == aHeight,
    "Timeout waiting for resize (current screen size: " +
      aController.window.screen.availWidth +
      "X" +
      aController.window.screen.availHeight +
      "), Requested width " +
      aWidth +
      " but got " +
      aController.window.outerWidth +
      ", Request height " +
      aHeight +
      " but got " +
      aController.window.outerHeight,
    10000,
    50
  );
}

/**
 * Dynamically-built/XBL-defined menus can be hard to work with, this makes it
 *  easier.
 *
 * @param aRootPopup  The base popup. The caller is expected to activate it
 *     (by clicking/rightclicking the right widget). We will only wait for it
 *     to open if it is in the process.
 * @param aActions  An array of objects where each object has attributes
 *     with a value defined. We pick the menu item whose DOM node matches
 *     all the attributes with the specified names and value. We click whatever
 *     we find. We throw if the element being asked for is not found.
 * @param aKeepOpen  If set to true the popups are not closed after last click.
 *
 * @returns An array of popup elements that were left open. It will be
 *          an empty array if aKeepOpen was set to false.
 */
async function click_menus_in_sequence(aRootPopup, aActions, aKeepOpen) {
  if (aRootPopup.state != "open") {
    await BrowserTestUtils.waitForEvent(aRootPopup, "popupshown");
  }

  /**
   * Check if a node's attributes match all those given in actionObj.
   * Nodes that are obvious containers are skipped, and their children
   * will be used to recursively find a match instead.
   *
   * @param {Element} node - The node to check.
   * @param {object} actionObj - Contains attribute-value pairs to match.
   * @returns {Element|null} The matched node or null if no match.
   */
  let findMatch = function (node, actionObj) {
    // Ignore some elements and just use their children instead.
    if (node.localName == "hbox" || node.localName == "vbox") {
      for (let i = 0; i < node.children.length; i++) {
        let childMatch = findMatch(node.children[i]);
        if (childMatch) {
          return childMatch;
        }
      }
      return null;
    }

    let matchedAll = true;
    for (let name in actionObj) {
      let value = actionObj[name];
      if (!node.hasAttribute(name) || node.getAttribute(name) != value) {
        matchedAll = false;
        break;
      }
    }
    return matchedAll ? node : null;
  };

  // These popups sadly do not close themselves, so we need to keep track
  // of them so we can make sure they end up closed.
  let closeStack = [aRootPopup];

  let curPopup = aRootPopup;
  for (let [iAction, actionObj] of aActions.entries()) {
    let matchingNode = null;
    let kids = curPopup.children;
    for (let iKid = 0; iKid < kids.length; iKid++) {
      let node = kids[iKid];
      matchingNode = findMatch(node, actionObj);
      if (matchingNode) {
        break;
      }
    }

    if (!matchingNode) {
      throw new Error(
        "Did not find matching menu item for action index " +
          iAction +
          ": " +
          JSON.stringify(actionObj)
      );
    }

    if (matchingNode.localName == "menu") {
      matchingNode.openMenu(true);
    } else {
      curPopup.activateItem(matchingNode);
    }
    await new Promise(r => matchingNode.ownerGlobal.setTimeout(r, 500));

    let newPopup = null;
    if ("menupopup" in matchingNode) {
      newPopup = matchingNode.menupopup;
    }
    if (newPopup) {
      curPopup = newPopup;
      closeStack.push(curPopup);
      if (curPopup.state != "open") {
        await BrowserTestUtils.waitForEvent(curPopup, "popupshown");
      }
    }
  }

  if (!aKeepOpen) {
    close_popup_sequence(closeStack);
    return [];
  }
  return closeStack;
}

/**
 * Close given menupopups.
 *
 * @param aCloseStack  An array of menupopup elements that are to be closed.
 *                     The elements are processed from the end of the array
 *                     to the front (a stack).
 */
function close_popup_sequence(aCloseStack) {
  while (aCloseStack.length) {
    let curPopup = aCloseStack.pop();
    if (curPopup.state == "open") {
      curPopup.focus();
      curPopup.hidePopup();
    }
  }
}

/**
 * Click through the appmenu. Callers are expected to open the initial
 * appmenu panelview (e.g. by clicking the appmenu button). We wait for it
 * to open if it is not open yet. Then we use a recursive style approach
 * with a sequence of event listeners handling "ViewShown" events. The
 * `navTargets` parameter specifies items to click to navigate through the
 * menu. The optional `nonNavTarget` parameter specifies a final item to
 * click to perform a command after navigating through the menu. If this
 * argument is omitted, callers can interact with the last view panel that
 * is returned. Callers will then need to close the appmenu when they are
 * done with it.
 *
 * @param {object[]} navTargets - Array of objects that contain
 *   attribute->value pairs. We pick the menu item whose DOM node matches
 *   all the attribute->value pairs. We click whatever we find. We throw
 *   if the element being asked for is not found.
 * @param {object} [nonNavTarget] - Contains attribute->value pairs used
 *   to identify a final menu item to click.
 * @param {Window} win - The window we're using.
 * @returns {Element} The <vbox class="panel-subview-body"> element inside
 *   the last shown <panelview>.
 */
function _click_appmenu_in_sequence(navTargets, nonNavTarget, win) {
  const rootPopup = win.document.getElementById("appMenu-popup");

  function viewShownListener(navTargets, nonNavTarget, allDone, event) {
    // Set up the next listener if there are more navigation targets.
    if (navTargets.length > 0) {
      rootPopup.addEventListener(
        "ViewShown",
        viewShownListener.bind(
          null,
          navTargets.slice(1),
          nonNavTarget,
          allDone
        ),
        { once: true }
      );
    }

    const subview = event.target.querySelector(".panel-subview-body");

    // Click a target if there is a target left to click.
    const clickTarget = navTargets[0] || nonNavTarget;

    if (clickTarget) {
      const kids = Array.from(subview.children);
      const findFunction = node => {
        let selectors = [];
        for (let name in clickTarget) {
          let value = clickTarget[name];
          selectors.push(`[${name}="${value}"]`);
        }
        let s = selectors.join(",");
        return node.matches(s) || node.querySelector(s);
      };

      // Some views are dynamically populated after ViewShown, so we wait.
      utils.waitFor(
        () => kids.find(findFunction),
        () =>
          "Waited but did not find matching menu item for target: " +
          JSON.stringify(clickTarget)
      );

      const foundNode = kids.find(findFunction);

      EventUtils.synthesizeMouseAtCenter(foundNode, {}, foundNode.ownerGlobal);
    }

    // We are all done when there are no more navigation targets.
    if (navTargets.length == 0) {
      allDone(subview);
    }
  }

  let done = false;
  let subviewToReturn;
  const allDone = subview => {
    subviewToReturn = subview;
    done = true;
  };

  utils.waitFor(
    () => rootPopup.getAttribute("panelopen") == "true",
    "Waited for the appmenu to open, but it never opened."
  );

  // Because the appmenu button has already been clicked in the calling
  // code (to match click_menus_in_sequence), we have to call the first
  // viewShownListener manually, using a fake event argument, to start the
  // series of event listener calls.
  const fakeEvent = {
    target: win.document.getElementById("appMenu-mainView"),
  };
  viewShownListener(navTargets, nonNavTarget, allDone, fakeEvent);

  utils.waitFor(() => done, "Timed out in _click_appmenu_in_sequence.");
  return subviewToReturn;
}

/**
 * Utility wrapper function that clicks the main appmenu button to open the
 * appmenu before calling `click_appmenu_in_sequence`. Makes things simple
 * and concise for the most common case while still allowing for tests that
 * open the appmenu via keyboard before calling `_click_appmenu_in_sequence`.
 *
 * @param {object[]} navTargets - Array of objects that contain
 *     attribute->value pairs to be used to identify menu items to click.
 * @param {?object} nonNavTarget - Contains attribute->value pairs used
 *   to identify a final menu item to click.
 * @param {Window} win - The window we're using.
 * @returns {Element} The <vbox class="panel-subview-body"> element inside
 *                    the last shown <panelview>.
 */
function click_through_appmenu(navTargets, nonNavTarget, win) {
  let appmenu = win.document.getElementById("button-appmenu");
  EventUtils.synthesizeMouseAtCenter(appmenu, {}, appmenu.ownerGlobal);
  return _click_appmenu_in_sequence(navTargets, nonNavTarget, win);
}
