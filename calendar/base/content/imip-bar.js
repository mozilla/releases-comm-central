/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/msgHdrView.js */
/* import-globals-from item-editing/calendar-item-editing.js */

/* globals gMessageDisplay, msgWindow */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

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

    // We need to extend the HideMessageHeaderPane function to also hide the
    // message header pane. Otherwise, the imip bar will still be shown when
    // changing folders.
    if (!calImipBar.tbHideMessageHeaderPane) {
      calImipBar.tbHideMessageHeaderPane = HideMessageHeaderPane;
      HideMessageHeaderPane = function(...args) {
        calImipBar.resetBar();
        calImipBar.tbHideMessageHeaderPane(...args);
      };
    }

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

  observe(subject, topic, state) {
    if (topic == "onItipItemCreation") {
      if (!Services.prefs.getBoolPref("calendar.itip.showImipBar", true)) {
        // Do not show the imip bar if the user has opted out of seeing it.
        return;
      }
      // NOTE: Itip item is *about* to be loaded into the #messagepane when this
      // callback is triggered by CalMimeConverter.convertToHTML.
      let itipItem = null;
      try {
        if (!subject) {
          let sinkProps = msgWindow.msgHeaderSink.properties;
          // This property was set by CalMimeConverter.jsm.
          itipItem = sinkProps.getPropertyAsInterface("itipItem", Ci.calIItipItem);
        }
      } catch (e) {
        // This will throw on every message viewed that doesn't have the
        // itipItem property set on it. So we eat the errors and move on.
        // XXX TODO: Only swallow the errors we need to. Throw all others.
      }
      if (!itipItem || !gMessageDisplay.displayedMessage) {
        return;
      }

      let imipMethod = gMessageDisplay.displayedMessage.getStringProperty("imip_method");
      cal.itip.initItemFromMsgData(itipItem, imipMethod, gMessageDisplay.displayedMessage);

      imipBar.collapsed = false;
      imipBar.label = cal.itip.getMethodText(itipItem.receivedMethod);

      // This is triggered by CalMimeConverter.convertToHTML, so we know that
      // the message is not yet loaded with the invite. Keep track of this for
      // displayModifications.
      calImipBar.overlayLoaded = false;
      document.getElementById("messagepane").addEventListener(
        "DOMContentLoaded",
        () => {
          calImipBar.overlayLoaded = true;

          let doc = document.getElementById("messagepane").contentDocument;
          let details = doc.getElementById("imipHTMLDetails");
          let msgbody = doc.querySelector("div.moz-text-html");
          if (!msgbody) {
            // No html part. Open up the imip details then.
            details.setAttribute("open", "open");
          } else {
            // Move the generated meeting details first (but keep it collapsed).
            // Probably the HTML representation is better, and can contain
            // important notes.
            msgbody.prepend(details);
          }
        },
        {
          once: true,
        }
      );
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
    }
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
      } else if (button.type == "menu-button") {
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
    let isOutgoing = function(aMsgHdr) {
      if (!aMsgHdr) {
        return false;
      }
      let author = aMsgHdr.mime2DecodedAuthor;
      let isSentFolder = aMsgHdr.folder && aMsgHdr.folder.flags & Ci.nsMsgFolderFlags.SentMail;
      if (author && isSentFolder) {
        let accounts = MailServices.accounts;
        for (let identity of accounts.allIdentities) {
          if (author.includes(identity.email) && !identity.fccReplyFollowsParent) {
            return true;
          }
        }
      }
      return false;
    };

    // We override the bar label for sent out invitations and in case the event does not exist
    // anymore, we also clear the buttons if any to avoid e.g. accept/decline buttons
    if (isOutgoing(gMessageDisplay.displayedMessage)) {
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
      let doUpdate = () =>
        cal.invitation.updateInvitationOverlay(
          browser.contentDocument,
          newEvent,
          itipItem,
          oldEvent
        );
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
   * @param   {String}  aParticipantStatus  A partstat string as per RfC 5545
   * @param   {String}  aResponse           Either 'AUTO', 'NONE' or 'USER',
   *                                          see calItipItem interface
   * @returns {Boolean}                     true, if the action succeeded
   */
  executeAction(aParticipantStatus, aResponse) {
    // control to avoid processing _execAction on later user changes on the item
    let isFirstProcessing = true;

    /**
     * Internal function to trigger an scheduling operation
     *
     * @param   {Function}     aActionFunc   The function to call to do the
     *                                         scheduling operation
     * @param   {calIItipItem} aItipItem     Scheduling item
     * @param   {nsIWindow}    aWindow       The current window
     * @param   {String}       aPartStat     partstat string as per RfC 5545
     * @param   {Object}       aExtResponse  JS object containing at least
     *                                         an responseMode property
     * @returns {Boolean}                    true, if the action succeeded
     */
    function _execAction(aActionFunc, aItipItem, aWindow, aPartStat, aExtResponse) {
      if (cal.itip.promptCalendar(aActionFunc.method, aItipItem, aWindow)) {
        let isDeclineCounter = aPartStat == "X-DECLINECOUNTER";
        // filter out fake partstats
        if (aPartStat.startsWith("X-")) {
          aParticipantStatus = "";
        }
        // hide the buttons now, to disable pressing them twice...
        if (aPartStat == aParticipantStatus) {
          calImipBar.resetButtons();
        }

        let opListener = {
          QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
          onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
            isFirstProcessing = false;
            if (Components.isSuccessCode(aStatus) && isDeclineCounter) {
              // TODO: move the DECLINECOUNTER stuff to actionFunc
              aItipItem.getItemList().forEach(aItem => {
                // we can rely on the received itipItem to reply at this stage
                // already, the checks have been done in cal.itip.processFoundItems
                // when setting up the respective aActionFunc
                let attendees = cal.itip.getAttendeesBySender(
                  aItem.getAttendees(),
                  aItipItem.sender
                );
                let status = true;
                if (
                  attendees.length == 1 &&
                  calImipBar.foundItems &&
                  calImipBar.foundItems.length
                ) {
                  // we must return a message with the same sequence number as the
                  // counterproposal - to make it easy, we simply use the received
                  // item and just remove a comment, if any
                  try {
                    let item = aItem.clone();
                    item.calendar = calImipBar.foundItems[0].calendar;
                    item.deleteProperty("COMMENT");
                    // once we have full support to deal with for multiple items
                    // in a received invitation message, we should send this
                    // from outside outside of the forEach context
                    status = cal.itip.sendDeclineCounterMessage(item, "DECLINECOUNTER", attendees, {
                      value: false,
                    });
                  } catch (e) {
                    cal.ERROR(e);
                    status = false;
                  }
                } else {
                  status = false;
                }
                if (!status) {
                  cal.ERROR("Failed to send DECLINECOUNTER reply!");
                }
              });
            }
            // For now, we just state the status for the user something very simple
            let label = cal.itip.getCompleteText(aStatus, aOperationType);
            imipBar.label = label;

            if (!Components.isSuccessCode(aStatus)) {
              cal.showError(label);
            }
          },
          onGetResult(calendar, status, itemType, detail, items) {},
        };

        try {
          aActionFunc(opListener, aParticipantStatus, aExtResponse);
        } catch (exc) {
          Cu.reportError(exc);
        }
        return true;
      }
      return false;
    }

    if (aParticipantStatus == null) {
      aParticipantStatus = "";
    }
    if (aParticipantStatus == "X-SHOWDETAILS" || aParticipantStatus == "X-RESCHEDULE") {
      let counterProposal;
      let items = calImipBar.foundItems;
      if (items && items.length) {
        let item = items[0].isMutable ? items[0] : items[0].clone();

        if (aParticipantStatus == "X-RESCHEDULE") {
          // TODO most of the following should be moved to the actionFunc defined in
          // calItipUtils
          let proposedItem = calImipBar.itipItem.getItemList()[0];
          let proposedRID = proposedItem.getProperty("RECURRENCE-ID");
          if (proposedRID) {
            // if this is a counterproposal for a specific occurrence, we use
            // that to compare with
            item = item.recurrenceInfo.getOccurrenceFor(proposedRID).clone();
          }
          let parsedProposal = cal.invitation.parseCounter(proposedItem, item);
          let potentialProposers = cal.itip.getAttendeesBySender(
            proposedItem.getAttendees(),
            calImipBar.itipItem.sender
          );
          let proposingAttendee = potentialProposers.length == 1 ? potentialProposers[0] : null;
          if (
            proposingAttendee &&
            ["OK", "OUTDATED", "NOTLATESTUPDATE"].includes(parsedProposal.result.type)
          ) {
            counterProposal = {
              attendee: proposingAttendee,
              proposal: parsedProposal.differences,
              oldVersion:
                parsedProposal.result == "OLDVERSION" || parsedProposal.result == "NOTLATESTUPDATE",
              onReschedule: () => {
                imipBar.label = cal.l10n.getLtnString("imipBarCounterPreviousVersionText");
                // TODO: should we hide the buttons in this case, too?
              },
            };
          } else {
            imipBar.label = cal.l10n.getLtnString("imipBarCounterErrorText");
            calImipBar.resetButtons();
            if (proposingAttendee) {
              cal.LOG(parsedProposal.result.descr);
            } else {
              cal.LOG("Failed to identify the sending attendee of the counterproposal.");
            }

            return false;
          }
        }
        // if this a rescheduling operation, we suppress the occurrence
        // prompt here
        modifyEventWithDialog(item, aParticipantStatus != "X-RESCHEDULE", null, counterProposal);
      }
    } else {
      let response;
      if (aResponse) {
        if (aResponse == "AUTO" || aResponse == "NONE" || aResponse == "USER") {
          response = { responseMode: Ci.calIItipItem[aResponse] };
        }
        // Open an extended response dialog to enable the user to add a comment, make a
        // counterproposal, delegate the event or interact in another way.
        // Instead of a dialog, this might be implemented as a separate container inside the
        // imip-overlay as proposed in bug 458578
      }
      let delmgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
        Ci.calIDeletedItems
      );
      let items = calImipBar.itipItem.getItemList();
      if (items && items.length) {
        let delTime = delmgr.getDeletedDate(items[0].id);
        let dialogText = cal.l10n.getLtnString("confirmProcessInvitation");
        let dialogTitle = cal.l10n.getLtnString("confirmProcessInvitationTitle");
        if (delTime && !Services.prompt.confirm(window, dialogTitle, dialogText)) {
          return false;
        }
      }

      if (aParticipantStatus == "X-SAVECOPY") {
        // we create and adopt copies of the respective events
        let saveitems = calImipBar.itipItem
          .getItemList()
          .map(cal.itip.getPublishLikeItemCopy.bind(cal));
        if (saveitems.length > 0) {
          let methods = { receivedMethod: "PUBLISH", responseMethod: "PUBLISH" };
          let newItipItem = cal.itip.getModifiedItipItem(calImipBar.itipItem, saveitems, methods);
          // setup callback and trigger re-processing
          let storeCopy = function(aItipItem, aRc, aActionFunc, aFoundItems) {
            if (isFirstProcessing && aActionFunc && Components.isSuccessCode(aRc)) {
              _execAction(aActionFunc, aItipItem, window, aParticipantStatus);
            }
          };
          cal.itip.processItipItem(newItipItem, storeCopy);
        }
        // we stop here to not process the original item
        return false;
      }
      return _execAction(
        calImipBar.actionFunc,
        calImipBar.itipItem,
        window,
        aParticipantStatus,
        response
      );
    }
    return false;
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

  /**
   * Open (or focus if already open) the calendar tab, even if the imip bar is
   * in a message window, and even if there is no main three pane Thunderbird
   * window open. Called when clicking the imip bar's calendar button.
   */
  goToCalendar() {
    let openCal = mainWindow => {
      mainWindow.focus();
      mainWindow.document.getElementById("tabmail").openTab("calendar", {
        title: mainWindow.document.getElementById("calendar-tab-button").getAttribute("title"),
      });
    };

    let mainWindow = Services.wm.getMostRecentWindow("mail:3pane");

    if (mainWindow) {
      openCal(mainWindow);
    } else {
      mainWindow = Services.ww.openWindow(
        null,
        "chrome://messenger/content/messenger.xhtml",
        "_blank",
        "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
        null
      );

      // Wait until calendar is set up in the new window.
      let calStartupObserver = {
        observe(subject, topic, data) {
          openCal(mainWindow);
          Services.obs.removeObserver(calStartupObserver, "calendar-startup-done");
        },
      };
      Services.obs.addObserver(calStartupObserver, "calendar-startup-done");
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
