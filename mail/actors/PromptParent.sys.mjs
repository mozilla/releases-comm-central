/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PromptUtils: "resource://gre/modules/PromptUtils.sys.mjs",
});

export class PromptParent extends JSWindowActorParent {
  receiveMessage(message) {
    const args = message.data;

    switch (message.name) {
      case "Prompt:Open": {
        return this.openWindowPrompt(args);
      }
    }

    return undefined;
  }

  /**
   * Opens a window prompt for a BrowsingContext, and puts the associated
   * browser in the modal state until the prompt is closed.
   *
   * @param {object} args
   *        The arguments passed up from the BrowsingContext to be passed
   *        directly to the modal window.
   * @returns {Promise}
   *         Resolves when the window prompt is dismissed.
   * @resolves {object}
   *           The arguments returned from the window prompt.
   */
  async openWindowPrompt(args) {
    const COMMON_DIALOG = "chrome://global/content/commonDialog.xhtml";
    const SELECT_DIALOG = "chrome://global/content/selectDialog.xhtml";
    const uri = args.promptType == "select" ? SELECT_DIALOG : COMMON_DIALOG;

    const browsingContext = this.browsingContext.top;

    const browser = browsingContext.embedderElement;
    let win;

    // If we are a chrome actor we can use the associated chrome win.
    if (!browsingContext.isContent && browsingContext.window) {
      win = browsingContext.window;
    } else {
      win = browser?.ownerGlobal;
      if (!win?.isChromeWindow) {
        win = browsingContext.topChromeWindow;
      }
    }

    // There's a requirement for prompts to be blocked if a window is
    // passed and that window is hidden (eg, auth prompts are suppressed if the
    // passed window is the hidden window).
    // See bug 875157 comment 30 for more..
    if (win?.winUtils && !win.winUtils.isParentWindowMainWidgetVisible) {
      throw new Error("Cannot call openModalWindow on a hidden window");
    }

    try {
      if (browser) {
        // The compose editor does not support enter/leaveModalState.
        browser.enterModalState?.();
        lazy.PromptUtils.fireDialogEvent(
          win,
          "DOMWillOpenModalDialog",
          browser
        );
      }

      const bag = lazy.PromptUtils.objectToPropBag(args);

      Services.ww.openWindow(
        win,
        uri,
        "_blank",
        "centerscreen,chrome,modal,titlebar",
        bag
      );

      lazy.PromptUtils.propBagToObject(bag, args);
    } finally {
      if (browser) {
        browser.leaveModalState?.();
        lazy.PromptUtils.fireDialogEvent(win, "DOMModalDialogClosed", browser);
      }
    }
    return args;
  }
}
