/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals AppConstants CanDetachAttachments CharsetMenu
  currentAttachments CustomizableUI ExtensionParent ExtensionSupport FullScreen
  getIconForAttachment goUpdateAttachmentCommands initAddonPrefsMenu
  initAppMenuPopup InitAppmenuViewBodyMenu InitAppMessageMenu
  InitAppmenuViewMessagesMenu InitAppFolderViewsMenu InitAppViewSortByMenu
  InitMessageTags InitRecentlyClosedTabsPopup InitViewFolderViewsMenu
  InitViewHeadersMenu InitViewLayoutStyleMenu MozXULElement msgWindow
  onViewToolbarsPopupShowing RefreshCustomViewsPopup RefreshTagsPopup
  RefreshViewPopup SanitizeAttachmentDisplayName Services ShortcutUtils
  UpdateCharsetMenu updateEditUIVisibility UpdateFullZoomMenu XPCOMUtils */

ChromeUtils.defineModuleGetter(this, "AppMenuNotifications",
                               "resource://gre/modules/AppMenuNotifications.jsm");

ChromeUtils.defineModuleGetter(this, "PanelMultiView",
                               "resource:///modules/PanelMultiView.jsm");

// Needed for character encoding subviews.
XPCOMUtils.defineLazyGetter(this, "gBundle", function() {
  const kUrl = "chrome://global/locale/charsetMenu.properties";
  return Services.strings.createBundle(kUrl);
});

/**
 * Maintains the state and dispatches events for the main menu panel.
 */
const PanelUI = {
  /** Panel events that we listen for. **/
  get kEvents() {
    return ["popupshowing", "popupshown", "popuphiding", "popuphidden",
      "ViewShowing"];
  },
  /**
   * Used for lazily getting and memoizing elements from the document. Lazy
   * getters are set in init, and memoizing happens after the first retrieval.
   */
  get kElements() {
    return {
      mainView: "appMenu-mainView",
      multiView: "appMenu-multiView",
      menuButtonMail: "button-appmenu",
      menuButtonChat: "button-chat-appmenu",
      panel: "appMenu-popup",
      navbar: "mail-bar3",
      // TODO appmenu - do we need all of these?
      // notificationPanel: "appMenu-notification-popup",
      // addonNotificationContainer: "appMenu-addon-banners",
      overflowFixedList: "widget-overflow-fixed-list",
      // overflowPanel: "widget-overflow",
    };
  },

  /**
   * Used for the View / Text Encoding view.
   * Not ideal: copied from: mozilla-central/toolkit/modules/CharsetMenu.jsm
   * This set contains encodings that are in the Encoding Standard, except:
   *  - XSS-dangerous encodings (except ISO-2022-JP which is assumed to be
   *    too common not to be included).
   *  - x-user-defined, which practically never makes sense as an end-user-chosen
   *    override.
   *  - Encodings that IE11 doesn't have in its correspoding menu.
   */
  kEncodings: new Set([
    // Globally relevant
    "UTF-8",
    "windows-1252",
    // Arabic
    "windows-1256",
    "ISO-8859-6",
    // Baltic
    "windows-1257",
    "ISO-8859-4",
    // "ISO-8859-13", // Hidden since not in menu in IE11
    // Central European
    "windows-1250",
    "ISO-8859-2",
    // Chinese, Simplified
    "GBK",
    // Chinese, Traditional
    "Big5",
    // Cyrillic
    "windows-1251",
    "ISO-8859-5",
    "KOI8-R",
    "KOI8-U",
    "IBM866", // Not in menu in Chromium. Maybe drop this?
    // "x-mac-cyrillic", // Not in menu in IE11 or Chromium.
    // Greek
    "windows-1253",
    "ISO-8859-7",
    // Hebrew
    "windows-1255",
    "ISO-8859-8",
    // Japanese
    "Shift_JIS",
    "EUC-JP",
    "ISO-2022-JP",
    // Korean
    "EUC-KR",
    // Thai
    "windows-874",
    // Turkish
    "windows-1254",
    // Vietnamese
    "windows-1258",
    // Hiding rare European encodings that aren't in the menu in IE11 and would
    // make the menu messy by sorting all over the place
    // "ISO-8859-3",
    // "ISO-8859-10",
    // "ISO-8859-14",
    // "ISO-8859-15",
    // "ISO-8859-16",
    // "macintosh"
  ]),

  // Used for the View / Text Encoding view.
  // Not ideal: copied from: mozilla-central/toolkit/modules/CharsetMenu.jsm
  // Always at the start of the text encodings view, in this order, followed by
  // a separator.
  kPinnedEncodings: [
    "UTF-8",
    "windows-1252",
  ],

  _initialized: false,
  _notifications: null,

  init() {
    this._initElements();

    [this.menuButtonMail, this.menuButtonChat].forEach(button => {
      // There's no chat button in the messageWindow.xul context.
      if (button) {
        button.addEventListener("mousedown", this);
        button.addEventListener("keypress", this);
      }
    });

    this.menuButton = this.menuButtonMail;

    Services.obs.addObserver(this, "fullscreen-nav-toolbox");
    Services.obs.addObserver(this, "appMenu-notifications");

    XPCOMUtils.defineLazyPreferenceGetter(this, "autoHideToolbarInFullScreen",
      "browser.fullscreen.autohide", false, (pref, previousValue, newValue) => {
        // On OSX, or with autohide preffed off, MozDOMFullscreen is the only
        // event we care about, since fullscreen should behave just like non
        // fullscreen. Otherwise, we don't want to listen to these because
        // we'd just be spamming ourselves with both of them whenever a user
        // opened a video.
        if (newValue) {
          window.removeEventListener("MozDOMFullscreen:Entered", this);
          window.removeEventListener("MozDOMFullscreen:Exited", this);
          window.addEventListener("fullscreen", this);
        } else {
          window.addEventListener("MozDOMFullscreen:Entered", this);
          window.addEventListener("MozDOMFullscreen:Exited", this);
          window.removeEventListener("fullscreen", this);
        }

        this._updateNotifications(false);
      }, autoHidePref => autoHidePref && Services.appinfo.OS !== "Darwin");

    if (this.autoHideToolbarInFullScreen) {
      window.addEventListener("fullscreen", this);
    } else {
      window.addEventListener("MozDOMFullscreen:Entered", this);
      window.addEventListener("MozDOMFullscreen:Exited", this);
    }

    window.addEventListener("activate", this);
    CustomizableUI.addListener(this);

    // We are not currently using the notificationPanel.
    // for (let event of this.kEvents) {
    //   this.notificationPanel.addEventListener(event, this);
    // }

    // We do this sync on init because in order to have the overflow button show up
    // we need to know whether anything is in the permanent panel area.
    this.overflowFixedList.hidden = false;
    // Also unhide the separator. We use CSS to hide/show it based on the panel's content.
    this.overflowFixedList.previousElementSibling.hidden = false;
    CustomizableUI.registerMenuPanel(this.overflowFixedList, CustomizableUI.AREA_FIXED_OVERFLOW_PANEL);
    this.updateOverflowStatus();

    Services.obs.notifyObservers(null, "appMenu-notifications-request", "refresh");

    this._initialized = true;
  },

  _initElements() {
    for (let [k, v] of Object.entries(this.kElements)) {
      // Need to do fresh let-bindings per iteration
      let getKey = k;
      let id = v;
      this.__defineGetter__(getKey, function() {
        delete this[getKey];
        // eslint-disable-next-line consistent-return
        return this[getKey] = document.getElementById(id);
      });
    }
  },

  _eventListenersAdded: false,
  _ensureEventListenersAdded() {
    if (this._eventListenersAdded)
      return;
    this._addEventListeners();
  },

  _addEventListeners() {
    for (let event of this.kEvents) {
      this.panel.addEventListener(event, this);
    }
    this._eventListenersAdded = true;
  },

  _removeEventListeners() {
    for (let event of this.kEvents) {
      this.panel.removeEventListener(event, this);
    }
    this._eventListenersAdded = false;
  },

  uninit() {
    this._removeEventListeners();

    // We are not currently using the notificationPanel.
    // for (let event of this.kEvents) {
    //   this.notificationPanel.removeEventListener(event, this);
    // }

    Services.obs.removeObserver(this, "fullscreen-nav-toolbox");
    Services.obs.removeObserver(this, "appMenu-notifications");

    window.removeEventListener("MozDOMFullscreen:Entered", this);
    window.removeEventListener("MozDOMFullscreen:Exited", this);
    window.removeEventListener("fullscreen", this);
    window.removeEventListener("activate", this);

    [this.menuButtonMail, this.menuButtonChat].forEach(button => {
      // There's no chat button in the messageWindow.xul context.
      if (button) {
        button.removeEventListener("mousedown", this);
        button.removeEventListener("keypress", this);
      }
    });

    CustomizableUI.removeListener(this);
  },

  /**
   * Opens the menu panel if it's closed, or closes it if it's open.
   *
   * @param event the event that triggers the toggle.
   */
  toggle(event) {
    // Don't show the panel if the window is in customization mode,
    // since this button doubles as an exit path for the user in this case.
    if (document.documentElement.hasAttribute("customizing")) {
      return;
    }

    // Since we have several menu buttons, make sure the current one is used.
    // This works for now, but in the long run, if we're showing badges etc.
    // then the current menuButton needs to be set when the app's view/tab
    // changes, not just when the menu is toggled.
    this.menuButton = event.target;

    this._ensureEventListenersAdded();
    if (this.panel.state == "open") {
      this.hide();
    } else if (this.panel.state == "closed") {
      this.show(event);
    }
  },

  /**
   * Opens the menu panel. If the event target has a child with the
   * toolbarbutton-icon attribute, the panel will be anchored on that child.
   * Otherwise, the panel is anchored on the event target itself.
   *
   * @param aEvent the event (if any) that triggers showing the menu.
   */
  show(aEvent) {
    this._ensureShortcutsShown();
    (async () => {
      await this.ensureReady();

      if (this.panel.state == "open" ||
          document.documentElement.hasAttribute("customizing")) {
        return;
      }

      let domEvent = null;
      if (aEvent && aEvent.type != "command") {
        domEvent = aEvent;
      }

      let anchor = this._getPanelAnchor(this.menuButton);
      await PanelMultiView.openPopup(this.panel, anchor, {
        triggerEvent: domEvent,
      });
    })().catch(Cu.reportError);
  },

  /**
   * If the menu panel is being shown, hide it.
   */
  hide() {
    if (document.documentElement.hasAttribute("customizing")) {
      return;
    }

    PanelMultiView.hidePopup(this.panel);
  },

  observe(subject, topic, status) {
    switch (topic) {
      case "fullscreen-nav-toolbox":
        if (this._notifications) {
          this._updateNotifications(false);
        }
        break;
      case "appMenu-notifications":
        // Don't initialize twice.
        if (status == "init" && this._notifications) {
          break;
        }
        this._notifications = AppMenuNotifications.notifications;
        this._updateNotifications(true);
        break;
    }
  },

  handleEvent(event) {
    // Ignore context menus and menu button menus showing and hiding:
    if (event.type.startsWith("popup") &&
        event.target != this.panel) {
      return;
    }
    switch (event.type) {
      case "popupshowing":
        initAppMenuPopup();
        // Fall through
      case "popupshown":
        if (event.type == "popupshown") {
          CustomizableUI.addPanelCloseListeners(this.panel);
        }
        // Fall through
      case "popuphiding":
        // Fall through
      case "popuphidden":
        this._updateNotifications();
        this._updatePanelButton(event.target);
        if (event.type == "popuphidden") {
          CustomizableUI.removePanelCloseListeners(this.panel);
        }
        break;
      case "mousedown":
        if (event.button == 0) {
          this.toggle(event);
        }
        break;
      case "keypress":
        if (event.key == " " || event.key == "Enter") {
          this.toggle(event);
          event.stopPropagation();
        }
        break;
      case "MozDOMFullscreen:Entered":
      case "MozDOMFullscreen:Exited":
      case "fullscreen":
      case "activate":
        this._updateNotifications();
        break;
      case "ViewShowing":
        PanelUI._handleViewShowingEvent(event);
        break;
    }
  },

  /**
   * When a ViewShowing event happens when a <panelview> element is shown,
   * do any required set up for that particular view.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _handleViewShowingEvent(event) {
    // Typically event.target for "ViewShowing" is a <panelview> element.
    PanelUI._ensureShortcutsShown(event.target);

    switch (event.target.id) {
      case "appMenu-attachmentsView":
        this._onAttachmentsViewShow(event);
        break;
      case "appMenu-attachmentView":
        this._onAttachmentViewShow(event);
        break;
      case "appMenu-foldersView":
        this._onFoldersViewShow(event);
        break;
      case "appMenu-addonsView":
        initAddonPrefsMenu(event.target.querySelector(".panel-subview-body"),
          "toolbarbutton",
          "subviewbutton subviewbutton-iconic",
          "subviewbutton subviewbutton-iconic");
        break;
      case "appMenu-preferencesView":
        onViewToolbarsPopupShowing(event,
          "mail-toolbox",
          document.getElementById("appmenu_quickFilterBar"),
          "toolbarbutton",
          "subviewbutton subviewbutton-iconic");
        break;
      case "appMenu-preferencesLayoutView":
        PanelUI._onPreferencesLayoutViewShow(event);
        break;
      // View
      case "appMenu-viewSortByView":
        InitAppViewSortByMenu();
        break;
      case "appMenu-viewMessagesView":
        RefreshViewPopup(event.target);
        break;
      case "appMenu-viewMessagesTagsView":
        PanelUI._refreshDynamicView(event, RefreshTagsPopup);
        break;
      case "appMenu-viewMessagesCustomViewsView":
        PanelUI._refreshDynamicView(event, RefreshCustomViewsPopup);
        break;
      case "appMenu-viewThreadsView":
        InitAppmenuViewMessagesMenu();
        break;
      case "appMenu-viewHeadersView":
        InitViewHeadersMenu();
        break;
      case "appMenu-viewMessageBodyAsView":
        InitAppmenuViewBodyMenu();
        break;
      case "appMenu-viewFeedsView":
        InitAppmenuViewBodyMenu();
        break;
      case "appMenu-viewZoomView":
        UpdateFullZoomMenu();
        break;
      case "appMenu-viewTextEncodingView":
        this._onTextEncodingViewShow(event);
        break;
      case "appMenu-viewTextEncodingDetectorsView":
        this._onTextEncodingDetectorsViewShow(event);
        break;
      // Go
      case "appMenu-goRecentlyClosedTabsView":
        PanelUI._refreshDynamicView(event, InitRecentlyClosedTabsPopup);
        break;
      // Message
      case "appMenu-messageView":
        InitAppMessageMenu();
        break;
      case "appMenu-messageTagView":
        PanelUI._refreshDynamicView(event, InitMessageTags);
        break;
    }
  },

  /**
   * Refreshes some views that are dynamically populated. Typically called by
   * event listeners responding to a ViewShowing event. It calls a given refresh
   * function (that populates the view), passing appmenu-specific arguments.
   *
   * @param {ViewShowingEvent} event    ViewShowing event.
   * @param {Function} refreshFunction  Function that refreshes a particular view.
   */
  _refreshDynamicView(event, refreshFunction) {
    refreshFunction(event.target.querySelector(".panel-subview-body"),
      "toolbarbutton",
      "subviewbutton subviewbutton-iconic",
      "toolbarseparator");
  },

  get isReady() {
    return !!this._isReady;
  },

  get isNotificationPanelOpen() {
    let panelState = this.notificationPanel.state;

    return panelState == "showing" || panelState == "open";
  },

  /**
   * Registering the menu panel is done lazily for performance reasons. This
   * method is exposed so that CustomizationMode can force panel-readyness in the
   * event that customization mode is started before the panel has been opened
   * by the user.
   *
   * @param aCustomizing (optional) set to true if this was called while entering
   *        customization mode. If that's the case, we trust that customization
   *        mode will handle calling beginBatchUpdate and endBatchUpdate.
   *
   * @return a Promise that resolves once the panel is ready to roll.
   */
  async ensureReady() {
    if (this._isReady) {
      return;
    }

    await window.delayedStartupPromise;
    this._ensureEventListenersAdded();
    this.panel.hidden = false;
    this._isReady = true;
  },

  /**
   * Shows a subview in the panel with a given ID.
   *
   * @param aViewId the ID of the subview to show.
   * @param aAnchor the element that spawned the subview.
   * @param aEvent the event triggering the view showing.
   */
  async showSubView(aViewId, aAnchor, aEvent) {
    let domEvent = null;
    if (aEvent) {
      if (aEvent.type == "mousedown" && aEvent.button != 0) {
        return;
      }
      if (aEvent.type == "keypress" && aEvent.key != " " &&
          aEvent.key != "Enter") {
        return;
      }
      if (aEvent.type == "command" && aEvent.inputSource != null) {
        // Synthesize a new DOM mouse event to pass on the inputSource.
        domEvent = document.createEvent("MouseEvent");
        domEvent.initNSMouseEvent("click", true, true, null, 0, aEvent.screenX, aEvent.screenY,
                                  0, 0, false, false, false, false, 0, aEvent.target, 0, aEvent.inputSource);
      } else if (aEvent.mozInputSource != null || aEvent.type == "keypress") {
        domEvent = aEvent;
      }
    }

    this._ensureEventListenersAdded();
    let viewNode = document.getElementById(aViewId);
    if (!viewNode) {
      Cu.reportError("Could not show panel subview with id: " + aViewId);
      return;
    }

    if (!aAnchor) {
      Cu.reportError("Expected an anchor when opening subview with id: " + aViewId);
      return;
    }

    let container = aAnchor.closest("panelmultiview");
    if (container) {
      container.showSubView(aViewId, aAnchor);
    } else if (!aAnchor.open) {
      aAnchor.open = true;

      let tempPanel = document.createXULElement("panel");
      tempPanel.setAttribute("type", "arrow");
      tempPanel.setAttribute("id", "customizationui-widget-panel");
      tempPanel.setAttribute("class", "cui-widget-panel");
      tempPanel.setAttribute("viewId", aViewId);
      if (aAnchor.getAttribute("tabspecific")) {
        tempPanel.setAttribute("tabspecific", true);
      }
      if (this._disableAnimations) {
        tempPanel.setAttribute("animate", "false");
      }
      tempPanel.setAttribute("context", "");
      tempPanel.setAttribute("photon", true);
      document.getElementById(CustomizableUI.AREA_NAVBAR).appendChild(tempPanel);
      // If the view has a footer, set a convenience class on the panel.
      tempPanel.classList.toggle("cui-widget-panelWithFooter",
                                 viewNode.querySelector(".panel-subview-footer"));

      let multiView = document.createXULElement("panelmultiview");
      multiView.setAttribute("id", "customizationui-widget-multiview");
      multiView.setAttribute("viewCacheId", "appMenu-viewCache");
      multiView.setAttribute("mainViewId", viewNode.id);
      tempPanel.appendChild(multiView);
      viewNode.classList.add("cui-widget-panelview");

      let viewShown = false;
      let panelRemover = () => {
        viewNode.classList.remove("cui-widget-panelview");
        if (viewShown) {
          CustomizableUI.removePanelCloseListeners(tempPanel);
          tempPanel.removeEventListener("popuphidden", panelRemover);
        }
        aAnchor.open = false;

        PanelMultiView.removePopup(tempPanel);
      };

      if (aAnchor.parentNode.id == "PersonalToolbar") {
        tempPanel.classList.add("bookmarks-toolbar");
      }

      let anchor = this._getPanelAnchor(aAnchor);

      if (aAnchor != anchor && aAnchor.id) {
        anchor.setAttribute("consumeanchor", aAnchor.id);
      }

      try {
        viewShown = await PanelMultiView.openPopup(tempPanel, anchor, {
          position: "bottomcenter topright",
          triggerEvent: domEvent,
        });
      } catch (ex) {
        Cu.reportError(ex);
      }

      if (viewShown) {
        CustomizableUI.addPanelCloseListeners(tempPanel);
        tempPanel.addEventListener("popuphidden", panelRemover);
      } else {
        panelRemover();
      }
    }
  },

  /**
   * NB: The enable- and disableSingleSubviewPanelAnimations methods only
   * affect the hiding/showing animations of single-subview panels (tempPanel
   * in the showSubView method).
   */
  disableSingleSubviewPanelAnimations() {
    this._disableAnimations = true;
  },

  enableSingleSubviewPanelAnimations() {
    this._disableAnimations = false;
  },

  updateOverflowStatus() {
    let hasKids = this.overflowFixedList.hasChildNodes();
    if (hasKids && !this.navbar.hasAttribute("nonemptyoverflow")) {
      this.navbar.setAttribute("nonemptyoverflow", "true");
      this.overflowPanel.setAttribute("hasfixeditems", "true");
    } else if (!hasKids && this.navbar.hasAttribute("nonemptyoverflow")) {
      PanelMultiView.hidePopup(this.overflowPanel);
      this.overflowPanel.removeAttribute("hasfixeditems");
      this.navbar.removeAttribute("nonemptyoverflow");
    }
  },

  onWidgetAfterDOMChange(aNode, aNextNode, aContainer, aWasRemoval) {
    if (aContainer == this.overflowFixedList) {
      this.updateOverflowStatus();
    }
  },

  onAreaReset(aArea, aContainer) {
    if (aContainer == this.overflowFixedList) {
      this.updateOverflowStatus();
    }
  },

  /**
   * Sets the anchor node into the open or closed state, depending
   * on the state of the panel.
   */
  _updatePanelButton() {
    this.menuButton.open = this.panel.state == "open" ||
                           this.panel.state == "showing";
  },

  /**
   * Event handler for showing the Preferences/Layout view. Removes "checked"
   * from all layout menu items and then checks the current layout menu item.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _onPreferencesLayoutViewShow(event) {
    event.target.querySelectorAll("[name='viewlayoutgroup']")
      .forEach(item => item.removeAttribute("checked"));

    InitViewLayoutStyleMenu(event, true);
  },

  /**
   * Refreshes and populates the attachments view when it is shown, adding attachment items, etc.
   * See similar function FillAttachmentListPopup.
   *
   * @param {ViewShowingEvent} event  The "ViewShowing" event.
   */
  _onAttachmentsViewShow(event) {
    const viewBody = event.target.querySelector(".panel-subview-body");

    // First clear out the old attachment items. They are above the separator.
    while (viewBody.firstChild.localName == "toolbarbutton") {
      viewBody.firstChild.remove();
    }

    for (const [attachmentIndex, attachment] of currentAttachments.entries()) {
      PanelUI._addAttachmentToAttachmentsView(viewBody, attachment, attachmentIndex + 1);
    }

    goUpdateAttachmentCommands();
  },

  /**
   * Add an attachment button to the attachments view panel.
   * See the similar function addAttachmentToPopup.
   *
   * @param {Element} viewBody         Parent element that will receive the attachment button.
   * @param {Object} attachment        Attachment data.
   * @param {Number} attachmentIndex   1-based index of the attachment.
   */
  _addAttachmentToAttachmentsView(viewBody, attachment, attachmentIndex) {
    if (!viewBody) {
      return;
    }

    const item = document.createXULElement("toolbarbutton");
    if (!item) {
      return;
    }

    // Insert the item just before the separator.
    item.setAttribute("class", "subviewbutton subviewbutton-iconic subviewbutton-nav");
    item.setAttribute("image", getIconForAttachment(attachment));
    item.setAttribute("closemenu", "none");

    // Find the separator index.
    let separatorIndex = 0;
    while (viewBody.childNodes[separatorIndex].localName != "toolbarseparator") {
      separatorIndex += 1;
    }

    // The accesskeys for the attachments in the menu start with 1 (not 0).
    const displayName = SanitizeAttachmentDisplayName(attachment);
    const label = document.getElementById("bundle_messenger")
                          .getFormattedString("attachmentDisplayNameFormat",
                                              [attachmentIndex, displayName]);
    item.setAttribute("crop", "center");
    item.setAttribute("label", label);
    item.setAttribute("accesskey", attachmentIndex % 10);

    // Each attachment gets its own subview with options for opening, saving, deleting, etc.
    item.setAttribute("oncommand", "PanelUI.showSubView('appMenu-attachmentView', this)");

    // Add the attachment data to the item so that when the item is clicked and the subview is
    // shown, we can access the attachment data from the ViewShowing event's explicitOriginalTarget.
    item.attachment = attachment;

    // TODO appmenu - Test that these classes still work as intended.
    if (attachment.isExternalAttachment) {
      if (!attachment.hasFile) {
        item.classList.add("notfound");
      } else {
        // TODO appmenu - Is this still needed?  It's from the old menupopup code.
        //
        // The text-link class must be added to the <label> and have a <menu> hover rule.
        // Adding to <menu> makes hover overflow the underline to the popup items.
        // const label = item.firstChild.nextSibling;
        // label.classList.add("text-link");
      }
    }

    if (attachment.isDeleted) {
      item.classList.add("notfound");
    }

    if (!attachment.hasFile) {
      item.setAttribute("disabled", "true");
    }

    viewBody.insertBefore(item, viewBody.childNodes[separatorIndex]);
  },

  /**
   * Refreshes and populates the single attachment view (open, save, etc.) when it is shown.
   * See similar function addAttachmentToPopup.
   *
   * @param {ViewShowingEvent} event  The "ViewShowing" event.
   */
  _onAttachmentViewShow(event) {
    const attachment = event.explicitOriginalTarget.attachment;
    const bundle = document.getElementById("bundle_messenger");

    const detached = attachment.isExternalAttachment;
    const deleted  = !attachment.hasFile;
    const canDetach = CanDetachAttachments() && !deleted && !detached;

    const attachmentView = document.getElementById("appMenu-attachmentView");
    attachmentView.setAttribute("title", attachment.name);

    const viewBody = attachmentView.querySelector(".panel-subview-body");

    // Clear out old view items.
    while (viewBody.firstChild) {
      viewBody.firstChild.remove();
    }

    // Create the "open" item.
    const openButton = document.createXULElement("toolbarbutton");
    openButton.attachment = attachment;
    openButton.setAttribute("class", "subviewbutton subviewbutton-iconic");
    openButton.setAttribute("oncommand", "this.attachment.open();");
    openButton.setAttribute("label", bundle.getString("openLabel"));
    openButton.setAttribute("accesskey", bundle.getString("openLabelAccesskey"));
    if (deleted) {
      openButton.setAttribute("disabled", "true");
    }
    viewBody.appendChild(openButton);

    // Create the "save" item.
    const saveButton = document.createXULElement("toolbarbutton");
    saveButton.attachment = attachment;
    saveButton.setAttribute("class", "subviewbutton subviewbutton-iconic");
    saveButton.setAttribute("oncommand", "this.attachment.save();");
    saveButton.setAttribute("label", bundle.getString("saveLabel"));
    saveButton.setAttribute("accesskey", bundle.getString("saveLabelAccesskey"));
    if (deleted) {
      saveButton.setAttribute("disabled", "true");
    }
    viewBody.appendChild(saveButton);

    // Create the "detach" item.
    const detachButton = document.createXULElement("toolbarbutton");
    detachButton.attachment = attachment;
    detachButton.setAttribute("class", "subviewbutton subviewbutton-iconic");
    detachButton.setAttribute("oncommand", "this.attachment.detach(true);");
    detachButton.setAttribute("label", bundle.getString("detachLabel"));
    detachButton.setAttribute("accesskey", bundle.getString("detachLabelAccesskey"));
    if (!canDetach) {
      detachButton.setAttribute("disabled", "true");
    }
    viewBody.appendChild(detachButton);

    // Create the "delete" item.
    const deleteButton = document.createXULElement("toolbarbutton");
    deleteButton.attachment = attachment;
    deleteButton.setAttribute("class", "subviewbutton subviewbutton-iconic");
    deleteButton.setAttribute("oncommand", "this.attachment.detach(false);");
    deleteButton.setAttribute("label", bundle.getString("deleteLabel"));
    deleteButton.setAttribute("accesskey", bundle.getString("deleteLabelAccesskey"));
    if (!canDetach) {
      deleteButton.setAttribute("disabled", "true");
    }
    viewBody.appendChild(deleteButton);

    // Create the "open containing folder" item, for existing detached only.
    if (attachment.isFileAttachment) {
      const separator = document.createXULElement("toolbarseparator");
      viewBody.appendChild(separator);
      const openFolderButton = document.createXULElement("toolbarbutton");
      openFolderButton.attachment = attachment;
      openFolderButton.setAttribute("class", "subviewbutton subviewbutton-iconic");
      openFolderButton.setAttribute("oncommand", "this.attachment.openFolder();");
      openFolderButton.setAttribute("label", bundle.getString("openFolderLabel"));
      openFolderButton.setAttribute("accesskey", bundle.getString("openFolderLabelAccesskey"));
      if (deleted) {
        openFolderButton.setAttribute("disabled", "true");
      }
      viewBody.appendChild(openFolderButton);
    }
  },

  /**
   * Event listener for showing the Folders view.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _onFoldersViewShow(event) {
    event.target.querySelectorAll('[name="viewmessages"]')
      .forEach(item => item.removeAttribute("checked"));

    InitAppFolderViewsMenu();
    InitViewFolderViewsMenu(event);
  },

  /**
   * Create a toolbarbutton DOM node for a text encoding menu item.
   * Similar to the CharsetMenu.build function.
   *
   * @param {Document} doc     The document where the node will be created.
   * @param {Object} nodeInfo  Contains attributes to set on the node.
   * @returns {Element}        The DOM node.
   */
  _createTextEncodingNode(doc, nodeInfo) {
    const node = doc.createXULElement("toolbarbutton");
    node.setAttribute("type", "radio");
    node.setAttribute("name", nodeInfo.name + "Group");
    node.setAttribute(nodeInfo.name, nodeInfo.value);
    node.setAttribute("label", nodeInfo.label);
    if (nodeInfo.accesskey) {
      node.setAttribute("accesskey", nodeInfo.accesskey);
    }
    node.setAttribute("class", "subviewbutton subviewbutton-iconic");
    return node;
  },

  /**
   * Event listener for showing the View/Text_Encoding view.
   * Similar to the CharsetMenu.build function.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _onTextEncodingViewShow(event) {
    const panelView = event.target;
    const doc = panelView.ownerDocument;
    const parent = panelView.querySelector(".panel-subview-body");
    const showDetectors = panelView.getAttribute("detectors") != "false";

    // Clear the view before recreating it.
    while (parent.firstChild) {
      parent.firstChild.remove();
    }

    if (showDetectors) {
      // Add toolbarbutton for detectors subview.
      const node = doc.createXULElement("toolbarbutton");
      node.setAttribute("class", "subviewbutton subviewbutton-nav");
      node.setAttribute("closemenu", "none");

      node.setAttribute("label",
        gBundle.GetStringFromName("charsetMenuAutodet"));

      node.setAttribute("accesskey",
        gBundle.GetStringFromName("charsetMenuAutodet.key"));

      node.setAttribute("oncommand",
        "PanelUI.showSubView('appMenu-viewTextEncodingDetectorsView', this)");

      parent.appendChild(node);
      parent.appendChild(doc.createXULElement("toolbarseparator"));
    }

    // Add a toolbarbutton for each character encoding.
    const pinnedInfoCache = CharsetMenu.getCharsetInfo(
      PanelUI.kPinnedEncodings, false);

    const charsetInfoCache = CharsetMenu.getCharsetInfo(PanelUI.kEncodings);

    pinnedInfoCache.forEach(charsetInfo => parent.appendChild(
      PanelUI._createTextEncodingNode(doc, charsetInfo)));

    parent.appendChild(doc.createXULElement("toolbarseparator"));

    charsetInfoCache.forEach(charsetInfo => parent.appendChild(
      PanelUI._createTextEncodingNode(doc, charsetInfo)));

    UpdateCharsetMenu(msgWindow.mailCharacterSet, parent);
  },

  /**
   * Event listener for showing the View/Text_Encoding/Auto-Detect view.
   * Similar to the CharsetMenu.build function.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _onTextEncodingDetectorsViewShow(event) {
    const panelView = event.target;
    const parent = panelView.querySelector(".panel-subview-body");
    const doc = parent.ownerDocument;

    // Clear the view before recreating it.
    while (parent.firstChild) {
      parent.firstChild.remove();
    }

    // Populate the view with toolbarbuttons.
    panelView.setAttribute("title",
      gBundle.GetStringFromName("charsetMenuAutodet"));

    const detectorInfoCache = CharsetMenu.getDetectorInfo();

    detectorInfoCache.forEach(detectorInfo => parent.appendChild(
        PanelUI._createTextEncodingNode(doc, detectorInfo)));

    parent.appendChild(doc.createXULElement("toolbarseparator"));

    // Make the current selection checked. (Like UpdateDetectorMenu function.)
    const detector = Services.prefs.getComplexValue("intl.charset.detector",
      Ci.nsIPrefLocalizedString);

    const item = parent.getElementsByAttribute("detector", detector).item(0);

    if (item) {
      item.setAttribute("checked", "true");
    }
  },

  /**
   * Set the text encoding detector preference. Used for the
   * View / Text Encoding / Auto-Detect view.
   *
   * @param {Event} event  The 'oncommand' event.
   */
  setTextEncodingDetector(event) {
    Services.prefs.setStringPref("intl.charset.detector",
      event.target.getAttribute("detector"));
  },

  _updateQuitTooltip() {
    if (AppConstants.platform == "win") {
      return;
    }

    let tooltipId = AppConstants.platform == "macosx" ?
                    "quit-button.tooltiptext.mac" :
                    "quit-button.tooltiptext.linux2";

    let brands = Services.strings.createBundle("chrome://branding/locale/brand.properties");
    let stringArgs = [brands.GetStringFromName("brandShortName")];

    let key = document.getElementById("key_quitApplication");
    stringArgs.push(ShortcutUtils.prettifyShortcut(key));
    let tooltipString = CustomizableUI.getLocalizedProperty({x: tooltipId}, "x", stringArgs);
    let quitButton = document.getElementById("PanelUI-quit");
    quitButton.setAttribute("tooltiptext", tooltipString);
  },

  _hidePopup() {
    if (this.isNotificationPanelOpen) {
      this.notificationPanel.hidePopup();
    }
  },

  _updateNotifications(notificationsChanged) {
    let notifications = this._notifications;
    if (!notifications || !notifications.length) {
      if (notificationsChanged) {
        this._clearAllNotifications();
        this._hidePopup();
      }
      return;
    }

    if ((window.fullScreen && FullScreen.navToolboxHidden) || document.fullscreenElement) {
      this._hidePopup();
      return;
    }

    let doorhangers =
      notifications.filter(n => !n.dismissed && !n.options.badgeOnly);

    if (this.panel.state == "showing" || this.panel.state == "open") {
      // If the menu is already showing, then we need to dismiss all notifications
      // since we don't want their doorhangers competing for attention
      doorhangers.forEach(n => {
        n.dismissed = true;
        if (n.options.onDismissed) {
          n.options.onDismissed(window);
        }
      });
      this._hidePopup();
      this._clearBadge();
      if (!notifications[0].options.badgeOnly) {
        this._showBannerItem(notifications[0]);
      }
    } else if (doorhangers.length > 0) {
      // Only show the doorhanger if the window is focused and not fullscreen
      if ((window.fullScreen && this.autoHideToolbarInFullScreen) || Services.focus.activeWindow !== window) {
        this._hidePopup();
        this._showBadge(doorhangers[0]);
        this._showBannerItem(doorhangers[0]);
      } else {
        this._clearBadge();
        this._showNotificationPanel(doorhangers[0]);
      }
    } else {
      this._hidePopup();
      this._showBadge(notifications[0]);
      this._showBannerItem(notifications[0]);
    }
  },

  _showNotificationPanel(notification) {
    this._refreshNotificationPanel(notification);

    if (this.isNotificationPanelOpen) {
      return;
    }

    if (notification.options.beforeShowDoorhanger) {
      notification.options.beforeShowDoorhanger(document);
    }

    let anchor = this._getPanelAnchor(this.menuButton);

    this.notificationPanel.hidden = false;

    // Insert Fluent files when needed before notification is opened
    MozXULElement.insertFTLIfNeeded("branding/brand.ftl");
    MozXULElement.insertFTLIfNeeded("browser/appMenuNotifications.ftl");

    // After Fluent files are loaded into document replace data-lazy-l10n-ids with actual ones
    document.getElementById("appMenu-notification-popup").querySelectorAll("[data-lazy-l10n-id]").forEach(el => {
      el.setAttribute("data-l10n-id", el.getAttribute("data-lazy-l10n-id"));
      el.removeAttribute("data-lazy-l10n-id");
    });

    this.notificationPanel.openPopup(anchor, "bottomcenter topright");
  },

  _clearNotificationPanel() {
    for (let popupnotification of this.notificationPanel.children) {
      popupnotification.hidden = true;
      popupnotification.notification = null;
    }
  },

  _clearAllNotifications() {
    this._clearNotificationPanel();
    this._clearBadge();
    this._clearBannerItem();
  },

  _formatDescriptionMessage(n) {
    let text = {};
    let array = n.options.message.split("<>");
    text.start = array[0] || "";
    text.name = n.options.name || "";
    text.end = array[1] || "";
    return text;
  },

  _refreshNotificationPanel(notification) {
    this._clearNotificationPanel();

    let popupnotificationID = this._getPopupId(notification);
    let popupnotification = document.getElementById(popupnotificationID);

    popupnotification.setAttribute("id", popupnotificationID);
    popupnotification.setAttribute("buttoncommand", "PanelUI._onNotificationButtonEvent(event, 'buttoncommand');");
    popupnotification.setAttribute("secondarybuttoncommand",
      "PanelUI._onNotificationButtonEvent(event, 'secondarybuttoncommand');");

    if (notification.options.message) {
      let desc = this._formatDescriptionMessage(notification);
      popupnotification.setAttribute("label", desc.start);
      popupnotification.setAttribute("name", desc.name);
      popupnotification.setAttribute("endlabel", desc.end);
    }
    if (notification.options.onRefresh) {
      notification.options.onRefresh(window);
    }
    if (notification.options.popupIconURL) {
      popupnotification.setAttribute("icon", notification.options.popupIconURL);
    }

    popupnotification.notification = notification;
    popupnotification.show();
  },

  _showBadge(notification) {
    let badgeStatus = this._getBadgeStatus(notification);
    this.menuButton.setAttribute("badge-status", badgeStatus);
  },

  // "Banner item" here refers to an item in the hamburger panel menu. They will
  // typically show up as a colored row in the panel.
  _showBannerItem(notification) {
    if (!this._panelBannerItem) {
      this._panelBannerItem = this.mainView.querySelector(".panel-banner-item");
    }
    let label = this._panelBannerItem.getAttribute("label-" + notification.id);
    // Ignore items we don't know about.
    if (!label) {
      return;
    }
    this._panelBannerItem.setAttribute("notificationid", notification.id);
    this._panelBannerItem.setAttribute("label", label);
    this._panelBannerItem.hidden = false;
    this._panelBannerItem.notification = notification;
  },

  _clearBadge() {
    this.menuButton.removeAttribute("badge-status");
  },

  _clearBannerItem() {
    if (this._panelBannerItem) {
      this._panelBannerItem.notification = null;
      this._panelBannerItem.hidden = true;
    }
  },

  _onNotificationButtonEvent(event, type) {
    let notificationEl = getNotificationFromElement(event.originalTarget);

    if (!notificationEl)
      throw new Error("PanelUI._onNotificationButtonEvent: couldn't find notification element");

    if (!notificationEl.notification)
      throw new Error("PanelUI._onNotificationButtonEvent: couldn't find notification");

    let notification = notificationEl.notification;

    if (type == "secondarybuttoncommand") {
      AppMenuNotifications.callSecondaryAction(window, notification);
    } else {
      AppMenuNotifications.callMainAction(window, notification, true);
    }
  },

  _onBannerItemSelected(event) {
    let target = event.originalTarget;
    if (!target.notification)
      throw new Error("menucommand target has no associated action/notification");

    event.stopPropagation();
    AppMenuNotifications.callMainAction(window, target.notification, false);
  },

  _getPopupId(notification) { return "appMenu-" + notification.id + "-notification"; },

  _getBadgeStatus(notification) { return notification.id; },

  _getPanelAnchor(candidate) {
    let iconAnchor =
      document.getAnonymousElementByAttribute(candidate, "class",
                                              "toolbarbutton-badge-stack") ||
      document.getAnonymousElementByAttribute(candidate, "class",
                                              "toolbarbutton-icon");
    return iconAnchor || candidate;
  },

  // This is unused:
  // _addedShortcuts: false,

  _ensureShortcutsShown(view = this.mainView) {
    if (view.hasAttribute("added-shortcuts")) {
      return;
    }
    view.setAttribute("added-shortcuts", "true");
    for (let button of view.querySelectorAll("toolbarbutton[key]")) {
      let keyId = button.getAttribute("key");
      let key = document.getElementById(keyId);
      if (!key) {
        continue;
      }
      button.setAttribute("shortcut", ShortcutUtils.prettifyShortcut(key));
    }
  },
};

XPCOMUtils.defineConstant(this, "PanelUI", PanelUI);

/**
 * Gets the currently selected locale for display.
 * @return  the selected locale
 */
function getLocale() {
  return Services.locale.appLocaleAsLangTag;
}

/**
 * Given a DOM node inside a <popupnotification>, return the parent <popupnotification>.
 */
function getNotificationFromElement(aElement) {
  return aElement.closest("popupnotification");
}
