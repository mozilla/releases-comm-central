/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozElements, MozXULElement, chatHandler */

// Wrap in a block to prevent leaking to window scope.
{
  const { IMServices } = ChromeUtils.importESModule(
    "resource:///modules/IMServices.sys.mjs"
  );
  const { Status } = ChromeUtils.importESModule(
    "resource:///modules/imStatusUtils.sys.mjs"
  );
  const { TextboxSize } = ChromeUtils.importESModule(
    "resource:///modules/imTextboxUtils.sys.mjs"
  );
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  const { InlineSpellChecker } = ChromeUtils.importESModule(
    "resource://gre/modules/InlineSpellChecker.sys.mjs"
  );

  /**
   * The MozChatConversation widget displays the entire chat conversation
   * including status notifications
   *
   * @augments {MozXULElement}
   */
  class MozChatConversation extends MozXULElement {
    static get inheritedAttributes() {
      return {
        browser: "autoscrollpopup",
      };
    }

    constructor() {
      super();

      ChromeUtils.defineESModuleGetters(this, {
        ChatEncryption: "resource:///modules/ChatEncryption.sys.mjs",
      });

      this.observer = {
        // @see {nsIObserver}
        observe: (subject, topic, data) => {
          if (topic == "conversation-loaded") {
            if (subject != this.convBrowser) {
              return;
            }

            this.convBrowser.progressBar = this.progressBar;

            // Display all queued messages. Use a timeout so that message text
            // modifiers can be added with observers for this notification.
            if (!this.loaded) {
              setTimeout(this._showFirstMessages.bind(this), 0);
            }

            Services.obs.removeObserver(this.observer, "conversation-loaded");

            return;
          }

          switch (topic) {
            case "new-text":
              if (this.loaded && this.addMsg(subject)) {
                // This will mark the conv as read, but also update the conv title
                // with the new unread count etc.
                this.tab.update();
              }
              break;

            case "update-text":
              if (this.loaded) {
                this.updateMsg(subject);
              }
              break;

            case "remove-text":
              if (this.loaded) {
                this.removeMsg(data);
              }
              break;

            case "status-text-changed":
              this._statusText = data || "";
              this.displayStatusText();
              break;

            case "replying-to-prompt":
              this.addPrompt(data);
              break;

            case "target-prpl-conversation-changed":
            case "update-conv-title":
              if (this.tab && this.conv) {
                this.tab.setAttribute("label", this.conv.title);
              }
              break;

            // Update the status too.
            case "update-buddy-status":
            case "update-buddy-icon":
            case "update-conv-icon":
            case "update-conv-chatleft":
              if (this.tab && this._isConversationSelected) {
                this.updateConvStatus();
              }
              break;

            case "update-typing":
              if (this.tab && this._isConversationSelected) {
                this._currentTypingName = data;
                this.updateConvStatus();
              }
              break;

            case "chat-buddy-add":
              if (!this._isConversationSelected) {
                break;
              }
              for (const nick of subject.QueryInterface(
                Ci.nsISimpleEnumerator
              )) {
                this.insertBuddy(this.createBuddy(nick));
              }
              this.updateParticipantCount();
              break;

            case "chat-buddy-remove":
              if (!this._isConversationSelected) {
                for (const nick of subject.QueryInterface(
                  Ci.nsISimpleEnumerator
                )) {
                  const name = nick.toString();
                  if (this._isBuddyActive(name)) {
                    delete this._activeBuddies[name];
                  }
                }
                break;
              }
              for (const nick of subject.QueryInterface(
                Ci.nsISimpleEnumerator
              )) {
                this.removeBuddy(nick.toString());
              }
              this.updateParticipantCount();
              break;

            case "chat-buddy-update":
              this.updateBuddy(subject, data);
              break;

            case "chat-update-topic":
              if (this._isConversationSelected) {
                this.updateTopic();
              }
              break;
            case "update-conv-encryption":
              if (this._isConversationSelected) {
                this.ChatEncryption.updateEncryptionButton(document, this.conv);
              }
              break;
          }
        },
        QueryInterface: ChromeUtils.generateQI([
          "nsIObserver",
          "nsISupportsWeakReference",
        ]),
      };
    }

    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }

      this.loaded = false;
      this._readCount = 0;
      this._statusText = "";
      this._pendingValueChangedCall = false;
      this._nickEscape = /[[\]{}()*+?.\\^$|]/g;
      this._currentTypingName = "";

      // This value represents the difference between the deck's height and the
      // textbox's content height (borders, margins, paddings).
      // Differ according to the Operating System native theme.
      this._TEXTBOX_VERTICAL_OVERHEAD = 0;

      // Ratio textbox height / conversation height.
      // 0.1 means that the textbox's height is 10% of the conversation's height.
      this._TEXTBOX_RATIO = 0.1;

      this.setAttribute("orient", "vertical");
      this.setAttribute("flex", "1");
      this.classList.add("convBox");

      this.convTop = document.createXULElement("vbox");
      this.convTop.setAttribute("flex", "1");
      this.convTop.classList.add("conv-top");

      this.notification = document.createXULElement("vbox");

      this.convBrowser = document.createXULElement("browser", {
        is: "conversation-browser",
      });
      this.convBrowser.setAttribute("flex", "1");
      this.convBrowser.setAttribute("type", "content");
      this.convBrowser.setAttribute("messagemanagergroup", "browsers");

      this.progressBar = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "progress"
      );
      this.progressBar.setAttribute("hidden", "hidden");

      this.findbar = document.createXULElement("findbar");
      this.findbar.setAttribute("reversed", "true");

      this.convTop.appendChild(this.notification);
      this.convTop.appendChild(this.convBrowser);
      this.convTop.appendChild(this.progressBar);
      this.convTop.appendChild(this.findbar);

      this.splitter = document.createXULElement("splitter");
      this.splitter.setAttribute("orient", "vertical");
      this.splitter.classList.add("splitter");

      this.convStatusContainer = document.createXULElement("hbox");
      this.convStatusContainer.setAttribute("hidden", "true");
      this.convStatusContainer.classList.add("conv-status-container");

      this.convStatus = document.createXULElement("description");
      this.convStatus.classList.add("plain");
      this.convStatus.classList.add("conv-status");
      this.convStatus.setAttribute("crop", "end");

      this.convStatusContainer.appendChild(this.convStatus);

      this.convBottom = document.createXULElement("stack");
      this.convBottom.classList.add("conv-bottom");

      this.inputBox = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "textarea"
      );
      this.inputBox.classList.add("conv-textbox");

      this.charCounter = document.createXULElement("description");
      this.charCounter.classList.add("conv-counter");
      this.convBottom.appendChild(this.inputBox);
      this.convBottom.appendChild(this.charCounter);

      this.appendChild(this.convTop);
      this.appendChild(this.splitter);
      this.appendChild(this.convStatusContainer);
      this.appendChild(this.convBottom);

      this.inputBox.addEventListener("keypress", this.inputKeyPress.bind(this));
      this.inputBox.addEventListener(
        "input",
        this.inputValueChanged.bind(this)
      );
      this.inputBox.addEventListener(
        "overflow",
        this.inputExpand.bind(this),
        true
      );
      this.inputBox.addEventListener(
        "underflow",
        this._onTextboxUnderflow,
        true
      );

      new MutationObserver(
        function (aMutations) {
          for (const mutation of aMutations) {
            if (mutation.oldValue == "dragging") {
              this._onSplitterChange();
              break;
            }
          }
        }.bind(this)
      ).observe(this.splitter, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["state"],
      });

      this.convBrowser.addEventListener(
        "keypress",
        this.browserKeyPress.bind(this)
      );
      this.convBrowser.addEventListener(
        "dblclick",
        this.browserDblClick.bind(this)
      );
      Services.obs.addObserver(this.observer, "conversation-loaded");

      // @implements {nsIObserver}
      this.prefObserver = () => {
        if (Services.prefs.getBoolPref("mail.spellcheck.inline")) {
          this.inputBox.setAttribute("spellcheck", "true");
          this.spellchecker.enabled = true;
        } else {
          this.inputBox.removeAttribute("spellcheck");
          this.spellchecker.enabled = false;
        }
      };
      Services.prefs.addObserver("mail.spellcheck.inline", this.prefObserver);

      this.initializeAttributeInheritance();
    }

    get msgNotificationBar() {
      if (!this._notificationBox) {
        this._notificationBox = new MozElements.NotificationBox(element => {
          element.setAttribute("notificationside", "top");
          this.notification.prepend(element);
        });
      }
      return this._notificationBox;
    }

    destroy() {
      if (this._conv) {
        this._forgetConv();
      }

      Services.prefs.removeObserver(
        "mail.spellcheck.inline",
        this.prefObserver
      );
    }

    _forgetConv() {
      this._conv.removeObserver(this.observer);
      delete this._conv;
      this.convBrowser.destroy();
      this.findbar.destroy();
    }

    close() {
      this._forgetConv(true);
    }

    _showFirstMessages() {
      this.loaded = true;
      const messages = this._conv.getMessages();
      this._readCount = messages.length - this._conv.unreadMessageCount;
      if (this._readCount) {
        this._writingContextMessages = true;
      }
      messages.forEach(this.addMsg.bind(this));
      delete this._writingContextMessages;

      if (this.tab && this.tab.selected && document.hasFocus()) {
        // This will mark the conv as read, but also update the conv title
        // with the new unread count etc.
        this.tab.update();
      }
    }

    displayStatusText() {
      this.convStatus.value = this._statusText;
      if (this._statusText) {
        this.convStatusContainer.removeAttribute("hidden");
      } else {
        this.convStatusContainer.setAttribute("hidden", "true");
      }
    }

    addMsg(aMsg) {
      if (!this.loaded) {
        throw new Error("Calling addMsg before the browser is ready?");
      }

      var conv = aMsg.conversation;
      if (!conv) {
        // The conversation has already been destroyed,
        // probably because the window was closed.
        // Return without doing anything.
        return false;
      }

      // Ugly hack... :(
      if (!aMsg.system && conv.isChat) {
        const name = aMsg.who;
        let color;
        if (this.buddies.has(name)) {
          const buddy = this.buddies.get(name);
          color = buddy.color;
          buddy.removeAttribute("inactive");
          this._activeBuddies[name] = true;
        } else {
          // Buddy no longer in the room
          color = this._computeColor(name);
        }
        aMsg.color = "color: hsl(" + color + ", 100%, 40%);";
      }

      // Porting note: In TB, this.tab points at the imconv richlistitem element.
      const read = this._readCount > 0;
      const isUnreadMessage = !read && aMsg.incoming && !aMsg.system;
      const isTabFocused = this.tab && this.tab.selected && document.hasFocus();
      const shouldSetUnreadFlag = this.tab && isUnreadMessage && !isTabFocused;
      const firstUnread =
        this.tab &&
        !this.tab.hasAttribute("unread") &&
        isUnreadMessage &&
        this._isAfterFirstRealMessage &&
        (!isTabFocused || this._writingContextMessages);

      // Since the unread flag won't be set if the tab is focused,
      // we need the following when showing the first messages to stop
      // firstUnread being set for subsequent messages.
      if (firstUnread) {
        delete this._writingContextMessages;
      }

      this.convBrowser.appendMessage(aMsg, read, firstUnread);
      if (!aMsg.system) {
        this._isAfterFirstRealMessage = true;
      }

      if (read) {
        --this._readCount;
        if (!this._readCount && !this._isAfterFirstRealMessage) {
          // If all the context messages were system messages, we don't want
          // an unread ruler after the context messages, so we forget that
          // we had context messages.
          delete this._writingContextMessages;
        }
        return false;
      }

      if (isUnreadMessage && (!aMsg.conversation.isChat || aMsg.containsNick)) {
        this._lastPing = aMsg.who;
        this._lastPingTime = aMsg.time;
      }

      if (shouldSetUnreadFlag) {
        if (conv.isChat && aMsg.containsNick) {
          this.tab.setAttribute("attention", "true");
        }
        this.tab.setAttribute("unread", "true");
      }

      return isTabFocused;
    }

    /**
     * Updates an existing message with the matching remote ID.
     *
     * @param {imIMessage} aMsg - Message to update.
     */
    updateMsg(aMsg) {
      if (!this.loaded) {
        throw new Error("Calling updateMsg before the browser is ready?");
      }

      var conv = aMsg.conversation;
      if (!conv) {
        // The conversation has already been destroyed,
        // probably because the window was closed.
        // Return without doing anything.
        return;
      }

      // Update buddy color.
      // Ugly hack... :(
      if (!aMsg.system && conv.isChat) {
        const name = aMsg.who;
        let color;
        if (this.buddies.has(name)) {
          const buddy = this.buddies.get(name);
          color = buddy.color;
          buddy.removeAttribute("inactive");
          this._activeBuddies[name] = true;
        } else {
          // Buddy no longer in the room
          color = this._computeColor(name);
        }
        aMsg.color = "color: hsl(" + color + ", 100%, 40%);";
      }

      this.convBrowser.replaceMessage(aMsg);
    }

    /**
     * Removes an existing message with matching remote ID.
     *
     * @param {string} remoteId - Remote ID of the message to remove.
     */
    removeMsg(remoteId) {
      if (!this.loaded) {
        throw new Error("Calling removeMsg before the browser is ready?");
      }

      this.convBrowser.removeMessage(remoteId);
    }

    sendMsg(aMsg) {
      if (!aMsg) {
        return;
      }

      const account = this._conv.account;

      if (aMsg.startsWith("/")) {
        const convToFocus = {};

        // The /say command is used to bypass command processing
        // (/say can be shortened to just /).
        // "/say" or "/say " should be ignored, as should "/" and "/ ".
        if (aMsg.match(/^\/(?:say)? ?$/)) {
          this.resetInput();
          return;
        }

        if (aMsg.match(/^\/(?:say)? .*/)) {
          aMsg = aMsg.slice(aMsg.indexOf(" ") + 1);
        } else if (
          IMServices.cmd.executeCommand(aMsg, this._conv.target, convToFocus)
        ) {
          this._conv.sendTyping("");
          this.resetInput();
          if (convToFocus.value) {
            chatHandler.focusConversation(convToFocus.value);
          }
          return;
        }

        if (account.protocol.slashCommandsNative && account.connected) {
          const cmd = aMsg.match(/^\/[^ ]+/);
          if (cmd && cmd != "/me") {
            this._conv.systemMessage(
              this.bundle.formatStringFromName("unknownCommand", [cmd], 1),
              true
            );
            return;
          }
        }
      }

      this._conv.sendMsg(aMsg, false, false);

      // reset the textbox to its original size
      this.resetInput();
    }

    _onSplitterChange() {
      // set the default height as the deck height (modified by the splitter)
      this.inputBox.defaultHeight =
        parseInt(this.inputBox.parentNode.getBoundingClientRect().height) -
        this._TEXTBOX_VERTICAL_OVERHEAD;
    }

    calculateTextboxDefaultHeight() {
      const totalSpace = parseInt(
        window.getComputedStyle(this).getPropertyValue("height")
      );
      const textboxStyle = window.getComputedStyle(this.inputBox);
      let lineHeight = textboxStyle.lineHeight;
      if (lineHeight == "normal") {
        lineHeight = parseFloat(textboxStyle.fontSize) * 1.2;
      } else {
        lineHeight = parseFloat(lineHeight);
      }

      // Compute the overhead size.
      const textboxHeight = this.inputBox.clientHeight;
      const deckHeight =
        this.inputBox.parentNode.getBoundingClientRect().height;
      this._TEXTBOX_VERTICAL_OVERHEAD = deckHeight - textboxHeight;

      // Calculate the number of lines to display.
      let numberOfLines = Math.round(
        (totalSpace * this._TEXTBOX_RATIO) / lineHeight
      );
      if (numberOfLines <= 0) {
        numberOfLines = 1;
      }
      if (!this._maxEmptyLines) {
        this._maxEmptyLines = Services.prefs.getIntPref(
          "messenger.conversations.textbox.defaultMaxLines"
        );
      }

      if (numberOfLines > this._maxEmptyLines) {
        numberOfLines = this._maxEmptyLines;
      }
      this.inputBox.defaultHeight = numberOfLines * lineHeight;

      // set minimum height (in case the user moves the splitter)
      this.inputBox.parentNode.style.minHeight =
        lineHeight + this._TEXTBOX_VERTICAL_OVERHEAD + "px";
    }

    initTextboxFormat() {
      // Init the textbox size
      this.calculateTextboxDefaultHeight();
      this.inputBox.parentNode.style.height =
        this.inputBox.defaultHeight + this._TEXTBOX_VERTICAL_OVERHEAD + "px";
      this.inputBox.style.overflowY = "hidden";

      this.spellchecker = new InlineSpellChecker(this.inputBox);
      if (Services.prefs.getBoolPref("mail.spellcheck.inline")) {
        this.inputBox.setAttribute("spellcheck", "true");
        this.spellchecker.enabled = true;
      } else {
        this.inputBox.removeAttribute("spellcheck");
        this.spellchecker.enabled = false;
      }
    }

    // eslint-disable-next-line complexity
    inputKeyPress(event) {
      const text = this.inputBox.value;

      const navKeyCodes = [
        KeyEvent.DOM_VK_PAGE_UP,
        KeyEvent.DOM_VK_PAGE_DOWN,
        KeyEvent.DOM_VK_HOME,
        KeyEvent.DOM_VK_END,
        KeyEvent.DOM_VK_UP,
        KeyEvent.DOM_VK_DOWN,
      ];

      // Pass navigation keys to the browser if
      // 1) the textbox is empty or 2) it's an IB-specific key combination
      if (
        (!text && navKeyCodes.includes(event.keyCode)) ||
        ((event.shiftKey || event.altKey) &&
          (event.keyCode == KeyEvent.DOM_VK_PAGE_UP ||
            event.keyCode == KeyEvent.DOM_VK_PAGE_DOWN))
      ) {
        const newEvent = new KeyboardEvent("keypress", event);
        event.preventDefault();
        event.stopPropagation();
        // Keyboard events must be sent to the focused element for bubbling to work.
        this.convBrowser.focus();
        this.convBrowser.dispatchEvent(newEvent);
        this.inputBox.focus();
        return;
      }

      // When attempting to copy an empty selection, copy the
      // browser selection instead (see bug 693).
      // The 'C' won't be lowercase if caps lock is enabled.
      if (
        (event.charCode == 99 /* 'c' */ ||
          (event.charCode == 67 /* 'C' */ && !event.shiftKey)) &&
        (navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey) &&
        this.inputBox.selectionStart == this.inputBox.selectionEnd
      ) {
        this.convBrowser.doCommand();
        return;
      }

      // We don't want to enable tab completion if the user has selected
      // some text, as it's not clear what the user would expect
      // to happen in that case.
      const noSelection = !(
        this.inputBox.selectionEnd - this.inputBox.selectionStart
      );

      // Undo tab complete.
      if (
        noSelection &&
        this._completions &&
        event.keyCode == KeyEvent.DOM_VK_BACK_SPACE &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        if (text == this._beforeTabComplete) {
          // Nothing to undo, so let backspace act normally.
          delete this._completions;
        } else {
          event.preventDefault();

          // First undo the comma separating multiple nicks or the suffix.
          // More than one nick:
          //   "nick1, nick2: " -> "nick1: nick2"
          // Single nick: remove the suffix
          //   "nick1: " -> "nick1"
          const pos = this.inputBox.selectionStart;
          const suffix = ": ";
          if (
            pos > suffix.length &&
            text.substring(pos - suffix.length, pos) == suffix
          ) {
            const completions = Array.from(this.buddies.keys());
            // Check if the preceding words are a sequence of nick completions.
            const preceding = text
              .substring(0, pos - suffix.length)
              .split(", ");
            if (preceding.every(n => completions.includes(n))) {
              let s = preceding.pop();
              if (preceding.length) {
                s = suffix + s;
              }
              this.inputBox.selectionStart -= s.length + suffix.length;
              this.addString(s);
              if (this._completions[0].slice(-suffix.length) == suffix) {
                this._completions = this._completions.map(c =>
                  c.slice(0, -suffix.length)
                );
              }
              if (
                this._completions.length == 1 &&
                this.inputBox.value == this._beforeTabComplete
              ) {
                // Nothing left to undo or to cycle through.
                delete this._completions;
              }
              return;
            }
          }

          // Full undo.
          this.inputBox.selectionStart = 0;
          this.addString(this._beforeTabComplete);
          delete this._completions;
          return;
        }
      }

      // Tab complete.
      // Keep the default behavior of the tab key if the input box
      // is empty or a modifier is used.
      if (
        event.keyCode == KeyEvent.DOM_VK_TAB &&
        text.length != 0 &&
        noSelection &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (!event.shiftKey || this._completions)
      ) {
        event.preventDefault();

        if (this._completions) {
          // Tab has been pressed more than once.
          if (this._completions.length == 1) {
            return;
          }
          if (this._shouldListCompletionsLater) {
            this._conv.systemMessage(this._shouldListCompletionsLater);
            delete this._shouldListCompletionsLater;
          }

          this.inputBox.selectionStart = this._completionsStart;
          if (event.shiftKey) {
            // Reverse cycle completions.
            this._completionsIndex -= 2;
            if (this._completionsIndex < 0) {
              this._completionsIndex += this._completions.length;
            }
          }
          this.addString(this._completions[this._completionsIndex++]);
          this._completionsIndex %= this._completions.length;
          return;
        }

        let completions = [];
        let firstWordSuffix = " ";
        let secondNick = false;

        // Second regex result will contain word without leading special characters.
        this._beforeTabComplete = text.substring(
          0,
          this.inputBox.selectionStart
        );
        const words = this._beforeTabComplete.match(/\S*?([\w-]+)?$/);
        let word = words[0];
        if (!word) {
          return;
        }
        let isFirstWord = this.inputBox.selectionStart == word.length;

        // Check if we are completing a command.
        const completingCommand = isFirstWord && word[0] == "/";
        if (completingCommand) {
          for (const cmd of IMServices.cmd.listCommandsForConversation(
            this._conv
          )) {
            // It's possible to have a global and a protocol specific command
            // with the same name. Avoid duplicates in the |completions| array.
            const name = "/" + cmd.name;
            if (!completions.includes(name)) {
              completions.push(name);
            }
          }
        } else {
          // If it's not a command, the only thing we can complete is a nick.
          if (!this._conv.isChat) {
            return;
          }

          firstWordSuffix = ": ";
          completions = Array.from(this.buddies.keys());

          const outgoingNick = this._conv.nick;
          completions = completions.filter(c => c != outgoingNick);

          // Check if the preceding words are a sequence of nick completions.
          const wordStart = this.inputBox.selectionStart - word.length;
          if (wordStart > 2) {
            const separator = text.substring(wordStart - 2, wordStart);
            if (separator == ": " || separator == ", ") {
              const preceding = text.substring(0, wordStart - 2).split(", ");
              if (preceding.every(n => completions.includes(n))) {
                secondNick = true;
                isFirstWord = true;
                // Remove preceding completions from possible completions.
                completions = completions.filter(c => !preceding.includes(c));
              }
            }
          }
        }

        // Keep only the completions that share |word| as a prefix.
        // Be case insensitive only if |word| is entirely lower case.
        let condition;
        if (word.toLocaleLowerCase() == word) {
          condition = c => c.toLocaleLowerCase().startsWith(word);
        } else {
          condition = c => c.startsWith(word);
        }
        let matchingCompletions = completions.filter(condition);
        if (!matchingCompletions.length && words[1]) {
          word = words[1];
          firstWordSuffix = " ";
          matchingCompletions = completions.filter(condition);
        }
        if (!matchingCompletions.length) {
          return;
        }

        // If the cursor is in the middle of a word, and the word is a nick,
        // there is no need to complete - just jump to the end of the nick.
        const wholeWord = text.substring(
          this.inputBox.selectionStart - word.length
        );
        for (const completion of matchingCompletions) {
          if (wholeWord.lastIndexOf(completion, 0) == 0) {
            const moveCursor = completion.length - word.length;
            this.inputBox.selectionStart += moveCursor;
            const separator = text.substring(
              this.inputBox.selectionStart,
              this.inputBox.selectionStart + 2
            );
            if (separator == ": " || separator == ", ") {
              this.inputBox.selectionStart += 2;
            } else if (!moveCursor) {
              // If we're already at the end of a nick, carry on to display
              // a list of possible alternatives and/or apply punctuation.
              break;
            }
            return;
          }
        }

        // We have possible completions!
        this._completions = matchingCompletions.sort();
        this._completionsIndex = 0;
        // Save now the first and last completions in alphabetical order,
        // as we will need them to find a common prefix. However they may
        // not be the first and last completions in the list of completions
        // actually exposed to the user, as if there are active nicks
        // they will be moved to the beginning of the list.
        const firstCompletion = this._completions[0];
        const lastCompletion = this._completions.slice(-1)[0];

        let preferredNick = false;
        if (this._conv.isChat && !completingCommand) {
          // If there are active nicks, prefer those.
          const activeCompletions = this._completions.filter(
            c =>
              this.buddies.has(c) &&
              !this.buddies.get(c).hasAttribute("inactive")
          );
          if (activeCompletions.length == 1) {
            preferredNick = true;
          }
          if (activeCompletions.length) {
            // Move active nicks to the front of the queue.
            activeCompletions.reverse();
            activeCompletions.forEach(function (c) {
              this._completions.splice(this._completions.indexOf(c), 1);
              this._completions.unshift(c);
            }, this);
          }

          // If one of the completions is the sender of the last ping,
          // take it, if it was less than an hour ago.
          if (
            this._lastPing &&
            this.buddies.has(this._lastPing) &&
            this._completions.includes(this._lastPing) &&
            Date.now() / 1000 - this._lastPingTime < 3600
          ) {
            preferredNick = true;
            this._completionsIndex = this._completions.indexOf(this._lastPing);
          }
        }

        // Display the possible completions in a system message.
        delete this._shouldListCompletionsLater;
        if (this._completions.length > 1) {
          const completionsList = this._completions.join(" ");
          if (preferredNick) {
            // If we have a preferred nick (which is completed as a whole
            // even if there are alternatives), only show the list of
            // completions on the next <tab> press.
            this._shouldListCompletionsLater = completionsList;
          } else {
            this._conv.systemMessage(completionsList);
          }
        }

        const suffix = isFirstWord ? firstWordSuffix : "";
        this._completions = this._completions.map(c => c + suffix);

        let completion;
        if (this._completions.length == 1 || preferredNick) {
          // Only one possible completion? Apply it! :-)
          completion = this._completions[this._completionsIndex++];
          this._completionsIndex %= this._completions.length;
        } else {
          // We have several possible completions, attempt to find a common prefix.
          const maxLength = Math.min(
            firstCompletion.length,
            lastCompletion.length
          );
          let i = 0;
          while (i < maxLength && firstCompletion[i] == lastCompletion[i]) {
            ++i;
          }

          if (i) {
            completion = firstCompletion.substring(0, i);
          } else {
            // Include this case so that secondNick is applied anyway,
            // in case a completion is added by another tab press.
            completion = word;
          }
        }

        // Always replace what the user typed as its upper/lowercase may
        // not be correct.
        this.inputBox.selectionStart -= word.length;
        this._completionsStart = this.inputBox.selectionStart;

        if (secondNick) {
          // Replace the trailing colon with a comma before the completed nick.
          this.inputBox.selectionStart -= 2;
          completion = ", " + completion;
        }

        this.addString(completion);
      } else if (this._completions) {
        delete this._completions;
      }

      if (event.keyCode != 13) {
        return;
      }

      if (!event.ctrlKey && !event.shiftKey && !event.altKey) {
        // Prevent the default action before calling sendMsg to avoid having
        // a line break inserted in the textbox if sendMsg throws.
        event.preventDefault();
        this.sendMsg(text);
      } else if (!event.shiftKey) {
        this.addString("\n");
      }
    }

    inputValueChanged() {
      // Delaying typing notifications will avoid sending several updates in
      // a row if the user is on a slow or overloaded machine that has
      // trouble to handle keystrokes in a timely fashion.
      // Make sure only one typing notification call can be pending.
      if (this._pendingValueChangedCall) {
        return;
      }

      this._pendingValueChangedCall = true;
      Services.tm.mainThread.dispatch(
        this.delayedInputValueChanged.bind(this),
        Ci.nsIEventTarget.DISPATCH_NORMAL
      );
    }

    delayedInputValueChanged() {
      this._pendingValueChangedCall = false;

      // By the time this function is executed, the conversation may have
      // been closed.
      if (!this._conv) {
        return;
      }

      const text = this.inputBox.value;

      // Try to avoid sending typing notifications when the user is
      // typing a command in the conversation.
      // These checks are not perfect (especially if non-existing
      // commands are sent as regular messages on the in-use prpl).
      let left = Ci.prplIConversation.NO_TYPING_LIMIT;
      if (!text.startsWith("/")) {
        left = this._conv.sendTyping(text);
      } else if (/^\/me /.test(text)) {
        left = this._conv.sendTyping(text.slice(4));
      }

      // When the input box is cleared or there is no character limit,
      // don't show the character limit.
      if (left == Ci.prplIConversation.NO_TYPING_LIMIT || !text.length) {
        this.charCounter.setAttribute("value", "");
        this.inputBox.removeAttribute("invalidInput");
      } else {
        // 200 is a 'magic' constant to avoid showing big numbers.
        this.charCounter.setAttribute("value", left < 200 ? left : "");

        if (left >= 0) {
          this.inputBox.removeAttribute("invalidInput");
        } else if (left < 0) {
          this.inputBox.setAttribute("invalidInput", "true");
        }
      }
    }

    resetInput() {
      this.inputBox.value = "";
      this.charCounter.setAttribute("value", "");
      this.inputBox.removeAttribute("invalidInput");

      this._statusText = "";
      this.displayStatusText();

      if (TextboxSize.autoResize) {
        const currHeight = Math.round(
          this.inputBox.parentNode.getBoundingClientRect().height
        );
        if (
          this.inputBox.defaultHeight + this._TEXTBOX_VERTICAL_OVERHEAD >
          currHeight
        ) {
          this.inputBox.defaultHeight =
            currHeight - this._TEXTBOX_VERTICAL_OVERHEAD;
        }
        this.convBottom.style.height =
          this.inputBox.defaultHeight + this._TEXTBOX_VERTICAL_OVERHEAD + "px";
        this.inputBox.style.overflowY = "hidden";
      }
    }

    inputExpand() {
      // This feature has been disabled, or the user is currently dragging
      // the splitter and the textbox has received an overflow event
      if (
        !TextboxSize.autoResize ||
        this.splitter.getAttribute("state") == "dragging"
      ) {
        this.inputBox.style.overflowY = "";
        return;
      }

      // Check whether we can increase the height without hiding the status bar
      // (ensure the min-height property on the top part of this dialog)
      const topBoxStyle = window.getComputedStyle(this.convTop);
      const topMinSize = parseInt(topBoxStyle.getPropertyValue("min-height"));
      const topSize = parseInt(topBoxStyle.getPropertyValue("height"));
      const deck = this.inputBox.parentNode;
      const oldDeckHeight = Math.round(deck.getBoundingClientRect().height);
      const newDeckHeight =
        parseInt(this.inputBox.scrollHeight) + this._TEXTBOX_VERTICAL_OVERHEAD;

      if (!topMinSize || topSize - topMinSize > newDeckHeight - oldDeckHeight) {
        // Hide a possible vertical scrollbar.
        this.inputBox.style.overflowY = "hidden";
        deck.style.height = newDeckHeight + "px";
      } else {
        this.inputBox.style.overflowY = "";
        // Set it to the maximum possible value.
        deck.style.height = oldDeckHeight + (topSize - topMinSize) + "px";
      }
    }

    onConvResize() {
      if (!this.splitter.hasAttribute("state")) {
        this.calculateTextboxDefaultHeight();
        this.inputBox.parentNode.style.height =
          this.inputBox.defaultHeight + this._TEXTBOX_VERTICAL_OVERHEAD + "px";
      } else {
        // Used in case the browser is already on its min-height, resize the
        // textbox to avoid hiding the status bar.
        const convTopStyle = window.getComputedStyle(this.convTop);
        let convTopHeight = parseInt(convTopStyle.getPropertyValue("height"));
        const convTopMinHeight = parseInt(
          convTopStyle.getPropertyValue("min-height")
        );

        if (convTopHeight == convTopMinHeight) {
          this.inputBox.parentNode.style.height =
            this.inputBox.parentNode.style.minHeight;
          convTopHeight = parseInt(convTopStyle.getPropertyValue("height"));
          this.inputBox.parentNode.style.height =
            parseInt(this.inputBox.parentNode.style.minHeight) +
            (convTopHeight - convTopMinHeight) +
            "px";
        }
      }
      if (TextboxSize.autoResize) {
        this.inputExpand();
      }
    }

    _onTextboxUnderflow() {
      if (TextboxSize.autoResize) {
        this.style.overflowY = "hidden";
      }
    }

    browserKeyPress(event) {
      const accelKeyPressed =
        AppConstants.platform == "macosx" ? event.metaKey : event.ctrlKey;

      // 118 is the decimal code for "v" character, 13 keyCode for "return" key
      if (
        ((accelKeyPressed && event.charCode != 118) || event.altKey) &&
        event.keyCode != 13
      ) {
        return;
      }

      if (
        event.charCode == 0 && // it's not a character, it's a command key
        event.keyCode != 13 && // Return
        event.keyCode != 8 && // Backspace
        event.keyCode != 46
      ) {
        // Delete
        return;
      }

      if (
        accelKeyPressed ||
        !Services.prefs.getBoolPref("accessibility.typeaheadfind")
      ) {
        this.inputBox.focus();

        // A common use case is to click somewhere in the conversation and
        // start typing a command (often /me). If quick find is enabled, it
        // will pick up the "/" keypress and open the findbar.
        if (event.charCode == "/".charCodeAt(0)) {
          event.preventDefault();
        }
      }

      // Returns for Ctrl+V
      if (accelKeyPressed) {
        return;
      }

      // resend the event
      const clonedEvent = new KeyboardEvent("keypress", event);
      this.inputBox.dispatchEvent(clonedEvent);
    }

    browserDblClick(event) {
      if (
        !Services.prefs.getBoolPref(
          "messenger.conversations.doubleClickToReply"
        )
      ) {
        return;
      }

      for (let node = event.target; node; node = node.parentNode) {
        if (node._originalMsg) {
          const msg = node._originalMsg;
          if (
            msg.system ||
            msg.outgoing ||
            !msg.incoming ||
            msg.error ||
            !this._conv.isChat
          ) {
            return;
          }
          this.addPrompt(msg.who + ": ");
          return;
        }
      }
    }

    /**
     * Replace the current selection in the inputBox by the given string
     *
     * @param {string} aString
     */
    addString(aString) {
      const cursorPosition = this.inputBox.selectionStart + aString.length;

      this.inputBox.value =
        this.inputBox.value.substr(0, this.inputBox.selectionStart) +
        aString +
        this.inputBox.value.substr(this.inputBox.selectionEnd);
      this.inputBox.selectionStart = this.inputBox.selectionEnd =
        cursorPosition;
      this.inputValueChanged();
    }

    addPrompt(aPrompt) {
      const currentEditorValue = this.inputBox.value;
      if (!currentEditorValue.startsWith(aPrompt)) {
        this.inputBox.value = aPrompt + currentEditorValue;
      }

      this.inputBox.focus();
      this.inputValueChanged();
    }

    /**
     * Update the participant count of a chat conversation
     */
    updateParticipantCount() {
      document.getElementById("participantCount").value = this.buddies.size;
    }

    /**
     * Set the attributes (flags) of a chat buddy
     *
     * @param {object} aItem
     */
    setBuddyAttributes(aItem) {
      const buddy = aItem.chatBuddy;
      let src;
      let l10nId;
      if (buddy.founder) {
        src = "chrome://messenger/skin/icons/founder.png";
        l10nId = "chat-participant-owner-role-icon2";
      } else if (buddy.admin) {
        src = "chrome://messenger/skin/icons/operator.png";
        l10nId = "chat-participant-administrator-role-icon2";
      } else if (buddy.moderator) {
        src = "chrome://messenger/skin/icons/half-operator.png";
        l10nId = "chat-participant-moderator-role-icon2";
      } else if (buddy.voiced) {
        src = "chrome://messenger/skin/icons/voice.png";
        l10nId = "chat-participant-voiced-role-icon2";
      }
      const imageEl = aItem.querySelector(".conv-nicklist-image");
      if (src) {
        imageEl.setAttribute("src", src);
        document.l10n.setAttributes(imageEl, l10nId);
      } else {
        imageEl.removeAttribute("src");
        imageEl.removeAttribute("data-l10n-id");
        imageEl.removeAttribute("alt");
      }
    }

    /**
     * Compute color for a nick
     *
     * @param {string} aName
     */
    _computeColor(aName) {
      // Compute the color based on the nick
      let nick = aName.match(/[a-zA-Z0-9]+/);
      nick = nick ? nick[0].toLowerCase() : (nick = aName);
      // We compute a hue value (between 0 and 359) based on the
      // characters of the nick.
      // The first character weights kInitialWeight, each following
      // character weights kWeightReductionPerChar * the weight of the
      // previous character.
      const kInitialWeight = 10; // 10 = 360 hue values / 36 possible characters.
      const kWeightReductionPerChar = 0.52; // arbitrary value
      let weight = kInitialWeight;
      let res = 0;
      for (let i = 0; i < nick.length; ++i) {
        let char = nick.charCodeAt(i) - 47;
        if (char > 10) {
          char -= 39;
        }
        // now char contains a value between 1 and 36
        res += char * weight;
        weight *= kWeightReductionPerChar;
      }
      return Math.round(res) % 360;
    }

    _isBuddyActive(aBuddyName) {
      return Object.prototype.hasOwnProperty.call(
        this._activeBuddies,
        aBuddyName
      );
    }

    /**
     * Create a buddy item to add in the visible list of participants
     *
     * @param {object} aBuddy
     */
    createBuddy(aBuddy) {
      const name = aBuddy.name;
      if (!name) {
        throw new Error("The empty string isn't a valid nick.");
      }
      if (this.buddies.has(name)) {
        throw new Error("Adding chat buddy " + name + " twice?!");
      }

      this.trackNick(name);

      const image = document.createElement("img");
      image.classList.add("conv-nicklist-image");
      const label = document.createXULElement("label");
      label.classList.add("conv-nicklist-label");
      label.setAttribute("value", name);
      label.setAttribute("flex", "1");
      label.setAttribute("crop", "end");

      // Fix insertBuddy below if you change the DOM makeup!
      const item = document.createXULElement("richlistitem");
      item.chatBuddy = aBuddy;
      item.appendChild(image);
      item.appendChild(label);
      this.setBuddyAttributes(item);

      const color = this._computeColor(name);
      const style = "color: hsl(" + color + ", 100%, 40%);";
      item.colorStyle = style;
      item.setAttribute("style", style);
      item.setAttribute("align", "center");
      if (!this._isBuddyActive(name)) {
        item.setAttribute("inactive", "true");
      }
      item.color = color;
      this.buddies.set(name, item);

      return item;
    }

    /**
     * Insert item at the right position
     *
     * @param {Node} aListItem
     */
    insertBuddy(aListItem) {
      const nicklist = document.getElementById("nicklist");
      const nick = aListItem.querySelector("label").value.toLowerCase();

      // Look for the place of the nick in the list
      let start = 0;
      let end = nicklist.itemCount;
      while (start < end) {
        const middle = start + Math.floor((end - start) / 2);
        if (
          nick <
          nicklist
            .getItemAtIndex(middle)
            .firstElementChild.nextElementSibling.getAttribute("value")
            .toLowerCase()
        ) {
          end = middle;
        } else {
          start = middle + 1;
        }
      }

      // Now insert the element
      if (end == nicklist.itemCount) {
        nicklist.appendChild(aListItem);
      } else {
        nicklist.insertBefore(aListItem, nicklist.getItemAtIndex(end));
      }
    }

    /**
     * Update a buddy in the visible list of participants
     *
     * @param {object} aBuddy
     * @param {string} aOldName
     */
    updateBuddy(aBuddy, aOldName) {
      const name = aBuddy.name;
      if (!name) {
        throw new Error("The empty string isn't a valid nick.");
      }

      if (!aOldName) {
        if (!this._isConversationSelected) {
          return;
        }
        // If aOldName is null, we are changing the flags of the buddy
        const item = this.buddies.get(name);
        item.chatBuddy = aBuddy;
        this.setBuddyAttributes(item);
        return;
      }

      if (this._isBuddyActive(aOldName)) {
        delete this._activeBuddies[aOldName];
        this._activeBuddies[aBuddy.name] = true;
      }

      this.trackNick(name);

      if (!this._isConversationSelected) {
        return;
      }

      // Is aOldName is not null, then we are renaming the buddy
      if (!this.buddies.has(aOldName)) {
        throw new Error(
          "Updating a chat buddy that does not exist: " + aOldName
        );
      }

      if (this.buddies.has(name)) {
        throw new Error(
          "Updating a chat buddy to an already existing one: " + name
        );
      }

      const item = this.buddies.get(aOldName);
      item.chatBuddy = aBuddy;
      this.buddies.delete(aOldName);
      this.buddies.set(name, item);
      item.querySelector("label").value = name;

      // Move this item to the right position if its name changed
      item.remove();
      this.insertBuddy(item);
    }

    removeBuddy(aName) {
      if (!this.buddies.has(aName)) {
        throw new Error("Cannot remove a buddy that was not in the room");
      }
      this.buddies.get(aName).remove();
      this.buddies.delete(aName);
      if (this._isBuddyActive(aName)) {
        delete this._activeBuddies[aName];
      }
    }

    trackNick(aNick) {
      if ("_showNickList" in this) {
        this._showNickList[aNick.replace(this._nickEscape, "\\$&")] = true;
        delete this._showNickRegExp;
      }
    }

    getShowNickModifier() {
      return function (aNode) {
        if (!("_showNickRegExp" in this)) {
          if (!("_showNickList" in this)) {
            this._showNickList = {};
            for (const n of this.buddies.keys()) {
              this._showNickList[n.replace(this._nickEscape, "\\$&")] = true;
            }
          }

          // The reverse sort ensures that if we have "foo" and "foobar",
          // "foobar" will be matched first by the regexp.
          const nicks = Object.keys(this._showNickList)
            .sort()
            .reverse()
            .join("|");
          if (nicks) {
            // We use \W to match for word-boundaries, as \b will not match the
            // nick if it starts/ends with \W characters.
            // XXX Ideally we would use unicode word boundaries:
            // http://www.unicode.org/reports/tr29/#Word_Boundaries
            this._showNickRegExp = new RegExp("\\W(?:" + nicks + ")\\W");
          } else {
            // nobody, disable...
            this._showNickRegExp = { exec: () => null };
            return 0;
          }
        }
        const exp = this._showNickRegExp;
        let result = 0;
        let match;
        // Add leading/trailing spaces to match at beginning and end of
        // the string as well. (If we used regex ^ and $, match.index would
        // not be reliable.)
        while ((match = exp.exec(" " + aNode.data + " "))) {
          // \W is not zero-length, but this is cancelled by the
          // extra leading space here.
          const nickNode = aNode.splitText(match.index);
          // subtract the 2 \W's to get the length of the nick.
          aNode = nickNode.splitText(match[0].length - 2);
          // at this point, nickNode is a text node with only the text
          // of the nick and aNode is a text node with the text after
          // the nick. The text in aNode hasn't been processed yet.
          const nick = nickNode.data;
          const elt = aNode.ownerDocument.createElement("span");
          elt.setAttribute("class", "ib-nick");
          if (this.buddies.has(nick)) {
            const buddy = this.buddies.get(nick);
            elt.setAttribute("style", buddy.colorStyle);
            elt.setAttribute("data-nickColor", buddy.color);
          } else {
            elt.setAttribute("data-left", "true");
          }
          nickNode.parentNode.replaceChild(elt, nickNode);
          elt.textContent = nick;
          result += 2;
        }
        return result;
      }.bind(this);
    }

    /**
     * Display the topic and topic editable flag for the current MUC in the
     * conversation header.
     */
    updateTopic() {
      const cti = document.getElementById("conv-top-info");
      const editable = !!this._conv.topicSettable;

      const topicText = this._conv.topic;
      const noTopic = !topicText;
      cti.setAsChat(topicText || this._conv.noTopicString, noTopic, editable);
    }

    focus() {
      this.inputBox.focus();

      if (!this.loaded) {
        return;
      }

      if (this.tab) {
        this.tab.removeAttribute("unread");
        this.tab.removeAttribute("attention");
      }
      this._conv.markAsRead();
    }

    switchingToPanel() {
      if (this._visibleTimer) {
        return;
      }

      // Start a timer to detect if the tab has been visible to the
      // user for long enough to actually be seen (as opposed to the
      // tab only being visible "accidentally in passing").
      delete this._wasVisible;
      this._visibleTimer = setTimeout(() => {
        this._wasVisible = true;
        delete this._visibleTimer;

        // Porting note: For TB, we also need to update the conv title
        // and reset the unread flag. In IB, this is done by tabbrowser.
        this.tab.update();
      }, 1000);
      this.convBrowser.isActive = true;
    }

    switchingAwayFromPanel(aHidden) {
      if (this._visibleTimer) {
        clearTimeout(this._visibleTimer);
        delete this._visibleTimer;
      }
      // Remove the unread ruler if the tab has been visible without
      // interruptions for sufficiently long.
      if (this._wasVisible) {
        this.convBrowser.removeUnreadRuler();
      }

      if (aHidden) {
        this.convBrowser.isActive = false;
      }
    }

    updateConvStatus() {
      const cti = document.getElementById("conv-top-info");
      cti.setProtocol(this._conv.account.protocol);

      // Set the icon, potentially showing a fallback icon if this is an IM.
      cti.setUserIcon(this._conv.convIconFilename, !this._conv.isChat);

      if (this._conv.isChat) {
        this.updateTopic();
        cti.setAttribute("displayName", this._conv.title);
      } else {
        let displayName = this._conv.title;
        let statusText = "";
        let statusType = Ci.imIStatusInfo.STATUS_UNKNOWN;

        const buddy = this._conv.buddy;
        if (buddy?.account.connected) {
          displayName = buddy.displayName;
          statusText = buddy.statusText;
          statusType = buddy.statusType;
        }
        cti.setAttribute("displayName", displayName);

        let statusName;

        const typingState = this._conv.typingState;
        const typingName = this._currentTypingName || this._conv.title;

        switch (typingState) {
          case Ci.prplIConvIM.TYPING:
            statusName = "active-typing";
            statusText = this.bundle.formatStringFromName(
              "chat.contactIsTyping",
              [typingName],
              1
            );
            break;
          case Ci.prplIConvIM.TYPED:
            statusName = "paused-typing";
            statusText = this.bundle.formatStringFromName(
              "chat.contactHasStoppedTyping",
              [typingName],
              1
            );
            break;
          default:
            statusName = Status.toAttribute(statusType);
            statusText = Status.toLabel(statusType, statusText);
            break;
        }
        cti.setStatus(statusName, statusText);
      }
    }

    showParticipants() {
      if (this._conv.isChat) {
        const nicklist = document.getElementById("nicklist");
        while (nicklist.hasChildNodes()) {
          nicklist.lastChild.remove();
        }
        // Populate the nicklist
        this.buddies = new Map();
        for (const n of this.conv.getParticipants()) {
          this.createBuddy(n);
        }
        nicklist.append(
          ...Array.from(this.buddies.keys())
            .sort((a, b) => a.localeCompare(b))
            .map(nick => this.buddies.get(nick))
        );
        this.updateParticipantCount();
      }
    }

    /**
     * Set up the shared conversation specific components (conversation browser
     * references, status header, participants list, text input) for this
     * conversation.
     */
    initConversationUI() {
      this._activeBuddies = {};
      if (this._conv.isChat) {
        const cti = document.getElementById("conv-top-info");
        cti.setAttribute("displayName", this._conv.title);

        this.showParticipants();

        if (Services.prefs.getBoolPref("messenger.conversations.showNicks")) {
          this.convBrowser.addTextModifier(this.getShowNickModifier());
        }
      }

      if (this.tab) {
        this.tab.setAttribute("label", this._conv.title);
      }

      this.findbar.browser = this.convBrowser;

      this.updateConvStatus();
      this.initTextboxFormat();
    }

    /**
     * Change the UI Conversation attached to this component and its browser.
     * Does not clear any existing messages in the conversation browser.
     *
     * @param {IMConversation} conv
     */
    changeConversation(conv) {
      this._conv.removeObserver(this.observer);
      this._conv = conv;
      this._conv.addObserver(this.observer);
      this.convBrowser._conv = conv;
      this.initConversationUI();
    }

    get editor() {
      return this.inputBox;
    }

    get _isConversationSelected() {
      // TB-only: returns true if the chat conversation element is the currently
      // selected one, i.e if it has to maintain the participant list.
      // The JS property this.tab.selected is always false when the chat tab
      // is inactive, so we need to double-check to be sure.
      return this.tab.selected || this.tab.hasAttribute("selected");
    }

    get convId() {
      return this._conv.id;
    }

    get conv() {
      return this._conv;
    }

    set conv(val) {
      if (this._conv && val) {
        throw new Error("chat-conversation already initialized");
      }
      if (!val) {
        // this conversation has probably been moved to another
        // tab. Forget the prplConversation so that it isn't
        // closed when destroying this binding.
        this._forgetConv();
        return;
      }
      this._conv = val;
      this._conv.addObserver(this.observer);
      this.convBrowser.init(this._conv);
      this.initConversationUI();
    }

    get contentWindow() {
      return this.convBrowser.contentWindow;
    }

    get bundle() {
      if (!this._bundle) {
        this._bundle = Services.strings.createBundle(
          "chrome://messenger/locale/chat.properties"
        );
      }
      return this._bundle;
    }
  }

  customElements.define("chat-conversation", MozChatConversation);
}
