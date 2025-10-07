/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../utilityOverlay.js */

/* globals saveURL */ // From contentAreaUtils.js
/* globals goUpdateCommand */ // From globalOverlay.js

var { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { InlineSpellChecker, SpellCheckHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/InlineSpellChecker.sys.mjs"
);
var { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
var { ShortcutUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ShortcutUtils.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
ChromeUtils.defineESModuleGetters(this, {
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  nsContextMenu: "chrome://messenger/content/nsContextMenu.sys.mjs",
});
var { E10SUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/E10SUtils.sys.mjs"
);

var gContextMenu;
var gSpellChecker = new InlineSpellChecker();

window.addEventListener(
  "DOMContentLoaded",
  () => {
    const contextMenuPopup = document.getElementById("browserContext");
    //contextMenuPopup.addEventListener("command", event => { }); // TODO: use!
    contextMenuPopup.addEventListener("popupshowing", event => {
      if (event.target.id != "browserContext") {
        return true;
      }

      gContextMenu = new nsContextMenu(event.target, event.shiftKey);
      return gContextMenu.shouldDisplay;
    });
    contextMenuPopup.addEventListener("popuphiding", event => {
      if (event.target != contextMenuPopup) {
        return;
      }
      gContextMenu.hiding();
      gContextMenu = null;
    });
  },
  { once: true }
);

/** Called by ContextMenuParent.sys.mjs */
function openContextMenu({ data }, browser, actor) {
  if (!browser.hasAttribute("context")) {
    return;
  }

  const wgp = actor.manager;

  if (!wgp.isCurrentGlobal) {
    // Don't display context menus for unloaded documents
    return;
  }

  // NOTE: We don't use `wgp.documentURI` here as we want to use the failed
  // channel URI in the case we have loaded an error page.
  const documentURIObject = wgp.browsingContext.currentURI;

  let frameReferrerInfo = data.frameReferrerInfo;
  if (frameReferrerInfo) {
    frameReferrerInfo = E10SUtils.deserializeReferrerInfo(frameReferrerInfo);
  }

  let linkReferrerInfo = data.linkReferrerInfo;
  if (linkReferrerInfo) {
    linkReferrerInfo = E10SUtils.deserializeReferrerInfo(linkReferrerInfo);
  }

  const frameID = nsContextMenu.WebNavigationFrames.getFrameId(
    wgp.browsingContext
  );

  nsContextMenu.contentData = {
    context: data.context,
    browser,
    actor,
    editFlags: data.editFlags,
    spellInfo: data.spellInfo,
    principal: wgp.documentPrincipal,
    storagePrincipal: wgp.documentStoragePrincipal,
    documentURIObject,
    docLocation: data.docLocation,
    charSet: data.charSet,
    referrerInfo: E10SUtils.deserializeReferrerInfo(data.referrerInfo),
    frameReferrerInfo,
    linkReferrerInfo,
    contentType: data.contentType,
    contentDisposition: data.contentDisposition,
    frameID,
    frameOuterWindowID: frameID,
    frameBrowsingContext: wgp.browsingContext,
    selectionInfo: data.selectionInfo,
    disableSetDesktopBackground: data.disableSetDesktopBackground,
    loginFillInfo: data.loginFillInfo,
    parentAllowsMixedContent: data.parentAllowsMixedContent,
    userContextId: wgp.browsingContext.originAttributes.userContextId,
    webExtContextData: data.webExtContextData,
    cookieJarSettings: wgp.cookieJarSettings,
  };

  // Note: `popup` must be in `document`, but `browser` might be in a
  // different document, such as about:3pane.
  const popup = document.getElementById(browser.getAttribute("context"));
  const context = nsContextMenu.contentData.context;

  // Fill in some values in the context from the WindowGlobalParent actor.
  context.principal = wgp.documentPrincipal;
  context.storagePrincipal = wgp.documentStoragePrincipal;
  context.frameID = frameID;
  context.frameOuterWindowID = wgp.outerWindowId;
  context.frameBrowsingContextID = wgp.browsingContext.id;

  // We don't have access to the original event here, as that happened in
  // another process. Therefore we synthesize a new MouseEvent to propagate the
  // inputSource to the subsequently triggered popupshowing event.
  const newEvent = new PointerEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    screenX: context.screenXDevPx / window.devicePixelRatio,
    screenY: context.screenYDevPx / window.devicePixelRatio,
    button: 2,
    pointerType: (() => {
      switch (context.inputSource) {
        case MouseEvent.MOZ_SOURCE_MOUSE:
          return "mouse";
        case MouseEvent.MOZ_SOURCE_PEN:
          return "pen";
        case MouseEvent.MOZ_SOURCE_ERASER:
          return "eraser";
        case MouseEvent.MOZ_SOURCE_CURSOR:
          return "cursor";
        case MouseEvent.MOZ_SOURCE_TOUCH:
          return "touch";
        case MouseEvent.MOZ_SOURCE_KEYBOARD:
          return "keyboard";
        default:
          return "";
      }
    })(),
  });
  popup.openPopupAtScreen(newEvent.screenX, newEvent.screenY, true, newEvent);
}
