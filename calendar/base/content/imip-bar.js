/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/msgHdrView.js */
/* import-globals-from item-editing/calendar-item-editing.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/**
 * Provides shortcuts to set label and collapsed attribute of imip-bar node.
 */
const imipBar = {
  get bar() {
    return document.querySelector(".calendar-notification-bar");
  },
  get label() {
    return this.bar.querySelector(".msgNotificationBarText").textContent;
  },
  set label(val) {
    this.bar.querySelector(".msgNotificationBarText").textContent = val;
  },
  get collapsed() {
    return this.bar.collapsed;
  },
  set collapsed(val) {
    this.bar.collapsed = val;
  },
};

/**
 * This bar lives inside the message window.
 * Its lifetime is the lifetime of the main thunderbird message window.
 */
var calImipBar = {
  actionFunc: null,
  itipItem: null,
  foundItems: null,
  loadingItipItem: null,

  /**
   * Thunderbird Message listener interface, hide the bar before we begin
   */
  onStartHeaders() {
    calImipBar.resetBar();
  },

  /**
   * Thunderbird Message listener interface
   */
  onEndHeaders() {},

  /**
   * Load Handler called to initialize the imip bar
   * NOTE: This function is called without a valid this-context!
   */
  load() {
    // Add a listener to gMessageListeners defined in msgHdrView.js
    gMessageListeners.push(calImipBar);

    // Hook into this event to hide the message header pane otherwise, the imip
    // bar will still be shown when changing folders.
    document.getElementById("msgHeaderView").addEventListener("message-header-pane-hidden", () => {
      calImipBar.resetBar();
    });

    // Set up our observers
    Services.obs.addObserver(calImipBar, "onItipItemCreation");
  },

  /**
   * Unload handler to clean up after the imip bar
   * NOTE: This function is called without a valid this-context!
   */
  unload() {
    removeEventListener("messagepane-loaded", calImipBar.load, true);
    removeEventListener("messagepane-unloaded", calImipBar.unload, true);

    calImipBar.resetBar();
    Services.obs.removeObserver(calImipBar, "onItipItemCreation");
  },

  showImipBar(itipItem, imipMethod) {
    if (!Services.prefs.getBoolPref("calendar.itip.showImipBar", true)) {
      // Do not show the imip bar if the user has opted out of seeing it.
      return;
    }

    // How we get here:
    //
    // 1. `mime_find_class` finds the `CalMimeConverter` class matches the
    //      content-type of an attachment.
    // 2. `mime_find_class` extracts the method from the attachments headers
    //      and sets `imipMethod` on the message's mail channel.
    // 3. `CalMimeConverter` is called to generate the HTML in the message.
    //      It initialises `itipItem` and sets it on the channel.
    // 4. msgHdrView.js gathers `itipItem` and `imipMethod` from the channel.

    cal.itip.initItemFromMsgData(itipItem, imipMethod, gMessage);

    if (Services.prefs.getBoolPref("calendar.itip.newInvitationDisplay")) {
      window.dispatchEvent(new CustomEvent("onItipItemCreation", { detail: itipItem }));
    }

    imipBar.collapsed = false;
    imipBar.label = cal.itip.getMethodText(itipItem.receivedMethod);

    // This is triggered by CalMimeConverter.convertToHTML, so we know that
    // the message is not yet loaded with the invite. Keep track of this for
    // displayModifications.
    calImipBar.overlayLoaded = false;

    if (!Services.prefs.getBoolPref("calendar.itip.newInvitationDisplay")) {
      calImipBar.overlayLoaded = true;

      let doc = document.getElementById("messagepane").contentDocument;
      let details = doc.getElementById("imipHTMLDetails");
      let msgbody = doc.querySelector("div.moz-text-html");
      if (!msgbody) {
        details.setAttribute("open", "open");
      } else {
        // The HTML representation can contain important notes.

        // For consistent appearance, move the generated meeting details first.
        msgbody.prepend(details);

        if (Services.prefs.getBoolPref("calendar.itip.imipDetailsOpen", true)) {
          // Expand the iMIP details if pref says so.
          details.setAttribute("open", "open");
        }
      }
    }
    // NOTE: processItipItem may call setupOptions asynchronously because the
    // getItem method it triggers is async for *some* calendars. In theory,
    // this could complete after a different item has been loaded, so we
    // record the loading item now, and early exit setupOptions if the loading
    // item has since changed.
    // NOTE: loadingItipItem is reset on changing messages in resetBar.
    calImipBar.loadingItipItem = itipItem;
    cal.itip.processItipItem(itipItem, calImipBar.setupOptions);

    // NOTE: At this point we essentially have two parallel async operations:
    // 1. Load the CalMimeConverter.convertToHTML into the #messagepane and
    //    then set overlayLoaded to true.
    // 2. Find a corresponding event through processItipItem and then call
    //    setupOptions. Note that processItipItem may be instantaneous for
    //    some calendars.
    //
    // In the mean time, if we switch messages, then loadingItipItem will be
    // set to some other value: either another item, or null by resetBar.
    //
    // Once setupOptions is called, if the message has since changed we do
    // nothing and exit. Otherwise, if we found a corresponding item in the
    // calendar, we proceed to displayModifications. If overlayLoaded is true
    // we update the #messagepane immediately, otherwise we update it on
    // DOMContentLoaded, which has not yet happened.
  },

  /**
   * Hide the imip bar and reset the itip item.
   */
  resetBar() {
    imipBar.collapsed = true;
    calImipBar.resetButtons();

    // Clear our iMIP/iTIP stuff so it doesn't contain stale information.
    cal.itip.cleanupItipItem(calImipBar.itipItem);
    calImipBar.itipItem = null;
    calImipBar.loadingItipItem = null;
  },

  /**
   * Resets all buttons and its menuitems, all buttons are hidden thereafter
   */
  resetButtons() {
    let buttons = calImipBar.getButtons();
    for (let button of buttons) {
      button.setAttribute("hidden", "true");
      for (let item of calImipBar.getMenuItems(button)) {
        item.removeAttribute("hidden");
      }
    }
  },

  /**
   * Provides a list of all available buttons
   */
  getButtons() {
    let toolbarbuttons = document
      .getElementById("imip-view-toolbar")
      .getElementsByTagName("toolbarbutton");
    return Array.from(toolbarbuttons);
  },

  /**
   * Provides a list of available menuitems of a button
   *
   * @param aButton        button node
   */
  getMenuItems(aButton) {
    let items = [];
    let mitems = aButton.getElementsByTagName("menuitem");
    if (mitems != null && mitems.length > 0) {
      for (let mitem of mitems) {
        items.push(mitem);
      }
    }
    return items;
  },

  /**
   * Checks and converts button types based on available menuitems of the buttons
   * to avoid dropdowns which are empty or only replicating the default button action
   * Should be called once the buttons are set up
   */
  conformButtonType() {
    // check only needed on visible and not simple buttons
    let buttons = calImipBar
      .getButtons()
      .filter(aElement => aElement.hasAttribute("type") && !aElement.hidden);
    // change button if appropriate
    for (let button of buttons) {
      let items = calImipBar.getMenuItems(button).filter(aItem => !aItem.hidden);
      if (button.type == "menu" && items.length == 0) {
        // hide non functional buttons
        button.hidden = true;
      } else if (button.type == "menu") {
        if (
          items.length == 0 ||
          (items.length == 1 &&
            button.hasAttribute("oncommand") &&
            items[0].hasAttribute("oncommand") &&
            button.getAttribute("oncommand").endsWith(items[0].getAttribute("oncommand")))
        ) {
          // convert to simple button
          button.removeAttribute("type");
        }
      }
    }
  },

  /**
   * This is our callback function that is called each time the itip bar UI needs updating.
   * NOTE: This function is called without a valid this-context!
   *
   * @param itipItem      The iTIP item to set up for
   * @param rc            The status code from processing
   * @param actionFunc    The action function called for execution
   * @param foundItems    An array of items found while searching for the item
   *                      in subscribed calendars
   */
  setupOptions(itipItem, rc, actionFunc, foundItems) {
    if (itipItem !== calImipBar.loadingItipItem) {
      // The given itipItem refers to an earlier displayed message.
      return;
    }

    let data = cal.itip.getOptionsText(itipItem, rc, actionFunc, foundItems);

    if (Components.isSuccessCode(rc)) {
      calImipBar.itipItem = itipItem;
      calImipBar.actionFunc = actionFunc;
      calImipBar.foundItems = foundItems;
    }

    // We need this to determine whether this is an outgoing or incoming message because
    // Thunderbird doesn't provide a distinct flag on message level to do so. Relying on
    // folder flags only may lead to false positives.
    let isOutgoing = function (aMsgHdr) {
      if (!aMsgHdr) {
        return false;
      }
      let author = aMsgHdr.mime2DecodedAuthor;
      let isSentFolder = aMsgHdr.folder && aMsgHdr.folder.flags & Ci.nsMsgFolderFlags.SentMail;
      if (author && isSentFolder) {
        for (let identity of MailServices.accounts.allIdentities) {
          if (author.includes(identity.email) && !identity.fccReplyFollowsParent) {
            return true;
          }
        }
      }
      return false;
    };

    // We override the bar label for sent out invitations and in case the event does not exist
    // anymore, we also clear the buttons if any to avoid e.g. accept/decline buttons
    if (isOutgoing(gMessage)) {
      if (calImipBar.foundItems && calImipBar.foundItems[0]) {
        data.label = cal.l10n.getLtnString("imipBarSentText");
      } else {
        data = {
          label: cal.l10n.getLtnString("imipBarSentButRemovedText"),
          buttons: [],
          hideMenuItems: [],
          hideItems: [],
          showItems: [],
        };
      }
    }

    imipBar.label = data.label;
    // let's reset all buttons first
    calImipBar.resetButtons();
    // now we update the visible items - buttons are hidden by default
    // apart from that, we need this to adapt the accept button depending on
    // whether three or four button style is present
    for (let item of data.hideItems) {
      document.getElementById(item).setAttribute("hidden", "true");
    }
    for (let item of data.showItems) {
      document.getElementById(item).removeAttribute("hidden");
    }
    // adjust button style if necessary
    calImipBar.conformButtonType();

    calImipBar.displayModifications();
  },

  /**
   * Displays changes in case of invitation updates in invitation overlay.
   *
   * NOTE: This should only be called if the invitation is already loaded in the
   * #messagepane, in which case calImipBar.overlayLoaded should be set to true,
   * or is guaranteed to be loaded next in #messagepane.
   */
  displayModifications() {
    if (
      !calImipBar.foundItems ||
      !calImipBar.foundItems[0] ||
      !calImipBar.itipItem ||
      !Services.prefs.getBoolPref("calendar.itip.displayInvitationChanges", false)
    ) {
      return;
    }

    let itipItem = calImipBar.itipItem;
    let foundEvent = calImipBar.foundItems[0];
    let currentEvent = itipItem.getItemList()[0];
    let diff = cal.itip.compare(currentEvent, foundEvent);
    if (diff != 0) {
      let newEvent;
      let oldEvent;

      if (diff == 1) {
        // This is an update to previously accepted invitation.
        oldEvent = foundEvent;
        newEvent = currentEvent;
      } else {
        // This is a copy of a previously sent out invitation or a previous
        // revision of a meanwhile accepted invitation, so we flip the order.
        oldEvent = currentEvent;
        newEvent = foundEvent;
      }

      let browser = document.getElementById("messagepane");
      let doUpdate = () => {
        if (Services.prefs.getBoolPref("calendar.itip.newInvitationDisplay")) {
          return;
        }
        cal.invitation.updateInvitationOverlay(
          browser.contentDocument,
          newEvent,
          itipItem,
          oldEvent
        );
      };
      if (calImipBar.overlayLoaded) {
        // Document is already loaded.
        doUpdate();
      } else {
        // The event is not yet shown. This can happen if setupOptions is called
        // before CalMimeConverter.convertToHTML has finished, or the
        // corresponding HTML string has not yet been loaded.
        // Wait until the event is shown, then immediately update it.
        browser.addEventListener("DOMContentLoaded", doUpdate, { once: true });
      }
    }
  },

  /**
   * Executes an action triggered by an imip bar button
   *
   * @param   {string}  aParticipantStatus  A partstat string as per RfC 5545
   * @param   {string}  aResponse           Either 'AUTO', 'NONE' or 'USER',
   *                                          see calItipItem interface
   * @returns {boolean} true, if the action succeeded
   */
  executeAction(aParticipantStatus, aResponse) {
    return cal.itip.executeAction(
      window,
      aParticipantStatus,
      aResponse,
      calImipBar.actionFunc,
      calImipBar.itipItem,
      calImipBar.foundItems,
      ({ resetButtons, label }) => {
        if (label != undefined) {
          calImipBar.label = label;
        }
        if (resetButtons) {
          calImipBar.resetButtons();
        }
      }
    );
  },

  /**
   * Hide the imip bar in all windows and set a pref to prevent it from being
   * shown again. Called when clicking the imip bar's "do not show..." menu item.
   */
  doNotShowImipBar() {
    Services.prefs.setBoolPref("calendar.itip.showImipBar", false);
    for (let window of Services.ww.getWindowEnumerator()) {
      if (window.calImipBar) {
        window.calImipBar.resetBar();
      }
    }
  },
};

{
  let msgHeaderView = document.getElementById("msgHeaderView");
  if (msgHeaderView && msgHeaderView.loaded) {
    calImipBar.load();
  } else {
    addEventListener("messagepane-loaded", calImipBar.load, true);
  }
}
addEventListener("messagepane-unloaded", calImipBar.unload, true);
