/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";
import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * Timeout for focusing a window.  Only really an issue on linux.
 */
var WINDOW_FOCUS_TIMEOUT_MS = 10000;

function getWindowTypeOrID(win) {
  const docElement = win.document.documentElement;
  return docElement.getAttribute("windowtype") || docElement.id;
}

/**
 * Call this if the window you want to get may already be open.  What we
 *  provide above just directly grabbing the window yourself is:
 * - We wait for it to finish loading.
 *
 * @param {string} aWindowType - The window type that will be created. This is
 *   the value of the "windowtype" attribute on the window. The values tend to
 *   look like "app:windowname", for example "mailnews:search".
 * @returns {Window}
 */
export function wait_for_existing_window(aWindowType) {
  return Services.wm.getMostRecentWindow(aWindowType);
}

/**
 * Call this just before you trigger the event that will cause a window to be
 *  displayed.
 *
 * @param {string} aWindowType - The window type that will be created. This is
 *   the value of the "windowtype" attribute on the window. The values tend to
 *   look like "app:windowname", for example "mailnews:search".
 * @returns {Promise} A promise resolved when a window of the right type opens.
 */
export async function promise_new_window(aWindowType) {
  const domWindow = await BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => getWindowTypeOrID(win) == aWindowType
  );
  await new Promise(resolve => domWindow.setTimeout(resolve));
  await new Promise(resolve => domWindow.setTimeout(resolve));

  return domWindow;
}

/**
 * Plan for the imminent display of a modal dialog.  Modal dialogs spin their
 *  own event loop which means that either that control flow will not return
 *  to the caller until the modal dialog finishes running.  This means that
 *  you need to provide a sub-test function to be run inside the modal dialog
 *  (and it should not start with "test" or mozmill will also try and run it.)
 *
 * @param {string} aWindowType - The window type that you expect the modal
 *   dialog to have or the ID of the window if there is no window type available.
 * @param {function} aSubTestFunction - The sub-test function that will be run
 *   once the modal dialog appears and is loaded. This function should take one
 *   argument, the modal dialog.
 */
export async function promise_modal_dialog(aWindowType, aSubTestFunction) {
  const domWindow = await BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => getWindowTypeOrID(win) == aWindowType
  );
  await aSubTestFunction(domWindow);
  await BrowserTestUtils.windowClosed(domWindow);
}

/**
 * Wait for the window to be focused.
 *
 * @param aWindow the window to be focused.
 */
export async function wait_for_window_focused(aWindow) {
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

  await TestUtils.waitForCondition(
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
 * @param {XULBrowserElement} aBrowser - The <browser> element to wait for.
 * @param {string|function} aURLOrPredicate - The URL that should be loaded
 *   (string) or a predicate for the URL (function).
 * @returns {Window} The browser's content window.
 */
export async function wait_for_browser_load(aBrowser, aURLOrPredicate) {
  // aBrowser has all the fields we need already.
  return _wait_for_generic_load(aBrowser, aURLOrPredicate);
}

/**
 * Given an HTML <frame> or <iframe>, waits for it to completely load.
 *
 * @param aFrame The element to wait for.
 * @param aURLOrPredicate The URL that should be loaded (string) or a predicate
 *                        for the URL (function).
 * @returns The frame.
 */
export async function wait_for_frame_load(aFrame, aURLOrPredicate) {
  return _wait_for_generic_load(aFrame, aURLOrPredicate);
}

/**
 * Generic function to wait for some sort of document to load. We expect
 * aDetails to have three fields:
 * - webProgress: an nsIWebProgress associated with the contentWindow.
 * - currentURI: the currently loaded page (nsIURI).
 */
async function _wait_for_generic_load(aDetails, aURLOrPredicate) {
  let predicate;
  if (typeof aURLOrPredicate == "string") {
    const expectedURL = NetUtil.newURI(aURLOrPredicate);
    predicate = url => expectedURL.equals(url);
  } else {
    predicate = aURLOrPredicate;
  }

  await TestUtils.waitForCondition(function () {
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
  }, `waiting for content page to load. Current URL is: ${aDetails.currentURI?.spec}`);

  // Lie to mozmill to convince it to not explode because these frames never
  // get a mozmillDocumentLoaded attribute (bug 666438).
  const contentWindow = aDetails.contentWindow;
  if (contentWindow) {
    return contentWindow;
  }
  return null;
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
export async function click_menus_in_sequence(aRootPopup, aActions, aKeepOpen) {
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
  const findMatch = function (node, actionObj) {
    // Ignore some elements and just use their children instead.
    if (node.localName == "hbox" || node.localName == "vbox") {
      for (let i = 0; i < node.children.length; i++) {
        const childMatch = findMatch(node.children[i]);
        if (childMatch) {
          return childMatch;
        }
      }
      return null;
    }

    let matchedAll = true;
    for (const name in actionObj) {
      const value = actionObj[name];
      if (!node.hasAttribute(name) || node.getAttribute(name) != value) {
        matchedAll = false;
        break;
      }
    }
    return matchedAll ? node : null;
  };

  // These popups sadly do not close themselves, so we need to keep track
  // of them so we can make sure they end up closed.
  const closeStack = [aRootPopup];

  let curPopup = aRootPopup;
  for (const [iAction, actionObj] of aActions.entries()) {
    let matchingNode = null;
    const kids = curPopup.children;
    for (let iKid = 0; iKid < kids.length; iKid++) {
      const node = kids[iKid];
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
export function close_popup_sequence(aCloseStack) {
  while (aCloseStack.length) {
    const curPopup = aCloseStack.pop();
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
async function _click_appmenu_in_sequence(navTargets, nonNavTarget, win) {
  const rootPopup = win.document.getElementById("appMenu-popup");

  async function viewShownListener(
    shownNavTargets,
    shownNonNavTarget,
    allDone,
    event
  ) {
    // Set up the next listener if there are more navigation targets.
    if (shownNavTargets.length > 0) {
      rootPopup.addEventListener(
        "ViewShown",
        viewShownListener.bind(
          null,
          shownNavTargets.slice(1),
          shownNonNavTarget,
          allDone
        ),
        { once: true }
      );
    }

    const subview = event.target.querySelector(".panel-subview-body");

    // Click a target if there is a target left to click.
    const clickTarget = shownNavTargets[0] || shownNonNavTarget;

    if (clickTarget) {
      const kids = Array.from(subview.children);
      const findFunction = node => {
        const selectors = [];
        for (const name in clickTarget) {
          const value = clickTarget[name];
          selectors.push(`[${name}="${value}"]`);
        }
        const s = selectors.join(",");
        return node.matches(s) || node.querySelector(s);
      };

      // Some views are dynamically populated after ViewShown, so we wait.
      await TestUtils.waitForCondition(
        () => kids.find(findFunction),
        () =>
          "Waited but did not find matching menu item for target: " +
          JSON.stringify(clickTarget)
      );

      const foundNode = kids.find(findFunction);

      EventUtils.synthesizeMouseAtCenter(foundNode, {}, foundNode.ownerGlobal);
    }

    // We are all done when there are no more navigation targets.
    if (shownNavTargets.length == 0) {
      allDone(subview);
    }
  }

  let done = false;
  let subviewToReturn;
  const allDone = subview => {
    subviewToReturn = subview;
    done = true;
  };

  await TestUtils.waitForCondition(
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

  await TestUtils.waitForCondition(
    () => done,
    "Timed out in _click_appmenu_in_sequence."
  );
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
export async function click_through_appmenu(navTargets, nonNavTarget, win) {
  const appmenu = win.document.getElementById("button-appmenu");
  EventUtils.synthesizeMouseAtCenter(appmenu, {}, appmenu.ownerGlobal);
  return _click_appmenu_in_sequence(navTargets, nonNavTarget, win);
}
