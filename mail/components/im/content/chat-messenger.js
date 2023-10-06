/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements MozXULElement */
/* import-globals-from ../../../base/content/globalOverlay.js */

// This file is loaded in messenger.xhtml.
/* globals MailToolboxCustomizeDone, openIMAccountMgr,
   PROTO_TREE_VIEW, statusSelector, ZoomManager, gSpacesToolbar */

var { Notifications } = ChromeUtils.importESModule(
  "resource:///modules/chatNotifications.sys.mjs"
);
var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { Status } = ChromeUtils.importESModule(
  "resource:///modules/imStatusUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  ChatEncryption: "resource:///modules/ChatEncryption.sys.mjs",
  OTRUI: "resource:///modules/OTRUI.sys.mjs",
});

var gChatSpellChecker;
var gRangeParent;
var gRangeOffset;

var gBuddyListContextMenu = null;
var gChatBundle = Services.strings.createBundle(
  "chrome://messenger/locale/chat.properties"
);

function openChatContextMenu(popup) {
  let conv = chatHandler._getActiveConvView();
  let spellchecker = conv.spellchecker;
  let textbox = conv.editor;

  // The context menu uses gChatSpellChecker, so set it here for the duration of the menu.
  gChatSpellChecker = spellchecker;

  spellchecker.init(textbox.editor);
  spellchecker.initFromEvent(gRangeParent, gRangeOffset);
  let onMisspelling = spellchecker.overMisspelling;
  document.getElementById("spellCheckSuggestionsSeparator").hidden =
    !onMisspelling;
  document.getElementById("spellCheckAddToDictionary").hidden = !onMisspelling;
  let separator = document.getElementById("spellCheckAddSep");
  separator.hidden = !onMisspelling;
  document.getElementById("spellCheckNoSuggestions").hidden =
    !onMisspelling || spellchecker.addSuggestionsToMenu(popup, separator, 5);

  let dictMenu = document.getElementById("spellCheckDictionariesMenu");
  let dictSep = document.getElementById("spellCheckLanguageSeparator");
  spellchecker.addDictionaryListToMenu(dictMenu, dictSep);

  document
    .getElementById("spellCheckEnable")
    .setAttribute("checked", spellchecker.enabled);
  document
    .getElementById("spellCheckDictionaries")
    .setAttribute("hidden", !spellchecker.enabled);

  goUpdateCommand("cmd_undo");
  goUpdateCommand("cmd_copy");
  goUpdateCommand("cmd_cut");
  goUpdateCommand("cmd_paste");
  goUpdateCommand("cmd_selectAll");
}

function clearChatContextMenu(popup) {
  let conv = chatHandler._getActiveConvView();
  let spellchecker = conv.spellchecker;
  spellchecker.clearDictionaryListFromMenu();
  spellchecker.clearSuggestionsFromMenu();
}

function getSelectedPanel() {
  for (let element of document.getElementById("conversationsBox").children) {
    if (!element.hidden) {
      return element;
    }
  }
  return null;
}

/**
 * Hide all the child elements in the conversations box. After hiding all the
 * child elements, one element will be from chat conversation, chat log or
 * no conversation screen.
 */
function hideConversationsBoxPanels() {
  for (let element of document.getElementById("conversationsBox").children) {
    element.hidden = true;
  }
}

// This function modifies gChatSpellChecker and updates the UI accordingly. It's
// called when the user clicks on context menu to toggle the spellcheck feature.
function enableInlineSpellCheck(aEnableInlineSpellCheck) {
  gChatSpellChecker.enabled = aEnableInlineSpellCheck;
  document
    .getElementById("spellCheckEnable")
    .setAttribute("checked", aEnableInlineSpellCheck);
  document
    .getElementById("spellCheckDictionaries")
    .setAttribute("hidden", !aEnableInlineSpellCheck);
}

function buddyListContextMenu(aXulMenu) {
  // Clear the context menu from OTR related entries.
  OTRUI.removeBuddyContextMenu(document);

  this.target = aXulMenu.triggerNode.closest("richlistitem");
  if (!this.target) {
    this.shouldDisplay = false;
    return;
  }

  this.menu = aXulMenu;
  let localName = this.target.localName;
  this.onContact =
    localName == "richlistitem" &&
    this.target.getAttribute("is") == "chat-contact-richlistitem";
  this.onConv =
    localName == "richlistitem" &&
    this.target.getAttribute("is") == "chat-imconv-richlistitem";
  this.shouldDisplay = this.onContact || this.onConv;

  let hide = !this.onContact;
  [
    "context-openconversation",
    "context-edit-buddy-separator",
    "context-alias",
    "context-delete",
  ].forEach(function (aId) {
    document.getElementById(aId).hidden = hide;
  });

  document.getElementById("context-close-conversation").hidden = !this.onConv;
  document.getElementById("context-openconversation").disabled =
    !hide && !this.target.canOpenConversation();

  // Show OTR related context menu items if:
  // - The OTR feature is currently enabled.
  // - The target's status is not currently offline or unknown.
  // - The target can send messages.
  if (
    ChatEncryption.otrEnabled &&
    this.target.contact &&
    this.target.contact.statusType != Ci.imIStatusInfo.STATUS_UNKNOWN &&
    this.target.contact.statusType != Ci.imIStatusInfo.STATUS_OFFLINE &&
    this.target.contact.canSendMessage
  ) {
    OTRUI.addBuddyContextMenu(this.menu, document, this.target.contact);
  }

  const accountBuddy = this._getAccountBuddy();
  const canVerifyBuddy = accountBuddy?.canVerifyIdentity;
  const verifyMenuItem = document.getElementById("context-verifyBuddy");
  verifyMenuItem.hidden = !canVerifyBuddy;
  if (canVerifyBuddy) {
    const identityVerified = accountBuddy.identityVerified;
    verifyMenuItem.disabled = identityVerified;
    document.l10n.setAttributes(
      verifyMenuItem,
      identityVerified ? "chat-identity-verified" : "chat-verify-identity"
    );
  }
}

buddyListContextMenu.prototype = {
  /**
   * Get the prplIAccountBuddy instance that is related to the current context.
   *
   * @returns {prplIAccountBuddy?}
   */
  _getAccountBuddy() {
    if (this.onConv && this.target.conv?.buddy) {
      return this.target.conv.buddy;
    }
    return this.target.contact?.preferredBuddy?.preferredAccountBuddy;
  },
  openConversation() {
    if (this.onContact || this.onConv) {
      this.target.openConversation();
    }
  },
  closeConversation() {
    if (this.onConv) {
      this.target.closeConversation();
    }
  },
  alias() {
    if (this.onContact) {
      this.target.startAliasing();
    }
  },
  delete() {
    if (!this.onContact) {
      return;
    }

    let buddy = this.target.contact.preferredBuddy;
    let displayName = this.target.displayName;
    let promptTitle = gChatBundle.formatStringFromName(
      "buddy.deletePrompt.title",
      [displayName]
    );
    let userName = buddy.userName;
    if (displayName != userName) {
      displayName = gChatBundle.formatStringFromName(
        "buddy.deletePrompt.displayName",
        [displayName, userName]
      );
    }
    let proto = buddy.protocol.name; // FIXME build a list
    let promptMessage = gChatBundle.formatStringFromName(
      "buddy.deletePrompt.message",
      [displayName, proto]
    );
    let deleteButton = gChatBundle.GetStringFromName(
      "buddy.deletePrompt.button"
    );
    let prompts = Services.prompt;
    let flags =
      prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0 +
      prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
      prompts.BUTTON_POS_1_DEFAULT;
    if (
      prompts.confirmEx(
        window,
        promptTitle,
        promptMessage,
        flags,
        deleteButton,
        null,
        null,
        null,
        {}
      )
    ) {
      return;
    }

    this.target.deleteContact();
  },
  /**
   * Command event handler to verify the identity of the buddy the context menu
   * is currently opened for.
   */
  verifyIdentity() {
    const accountBuddy = this._getAccountBuddy();
    if (!accountBuddy) {
      return;
    }
    ChatEncryption.verifyIdentity(window, accountBuddy);
  },
};

var gChatTab = null;

var chatTabType = {
  name: "chat",
  panelId: "chatTabPanel",
  hasBeenOpened: false,
  modes: {
    chat: {
      type: "chat",
    },
  },

  tabMonitor: {
    monitorName: "chattab",

    // Unused, but needed functions
    onTabTitleChanged() {},
    onTabOpened(aTab) {},
    onTabPersist() {},
    onTabRestored() {},

    onTabClosing() {
      chatHandler._onTabDeactivated(true);
    },
    onTabSwitched(aNewTab, aOldTab) {
      // aNewTab == chat is handled earlier by showTab() below.
      if (aOldTab?.mode.name == "chat") {
        chatHandler._onTabDeactivated(true);
      }
    },
  },

  _handleArgs(aArgs) {
    if (
      !aArgs ||
      !("convType" in aArgs) ||
      (aArgs.convType != "log" && aArgs.convType != "focus")
    ) {
      return;
    }

    if (aArgs.convType == "focus") {
      chatHandler.focusConversation(aArgs.conv);
      return;
    }

    let item = document.getElementById("searchResultConv");
    item.log = aArgs.conv;
    if (aArgs.searchTerm) {
      item.searchTerm = aArgs.searchTerm;
    } else {
      delete item.searchTerm;
    }
    item.hidden = false;
    if (item.getAttribute("selected")) {
      chatHandler.onListItemSelected();
    } else {
      document.getElementById("contactlistbox").selectedItem = item;
    }
  },
  _onWindowActivated() {
    let tabmail = document.getElementById("tabmail");
    if (tabmail.currentTabInfo.mode.name == "chat") {
      chatHandler._onTabActivated();
    }
  },
  _onWindowDeactivated() {
    let tabmail = document.getElementById("tabmail");
    if (tabmail.currentTabInfo.mode.name == "chat") {
      chatHandler._onTabDeactivated(false);
    }
  },
  openTab(aTab, aArgs) {
    aTab.tabNode.setIcon("chrome://messenger/skin/icons/new/compact/chat.svg");
    if (!this.hasBeenOpened) {
      if (chatHandler.ChatCore && chatHandler.ChatCore.initialized) {
        let convs = IMServices.conversations.getUIConversations();
        if (convs.length != 0) {
          convs.sort((a, b) =>
            a.title.toLowerCase().localeCompare(b.title.toLowerCase())
          );
          for (let conv of convs) {
            chatHandler._addConversation(conv);
          }
        }
      }
      this.hasBeenOpened = true;
    }

    // The tab monitor will inform us when a different tab is selected.
    let tabmail = document.getElementById("tabmail");
    tabmail.registerTabMonitor(this.tabMonitor);
    window.addEventListener("deactivate", chatTabType._onWindowDeactivated);
    window.addEventListener("activate", chatTabType._onWindowActivated);

    gChatTab = aTab;
    this._handleArgs(aArgs);
    this.showTab(aTab);
    chatHandler.updateTitle();
  },
  shouldSwitchTo(aArgs) {
    if (!gChatTab) {
      return -1;
    }
    this._handleArgs(aArgs);
    return document.getElementById("tabmail").tabInfo.indexOf(gChatTab);
  },
  showTab(aTab) {
    gChatTab = aTab;
    chatHandler._onTabActivated();
    // The next call may change the selected conversation, but that
    // will be handled by the selected mutation observer of the chat-imconv-richlistitem.
    chatHandler._updateSelectedConversation();
    chatHandler._updateFocus();
  },
  closeTab(aTab) {
    gChatTab = null;
    let tabmail = document.getElementById("tabmail");
    tabmail.unregisterTabMonitor(this.tabMonitor);
    window.removeEventListener("deactivate", chatTabType._onWindowDeactivated);
    window.removeEventListener("activate", chatTabType._onWindowActivated);
  },
  persistTab(aTab) {
    return {};
  },
  restoreTab(aTabmail, aPersistedState) {
    aTabmail.openTab("chat", {});
  },

  supportsCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
        return true;
      default:
        return false;
    }
  },
  isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
        return !!this.getBrowser();
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
        return !!this.getFindbar();
      default:
        return false;
    }
  },
  doCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_find":
        this.getFindbar().onFindCommand();
        break;
      case "cmd_findAgain":
        this.getFindbar().onFindAgainCommand(false);
        break;
      case "cmd_findPrevious":
        this.getFindbar().onFindAgainCommand(true);
        break;
    }
  },
  onEvent(aEvent, aTab) {},
  getBrowser(aTab) {
    let panel = getSelectedPanel();
    if (panel == document.getElementById("logDisplay")) {
      if (!document.getElementById("logDisplayBrowserBox").hidden) {
        return document.getElementById("conv-log-browser");
      }
    } else if (panel && panel.localName == "chat-conversation") {
      return panel.convBrowser;
    }
    return null;
  },
  getFindbar(aTab) {
    let panel = getSelectedPanel();
    if (panel == document.getElementById("logDisplay")) {
      if (!document.getElementById("logDisplayBrowserBox").hidden) {
        return document.getElementById("log-findbar");
      }
    } else if (panel && panel.localName == "chat-conversation") {
      return panel.findbar;
    }
    return null;
  },

  saveTabState(aTab) {},
};

var chatHandler = {
  get msgNotificationBar() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "top");
        document.getElementById("chat-notification-top").prepend(element);
      });
    }
    return this._notificationBox;
  },

  _addConversation(aConv) {
    let list = document.getElementById("contactlistbox");
    let convs = document.getElementById("conversationsGroup");
    let selectedItem = list.selectedItem;
    let shouldSelect =
      gChatTab &&
      gChatTab.tabNode.selected &&
      (!selectedItem ||
        (selectedItem == convs &&
          convs.nextElementSibling.localName != "richlistitem" &&
          convs.nextSibling.getAttribute("is") != "chat-imconv-richlistitem"));
    let elt = convs.addContact(aConv, "imconv");
    if (shouldSelect) {
      list.selectedItem = elt;
    }

    if (aConv.isChat || !aConv.buddy) {
      return;
    }

    let contact = aConv.buddy.buddy.contact;
    elt.imContact = contact;
    let groupName = (contact.online ? "on" : "off") + "linecontactsGroup";
    let item = document.getElementById(groupName).removeContact(contact);
    if (list.selectedItem == item) {
      list.selectedItem = elt;
    }
  },

  _hasConversationForContact(aContact) {
    let convs = document.getElementById("conversationsGroup").contacts;
    return convs.some(
      aConversation =>
        aConversation.hasOwnProperty("imContact") &&
        aConversation.imContact.id == aContact.id
    );
  },

  _chatButtonUpdatePending: false,
  updateChatButtonState() {
    if (this._chatButtonUpdatePending) {
      return;
    }
    this._chatButtonUpdatePending = true;
    Services.tm.mainThread.dispatch(
      this._updateChatButtonState.bind(this),
      Ci.nsIEventTarget.DISPATCH_NORMAL
    );
  },
  // This is the unread count that was part of the latest
  // unread-im-count-changed notification.
  _notifiedUnreadCount: 0,
  _updateChatButtonState() {
    delete this._chatButtonUpdatePending;

    let [unreadTargetedCount, unreadTotalCount, unreadOTRNotificationCount] =
      this.countUnreadMessages();
    let unreadCount = unreadTargetedCount + unreadOTRNotificationCount;

    let chatButton = document.getElementById("button-chat");
    if (chatButton) {
      chatButton.badgeCount = unreadCount;
      if (unreadTotalCount || unreadOTRNotificationCount) {
        chatButton.setAttribute("unreadMessages", "true");
      } else {
        chatButton.removeAttribute("unreadMessages");
      }
    }

    let spacesChatButton = document.getElementById("chatButton");
    if (spacesChatButton) {
      spacesChatButton.classList.toggle("has-badge", unreadCount);
      document.l10n.setAttributes(
        spacesChatButton.querySelector(".spaces-badge-container"),
        "chat-button-unread-messages",
        {
          count: unreadCount,
        }
      );
    }
    let spacesPopupButtonChat = document.getElementById(
      "spacesPopupButtonChat"
    );
    if (spacesPopupButtonChat) {
      spacesPopupButtonChat.classList.toggle("has-badge", unreadCount);
      gSpacesToolbar.updatePinnedBadgeState();
    }

    let unifiedToolbarButtons = document.querySelectorAll(
      "#unifiedToolbarContent .chat .unified-toolbar-button"
    );
    for (const button of unifiedToolbarButtons) {
      if (unreadCount) {
        button.badge = unreadCount;
        continue;
      }
      button.badge = null;
    }

    if (unreadCount != this._notifiedUnreadCount) {
      let unreadInt = Cc["@mozilla.org/supports-PRInt32;1"].createInstance(
        Ci.nsISupportsPRInt32
      );
      unreadInt.data = unreadCount;
      Services.obs.notifyObservers(
        unreadInt,
        "unread-im-count-changed",
        unreadCount
      );
      this._notifiedUnreadCount = unreadCount;
    }
  },

  countUnreadMessages() {
    let convs = IMServices.conversations.getUIConversations();
    let unreadTargetedCount = 0;
    let unreadTotalCount = 0;
    let unreadOTRNotificationCount = 0;
    for (let conv of convs) {
      unreadTargetedCount += conv.unreadTargetedMessageCount;
      unreadTotalCount += conv.unreadIncomingMessageCount;
      unreadOTRNotificationCount += conv.unreadOTRNotificationCount;
    }
    return [unreadTargetedCount, unreadTotalCount, unreadOTRNotificationCount];
  },

  updateTitle() {
    if (!gChatTab) {
      return;
    }

    let title = gChatBundle.GetStringFromName("chatTabTitle");
    let [unreadTargetedCount] = this.countUnreadMessages();
    if (unreadTargetedCount) {
      title += " (" + unreadTargetedCount + ")";
    } else {
      let selectedItem = document.getElementById("contactlistbox").selectedItem;
      if (
        selectedItem &&
        selectedItem.localName == "richlistitem" &&
        selectedItem.getAttribute("is") == "chat-imconv-richlistitem" &&
        !selectedItem.hidden
      ) {
        title += " - " + selectedItem.getAttribute("displayname");
      }
    }
    gChatTab.title = title;
    document.getElementById("tabmail").setTabTitle(gChatTab);
  },

  onConvResize() {
    let panel = getSelectedPanel();
    if (panel && panel.localName == "chat-conversation") {
      panel.onConvResize();
    }
  },

  setStatusMenupopupCommand(aEvent) {
    let target = aEvent.target;
    if (target.getAttribute("id") == "imStatusShowAccounts") {
      openIMAccountMgr();
      return;
    }

    let status = target.getAttribute("status");
    if (!status) {
      // Can status really be null? Maybe because of an add-on...
      return;
    }

    let us = IMServices.core.globalUserStatus;
    us.setStatus(Status.toFlag(status), us.statusText);
  },

  _pendingLogBrowserLoad: false,
  _showLogPanel() {
    hideConversationsBoxPanels();
    document.getElementById("logDisplay").hidden = false;
    document.getElementById("logDisplayBrowserBox").hidden = false;
    document.getElementById("noPreviousConvScreen").hidden = true;
  },
  _showLog(aConversation, aSearchTerm) {
    if (!aConversation) {
      return;
    }
    this._showLogPanel();
    let browser = document.getElementById("conv-log-browser");
    browser._convScrollEnabled = false;
    if (this._pendingLogBrowserLoad) {
      browser._conv = aConversation;
      return;
    }
    browser.init(aConversation);
    this._pendingLogBrowserLoad = true;
    if (aSearchTerm) {
      this._pendingSearchTerm = aSearchTerm;
    }
    Services.obs.addObserver(this, "conversation-loaded");

    // Conversation title may not be set yet if this is a search result.
    let cti = document.getElementById("conv-top-info");
    cti.setAttribute("displayName", aConversation.title);

    // Find and display the contact for this log.
    for (let account of IMServices.accounts.getAccounts()) {
      if (
        account.normalizedName == aConversation.account.normalizedName &&
        account.protocol.normalizedName == aConversation.account.protocol.name
      ) {
        if (aConversation.isChat) {
          // Display information for MUCs.
          cti.setAsChat("", false, false);
          cti.setProtocol(account.protocol);
          return;
        }
        // Display information for contacts.
        let accountBuddy = IMServices.contacts.getAccountBuddyByNameAndAccount(
          aConversation.normalizedName,
          account
        );
        if (!accountBuddy) {
          return;
        }
        let contact = accountBuddy.buddy.contact;
        if (!contact) {
          return;
        }
        if (this.observedContact && this.observedContact.id == contact.id) {
          return;
        }
        this.showContactInfo(contact);
        this.observedContact = contact;
        return;
      }
    }
  },

  /**
   * Display a list of logs into a tree, and optionally handle a default selection.
   *
   * @param {imILog} aLogs - An array of imILog.
   * @param {boolean|imILog} aShouldSelect - Either a boolean (true means select the first log
   * of the list, false or undefined means don't mess with the selection) or a log
   * item that needs to be selected.
   * @returns {boolean} True if there's at least one log in the list, false if empty.
   */
  _showLogList(aLogs, aShouldSelect) {
    let logTree = document.getElementById("logTree");
    let treeView = (this._treeView = new chatLogTreeView(logTree, aLogs));
    if (!treeView._rowMap.length) {
      return false;
    }
    if (!aShouldSelect) {
      return true;
    }
    if (aShouldSelect === true) {
      // Select the first line.
      let selectIndex = 0;
      if (treeView.isContainer(selectIndex)) {
        // If the first line is a group, open it and select the
        // next line instead.
        treeView.toggleOpenState(selectIndex++);
      }
      logTree.view.selection.select(selectIndex);
      return true;
    }
    // Find the aShouldSelect log and select it.
    let logTime = aShouldSelect.time;
    for (let index = 0; index < treeView._rowMap.length; ++index) {
      if (
        !treeView.isContainer(index) &&
        treeView._rowMap[index].log.time == logTime
      ) {
        logTree.view.selection.select(index);
        logTree.ensureRowIsVisible(index);
        return true;
      }
      if (!treeView._rowMap[index].children.some(i => i.log.time == logTime)) {
        continue;
      }
      treeView.toggleOpenState(index);
      ++index;
      while (
        index < treeView._rowMap.length &&
        treeView._rowMap[index].log.time != logTime
      ) {
        ++index;
      }
      if (treeView._rowMap[index].log.time == logTime) {
        logTree.view.selection.select(index);
        logTree.ensureRowIsVisible(index);
      }
      return true;
    }
    throw new Error(
      "Couldn't find the log to select among the set of logs passed."
    );
  },

  onLogSelect() {
    let selection = this._treeView.selection;
    let currentIndex = selection.currentIndex;
    // The current (focused) row may not be actually selected...
    if (!selection.isSelected(currentIndex)) {
      return;
    }

    let log = this._treeView._rowMap[currentIndex].log;
    if (!log) {
      return;
    }

    let list = document.getElementById("contactlistbox");
    if (list.selectedItem.getAttribute("id") != "searchResultConv") {
      document.getElementById("goToConversation").hidden = false;
    }
    log.getConversation().then(aLogConv => {
      this._showLog(aLogConv);
    });
  },

  _contactObserver: {
    observe(aSubject, aTopic, aData) {
      if (
        aTopic == "contact-status-changed" ||
        aTopic == "contact-display-name-changed" ||
        aTopic == "contact-icon-changed"
      ) {
        chatHandler.showContactInfo(aSubject);
      }
    },
  },
  _observedContact: null,
  get observedContact() {
    return this._observedContact;
  },
  set observedContact(aContact) {
    if (aContact == this._observedContact) {
      return;
    }
    if (this._observedContact) {
      this._observedContact.removeObserver(this._contactObserver);
      delete this._observedContact;
    }
    this._observedContact = aContact;
    if (aContact) {
      aContact.addObserver(this._contactObserver);
    }
  },
  /**
   * Callback for the button that closes the log view. Resets the shared UI
   * elements to match the state of the active conversation. Hides the log
   * browser.
   */
  showCurrentConversation() {
    let item = document.getElementById("contactlistbox").selectedItem;
    if (!item) {
      return;
    }
    if (
      item.localName == "richlistitem" &&
      item.getAttribute("is") == "chat-imconv-richlistitem"
    ) {
      hideConversationsBoxPanels();
      item.convView.hidden = false;
      item.convView.querySelector(".conv-bottom").setAttribute("height", 90);
      document.getElementById("logTree").view.selection.clearSelection();
      if (item.conv.isChat) {
        item.convView.updateTopic();
      }
      ChatEncryption.updateEncryptionButton(document, item.conv);
      item.convView.focus();
    } else if (
      item.localName == "richlistitem" &&
      item.getAttribute("is") == "chat-contact-richlistitem"
    ) {
      item.openConversation();
    }
  },
  focusConversation(aUIConv) {
    let conv =
      document.getElementById("conversationsGroup").contactsById[aUIConv.id];
    document.getElementById("contactlistbox").selectedItem = conv;
    if (conv.convView) {
      conv.convView.focus();
    }
  },
  showContactInfo(aContact) {
    let cti = document.getElementById("conv-top-info");
    cti.setUserIcon(aContact.buddyIconFilename, true);
    cti.setAttribute("displayName", aContact.displayName);
    cti.setProtocol(aContact.preferredBuddy.protocol);

    let statusText = aContact.statusText;
    let statusType = aContact.statusType;
    cti.setStatus(
      Status.toAttribute(statusType),
      Status.toLabel(statusType, statusText)
    );

    let button = document.getElementById("goToConversation");
    button.label = gChatBundle.formatStringFromName(
      "startAConversationWith.button",
      [aContact.displayName]
    );
    button.disabled = !aContact.canSendMessage;
  },
  _hideContextPane(aHide) {
    document.getElementById("contextSplitter").hidden = aHide;
    document.getElementById("contextPane").hidden = aHide;
  },
  onListItemClick(aEvent) {
    // We only care about single clicks of the left button.
    if (aEvent.button != 0 || aEvent.detail != 1) {
      return;
    }
    let item = document.getElementById("contactlistbox").selectedItem;
    if (
      item.localName == "richlistitem" &&
      item.getAttribute("is") == "chat-imconv-richlistitem" &&
      item.convView
    ) {
      item.convView.focus();
    }
  },
  onListItemSelected() {
    let contactlistbox = document.getElementById("contactlistbox");
    let item = contactlistbox.selectedItem;
    if (
      !item ||
      item.hidden ||
      (item.localName == "richlistitem" &&
        item.getAttribute("is") == "chat-group-richlistitem")
    ) {
      this._hideContextPane(true);
      hideConversationsBoxPanels();
      document.getElementById("noConvScreen").hidden = false;
      this.updateTitle();
      this.observedContact = null;
      ChatEncryption.hideEncryptionButton(document);
      return;
    }

    this._hideContextPane(false);

    if (item.getAttribute("id") == "searchResultConv") {
      document.getElementById("goToConversation").hidden = true;
      document.getElementById("contextPane").removeAttribute("chat");
      let cti = document.getElementById("conv-top-info");
      cti.clear();
      this.observedContact = null;
      // Always hide encryption options for search conv
      ChatEncryption.hideEncryptionButton(document);

      let path = "logs/" + item.log.path;
      path = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        ...path.split("/")
      );
      IMServices.logs.getLogFromFile(path, true).then(aLog => {
        IMServices.logs.getSimilarLogs(aLog).then(aSimilarLogs => {
          if (contactlistbox.selectedItem != item) {
            return;
          }
          this._pendingSearchTerm = item.searchTerm || undefined;
          this._showLogList(aSimilarLogs, aLog);
        });
      });
    } else if (
      item.localName == "richlistitem" &&
      item.getAttribute("is") == "chat-imconv-richlistitem"
    ) {
      if (!item.convView) {
        let convBox = document.getElementById("conversationsBox");
        let conv = document.createXULElement("chat-conversation");
        convBox.appendChild(conv);
        conv.conv = item.conv;
        conv.tab = item;
        conv.convBrowser.setAttribute("context", "chatConversationContextMenu");
        conv.setAttribute("tooltip", "imTooltip");
        item.convView = conv;
        document.getElementById("contextSplitter").hidden = false;
        document.getElementById("contextPane").hidden = false;
        conv.editor.addEventListener("contextmenu", e => {
          // Stash away the original event's parent and range for later use.
          gRangeParent = e.rangeParent;
          gRangeOffset = e.rangeOffset;
          let popup = document.getElementById("chatContextMenu");
          popup.openPopupAtScreen(e.screenX, e.screenY, true);
          e.preventDefault();
        });

        // Set "mail editor mask" so changing the language doesn't
        // affect the global preference and multiple chats can have
        // individual languages.
        conv.editor.editor.flags |= Ci.nsIEditor.eEditorMailMask;

        let preferredLanguages =
          Services.prefs.getStringPref("spellchecker.dictionary")?.split(",") ??
          [];
        let initialLanguage = "";
        if (preferredLanguages.length === 1) {
          initialLanguage = preferredLanguages[0];
        }
        // Initialise language to the default.
        conv.editor.setAttribute("lang", initialLanguage);

        // Attach listener so we hear about language changes.
        document.addEventListener("spellcheck-changed", e => {
          let conv = chatHandler._getActiveConvView();
          let activeLanguages = e.detail.dictionaries ?? [];
          let languageToSet = "";
          if (activeLanguages.length === 1) {
            languageToSet = activeLanguages[0];
          }
          conv.editor.setAttribute("lang", languageToSet);
        });
      } else {
        item.convView.onConvResize();
      }

      hideConversationsBoxPanels();
      item.convView.hidden = false;
      item.convView.querySelector(".conv-bottom").setAttribute("height", 90);
      item.convView.updateConvStatus();
      item.update();

      ChatEncryption.updateEncryptionButton(document, item.conv);

      IMServices.logs.getLogsForConversation(item.conv).then(aLogs => {
        if (contactlistbox.selectedItem != item) {
          return;
        }
        this._showLogList(aLogs);
      });

      document
        .querySelectorAll("#contextPaneFlexibleBox .conv-chat")
        .forEach(e => {
          e.setAttribute("hidden", !item.conv.isChat);
        });
      if (item.conv.isChat) {
        item.convView.showParticipants();
      }

      let button = document.getElementById("goToConversation");
      button.label = gChatBundle.GetStringFromName(
        "goBackToCurrentConversation.button"
      );
      button.disabled = false;
      this.observedContact = null;
    } else if (
      item.localName == "richlistitem" &&
      item.getAttribute("is") == "chat-contact-richlistitem"
    ) {
      ChatEncryption.hideEncryptionButton(document);
      let contact = item.contact;
      if (
        this.observedContact &&
        contact &&
        this.observedContact.id == contact.id
      ) {
        return; // onselect has just been fired again because a status
        // change caused the chat-contact-richlistitem to move.
        // Return early to avoid flickering and changing the selected log.
      }

      this.showContactInfo(contact);
      this.observedContact = contact;

      document
        .querySelectorAll("#contextPaneFlexibleBox .conv-chat")
        .forEach(e => {
          e.setAttribute("hidden", "true");
        });

      IMServices.logs.getLogsForContact(contact).then(aLogs => {
        if (contactlistbox.selectedItem != item) {
          return;
        }
        if (!this._showLogList(aLogs, true)) {
          hideConversationsBoxPanels();
          document.getElementById("logDisplay").hidden = false;
          document.getElementById("logDisplayBrowserBox").hidden = false;
          document.getElementById("noPreviousConvScreen").hidden = true;
        }
      });
    }
    this.updateTitle();
  },

  onNickClick(aEvent) {
    // Open a private conversation only for a middle or double click.
    if (aEvent.button != 1 && (aEvent.button != 0 || aEvent.detail != 2)) {
      return;
    }

    let conv = document.getElementById("contactlistbox").selectedItem.conv;
    let nick = aEvent.target.chatBuddy.name;
    let name = conv.target.getNormalizedChatBuddyName(nick);
    try {
      let newconv = conv.account.createConversation(name);
      this.focusConversation(newconv);
    } catch (e) {}
  },

  onNicklistKeyPress(aEvent) {
    if (aEvent.keyCode != aEvent.DOM_VK_RETURN) {
      return;
    }

    let listbox = aEvent.target;
    if (listbox.selectedCount == 0) {
      return;
    }

    let conv = document.getElementById("contactlistbox").selectedItem.conv;
    let newconv;
    for (let i = 0; i < listbox.selectedCount; ++i) {
      let nick = listbox.getSelectedItem(i).chatBuddy.name;
      let name = conv.target.getNormalizedChatBuddyName(nick);
      try {
        newconv = conv.account.createConversation(name);
      } catch (e) {}
    }
    // Only focus last of the opened conversations.
    if (newconv) {
      this.focusConversation(newconv);
    }
  },

  addBuddy() {
    window.openDialog(
      "chrome://messenger/content/chat/addbuddy.xhtml",
      "",
      "chrome,modal,titlebar,centerscreen"
    );
  },

  joinChat() {
    window.openDialog(
      "chrome://messenger/content/chat/joinchat.xhtml",
      "",
      "chrome,modal,titlebar,centerscreen"
    );
  },

  _colorCache: {},
  // Duplicated code from chat-conversation.js :-(
  _computeColor(aName) {
    if (Object.prototype.hasOwnProperty.call(this._colorCache, aName)) {
      return this._colorCache[aName];
    }

    // Compute the color based on the nick
    var nick = aName.match(/[a-zA-Z0-9]+/);
    nick = nick ? nick[0].toLowerCase() : (nick = aName);
    // We compute a hue value (between 0 and 359) based on the
    // characters of the nick.
    // The first character weights kInitialWeight, each following
    // character weights kWeightReductionPerChar * the weight of the
    // previous character.
    const kInitialWeight = 10; // 10 = 360 hue values / 36 possible characters.
    const kWeightReductionPerChar = 0.52; // arbitrary value
    var weight = kInitialWeight;
    var res = 0;
    for (var i = 0; i < nick.length; ++i) {
      var char = nick.charCodeAt(i) - 47;
      if (char > 10) {
        char -= 39;
      }
      // now char contains a value between 1 and 36
      res += char * weight;
      weight *= kWeightReductionPerChar;
    }
    return (this._colorCache[aName] = Math.round(res) % 360);
  },

  _placeHolderButtonId: "",
  _updateNoConvPlaceHolder() {
    let connected = false;
    let hasAccount = false;
    let canJoinChat = false;
    for (let account of IMServices.accounts.getAccounts()) {
      hasAccount = true;
      if (account.connected) {
        connected = true;
        if (account.canJoinChat) {
          canJoinChat = true;
          break;
        }
      }
    }
    document.getElementById("noConvInnerBox").hidden = !connected;
    document.getElementById("noAccountInnerBox").hidden = hasAccount;
    document.getElementById("noConnectedAccountInnerBox").hidden =
      connected || !hasAccount;
    if (connected) {
      delete this._placeHolderButtonId;
    } else {
      this._placeHolderButtonId = hasAccount
        ? "openIMAccountManagerButton"
        : "openIMAccountWizardButton";
    }

    for (let id of [
      "statusTypeIcon",
      "statusMessage",
      "button-chat-accounts",
    ]) {
      let elt = document.getElementById(id);
      if (elt) {
        elt.disabled = !hasAccount;
      }
    }

    let chatStatusCmd = document.getElementById("cmd_chatStatus");
    if (chatStatusCmd) {
      if (hasAccount) {
        chatStatusCmd.removeAttribute("disabled");
      } else {
        chatStatusCmd.setAttribute("disabled", true);
      }
    }

    let addBuddyButton = document.getElementById("button-add-buddy");
    if (addBuddyButton) {
      addBuddyButton.disabled = !connected;
    }

    let addBuddyCmd = document.getElementById("cmd_addChatBuddy");
    if (addBuddyCmd) {
      if (connected) {
        addBuddyCmd.removeAttribute("disabled");
      } else {
        addBuddyCmd.setAttribute("disabled", true);
      }
    }

    let joinChatButton = document.getElementById("button-join-chat");
    if (joinChatButton) {
      joinChatButton.disabled = !canJoinChat;
    }

    let joinChatCmd = document.getElementById("cmd_joinChat");
    if (joinChatCmd) {
      if (canJoinChat) {
        joinChatCmd.removeAttribute("disabled");
      } else {
        joinChatCmd.setAttribute("disabled", true);
      }
    }

    let groupIds = ["conversations", "onlinecontacts", "offlinecontacts"];
    let contactlist = document.getElementById("contactlistbox");
    if (
      !hasAccount ||
      (!connected &&
        groupIds.every(
          id => document.getElementById(id + "Group").contacts.length
        ))
    ) {
      contactlist.disabled = true;
    } else {
      contactlist.disabled = false;
      this._updateSelectedConversation();
    }
  },
  _updateSelectedConversation() {
    let list = document.getElementById("contactlistbox");
    // We can't select anything if there's no account.
    if (list.disabled) {
      return;
    }

    // If the selection is already a conversation with unread messages, keep it.
    let selectedItem = list.selectedItem;
    if (
      selectedItem &&
      selectedItem.localName == "richlistitem" &&
      selectedItem.getAttribute("is") == "chat-imconv-richlistitem" &&
      selectedItem.directedUnreadCount
    ) {
      selectedItem.update();
      return;
    }

    let firstConv;
    let convs = document.getElementById("conversationsGroup");
    let conv = convs.nextElementSibling;
    while (conv.id != "searchResultConv") {
      if (!firstConv) {
        firstConv = conv;
      }
      // If there is a conversation with unread messages, select it.
      if (conv.directedUnreadCount) {
        list.selectedItem = conv;
        return;
      }
      conv = conv.nextElementSibling;
    }

    // No unread messages, select the first conversation, but only if
    // the existing selection is uninteresting (a section header).
    if (firstConv) {
      if (
        !selectedItem ||
        (selectedItem.localName == "richlistitem" &&
          selectedItem.getAttribute("is") == "chat-group-richlistitem")
      ) {
        list.selectedItem = firstConv;
      }
      return;
    }

    // No conversation, if a visible item is selected, keep it.
    if (selectedItem && !selectedItem.collapsed) {
      return;
    }

    // Select the first visible group header.
    let groupIds = ["conversations", "onlinecontacts", "offlinecontacts"];
    for (let id of groupIds) {
      let item = document.getElementById(id + "Group");
      if (item.collapsed) {
        continue;
      }
      list.selectedItem = item;
      return;
    }
  },
  _updateFocus() {
    let focusId = this._placeHolderButtonId || "contactlistbox";
    document.getElementById(focusId).focus();
  },
  _getActiveConvView() {
    let list = document.getElementById("contactlistbox");
    if (list.disabled) {
      return null;
    }
    let selectedItem = list.selectedItem;
    if (
      !selectedItem ||
      (selectedItem.localName != "richlistitem" &&
        selectedItem.getAttribute("is") != "chat-imconv-richlistitem")
    ) {
      return null;
    }
    let convView = selectedItem.convView;
    if (!convView || !convView.loaded) {
      return null;
    }
    return convView;
  },
  _onTabActivated() {
    let convView = chatHandler._getActiveConvView();
    if (convView) {
      convView.switchingToPanel();
    }
  },
  _onTabDeactivated(aHidden) {
    let convView = chatHandler._getActiveConvView();
    if (convView) {
      convView.switchingAwayFromPanel(aHidden);
    }
  },
  observe(aSubject, aTopic, aData) {
    if (aTopic == "chat-core-initialized") {
      this.initAfterChatCore();
      return;
    }

    if (aTopic == "conversation-loaded") {
      let browser = document.getElementById("conv-log-browser");
      if (aSubject != browser) {
        return;
      }

      for (let msg of browser._conv.getMessages()) {
        if (!msg.system) {
          msg.color =
            "color: hsl(" + this._computeColor(msg.who) + ", 100%, 40%);";
        }
        browser.appendMessage(msg);
      }

      if (this._pendingSearchTerm) {
        let findbar = document.getElementById("log-findbar");
        findbar._findField.value = this._pendingSearchTerm;
        findbar.open();
        browser.focus();
        delete this._pendingSearchTerm;
        let eventListener = function () {
          findbar.onFindAgainCommand();
          if (findbar._findFailedString && browser._messageDisplayPending) {
            return;
          }
          // Search result found or all messages added, we're done.
          browser.removeEventListener("MessagesDisplayed", eventListener);
        };
        browser.addEventListener("MessagesDisplayed", eventListener);
      }
      this._pendingLogBrowserLoad = false;
      Services.obs.removeObserver(this, "conversation-loaded");
      return;
    }

    if (
      aTopic == "account-connected" ||
      aTopic == "account-disconnected" ||
      aTopic == "account-added" ||
      aTopic == "account-removed"
    ) {
      this._updateNoConvPlaceHolder();
      return;
    }

    if (aTopic == "contact-signed-on") {
      if (!this._hasConversationForContact(aSubject)) {
        document.getElementById("onlinecontactsGroup").addContact(aSubject);
        document.getElementById("offlinecontactsGroup").removeContact(aSubject);
      }
      return;
    }
    if (aTopic == "contact-signed-off") {
      if (!this._hasConversationForContact(aSubject)) {
        document.getElementById("offlinecontactsGroup").addContact(aSubject);
        document.getElementById("onlinecontactsGroup").removeContact(aSubject);
      }
      return;
    }
    if (aTopic == "contact-added") {
      let groupName = (aSubject.online ? "on" : "off") + "linecontactsGroup";
      document.getElementById(groupName).addContact(aSubject);
      return;
    }
    if (aTopic == "contact-removed") {
      let groupName = (aSubject.online ? "on" : "off") + "linecontactsGroup";
      document.getElementById(groupName).removeContact(aSubject);
      return;
    }
    if (aTopic == "contact-no-longer-dummy") {
      let oldId = parseInt(aData);
      let groupName = (aSubject.online ? "on" : "off") + "linecontactsGroup";
      let group = document.getElementById(groupName);
      if (group.contactsById.hasOwnProperty(oldId)) {
        let contact = group.contactsById[oldId];
        delete group.contactsById[oldId];
        group.contactsById[contact.contact.id] = contact;
      }
      return;
    }
    if (aTopic == "new-text") {
      this.updateChatButtonState();
      return;
    }
    if (aTopic == "new-ui-conversation") {
      if (chatTabType.hasBeenOpened) {
        chatHandler._addConversation(aSubject);
      }
      return;
    }
    if (aTopic == "ui-conversation-closed") {
      this.updateChatButtonState();
      if (!chatTabType.hasBeenOpened) {
        return;
      }
      let conv = document
        .getElementById("conversationsGroup")
        .removeContact(aSubject);
      if (conv.imContact) {
        let contact = conv.imContact;
        let groupName = (contact.online ? "on" : "off") + "linecontactsGroup";
        document.getElementById(groupName).addContact(contact);
      }
      return;
    }

    if (aTopic == "buddy-authorization-request") {
      aSubject.QueryInterface(Ci.prplIBuddyRequest);
      let authLabel = gChatBundle.formatStringFromName(
        "buddy.authRequest.label",
        [aSubject.userName]
      );
      let value =
        "buddy-auth-request-" + aSubject.account.id + aSubject.userName;
      let acceptButton = {
        accessKey: gChatBundle.GetStringFromName(
          "buddy.authRequest.allow.accesskey"
        ),
        label: gChatBundle.GetStringFromName("buddy.authRequest.allow.label"),
        callback() {
          aSubject.grant();
        },
      };
      let denyButton = {
        accessKey: gChatBundle.GetStringFromName(
          "buddy.authRequest.deny.accesskey"
        ),
        label: gChatBundle.GetStringFromName("buddy.authRequest.deny.label"),
        callback() {
          aSubject.deny();
        },
      };
      let box = this.msgNotificationBar;
      let notification = box.appendNotification(
        value,
        {
          label: authLabel,
          priority: box.PRIORITY_INFO_HIGH,
        },
        [acceptButton, denyButton]
      );
      notification.removeAttribute("dismissable");
      if (!gChatTab) {
        let tabmail = document.getElementById("tabmail");
        tabmail.openTab("chat", { background: true });
      }
      return;
    }
    if (aTopic == "buddy-authorization-request-canceled") {
      aSubject.QueryInterface(Ci.prplIBuddyRequest);
      let value =
        "buddy-auth-request-" + aSubject.account.id + aSubject.userName;
      let box = this.msgNotificationBar;
      let notification = box.getNotificationWithValue(value);
      if (notification) {
        notification.close();
      }
      return;
    }
    if (aTopic == "buddy-verification-request") {
      aSubject.QueryInterface(Ci.imIIncomingSessionVerification);
      let barLabel = gChatBundle.formatStringFromName(
        "buddy.verificationRequest.label",
        [aSubject.subject]
      );
      let value =
        "buddy-verification-request-" +
        aSubject.account.id +
        "-" +
        aSubject.subject;
      let acceptButton = {
        accessKey: gChatBundle.GetStringFromName(
          "buddy.verificationRequest.allow.accesskey"
        ),
        label: gChatBundle.GetStringFromName(
          "buddy.verificationRequest.allow.label"
        ),
        callback() {
          aSubject
            .verify()
            .then(() => {
              window.openDialog(
                "chrome://messenger/content/chat/verify.xhtml",
                "",
                "chrome,modal,titlebar,centerscreen",
                aSubject
              );
            })
            .catch(error => {
              aSubject.account.ERROR(error);
              aSubject.cancel();
            });
        },
      };
      let denyButton = {
        accessKey: gChatBundle.GetStringFromName(
          "buddy.verificationRequest.deny.accesskey"
        ),
        label: gChatBundle.GetStringFromName(
          "buddy.verificationRequest.deny.label"
        ),
        callback() {
          aSubject.cancel();
        },
      };
      let box = this.msgNotificationBar;
      let notification = box.appendNotification(
        value,
        {
          label: barLabel,
          priority: box.PRIORITY_INFO_HIGH,
        },
        [acceptButton, denyButton]
      );
      notification.removeAttribute("dismissable");
      if (!gChatTab) {
        let tabmail = document.getElementById("tabmail");
        tabmail.openTab("chat", { background: true });
      }
      return;
    }
    if (aTopic == "buddy-verification-request-canceled") {
      aSubject.QueryInterface(Ci.imIIncomingSessionVerification);
      let value =
        "buddy-verification-request-" +
        aSubject.account.id +
        "-" +
        aSubject.subject;
      let box = this.msgNotificationBar;
      let notification = box.getNotificationWithValue(value);
      if (notification) {
        notification.close();
      }
      return;
    }
    if (aTopic == "conv-authorization-request") {
      aSubject.QueryInterface(Ci.prplIChatRequest);
      let value =
        "conv-auth-request-" + aSubject.account.id + aSubject.conversationName;
      let buttons = [
        {
          "l10n-id": "chat-conv-invite-accept",
          callback() {
            aSubject.grant();
          },
        },
      ];
      if (aSubject.canDeny) {
        buttons.push({
          "l10n-id": "chat-conv-invite-deny",
          callback() {
            aSubject.deny();
          },
        });
      }
      let box = this.msgNotificationBar;
      // Remove the notification when the request is cancelled.
      aSubject.completePromise.catch(() => {
        let notification = box.getNotificationWithValue(value);
        if (notification) {
          notification.close();
        }
      });
      let notification = box.appendNotification(
        value,
        {
          label: "",
          priority: box.PRIORITY_INFO_HIGH,
        },
        buttons
      );
      document.l10n.setAttributes(
        notification.messageText,
        "chat-conv-invite-label",
        {
          conversation: aSubject.conversationName,
        }
      );
      notification.removeAttribute("dismissable");
      if (!gChatTab) {
        let tabmail = document.getElementById("tabmail");
        tabmail.openTab("chat", { background: true });
      }
      return;
    }
    if (aTopic == "conversation-update-type") {
      // Find conversation in conversation list.
      let contactlistbox = document.getElementById("contactlistbox");
      let convs = document.getElementById("conversationsGroup");
      let convItem = convs.nextElementSibling;
      while (
        convItem.conv.target.id !== aSubject.target.id &&
        convItem.id != "searchResultConv"
      ) {
        convItem = convItem.nextElementSibling;
      }
      if (convItem.conv.target.id !== aSubject.target.id) {
        // Could not find a matching conversation in the front end.
        return;
      }
      // Update UI conversation associated with components
      if (convItem.convView && convItem.convView.conv !== aSubject) {
        convItem.convView.changeConversation(aSubject);
      }
      if (convItem.conv !== aSubject) {
        convItem.changeConversation(aSubject);
      } else {
        convItem.update();
      }
      // If the changed conversation is the selected item, make sure
      // we update the UI elements to match the conversation type.
      let selectedItem = contactlistbox.selectedItem;
      if (selectedItem === convItem && selectedItem.convView) {
        this.onListItemSelected();
      }
    }
  },
  initAfterChatCore() {
    let onGroup = document.getElementById("onlinecontactsGroup");
    let offGroup = document.getElementById("offlinecontactsGroup");

    for (let name in chatHandler.allContacts) {
      let contact = chatHandler.allContacts[name];
      let group = contact.online ? onGroup : offGroup;
      group.addContact(contact);
    }

    onGroup._updateGroupLabel();
    offGroup._updateGroupLabel();

    [
      "new-text",
      "new-ui-conversation",
      "ui-conversation-closed",
      "contact-signed-on",
      "contact-signed-off",
      "contact-added",
      "contact-removed",
      "contact-no-longer-dummy",
      "account-connected",
      "account-disconnected",
      "account-added",
      "account-removed",
      "conversation-update-type",
    ].forEach(chatHandler._addObserver);

    chatHandler._updateNoConvPlaceHolder();
    statusSelector.init();
  },
  _observedTopics: [],
  _addObserver(aTopic) {
    Services.obs.addObserver(chatHandler, aTopic);
    chatHandler._observedTopics.push(aTopic);
  },
  _removeObservers() {
    for (let topic of this._observedTopics) {
      Services.obs.removeObserver(this, topic);
    }
  },
  // TODO move this function away from here and test it.
  _getNextUnreadConversation(aConversations, aCurrent, aReverse) {
    let convCount = aConversations.length;
    if (!convCount) {
      return -1;
    }

    let direction = aReverse ? -1 : 1;
    let next = i => {
      i += direction;
      if (i < 0) {
        return i + convCount;
      }
      if (i >= convCount) {
        return i - convCount;
      }
      return i;
    };

    // Find starting point
    let start = 0;
    if (Number.isInteger(aCurrent)) {
      start = next(aCurrent);
    } else if (aReverse) {
      start = convCount - 1;
    }

    // Cycle through all conversations until we are at the start again.
    let i = start;
    do {
      // If there is a conversation with unread messages, select it.
      if (aConversations[i].unreadIncomingMessageCount) {
        return i;
      }
      i = next(i);
    } while (i !== start && i !== aCurrent);
    return -1;
  },
  _selectNextUnreadConversation(aReverse, aList) {
    let conversations = document.getElementById("conversationsGroup").contacts;
    if (!conversations.length) {
      return;
    }

    let rawConversations = conversations.map(c => c.conv);
    let current;
    if (
      aList.selectedItem.localName == "richlistitem" &&
      aList.selectedItem.getAttribute("is") == "chat-imconv-richlistitem"
    ) {
      current = aList.selectedIndex - aList.getIndexOfItem(conversations[0]);
    }
    let newIndex = this._getNextUnreadConversation(
      rawConversations,
      current,
      aReverse
    );
    if (newIndex !== -1) {
      aList.selectedItem = conversations[newIndex];
    }
  },
  /**
   * Restores the width in pixels stored on the width attribute of an element as
   * CSS width, so it is used for flex layout calculations. Useful for restoring
   * elements that were sized by a XUL splitter.
   *
   * @param {Element} element - Element to transfer the width attribute to CSS for.
   */
  _restoreWidth: element =>
    (element.style.width = `${element.getAttribute("width")}px`),
  async init() {
    Notifications.init();
    if (!Services.prefs.getBoolPref("mail.chat.enabled")) {
      [
        "chatButton",
        "spacesPopupButtonChat",
        "button-chat",
        "menu_goChat",
        "goChatSeparator",
        "imAccountsStatus",
        "joinChatMenuItem",
        "newIMAccountMenuItem",
        "newIMContactMenuItem",
        "appmenu_newIMAccountMenuItem",
        "appmenu_newIMContactMenuItem",
      ].forEach(function (aId) {
        let elt = document.getElementById(aId);
        if (elt) {
          elt.hidden = true;
        }
      });
      return;
    }

    window.addEventListener("unload", this._removeObservers.bind(this));

    // initialize the customizeDone method on the customizeable toolbar
    var toolbox = document.getElementById("chat-view-toolbox");
    toolbox.customizeDone = function (aEvent) {
      MailToolboxCustomizeDone(aEvent, "CustomizeChatToolbar");
    };

    let tabmail = document.getElementById("tabmail");
    tabmail.registerTabType(chatTabType);
    this._addObserver("buddy-authorization-request");
    this._addObserver("buddy-authorization-request-canceled");
    this._addObserver("buddy-verification-request");
    this._addObserver("buddy-verification-request-canceled");
    this._addObserver("conv-authorization-request");
    let listbox = document.getElementById("contactlistbox");
    listbox.addEventListener("keypress", function (aEvent) {
      let item = listbox.selectedItem;
      if (!item || !item.parentNode) {
        // empty list or item no longer in the list
        return;
      }
      item.keyPress(aEvent);
    });
    listbox.addEventListener("select", this.onListItemSelected.bind(this));
    listbox.addEventListener("click", this.onListItemClick.bind(this));
    document
      .getElementById("chatTabPanel")
      .addEventListener("keypress", function (aEvent) {
        let accelKeyPressed =
          AppConstants.platform == "macosx" ? aEvent.metaKey : aEvent.ctrlKey;
        if (
          !accelKeyPressed ||
          (aEvent.keyCode != aEvent.DOM_VK_DOWN &&
            aEvent.keyCode != aEvent.DOM_VK_UP)
        ) {
          return;
        }
        listbox._userSelecting = true;
        let reverse = aEvent.keyCode != aEvent.DOM_VK_DOWN;
        if (aEvent.shiftKey) {
          chatHandler._selectNextUnreadConversation(reverse, listbox);
        } else {
          listbox.moveByOffset(reverse ? -1 : 1, true, false);
        }
        listbox._userSelecting = false;
        let item = listbox.selectedItem;
        if (
          item.localName == "richlistitem" &&
          item.getAttribute("is") == "chat-imconv-richlistitem" &&
          item.convView
        ) {
          item.convView.focus();
        } else {
          listbox.focus();
        }
      });
    window.addEventListener("resize", this.onConvResize.bind(this));
    document.getElementById("conversationsGroup").sortComparator = (a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase());

    const { allContacts, onlineContacts, ChatCore } =
      ChromeUtils.importESModule("resource:///modules/chatHandler.sys.mjs");
    this.allContacts = allContacts;
    this.onlineContacts = onlineContacts;
    this.ChatCore = ChatCore;
    if (this.ChatCore.initialized) {
      this.initAfterChatCore();
    } else {
      this.ChatCore.init();
      this._addObserver("chat-core-initialized");
    }

    if (ChatEncryption.otrEnabled) {
      this._initOTR();
    }

    this._restoreWidth(document.getElementById("listPaneBox"));
    this._restoreWidth(document.getElementById("contextPane"));
  },

  async _initOTR() {
    if (!IMServices.core.initialized) {
      await new Promise(resolve => {
        function initObserver() {
          Services.obs.removeObserver(initObserver, "prpl-init");
          resolve();
        }
        Services.obs.addObserver(initObserver, "prpl-init");
      });
    }
    // Avoid loading OTR until we have an im account set up.
    if (IMServices.accounts.getAccounts().length === 0) {
      await new Promise(resolve => {
        function accountsObserver() {
          if (IMServices.accounts.getAccounts().length > 0) {
            Services.obs.removeObserver(accountsObserver, "account-added");
            resolve();
          }
        }
        Services.obs.addObserver(accountsObserver, "account-added");
      });
    }
    await OTRUI.init();
  },
};

function chatLogTreeGroupItem(aTitle, aLogItems) {
  this._title = aTitle;
  this._children = aLogItems;
  for (let child of this._children) {
    child._parent = this;
  }
  this._open = false;
}
chatLogTreeGroupItem.prototype = {
  getText() {
    return this._title;
  },
  get id() {
    return this._title;
  },
  get open() {
    return this._open;
  },
  get level() {
    return 0;
  },
  get _parent() {
    return null;
  },
  get children() {
    return this._children;
  },
  getProperties() {
    return "";
  },
};

function chatLogTreeLogItem(aLog, aText, aLevel) {
  this.log = aLog;
  this._text = aText;
  this._level = aLevel;
}
chatLogTreeLogItem.prototype = {
  getText() {
    return this._text;
  },
  get id() {
    return this.log.title;
  },
  get open() {
    return false;
  },
  get level() {
    return this._level;
  },
  get children() {
    return [];
  },
  getProperties() {
    return "";
  },
};

function chatLogTreeView(aTree, aLogs) {
  this._tree = aTree;
  this._logs = aLogs;
  this._tree.view = this;
  this._rebuild();
}
chatLogTreeView.prototype = {
  __proto__: new PROTO_TREE_VIEW(),

  _rebuild() {
    // Some date helpers...
    const kDayInMsecs = 24 * 60 * 60 * 1000;
    const kWeekInMsecs = 7 * kDayInMsecs;
    const kTwoWeeksInMsecs = 2 * kWeekInMsecs;

    // Drop the old rowMap.
    if (this._tree) {
      this._tree.rowCountChanged(0, -this._rowMap.length);
    }
    this._rowMap = [];

    let placesBundle = Services.strings.createBundle(
      "chrome://places/locale/places.properties"
    );
    let dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short" });
    let monthYearFormat = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
    });
    let monthFormat = new Intl.DateTimeFormat(undefined, { month: "long" });
    let weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });
    let nowDate = new Date();
    let todayDate = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate()
    );

    // The keys used in the 'firstgroups' object should match string ids.
    // The order is the reverse of that in which they will appear
    // in the logTree.
    let firstgroups = {
      previousWeek: [],
      currentWeek: [],
    };

    // today and yesterday are treated differently, because for JSON logs they
    // represent individual logs, and are not "groups".
    let today = null,
      yesterday = null;

    // Build a chatLogTreeLogItem for each log, and put it in the right group.
    let groups = {};
    for (let log of this._logs) {
      let logDate = new Date(log.time * 1000);
      // Calculate elapsed time between the log and 00:00:00 today.
      let timeFromToday = todayDate - logDate;
      let title = dateFormat.format(logDate);
      let group;
      if (timeFromToday <= 0) {
        today = new chatLogTreeLogItem(
          log,
          gChatBundle.GetStringFromName("log.today"),
          0
        );
        continue;
      } else if (timeFromToday <= kDayInMsecs) {
        yesterday = new chatLogTreeLogItem(
          log,
          gChatBundle.GetStringFromName("log.yesterday"),
          0
        );
        continue;
      } else if (timeFromToday <= kWeekInMsecs - kDayInMsecs) {
        // Note that the 7 days of the current week include today.
        group = firstgroups.currentWeek;
        title = weekdayFormat.format(logDate);
      } else if (timeFromToday <= kTwoWeeksInMsecs - kDayInMsecs) {
        group = firstgroups.previousWeek;
      } else {
        logDate.setHours(0);
        logDate.setMinutes(0);
        logDate.setSeconds(0);
        logDate.setDate(1);
        let groupID = logDate.toISOString();
        if (!(groupID in groups)) {
          let groupname;
          if (logDate.getFullYear() == nowDate.getFullYear()) {
            if (logDate.getMonth() == nowDate.getMonth()) {
              groupname = placesBundle.GetStringFromName(
                "finduri-AgeInMonths-is-0"
              );
            } else {
              groupname = monthFormat.format(logDate);
            }
          } else {
            groupname = monthYearFormat.format(logDate);
          }
          groups[groupID] = {
            entries: [],
            name: groupname,
          };
        }
        group = groups[groupID].entries;
      }
      group.push(new chatLogTreeLogItem(log, title, 1));
    }

    let groupIDs = Object.keys(groups).sort().reverse();

    // Add firstgroups to groups and groupIDs.
    for (let groupID in firstgroups) {
      let group = firstgroups[groupID];
      if (!group.length) {
        continue;
      }
      groupIDs.unshift(groupID);
      groups[groupID] = {
        entries: firstgroups[groupID],
        name: gChatBundle.GetStringFromName("log." + groupID),
      };
    }

    // Build tree.
    if (today) {
      this._rowMap.push(today);
    }
    if (yesterday) {
      this._rowMap.push(yesterday);
    }
    groupIDs.forEach(function (aGroupID) {
      let group = groups[aGroupID];
      group.entries.sort((l1, l2) => l2.log.time - l1.log.time);
      this._rowMap.push(new chatLogTreeGroupItem(group.name, group.entries));
    }, this);

    // Finally, notify the tree.
    if (this._tree) {
      this._tree.rowCountChanged(0, this._rowMap.length);
    }
  },
};

/**
 * Handler for onpopupshowing event of the participantListContextMenu. Decides
 * if the menu should be shown at all and manages the disabled state of its
 * items.
 *
 * @param {XULMenuPopupElement} menu
 * @returns {boolean} If the menu should be shown, currently decided based on
 *   if its only item has an action to perform.
 */
function showParticipantMenu(menu) {
  const target = menu.triggerNode.closest("richlistitem");
  if (!target?.chatBuddy?.canVerifyIdentity) {
    return false;
  }
  const identityVerified = target.chatBuddy.identityVerified;
  const verifyMenuItem = document.getElementById("context-verifyParticipant");
  verifyMenuItem.disabled = identityVerified;
  document.l10n.setAttributes(
    verifyMenuItem,
    identityVerified ? "chat-identity-verified" : "chat-verify-identity"
  );
  return true;
}

/**
 * Command handler for the verify identity context menu item of the participant
 * context menu. Initiates the verification for the participant the menu was
 * opened on.
 *
 * @returns {undefined}
 */
function verifyChatParticipant() {
  const target = document
    .getElementById("participantListContextMenu")
    .triggerNode.closest("richlistitem");
  const buddy = target.chatBuddy;
  if (!buddy) {
    return;
  }
  ChatEncryption.verifyIdentity(window, buddy);
}

window.addEventListener("load", () => chatHandler.init());
