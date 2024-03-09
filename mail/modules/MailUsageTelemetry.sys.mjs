/* -*- js-indent-level: 2; indent-tabs-mode: nil -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Observed topic names.
const DOMWINDOW_OPENED_TOPIC = "domwindowopened";

// Window types we're interested in.
const WINDOW_TYPES = ["mail:3pane", "mail:messageWindow", "msgcompose"];

// Window URLs we're interested in.
const WINDOW_URLS = [
  "chrome://messenger/content/messenger.xhtml",
  "chrome://messenger/content/messageWindow.xhtml",
  "chrome://messenger/content/messengercompose/messengercompose.xhtml",
  "about:3pane",
  "about:addressbook",
  "about:message",
];

// The elements we consider to be interactive.
const UI_TARGET_ELEMENTS = [
  "menuitem",
  "toolbarbutton",
  "key",
  "command",
  "checkbox",
  "input",
  "textarea",
  "button",
  "image",
  "radio",
  "select",
  "richlistitem",
];

// The containers of interactive elements that we care about and their pretty
// names. These should be listed in order of most-specific to least-specific,
// when iterating JavaScript will guarantee that ordering and so we will find
// the most specific area first.
const MESSENGER_UI_CONTAINER_IDS = {
  // Address Book.
  toolbox: "addressbook",
  booksPane: "addressbook",
  cardsPane: "addressbook",
  detailsPane: "addressbook",
  photoDialog: "addressbook",
  bookContext: "addressbook",
  sortContext: "addressbook",
  cardContext: "addressbook",

  // Calendar.
  "today-pane-panel": "calendar",
  calendarTabPanel: "calendar",
  "calendar-popupset": "calendar",
  calControlBarMenuPopup: "calendar",

  // Chat.
  chatTabPanel: "chat",
  buddyListContextMenu: "chat",
  chatConversationContextMenu: "chat",
  "chat-toolbar-context-menu": "chat",
  chatContextMenu: "chat",
  participantListContextMenu: "chat",

  // Message composition.
  msgcomposeWindow: "message-compose",

  // Anything to do with the 3-pane tab or message window.
  folderPaneHeaderBar: "message-display",
  folderPaneGetMessagesContext: "message-display",
  folderPaneMoreContext: "message-display",
  folderPaneModeContext: "message-display",
  folderPaneContext: "message-display",
  threadPaneHeaderBar: "message-display",
  threadPaneDisplayContext: "message-display",
  aboutPagesContext: "message-display",
  browserContext: "message-display",
  mailContext: "message-display",
  singleMessage: "message-display",
  emailAddressPopup: "message-display",
  copyPopup: "message-display",
  messageIdContext: "message-display",
  attachmentItemContext: "message-display",
  attachmentListContext: "message-display",
  "attachment-toolbar-context-menu": "message-display",
  copyUrlPopup: "message-display",
  simpleCopyPopup: "message-display",
  newsgroupPopup: "message-display",
  remoteContentOptions: "message-display",
  phishingOptions: "message-display",

  // The toolbox, menu bar, tab bar, spaces toolbar and status bar.
  "navigation-toolbox": "toolbox",
  "mail-toolbox": "toolbox",
  "quick-filter-bar": "toolbox",
  "appMenu-popup": "toolbox",
  unifiedToolbarMenu: "toolbox",
  "toolbar-context-menu": "toolbox",
  tabContextMenu: "toolbox",
  spacesToolbar: "toolbox",
  spacesContextMenu: "toolbox",
  settingsContextMenu: "toolbox",
  spacesToolbarContextMenu: "toolbox",
  spacesToolbarAddonsPopup: "toolbox",
  spacesToolbarCustomizationPanel: "toolbox",
  "status-bar": "toolbox",
  customizationTargetMenu: "toolbox",
  customizationPaletteMenu: "toolbox",
  toolbarMoveToPopup: "toolbox",
  toolbarFolderLocationPopup: "toolbox",
  toolbarTagPopup: "toolbox",
  toolbarMarkPopup: "toolbox",
  toolbarViewPickerPopup: "toolbox",
  messageHistoryPopup: "toolbox",
  toolbarGetMessagesContext: "toolbox",
  unifiedToolbarCreateBook: "toolbox",
};

const KNOWN_ADDONS = [];

function telemetryId(widgetId, obscureAddons = true) {
  // Add-on IDs need to be obscured.
  function addonId(id) {
    if (!obscureAddons) {
      return id;
    }

    let pos = KNOWN_ADDONS.indexOf(id);
    if (pos < 0) {
      pos = KNOWN_ADDONS.length;
      KNOWN_ADDONS.push(id);
    }
    return `addon${pos}`;
  }

  const actionIdSuffix = [
    "-browserAction-toolbarbutton",
    "-messageDisplayAction-toolbarbutton",
    "-composeAction-toolbarbutton",
  ].find(suffix => widgetId.endsWith(suffix));

  if (actionIdSuffix) {
    widgetId = addonId(
      widgetId.substring(0, widgetId.length - actionIdSuffix.length)
    );
  } else if (widgetId.startsWith("ext-keyset-id-")) {
    // Webextension command shortcuts don't have an id on their key element so
    // we see the id from the keyset that contains them.
    widgetId = addonId(widgetId.substring("ext-keyset-id-".length));
  } else if (widgetId.includes("-menuitem--")) {
    widgetId = addonId(widgetId.substring(0, widgetId.indexOf("-menuitem--")));
  } else if (/^qfb-tag-(?!\$label\d$)/.test(widgetId)) {
    // Only record the full ID of buttons for tags named label0...label9.
    // The data for other tags are of no use to us and could contain personal
    // information, so hide it behind this generic ID.
    widgetId = "qfb-tag-";
  }
  // Collapse these IDs as each element is given a unique ID.
  widgetId = widgetId.replace(/^folderPanelView\d+/, "folderPanelView");
  // Strip UUIDs in widget IDs.
  widgetId = widgetId.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ""
  );
  // Strip mail URLs as they could contain personal information.
  widgetId = widgetId.replace(/(imap|mailbox):\/\/.*/, "");
  return widgetId.replace(/_/g, "-");
}

export const MailUsageTelemetry = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsISupportsWeakReference",
  ]),

  _inited: false,

  init() {
    // Make sure to catch new chrome windows and subsession splits.
    Services.obs.addObserver(this, DOMWINDOW_OPENED_TOPIC, true);

    // Attach the handlers to the existing Windows.
    for (const winType of WINDOW_TYPES) {
      for (const win of Services.wm.getEnumerator(winType)) {
        this._registerWindow(win);
      }
    }

    this._inited = true;
  },

  uninit() {
    if (!this._inited) {
      return;
    }
    Services.obs.removeObserver(this, DOMWINDOW_OPENED_TOPIC);
  },

  observe(subject, topic, data) {
    switch (topic) {
      case DOMWINDOW_OPENED_TOPIC:
        this._onWindowOpen(subject);
        break;
    }
  },

  handleEvent(event) {
    switch (event.type) {
      case "unload":
        this._unregisterWindow(event.target);
        break;
    }
  },

  _getWidgetID(node) {
    // We want to find a sensible ID for this element.
    if (!node) {
      return null;
    }

    // Use this where more than one node of a type could be created (similar
    // to where a CSS class selector would be used instead of an ID selector).
    if (node.dataset.telemetryId) {
      return node.dataset.telemetryId;
    }

    if (node.id) {
      return node.id;
    }

    // One of these will at least let us know what the widget is for.
    const possibleAttributes = [
      "preference",
      "command",
      "observes",
      "data-l10n-id",
    ];

    // The key attribute on key elements is the actual key to listen for.
    if (node.localName != "key") {
      possibleAttributes.unshift("key");
    }

    for (const idAttribute of possibleAttributes) {
      if (node.hasAttribute(idAttribute)) {
        return node.getAttribute(idAttribute);
      }
    }

    return this._getWidgetID(node.parentElement);
  },

  _getBrowserWidgetContainer(node) {
    // Find the container holding this element.
    for (const containerId of Object.keys(MESSENGER_UI_CONTAINER_IDS)) {
      const container = node.ownerDocument.getElementById(containerId);
      if (container && container.contains(node)) {
        return MESSENGER_UI_CONTAINER_IDS[containerId];
      }
    }
    return null;
  },

  _getWidgetContainer(node) {
    if (node.localName == "key") {
      return "keyboard";
    }

    const { URL } = node.ownerDocument;
    if (WINDOW_URLS.includes(URL)) {
      return this._getBrowserWidgetContainer(node);
    }
    return null;
  },

  lastClickTarget: null,

  _recordCommand(event) {
    const types = [event.type];
    let sourceEvent = event;
    while (sourceEvent.sourceEvent) {
      sourceEvent = sourceEvent.sourceEvent;
      types.push(sourceEvent.type);
    }

    const lastTarget = this.lastClickTarget?.get();
    if (
      lastTarget &&
      sourceEvent.type == "command" &&
      sourceEvent.target.contains(lastTarget)
    ) {
      // Ignore a command event triggered by a click.
      this.lastClickTarget = null;
      return;
    }

    this.lastClickTarget = null;

    if (sourceEvent.type == "click") {
      // Only care about main button clicks.
      if (sourceEvent.button != 0) {
        return;
      }

      // This click may trigger a command event so retain the target to be able
      // to dedupe that event.
      this.lastClickTarget = Cu.getWeakReference(sourceEvent.target);
    }

    // We should never see events from web content as they are fired in a
    // content process, but let's be safe.
    const url = sourceEvent.target.ownerDocument.documentURIObject;
    if (!url.schemeIs("chrome") && !url.schemeIs("about")) {
      return;
    }

    // This is what events targeted at content will actually look like.
    if (
      sourceEvent.target.localName == "browser" ||
      sourceEvent.target.localName == "editor"
    ) {
      return;
    }

    // Find the actual element we're interested in.
    let node = sourceEvent.target;
    while (!UI_TARGET_ELEMENTS.includes(node.localName)) {
      node = node.parentNode;
      if (!node) {
        // A click on a space or label or something we're not interested in.
        return;
      }
    }

    const item = this._getWidgetID(node);
    const source = this._getWidgetContainer(node);

    if (item && source) {
      const scalar = `tb.ui.interaction.${source.replace("-", "_")}`;
      Services.telemetry.keyedScalarAdd(scalar, telemetryId(item), 1);
    }
  },

  /**
   * Listens for UI interactions in the window.
   */
  _addUsageListeners(win) {
    // Listen for command events from the UI.
    win.addEventListener("command", event => this._recordCommand(event), true);
    win.addEventListener("click", event => this._recordCommand(event), true);
  },

  /**
   * Adds listeners to a single chrome window.
   */
  _registerWindow(win) {
    this._addUsageListeners(win);

    win.addEventListener("unload", this);
  },

  /**
   * Removes listeners from a single chrome window.
   */
  _unregisterWindow(win) {
    win.removeEventListener("unload", this);
  },

  /**
   * Tracks the window count and registers the listeners for the tab count.
   *
   * @param{Object} win The window object.
   */
  _onWindowOpen(win) {
    // Make sure to have a |nsIDOMWindow|.
    if (!(win instanceof Ci.nsIDOMWindow)) {
      return;
    }

    const onLoad = () => {
      win.removeEventListener("load", onLoad);

      // Ignore non browser windows.
      if (
        !WINDOW_TYPES.includes(
          win.document.documentElement.getAttribute("windowtype")
        )
      ) {
        return;
      }

      this._registerWindow(win);
    };
    win.addEventListener("load", onLoad);
  },
};
