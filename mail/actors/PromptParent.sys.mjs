/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PromptUtils: "resource://gre/modules/PromptUtils.sys.mjs",
});

/**
 * @typedef {object} Prompt
 * @property {Function} resolver
 *           The resolve function to be called with the data from the Prompt
 *           after the user closes it.
 * @property {object} tabModalPrompt
 *           The TabModalPrompt being shown to the user.
 */

/**
 * gBrowserPrompts weakly maps BrowsingContexts to a Map of their currently
 * active Prompts.
 *
 * @type {WeakMap<BrowsingContext, Prompt>}
 */
const gBrowserPrompts = new WeakMap();

export class PromptParent extends JSWindowActorParent {
  didDestroy() {
    // In the event that the subframe or tab crashed, make sure that
    // we close any active Prompts.
    this.forceClosePrompts();
  }

  /**
   * Registers a new Prompt to be tracked for a particular BrowsingContext.
   * We need to track a Prompt so that we can, for example, force-close the
   * TabModalPrompt if the originating subframe or tab unloads or crashes.
   *
   * @param {object} tabModalPrompt
   *        The TabModalPrompt that will be shown to the user.
   * @param {string} id
   *        A unique ID to differentiate multiple Prompts coming from the same
   *        BrowsingContext.
   * @returns {Promise}
   * @resolves {object}
   *           Resolves with the arguments returned from the TabModalPrompt when it
   *           is dismissed.
   */
  registerPrompt(tabModalPrompt, id) {
    let prompts = gBrowserPrompts.get(this.browsingContext);
    if (!prompts) {
      prompts = new Map();
      gBrowserPrompts.set(this.browsingContext, prompts);
    }

    const promise = new Promise(resolve => {
      prompts.set(id, {
        tabModalPrompt,
        resolver: resolve,
      });
    });

    return promise;
  }

  /**
   * Removes a Prompt for a BrowsingContext with a particular ID from the registry.
   * This needs to be done to avoid leaking <xul:browser>'s.
   *
   * @param {string} id
   *        A unique ID to differentiate multiple Prompts coming from the same
   *        BrowsingContext.
   */
  unregisterPrompt(id) {
    const prompts = gBrowserPrompts.get(this.browsingContext);
    if (prompts) {
      prompts.delete(id);
    }
  }

  /**
   * Programmatically closes all Prompts for the current BrowsingContext.
   */
  forceClosePrompts() {
    const prompts = gBrowserPrompts.get(this.browsingContext) || [];

    for (const [, prompt] of prompts) {
      prompt.tabModalPrompt && prompt.tabModalPrompt.abortPrompt();
    }
  }

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
