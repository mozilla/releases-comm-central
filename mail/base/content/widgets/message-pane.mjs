/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// mailCommon.js
/* globals nsMsgViewIndex_None, gDBView: true, gViewWrapper: true */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);

/**
 * Message pane.
 * Template ID: #messagePaneTemplate
 */
class MessagePane extends HTMLElement {
  constructor() {
    super();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "isConversationView",
      "mail.thread.conversation.enabled",
      false
    );
  }

  /**
   * The xul:browser responsible for rendering web pages.
   *
   * @type {?XULBrowser}
   */
  #webBrowser = null;
  get webBrowser() {
    return this.#webBrowser;
  }
  set webBrowser(val) {
    this.#webBrowser = val;
  }

  /**
   * If the web browser is not null and not hidden.
   *
   * @returns {boolean}
   */
  isWebBrowserVisible() {
    return this.webBrowser && !this.webBrowser.hidden;
  }

  /**
   * The findbar element for the web browser.
   *
   * @type {?MozFindbar}
   */
  #webFindbar = null;
  get webFindbar() {
    if (this.#webFindbar) {
      return this.#webFindbar;
    }

    this.#webFindbar = document.createXULElement("findbar");
    this.#webFindbar.setAttribute("id", "webBrowserFindToolbar");
    this.#webFindbar.setAttribute("browserid", "webBrowser");
    this.appendChild(this.#webFindbar);

    return this.#webFindbar;
  }

  /**
   * The xul:browser responsible for rendering single messages. This browser
   * always has about:message loaded.
   *
   * @type {?XULBrowser}
   */
  #messageBrowser = null;
  get messageBrowser() {
    return this.#messageBrowser;
  }
  set messageBrowser(val) {
    this.#messageBrowser = val;
    this.#messageBrowser.docShell.allowDNSPrefetch = false;
  }

  /**
   * If the message browser is not null and not hidden.
   *
   * @returns {boolean}
   */
  isMessageBrowserVisible() {
    return this.messageBrowser && !this.messageBrowser.hidden;
  }

  /**
   * The findbar element for the message browser.
   *
   * @type {?MozFindbar}
   */
  get messageFindbar() {
    return this.messageBrowser?.contentDocument.querySelector("#findToolbar");
  }

  /**
   * The xul:browser responsible for rendering multiple messages.
   *
   * @type {?XULBrowser}
   */
  #multiMessageBrowser = null;
  get multiMessageBrowser() {
    return this.#multiMessageBrowser;
  }
  set multiMessageBrowser(val) {
    this.#multiMessageBrowser = val;
    this.#multiMessageBrowser.docShell.allowDNSPrefetch = false;
  }

  /**
   * If the multimessage browser is not null and not hidden.
   *
   * @returns {boolean}
   */
  isMultiMessageBrowserVisible() {
    return this.multiMessageBrowser && !this.multiMessageBrowser.hidden;
  }

  /**
   * The findbar element for the multi message browser.
   *
   * @type {?MozFindbar}
   */
  #multiMessageFindbar = null;
  get multiMessageFindbar() {
    if (this.#multiMessageFindbar) {
      return this.#multiMessageFindbar;
    }

    this.#multiMessageFindbar = document.createXULElement("findbar");
    this.#multiMessageFindbar.setAttribute("id", "multiMessageViewFindToolbar");
    this.#multiMessageFindbar.setAttribute("browserid", "multiMessageBrowser");
    this.appendChild(this.#multiMessageFindbar);

    return this.#multiMessageFindbar;
  }

  /**
   * Simple helper boolean to allow clearing the message pane without hiding the
   * start page if not needed.
   *
   * @type {boolean}
   */
  #keepStartPageOpen = false;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("messagePaneTemplate")
      .content.cloneNode(true);
    this.append(template);

    this.webBrowser = this.querySelector("#webBrowser");
    this.messageBrowser = this.querySelector("#messageBrowser");
    this.multiMessageBrowser = this.querySelector("#multiMessageBrowser");
  }

  /**
   * Wait for all the child browsers to load and be ready for consumption.
   *
   * @returns {Promise}
   */
  async isReady() {
    if (this.messageBrowser.contentDocument.readyState != "complete") {
      await new Promise(resolve => {
        this.messageBrowser.addEventListener("load", resolve, {
          capture: true,
          once: true,
        });
      });
    }

    if (this.multiMessageBrowser.contentDocument.readyState != "complete") {
      await new Promise(resolve => {
        this.multiMessageBrowser.addEventListener("load", resolve, {
          capture: true,
          once: true,
        });
      });
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "request-message-clear":
        this.clearAll();
        break;
      case "show-conversation-view": {
        // TODO: This is temporary as we're leveraging the multimessagebrowser
        // but in the future this custom element will handle its own UI.
        const conv = event.detail.collection.items[0].conversation;
        conv.getMessagesCollection({
          onItemsAdded() {},
          onItemsModified() {},
          onItemsRemoved() {},
          onQueryCompleted: collection => {
            const messages = collection.items
              .map(i => i.folderMessage)
              .filter(Boolean);
            this.multiMessageBrowser.contentWindow.gMessageSummary.summarize(
              "thread",
              messages,
              gDBView,
              msgs => this.#dispatchSingleMessageEvent(msgs)
            );
          },
        });
        break;
      }
    }
  }

  /**
   * Dispatch an event to request showing a single message when clicked while
   * viewing the multi message browser in conversation view.
   *
   * @param {integer[]} messagesArray
   */
  #dispatchSingleMessageEvent(messagesArray) {
    this.dispatchEvent(
      new CustomEvent("show-single-message", {
        bubbles: true,
        detail: {
          messages: messagesArray
            .map(m => gDBView.findIndexOfMsgHdr(m, true))
            .filter(i => i != nsMsgViewIndex_None),
        },
      })
    );
  }

  /**
   * Simple method to dispatch an event requesting the update of the selection
   * count wherever we display it.
   */
  #requestSelectedCountUpdate() {
    this.dispatchEvent(
      new CustomEvent("request-count-update", {
        bubbles: true,
      })
    );
  }

  /**
   * If the message pane is currently being collapsed by the splitter.
   *
   * @returns {boolean}
   */
  #isCollapsed() {
    return this.classList.contains("collapsed-by-splitter");
  }

  /**
   * Ensure all message pane browsers are blank. Default behavior is to not clear
   * the web browser, if the start page is still being displayed.
   *
   * @param {object} [options]
   * @param {boolean} [options.alwaysClearWebBrowser] - Clear the web browser,
   *    even if it is still displaying the start page.
   */
  clearAll(options) {
    this.#hideCurrentFindBar();
    if (options?.alwaysClearWebBrowser) {
      this.#keepStartPageOpen = false;
    }
    if (!this.#keepStartPageOpen) {
      this.clearWebPage();
    }
    this.#clearMessage();
    this.#clearMessages();
  }

  /**
   * Ensure the web page browser is blank.
   */
  clearWebPage() {
    this.#keepStartPageOpen = false;
    this.webBrowser.hidden = true;
    this.webBrowser.docShellIsActive = false;
    MailE10SUtils.loadAboutBlank(this.webBrowser);
  }

  /**
   * Display a web page in the web page browser. If `url` is not given, or is
   * "about:blank", the web page browser is cleared and hidden.
   *
   * @param {string} url - The URL to load.
   * @param {object} [params] - Any params to pass to MailE10SUtils.loadURI.
   */
  displayWebPage(url, params) {
    if (this.#isCollapsed()) {
      return;
    }

    if (!url || url == "about:blank") {
      this.clearWebPage();
      return;
    }

    this.#clearMessage();
    this.#clearMessages();

    MailE10SUtils.loadURI(this.webBrowser, url, params);
    this.webBrowser.docShellIsActive = window.tabOrWindow.selected;
    this.webBrowser.hidden = false;
  }

  /**
   * Ensure the message browser is not displaying a message.
   */
  #clearMessage() {
    this.messageBrowser.hidden = true;
    this.messageBrowser.contentWindow.displayMessage();
  }

  /**
   * Display a single message in the message browser. If `messageURI` is not
   * given, the message browser is cleared and hidden.
   *
   * @param {?string} messageURI - The URI representing the selected message, or
   *   null if nothing is selected.
   */
  displayMessage(messageURI) {
    this.#requestSelectedCountUpdate();

    // Hide the findbar of webview pane or multimessage pane if opened.
    const switchingMessages = !this.messageBrowser.hidden;
    if (!switchingMessages) {
      this.#hideCurrentFindBar();
    }

    if (this.#isCollapsed()) {
      return;
    }

    if (!messageURI) {
      // Clear both single and multimessage in case we come from either of those
      // states.
      this.#clearMessage();
      this.#clearMessages();
      return;
    }

    this.clearWebPage();
    this.#clearMessages();

    this.messageBrowser.contentWindow.displayMessage(messageURI, gViewWrapper);
    this.messageBrowser.hidden = false;
  }

  /**
   * Ensure the multi-message browser is not displaying messages.
   */
  #clearMessages() {
    this.multiMessageBrowser.hidden = true;
    this.multiMessageBrowser.contentWindow.gMessageSummary.clear();
  }

  /**
   * Display messages in the multi-message browser. For a single message, use
   * `displayMessage` instead. If `messages` is not given, or an empty array,
   * the multi-message browser is cleared and hidden.
   *
   * @param {nsIMsgDBHdr[]} messages - The array of selected message headers, if
   *   available.
   */
  displayMessages(messages = []) {
    this.#requestSelectedCountUpdate();

    const viewingMultiMessage = this.isMultiMessageBrowserVisible();
    if (!viewingMultiMessage) {
      // Ensure we hide the findbar if we're not jumping between
      // multi message views.
      this.#hideCurrentFindBar();
    }

    if (this.#isCollapsed()) {
      return;
    }

    if (messages.length == 0) {
      // Clear both single and multimessage in case we come from either of those
      // states.
      this.#clearMessage();
      this.#clearMessages();
      return;
    }

    this.clearWebPage();
    this.#clearMessage();

    // Show the new conversation view UI if the user requests it and if
    // gDBView.selection.count is 1, which means that a thread has been
    // selected and not multiple single messages.
    if (this.isConversationView && gDBView?.selection.count == 1) {
      let conversationView = document.querySelector("conversation-view");
      // Set up the conversation view element if we don't have one.
      if (!conversationView) {
        ChromeUtils.importESModule(
          "chrome://messenger/content/conversation-view.mjs",
          { global: "current" }
        );
        conversationView = document.createElement("conversation-view");
        conversationView.addEventListener("show-conversation-view", this);
        this.append(conversationView);
      }
      conversationView.show(gDBView.hdrForFirstSelectedMessage);
    } else {
      const getThreadId = message =>
        gDBView.getThreadContainingMsgHdr(message).getRootHdr().messageKey;
      const firstThreadId = getThreadId(messages.at(0));
      const isSingleThread = messages.every(
        m => getThreadId(m) == firstThreadId
      );

      this.multiMessageBrowser.contentWindow.gMessageSummary.summarize(
        isSingleThread ? "thread" : "multipleselection",
        messages,
        gDBView,
        msgs => this.#dispatchSingleMessageEvent(msgs)
      );
    }

    this.multiMessageBrowser.hidden = false;
    this.dispatchEvent(new CustomEvent("MsgsLoaded", { bubbles: true }));

    if (!viewingMultiMessage) {
      return;
    }

    // Check if can continue the search.
    if (this.multiMessageFindbar && !this.multiMessageFindbar.hidden) {
      this.multiMessageFindbar.onFindAgainCommand(false);
    }
  }

  /**
   * Hide the findbar, in all of messageBrowser, multimessageBrowser,
   * or webBrowser.
   */
  #hideCurrentFindBar() {
    // Multi message view.
    this.multiMessageFindbar?.clear();
    this.multiMessageFindbar?.close();

    // Single message view.
    this.messageFindbar?.clear();
    this.messageFindbar?.close();

    // Web Browser view.
    this.webFindbar?.clear();
    this.webFindbar?.close();
  }

  /**
   * Show the start page in the web page browser. The start page will remain
   * shown until a message is displayed.
   */
  showStartPage() {
    this.#keepStartPageOpen = true;
    let url = Services.urlFormatter.formatURLPref("mailnews.start_page.url");
    if (/^mailbox:|^imap:|^pop:|^s?news:|^nntp:/i.test(url)) {
      console.warn(`Can't use ${url} as mailnews.start_page.url`);
      Services.prefs.clearUserPref("mailnews.start_page.url");
      url = Services.urlFormatter.formatURLPref("mailnews.start_page.url");
    }
    this.displayWebPage(url);
  }

  /**
   * Helper function for the zoom commands, which returns the browser that is
   * currently visible in the message pane or null if no browser is visible.
   *
   * @returns {?XULElement} - A XUL browser or null.
   */
  visibleMessagePaneBrowser() {
    if (this.isWebBrowserVisible()) {
      return this.webBrowser;
    }

    if (this.isMessageBrowserVisible()) {
      // If the message browser is the one visible, actually return the
      // element showing the message's content, since that's the one zoom
      // commands should apply to.
      return this.messageBrowser.contentWindow.getMessagePaneBrowser();
    }

    if (this.isMultiMessageBrowserVisible()) {
      return this.multiMessageBrowser;
    }

    return null;
  }

  /**
   * Helper function that returns true if one of the three browser panes are
   * visible, and false otherwise.
   *
   * @returns {boolean} - Whether a browser pane is visible or not.
   */
  browserPaneVisible() {
    return (
      this.isWebBrowserVisible() ||
      this.isMessageBrowserVisible() ||
      this.isMultiMessageBrowserVisible()
    );
  }

  /**
   * Helper function to trigger a command from within the message browser
   * command controller.
   *
   * @param {string} command - The XUL command that needs to be triggered.
   */
  doMessageBrowserCommand(command) {
    this.messageBrowser?.contentWindow.commandController.doCommand(command);
  }

  /**
   * Helper function to check if a XUL command is enabled for the message
   * browser command controller.
   *
   * @param {string} command - The XUL command that needs to be checked.
   * @returns {boolean}
   */
  isMessageBrowserCommandEnabled(command) {
    return this.messageBrowser?.contentWindow.commandController.isCommandEnabled(
      command
    );
  }

  /**
   * Helper method to dispatch the cmd_find to the currently visible findbar.
   */
  onFindCommand() {
    if (this.isMessageBrowserVisible()) {
      this.doMessageBrowserCommand("cmd_find");
      return;
    }

    if (this.isMultiMessageBrowserVisible()) {
      this.multiMessageFindbar.onFindCommand();
      return;
    }

    if (this.isWebBrowserVisible()) {
      this.webFindbar.onFindCommand();
    }
  }

  /**
   * Helper method to dispatch the cmd_findAgain to the currently visible
   * findbar.
   */
  onFindAgainCommand() {
    if (this.isMessageBrowserVisible()) {
      this.doMessageBrowserCommand("cmd_findAgain");
      return;
    }

    if (this.isMultiMessageBrowserVisible()) {
      this.multiMessageFindbar.onFindAgainCommand(false);
      return;
    }

    if (this.isWebBrowserVisible()) {
      this.webFindbar.onFindAgainCommand(false);
    }
  }

  /**
   * Helper method to dispatch the cmd_findPrevious to the currently visible
   * findbar.
   */
  onFindPreviousCommand() {
    if (this.isMessageBrowserVisible()) {
      this.doMessageBrowserCommand("cmd_findPrevious");
      return;
    }

    if (this.isMultiMessageBrowserVisible()) {
      this.multiMessageFindbar.onFindAgainCommand(true);
      return;
    }

    if (this.isWebBrowserVisible()) {
      this.webFindbar.onFindAgainCommand(true);
    }
  }
}
customElements.define("message-pane", MessagePane);
