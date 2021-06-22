/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { XPCOMUtils } = ChromeUtils.import(
    "resource://gre/modules/XPCOMUtils.jsm"
  );

  const LazyModules = {};
  XPCOMUtils.defineLazyModuleGetters(LazyModules, {
    cleanupImMarkup: "resource:///modules/imContentSink.jsm",
    getCurrentTheme: "resource:///modules/imThemes.jsm",
    getDocumentFragmentFromHTML: "resource:///modules/imThemes.jsm",
    getHTMLForMessage: "resource:///modules/imThemes.jsm",
    initHTMLDocument: "resource:///modules/imThemes.jsm",
    insertHTMLForMessage: "resource:///modules/imThemes.jsm",
    isNextMessage: "resource:///modules/imThemes.jsm",
    serializeSelection: "resource:///modules/imThemes.jsm",
    smileTextNode: "resource:///modules/imSmileys.jsm",
  });

  (function() {
    // <browser> is lazily set up through setElementCreationCallback,
    // i.e. put into customElements the first time it's really seen.
    // Create a fake to ensure browser exists in customElements, since otherwise
    // we can't extend it. Then make sure this fake doesn't stay around.
    if (!customElements.get("browser")) {
      delete document.createXULElement("browser");
    }
  })();

  /**
   * The chat conversation browser, i.e. the main content on the chat tab.
   * @augments {MozBrowser}
   */
  class MozConversationBrowser extends customElements.get("browser") {
    constructor() {
      super();

      this._conv = null;

      // Make sure to load URLs externally.
      this.addEventListener("click", event => {
        // Right click should open the context menu.
        if (event.button == 2) {
          return;
        }

        // The 'click' event is fired even when the link is
        // activated with the keyboard.

        // The event target may be a descendant of the actual link.
        let url;
        for (let elem = event.target; elem; elem = elem.parentNode) {
          if (elem instanceof HTMLAnchorElement) {
            url = elem.href;
            if (url) {
              break;
            }
          }
        }
        if (!url) {
          return;
        }

        let uri = Services.io.newURI(url);

        // http and https are the only schemes that are both
        // allowed by our IM filters and exposed.
        if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        // loadURI can throw if the default browser is misconfigured.
        Cc["@mozilla.org/uriloader/external-protocol-service;1"]
          .getService(Ci.nsIExternalProtocolService)
          .loadURI(uri);
      });

      this.addEventListener("keypress", event => {
        switch (event.keyCode) {
          case KeyEvent.DOM_VK_PAGE_UP: {
            if (event.shiftKey) {
              this.contentWindow.scrollByPages(-1);
            } else if (event.altKey) {
              this.scrollToPreviousSection();
            }
            break;
          }
          case KeyEvent.DOM_VK_PAGE_DOWN: {
            if (event.shiftKey) {
              this.contentWindow.scrollByPages(1);
            } else if (event.altKey) {
              this.scrollToNextSection();
            }
            break;
          }
          case KeyEvent.DOM_VK_HOME: {
            this.scrollToPreviousSection();
            event.preventDefault();
            break;
          }
          case KeyEvent.DOM_VK_END: {
            this.scrollToNextSection();
            event.preventDefault();
            break;
          }
        }
      });
    }

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      super.connectedCallback();

      this._theme = null;

      this.autoCopyEnabled = false;

      this.magicCopyPref =
        "messenger.conversations.selections.magicCopyEnabled";

      this.magicCopyInitialized = false;

      this._destroyed = false;

      // Makes the chat browser scroll to the bottom automatically when we append
      // a new message. This behavior gets disabled when the user scrolls up to
      // look at the history, and we re-enable it when the user scrolls to
      // (within 10px) of the bottom.
      this._convScrollEnabled = true;

      this._textModifiers = [LazyModules.smileTextNode];

      // These variables are reset in onStateChange:
      this._lastMessage = null;
      this._lastMessageIsContext = true;
      this._firstNonContextElt = null;
      this._messageDisplayPending = false;
      this._pendingMessages = [];
      this._nextPendingMessageIndex = 0;
      this._pendingMessagesDisplayed = 0;
      this._displayPendingMessagesCalls = 0;
      this._sessions = [];

      this.progressBar = null;

      this.addEventListener("scroll", this.browserScroll);
      this.addEventListener("resize", this.browserResize);

      // @implements {nsIObserver}
      this.prefObserver = (subject, topic, data) => {
        if (this.magicCopyEnabled) {
          this.enableMagicCopy();
        } else {
          this.disableMagicCopy();
        }
      };

      // @implements {nsIController}
      this.copyController = {
        supportsCommand(command) {
          return command == "cmd_copy" || command == "cmd_cut";
        },
        isCommandEnabled: command => {
          return (
            command == "cmd_copy" &&
            !this.contentWindow.getSelection().isCollapsed
          );
        },
        doCommand: command => {
          let selection = this.contentWindow.getSelection();
          if (selection.isCollapsed) {
            return;
          }

          Cc["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Ci.nsIClipboardHelper)
            .copyString(LazyModules.serializeSelection(selection));
        },
        onEvent(command) {},
        QueryInterface: ChromeUtils.generateQI(["nsIController"]),
      };

      // @implements {nsISelectionListener}
      this.chatSelectionListener = {
        notifySelectionChanged(document, selection, reason) {
          if (
            !(
              reason & Ci.nsISelectionListener.MOUSEUP_REASON ||
              reason & Ci.nsISelectionListener.SELECTALL_REASON ||
              reason & Ci.nsISelectionListener.KEYPRESS_REASON
            )
          ) {
            // We are still dragging, don't bother with the selection.
            return;
          }

          Cc["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Ci.nsIClipboardHelper)
            .copyStringToClipboard(
              LazyModules.serializeSelection(selection),
              Ci.nsIClipboard.kSelectionClipboard
            );
        },
        QueryInterface: ChromeUtils.generateQI(["nsISelectionListener"]),
      };
    }

    init(conversation) {
      // Magic Copy may be initialized if the convbrowser is already
      // displaying a conversation.
      this.uninitMagicCopy();

      this._conv = conversation;

      // init is called when the message style preview is
      // reloaded so we need to reset _theme.
      this._theme = null;

      // Prevent ongoing asynchronous message display from continuing.
      this._messageDisplayPending = false;

      this.addEventListener(
        "load",
        () => {
          LazyModules.initHTMLDocument(
            this._conv,
            this.theme,
            this.contentDocument
          );

          this._exposeMethodsToContent();
          this.initMagicCopy();

          // We need to reset these variables here to avoid a race
          // condition if we are starting to display a new conversation
          // but the display of the previous conversation wasn't finished.
          // This can happen if the user quickly changes the selected
          // conversation in the log viewer.
          this._lastMessage = null;
          this._lastMessageIsContext = true;
          this._firstNonContextElt = null;
          this._messageDisplayPending = false;
          this._pendingMessages = [];
          this._nextPendingMessageIndex = 0;
          this._pendingMessagesDisplayed = 0;
          this._displayPendingMessagesCalls = 0;
          this._sessions = [];
          if (this.progressBar) {
            this.progressBar.hidden = true;
          }

          this.onChatNodeContentLoad = this.onContentElementLoad.bind(this);
          this.contentChatNode.addEventListener(
            "load",
            this.onChatNodeContentLoad,
            true
          );

          // Notify observers to get the conversation shown.
          Services.obs.notifyObservers(this, "conversation-loaded");
        },
        {
          once: true,
          capture: true,
        }
      );
      this.loadURI("chrome://chat/content/conv.html", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }

    get theme() {
      return this._theme || (this._theme = LazyModules.getCurrentTheme());
    }

    get contentDocument() {
      return this.webNavigation.document;
    }

    get contentChatNode() {
      return this.contentDocument.getElementById("Chat");
    }

    get magicCopyEnabled() {
      return Services.prefs.getBoolPref(this.magicCopyPref);
    }

    enableMagicCopy() {
      this.contentWindow.controllers.insertControllerAt(0, this.copyController);
      this.autoCopyEnabled =
        Services.clipboard.supportsSelectionClipboard() &&
        Services.prefs.getBoolPref("clipboard.autocopy");
      if (this.autoCopyEnabled) {
        let selection = this.contentWindow.getSelection();
        if (selection) {
          selection.addSelectionListener(this.chatSelectionListener);
        }
      }
    }

    disableMagicCopy() {
      this.contentWindow.controllers.removeController(this.copyController);
      if (this.autoCopyEnabled) {
        let selection = this.contentWindow.getSelection();
        if (selection) {
          selection.removeSelectionListener(this.chatSelectionListener);
        }
      }
    }

    initMagicCopy() {
      if (this.magicCopyInitialized) {
        return;
      }
      Services.prefs.addObserver(this.magicCopyPref, this.prefObserver);
      this.magicCopyInitialized = true;
      if (this.magicCopyEnabled) {
        this.enableMagicCopy();
      }
    }

    uninitMagicCopy() {
      if (!this.magicCopyInitialized) {
        return;
      }
      Services.prefs.removeObserver(this.magicCopyPref, this.prefObserver);
      if (this.magicCopyEnabled) {
        this.disableMagicCopy();
      }
      this.magicCopyInitialized = false;
    }

    destroy() {
      super.destroy();
      if (this._destroyed) {
        return;
      }
      this._destroyed = true;
      this._messageDisplayPending = false;

      this.uninitMagicCopy();

      if (this.contentChatNode) {
        // Remove the listener only if the conversation was initialized.
        this.contentChatNode.removeEventListener(
          "load",
          this.onChatNodeContentLoad,
          true
        );
      }
    }

    _updateConvScrollEnabled() {
      // Enable auto-scroll if the scrollbar is at the bottom.
      let body = this.contentDocument.querySelector("body");
      this._convScrollEnabled =
        body.scrollHeight <= body.scrollTop + body.clientHeight + 10;
      return this._convScrollEnabled;
    }

    convScrollEnabled() {
      return this._convScrollEnabled || this._updateConvScrollEnabled();
    }

    _scrollToElement(aElt) {
      aElt.scrollIntoView(true);
      this._scrollingIntoView = true;
    }

    _exposeMethodsToContent() {
      // Expose scrollToElement and convScrollEnabled to the message styles.
      this.contentWindow.scrollToElement = this._scrollToElement.bind(this);
      this.contentWindow.convScrollEnabled = this.convScrollEnabled.bind(this);
    }

    addTextModifier(aModifier) {
      if (!this._textModifiers.includes(aModifier)) {
        this._textModifiers.push(aModifier);
      }
    }

    set isActive(value) {
      if (!value && !this.browsingContext) {
        return;
      }
      this.browsingContext.isActive = value;
      if (value && this._pendingMessages.length) {
        this.startDisplayingPendingMessages(false);
      }
    }

    appendMessage(aMsg, aContext, aFirstUnread) {
      this._pendingMessages.push({
        msg: aMsg,
        context: aContext,
        firstUnread: aFirstUnread,
      });
      if (this.browsingContext.isActive) {
        this.startDisplayingPendingMessages(true);
      }
    }

    startDisplayingPendingMessages(delayed) {
      if (this._messageDisplayPending) {
        return;
      }
      this._messageDisplayPending = true;
      this.contentWindow.messageInsertPending = true;
      if (delayed) {
        requestIdleCallback(this.displayPendingMessages.bind(this));
      } else {
        // 200ms here is a generous amount of time. The conversation switch
        // should take no more than 100ms to feel 'immediate', but the perceived
        // performance if we flicker is likely even worse than having a barely
        // perceptible delay.
        let deadline = Cu.now() + 200;
        this.displayPendingMessages({
          timeRemaining() {
            return deadline - Cu.now();
          },
        });
      }
    }

    // getNextPendingMessage and getPendingMessagesCount are the
    // only 2 methods accessing the this._pendingMessages array
    // directly during the chunked display of messages. It is
    // possible to override these 2 methods to replace the array
    // with something else. The log viewer for example uses an
    // enumerator that creates message objects lazily to avoid
    // jank when displaying lots of messages.
    getNextPendingMessage() {
      let length = this._pendingMessages.length;
      if (this._nextPendingMessageIndex == length) {
        return null;
      }

      let result = this._pendingMessages[this._nextPendingMessageIndex++];

      if (this._nextPendingMessageIndex == length) {
        this._pendingMessages = [];
        this._nextPendingMessageIndex = 0;
      }

      return result;
    }

    getPendingMessagesCount() {
      return this._pendingMessages.length;
    }

    displayPendingMessages(timing) {
      if (!this._messageDisplayPending) {
        return;
      }

      let max = this.getPendingMessagesCount();
      do {
        // One message takes less than 2ms on average.
        let msg = this.getNextPendingMessage();
        if (!msg) {
          break;
        }
        this.displayMessage(
          msg.msg,
          msg.context,
          ++this._pendingMessagesDisplayed < max,
          msg.firstUnread
        );
      } while (timing.timeRemaining() > 2);

      let event = document.createEvent("UIEvents");
      event.initUIEvent("MessagesDisplayed", false, false, window, 0);
      if (this._pendingMessagesDisplayed < max) {
        if (this.progressBar) {
          // Show progress bar if after the third call (ca. 120ms)
          // less than half the messages have been displayed.
          if (
            ++this._displayPendingMessagesCalls > 2 &&
            max > 2 * this._pendingMessagesDisplayed
          ) {
            this.progressBar.hidden = false;
          }
          this.progressBar.max = max;
          this.progressBar.value = this._pendingMessagesDisplayed;
        }
        requestIdleCallback(this.displayPendingMessages.bind(this));
        this.dispatchEvent(event);
        return;
      }
      this.contentWindow.messageInsertPending = false;
      this._messageDisplayPending = false;
      this._pendingMessagesDisplayed = 0;
      this._displayPendingMessagesCalls = 0;
      if (this.progressBar) {
        this.progressBar.hidden = true;
      }
      this.dispatchEvent(event);
    }

    displayMessage(aMsg, aContext, aNoAutoScroll, aFirstUnread) {
      let doc = this.contentDocument;

      if (aMsg.noLog && aMsg.notification && aMsg.who == "sessionstart") {
        // New session log.
        if (this._lastMessage) {
          let ruler = doc.createElement("hr");
          ruler.className = "sessionstart-ruler";
          this.contentChatNode.appendChild(ruler);
          this._sessions.push(ruler);
          // Close any open bubble.
          this._lastMessage = null;
        }
        // Suppress this message unless it was an error message.
        if (!aMsg.error) {
          return;
        }
      }

      let cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
        Ci.mozITXTToHTMLConv
      );

      // kStructPhrase creates tags for plaintext-markup like *bold*,
      // /italics/, etc. We always use this; the content filter will
      // filter it out if the user does not want styling.
      let csFlags = cs.kStructPhrase;
      // Automatically find and link freetext URLs
      if (!aMsg.noLinkification) {
        csFlags |= cs.kURLs;
      }

      if (aFirstUnread) {
        this.setUnreadRuler();
      }

      // Right trim before displaying. This removes any OTR related
      // whitespace when the extension isn't enabled.
      let msg = aMsg.displayMessage.trimRight();

      // The slash of a leading '/me' should not be used to
      // format as italic, so we remove the '/me' text before
      // scanning the HTML, and we add it back later.
      let meRegExp = /^((<[^>]+>)*)\/me /;
      let me = false;
      if (meRegExp.test(msg)) {
        me = true;
        msg = msg.replace(meRegExp, "$1");
      }

      msg = cs
        .scanHTML(msg.replace(/&/g, "FROM-DTD-amp"), csFlags)
        .replace(/FROM-DTD-amp/g, "&");

      if (me) {
        msg = msg.replace(/^((<[^>]+>)*)/, "$1/me ");
      }

      aMsg.message = LazyModules.cleanupImMarkup(
        msg.replace(/\r?\n/g, "<br/>"),
        null,
        this._textModifiers
      );

      let next =
        (aContext == this._lastMessageIsContext || aMsg.system) &&
        LazyModules.isNextMessage(this.theme, aMsg, this._lastMessage);
      let newElt;
      if (next && aFirstUnread) {
        // If there wasn't an unread ruler, this would be a Next message.
        // Therefore, save that version for later.
        let html = LazyModules.getHTMLForMessage(
          aMsg,
          this.theme,
          next,
          aContext
        );
        let ruler = doc.getElementById("unread-ruler");
        ruler.nextMsgHtml = html;
        ruler._originalMsg = aMsg;

        // Remember where the Next message(s) would have gone.
        let insert = doc.getElementById("insert");
        if (!insert) {
          insert = doc.createElement("div");
          ruler.parentNode.insertBefore(insert, ruler);
        }
        insert.id = "insert-before";

        next = false;
        html = LazyModules.getHTMLForMessage(aMsg, this.theme, next, aContext);
        newElt = LazyModules.insertHTMLForMessage(aMsg, html, doc, next);
        let marker = doc.createElement("div");
        marker.id = "end-of-split-block";
        newElt.parentNode.appendChild(marker);

        // Bracket the place where additional Next messages will be added,
        // if that's not after the end-of-split-block element.
        insert = doc.getElementById("insert");
        if (insert) {
          marker = doc.createElement("div");
          marker.id = "next-messages-start";
          insert.parentNode.insertBefore(marker, insert);
          marker = doc.createElement("div");
          marker.id = "next-messages-end";
          insert.parentNode.insertBefore(marker, insert.nextElementSibling);
        }
      } else {
        let html = LazyModules.getHTMLForMessage(
          aMsg,
          this.theme,
          next,
          aContext
        );
        newElt = LazyModules.insertHTMLForMessage(aMsg, html, doc, next);
      }

      if (!aNoAutoScroll) {
        newElt.getBoundingClientRect(); // avoid ireflow bugs
        if (this.convScrollEnabled()) {
          this._scrollToElement(newElt);
        }
      }
      this._lastElement = newElt;
      this._lastMessage = aMsg;
      if (!aContext && !this._firstNonContextElt && !aMsg.system) {
        this._firstNonContextElt = newElt;
      }
      this._lastMessageIsContext = aContext;
    }

    setUnreadRuler() {
      // Remove any existing ruler (occurs when the window has lost focus).
      this.removeUnreadRuler();

      let ruler = this.contentDocument.createElement("hr");
      ruler.id = "unread-ruler";
      this.contentChatNode.appendChild(ruler);
    }

    removeUnreadRuler() {
      if (this._lastMessage) {
        this._lastMessage.whenRead();
      }

      let doc = this.contentDocument;
      let ruler = doc.getElementById("unread-ruler");
      if (!ruler) {
        return;
      }

      // If a message block was split by the ruler, rejoin it.
      let moveTo = doc.getElementById("insert-before");
      if (moveTo) {
        // Protect an existing insert node.
        let actualInsert = doc.getElementById("insert");
        if (actualInsert) {
          actualInsert.id = "actual-insert";
        }

        // Add first message following the ruler as a Next type message.
        // Replicates the relevant parts of insertHTMLForMessage().
        let range = doc.createRange();
        let moveToParent = moveTo.parentNode;
        range.selectNode(moveToParent);
        // eslint-disable-next-line no-unsanitized/method
        let documentFragment = LazyModules.getDocumentFragmentFromHTML(
          doc,
          ruler.nextMsgHtml
        );
        for (
          let root = documentFragment.firstElementChild;
          root;
          root = root.nextElementSibling
        ) {
          root._originalMsg = ruler._originalMsg;
        }
        moveToParent.insertBefore(documentFragment, moveTo);

        // If this added an insert node, insert the next messages there.
        let insert = doc.getElementById("insert");
        if (insert) {
          moveTo.remove();
          moveTo = insert;
          moveToParent = moveTo.parentNode;
        }

        // Move remaining messages from the message block following the ruler.
        let nextMessagesStart = doc.getElementById("next-messages-start");
        if (nextMessagesStart) {
          range = doc.createRange();
          range.setStartAfter(nextMessagesStart);
          range.setEndBefore(doc.getElementById("next-messages-end"));
          moveToParent.insertBefore(range.extractContents(), moveTo);
        }
        moveTo.remove();

        // Restore existing insert node.
        if (actualInsert) {
          actualInsert.id = "insert";
        }

        // Delete surplus message block.
        range = doc.createRange();
        range.setStartAfter(ruler);
        range.setEndAfter(doc.getElementById("end-of-split-block"));
        range.deleteContents();
      }
      ruler.remove();
    }

    _getSections() {
      // If a section is displayed below this point, we assume not enough of
      // it is visible, so we must scroll to it.
      // The 3/4 constant is arbitrary, but it has to be greater than 1/2.
      this._maximalSectionOffset = Math.round((this.clientHeight * 3) / 4);

      // Get list of current section elements.
      let sectionElements = [];
      if (this._firstNonContextElt) {
        sectionElements.push(this._firstNonContextElt);
      }
      let ruler = this.contentDocument.getElementById("unread-ruler");
      if (ruler) {
        sectionElements.push(ruler);
      }
      sectionElements = sectionElements.concat(this._sessions);

      // Return ordered array of sections with entries
      // [Y, scrollY such that Y is centered]
      let sections = [];
      let maxY = this.contentWindow.scrollMaxY;
      for (let i = 0; i < sectionElements.length; ++i) {
        let y = sectionElements[i].offsetTop;
        // The section is unnecessary if close to top/bottom of conversation.
        if (y < this._maximalSectionOffset || maxY < y) {
          continue;
        }
        sections.push([y, y - Math.round(this.clientHeight / 2)]);
      }
      sections.sort((a, b) => a[0] - b[0]);
      return sections;
    }

    scrollToPreviousSection() {
      let sections = this._getSections();
      let y = this.contentWindow.scrollY;
      let newY = 0;
      for (let i = sections.length - 1; i >= 0; --i) {
        let section = sections[i];
        if (y > section[0]) {
          newY = section[1];
          break;
        }
      }
      this.contentWindow.scrollTo(0, newY);
    }

    scrollToNextSection() {
      let sections = this._getSections();
      let y = this.contentWindow.scrollY;
      let newY = this.contentWindow.scrollMaxY;
      for (let i = 0; i < sections.length; ++i) {
        let section = sections[i];
        if (y + this._maximalSectionOffset < section[0]) {
          newY = section[1];
          break;
        }
      }
      this.contentWindow.scrollTo(0, newY);
    }

    browserScroll(event) {
      if (this._scrollingIntoView) {
        // We have explicitly requested a scrollIntoView, ignore the event.
        this._scrollingIntoView = false;
        this._lastScrollHeight = this.scrollHeight;
        this._lastScrollWidth = this.scrollWidth;
        return;
      }

      if (
        !("_lastScrollHeight" in this) ||
        this._lastScrollHeight != this.scrollHeight ||
        this._lastScrollWidth != this.scrollWidth
      ) {
        // Ensure scroll events triggered by a change of the
        // content area size (eg. resizing the window or moving the
        // textbox splitter) don't affect the auto-scroll behavior.
        this._lastScrollHeight = this.scrollHeight;
        this._lastScrollWidth = this.scrollWidth;
      }

      // If images higher than one line of text load they will trigger a
      // scroll event, which shouldn't disable auto-scroll while messages
      // are being appended without being scrolled.
      if (this._messageDisplayPending) {
        return;
      }

      // Enable or disable auto-scroll based on the scrollbar position.
      this._updateConvScrollEnabled();
    }

    browserResize(event) {
      if (this._convScrollEnabled && this._lastElement) {
        // The content area was resized and auto-scroll is enabled,
        // make sure the last inserted element is still visible
        this._scrollToElement(this._lastElement);
      }
    }

    onContentElementLoad(event) {
      if (
        event.target.localName == "img" &&
        this._convScrollEnabled &&
        !this._messageDisplayPending &&
        this._lastElement
      ) {
        // An image loaded while auto-scroll is enabled and no further
        // messages are currently being appended. So we need to scroll
        // the last element fully back into view.
        this._scrollToElement(this._lastElement);
      }
    }
  }
  customElements.define("conversation-browser", MozConversationBrowser, {
    extends: "browser",
  });
}
