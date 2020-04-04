/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { calendarDeactivator } = ChromeUtils.import(
  "resource:///modules/calendar/calCalendarDeactivator.jsm"
);

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Scheduling and iTIP helper code
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.itip namespace.

this.EXPORTED_SYMBOLS = ["calitip"]; /* exported calitip */

var calitip = {
  /**
   * Gets the sequence/revision number, either of the passed item or the last received one of an
   * attendee; see <http://tools.ietf.org/html/draft-desruisseaux-caldav-sched-04#section-7.1>.
   *
   * @param {calIAttendee|calIItemBase} aItem     The item or attendee to get the sequence info
   *                                                from.
   * @return {Number}                             The sequence number
   */
  getSequence(aItem) {
    let seq = null;

    let wrappedItem = cal.wrapInstance(aItem, Ci.calIAttendee);
    if (wrappedItem) {
      seq = wrappedItem.getProperty("RECEIVED-SEQUENCE");
    } else if (aItem) {
      // Unless the below is standardized, we store the last original
      // REQUEST/PUBLISH SEQUENCE in X-MOZ-RECEIVED-SEQUENCE to test against it
      // when updates come in:
      seq = aItem.getProperty("X-MOZ-RECEIVED-SEQUENCE");
      if (seq === null) {
        seq = aItem.getProperty("SEQUENCE");
      }

      // Make sure we don't have a pre Outlook 2007 appointment, but if we do
      // use Microsoft's Sequence number. I <3 MS
      if (seq === null || seq == "0") {
        seq = aItem.getProperty("X-MICROSOFT-CDO-APPT-SEQUENCE");
      }
    }

    if (seq === null) {
      return 0;
    }
    seq = parseInt(seq, 10);
    return isNaN(seq) ? 0 : seq;
  },

  /**
   * Gets the stamp date-time, either of the passed item or the last received one of an attendee;
   * see <http://tools.ietf.org/html/draft-desruisseaux-caldav-sched-04#section-7.2>.
   *
   * @param {calIAttendee|calIItemBase} aItem     The item or attendee to retrieve the stamp from
   * @return {calIDateTime}                       The timestamp for the item
   */
  getStamp(aItem) {
    let dtstamp = null;

    let wrappedItem = cal.wrapInstance(aItem, Ci.calIAttendee);
    if (wrappedItem) {
      let stamp = wrappedItem.getProperty("RECEIVED-DTSTAMP");
      if (stamp) {
        dtstamp = cal.createDateTime(stamp);
      }
    } else if (aItem) {
      // Unless the below is standardized, we store the last original
      // REQUEST/PUBLISH DTSTAMP in X-MOZ-RECEIVED-DTSTAMP to test against it
      // when updates come in:
      let stamp = aItem.getProperty("X-MOZ-RECEIVED-DTSTAMP");
      if (stamp) {
        dtstamp = cal.createDateTime(stamp);
      } else {
        // xxx todo: are there similar X-MICROSOFT-CDO properties to be considered here?
        dtstamp = aItem.stampTime;
      }
    }

    return dtstamp;
  },

  /**
   * Compares sequences and/or stamps of two items
   *
   * @param {calIItemBase|calIAttendee} aItem1        The first item to compare
   * @param {calIItemBase|calIAttendee} aItem2        The second item to compare
   * @return {Number}                                 +1 if item2 is newer, -1 if item1 is newer
   *                                                    or 0 if both are equal
   */
  compare(aItem1, aItem2) {
    let comp = calitip.compareSequence(aItem1, aItem2);
    if (comp == 0) {
      comp = calitip.compareStamp(aItem1, aItem2);
    }
    return comp;
  },

  /**
   * Compares sequences of two items
   *
   * @param {calIItemBase|calIAttendee} aItem1        The first item to compare
   * @param {calIItemBase|calIAttendee} aItem2        The second item to compare
   * @return {Number}                                 +1 if item2 is newer, -1 if item1 is newer
   *                                                    or 0 if both are equal
   */
  compareSequence(aItem1, aItem2) {
    let seq1 = calitip.getSequence(aItem1);
    let seq2 = calitip.getSequence(aItem2);
    if (seq1 > seq2) {
      return 1;
    } else if (seq1 < seq2) {
      return -1;
    }
    return 0;
  },

  /**
   * Compares stamp of two items
   *
   * @param {calIItemBase|calIAttendee} aItem1        The first item to compare
   * @param {calIItemBase|calIAttendee} aItem2        The second item to compare
   * @return {Number}                                 +1 if item2 is newer, -1 if item1 is newer
   *                                                    or 0 if both are equal
   */
  compareStamp(aItem1, aItem2) {
    let st1 = calitip.getStamp(aItem1);
    let st2 = calitip.getStamp(aItem2);
    if (st1 && st2) {
      return st1.compare(st2);
    } else if (!st1 && st2) {
      return -1;
    } else if (st1 && !st2) {
      return 1;
    }
    return 0;
  },

  /**
   * Checks if the given calendar is a scheduling calendar. This means it
   * needs an organizer id and an itip transport. It should also be writable.
   *
   * @param {calICalendar} aCalendar      The calendar to check
   * @return {Boolean}                    True, if its a scheduling calendar.
   */
  isSchedulingCalendar(aCalendar) {
    return (
      cal.acl.isCalendarWritable(aCalendar) &&
      aCalendar.getProperty("organizerId") &&
      aCalendar.getProperty("itip.transport")
    );
  },

  /**
   * Scope: iTIP message receiver
   *
   * Given an nsIMsgDBHdr and an imipMethod, set up the given itip item.
   *
   * @param {calIItemBase} itipItem   The item to set up
   * @param {String} imipMethod       The received imip method
   * @param {nsIMsgDBHdr} aMsgHdr     Information about the received email
   */
  initItemFromMsgData(itipItem, imipMethod, aMsgHdr) {
    // set the sender of the itip message
    itipItem.sender = calitip.getMessageSender(aMsgHdr);

    // Get the recipient identity and save it with the itip item.
    itipItem.identity = calitip.getMessageRecipient(aMsgHdr);

    // We are only called upon receipt of an invite, so ensure that isSend
    // is false.
    itipItem.isSend = false;

    // XXX Get these from preferences
    itipItem.autoResponse = Ci.calIItipItem.USER;

    if (imipMethod && imipMethod.length != 0 && imipMethod.toLowerCase() != "nomethod") {
      itipItem.receivedMethod = imipMethod.toUpperCase();
    } else {
      // There is no METHOD in the content-type header (spec violation).
      // Fall back to using the one from the itipItem's ICS.
      imipMethod = itipItem.receivedMethod;
    }
    cal.LOG("iTIP method: " + imipMethod);

    let isWritableCalendar = function(aCalendar) {
      /* TODO: missing ACL check for existing items (require callback API) */
      return (
        calitip.isSchedulingCalendar(aCalendar) && cal.acl.userCanAddItemsToCalendar(aCalendar)
      );
    };

    let writableCalendars = cal
      .getCalendarManager()
      .getCalendars()
      .filter(isWritableCalendar);
    if (writableCalendars.length > 0) {
      let compCal = Cc["@mozilla.org/calendar/calendar;1?type=composite"].createInstance(
        Ci.calICompositeCalendar
      );
      writableCalendars.forEach(compCal.addCalendar, compCal);
      itipItem.targetCalendar = compCal;
    }
  },

  /**
   * Scope: iTIP message receiver
   *
   * Gets the suggested text to be shown when an imip item has been processed.
   * This text is ready localized and can be displayed to the user.
   *
   * @param {Number} aStatus         The status of the processing (i.e NS_OK, an error code)
   * @param {Number} aOperationType  An operation type from calIOperationListener
   * @return {String}                The suggested text.
   */
  getCompleteText(aStatus, aOperationType) {
    let text = "";
    const cIOL = Ci.calIOperationListener;
    if (Components.isSuccessCode(aStatus)) {
      switch (aOperationType) {
        case cIOL.ADD:
          text = cal.l10n.getLtnString("imipAddedItemToCal2");
          break;
        case cIOL.MODIFY:
          text = cal.l10n.getLtnString("imipUpdatedItem2");
          break;
        case cIOL.DELETE:
          text = cal.l10n.getLtnString("imipCanceledItem2");
          break;
      }
    } else {
      text = cal.l10n.getLtnString("imipBarProcessingFailed", [aStatus.toString(16)]);
    }
    return text;
  },

  /**
   * Scope: iTIP message receiver
   *
   * Gets a text describing the given itip method. The text is of the form
   * "This Message contains a ... ".
   *
   * @param {String} method      The method to describe.
   * @return {String}            The localized text about the method.
   */
  getMethodText(method) {
    switch (method) {
      case "REFRESH":
        return cal.l10n.getLtnString("imipBarRefreshText");
      case "REQUEST":
        return cal.l10n.getLtnString("imipBarRequestText");
      case "PUBLISH":
        return cal.l10n.getLtnString("imipBarPublishText");
      case "CANCEL":
        return cal.l10n.getLtnString("imipBarCancelText");
      case "REPLY":
        return cal.l10n.getLtnString("imipBarReplyText");
      case "COUNTER":
        return cal.l10n.getLtnString("imipBarCounterText");
      case "DECLINECOUNTER":
        return cal.l10n.getLtnString("imipBarDeclineCounterText");
      default:
        cal.ERROR("Unknown iTIP method: " + method);
        return cal.l10n.getLtnString("imipBarUnsupportedText");
    }
  },

  /**
   * Scope: iTIP message receiver
   *
   * Gets localized toolbar label about the message state and triggers buttons to show.
   * This returns a JS object with the following structure:
   *
   * {
   *    label: "This is a desciptive text about the itip item",
   *    showItems: ["imipXXXButton", ...],
   *    hideItems: ["imipXXXButton_Option", ...]
   * }
   *
   * @see processItipItem   This takes the same parameters as its optionFunc.
   * @param {calIItipItem} itipItem       The itipItem to query.
   * @param {Number} rc                   The result of retrieving the item
   * @param {Function} actionFunc         The action function.
   * @param {calIItemBase[]} foundItems   An array of items found while searching for the item
   *                                        in subscribed calendars
   * @return {Object}                     Return information about the options
   */
  getOptionsText(itipItem, rc, actionFunc, foundItems) {
    let imipLabel = null;
    if (itipItem.receivedMethod) {
      imipLabel = calitip.getMethodText(itipItem.receivedMethod);
    }
    let data = { label: imipLabel, showItems: [], hideItems: [] };
    let separateButtons = Services.prefs.getBoolPref(
      "calendar.itip.separateInvitationButtons",
      false
    );

    let disallowedCounter = false;
    if (foundItems && foundItems.length) {
      let disallow = foundItems[0].getProperty("X-MICROSOFT-DISALLOW-COUNTER");
      disallowedCounter = disallow && disallow == "TRUE";
    }
    if (!calendarDeactivator.isCalendarActivated) {
      // Calendar is deactivated (no calendars are enabled).
      data.label = cal.l10n.getLtnString("imipBarCalendarDeactivated");
      data.showItems.push("imipGoToCalendarButton", "imipMoreButton");
      data.hideItems.push("imipMoreButton_SaveCopy");
    } else if (rc == Ci.calIErrors.CAL_IS_READONLY) {
      // No writable calendars, tell the user about it
      data.label = cal.l10n.getLtnString("imipBarNotWritable");
      data.showItems.push("imipGoToCalendarButton", "imipMoreButton");
      data.hideItems.push("imipMoreButton_SaveCopy");
    } else if (Components.isSuccessCode(rc) && !actionFunc) {
      // This case, they clicked on an old message that has already been
      // added/updated, we want to tell them that.
      data.label = cal.l10n.getLtnString("imipBarAlreadyProcessedText");
      if (foundItems && foundItems.length) {
        data.showItems.push("imipDetailsButton");
        if (itipItem.receivedMethod == "COUNTER" && itipItem.sender) {
          if (disallowedCounter) {
            data.label = cal.l10n.getLtnString("imipBarDisallowedCounterText");
          } else {
            let comparison;
            for (let item of itipItem.getItemList()) {
              let attendees = cal.itip.getAttendeesBySender(item.getAttendees(), itipItem.sender);
              if (attendees.length == 1) {
                comparison = calitip.compareSequence(item, foundItems[0]);
                if (comparison == 1) {
                  data.label = cal.l10n.getLtnString("imipBarCounterErrorText");
                  break;
                } else if (comparison == -1) {
                  data.label = cal.l10n.getLtnString("imipBarCounterPreviousVersionText");
                }
              }
            }
          }
        }
      } else if (itipItem.receivedMethod == "REPLY") {
        // The item has been previously removed from the available calendars or the calendar
        // containing the item is not available
        let delmgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
          Ci.calIDeletedItems
        );
        let delTime = null;
        let items = itipItem.getItemList();
        if (items && items.length) {
          delTime = delmgr.getDeletedDate(items[0].id);
        }
        if (delTime) {
          data.label = cal.l10n.getLtnString("imipBarReplyToRecentlyRemovedItem", [
            delTime.toString(),
          ]);
        } else {
          data.label = cal.l10n.getLtnString("imipBarReplyToNotExistingItem");
        }
      } else if (itipItem.receivedMethod == "DECLINECOUNTER") {
        data.label = cal.l10n.getLtnString("imipBarDeclineCounterText");
      }
    } else if (Components.isSuccessCode(rc)) {
      cal.LOG("iTIP options on: " + actionFunc.method);
      switch (actionFunc.method) {
        case "PUBLISH:UPDATE":
        case "REQUEST:UPDATE-MINOR":
          data.label = cal.l10n.getLtnString("imipBarUpdateText");
        // falls through
        case "REPLY":
          data.showItems.push("imipUpdateButton");
          break;
        case "PUBLISH":
          data.showItems.push("imipAddButton");
          break;
        case "REQUEST:UPDATE":
        case "REQUEST:NEEDS-ACTION":
        case "REQUEST": {
          let isRecurringMaster = false;
          for (let item of itipItem.getItemList()) {
            if (item.recurrenceInfo) {
              isRecurringMaster = true;
            }
          }

          if (actionFunc.method == "REQUEST:UPDATE") {
            if (isRecurringMaster) {
              data.label = cal.l10n.getLtnString("imipBarUpdateSeriesText");
            } else if (itipItem.getItemList().length > 1) {
              data.label = cal.l10n.getLtnString("imipBarUpdateMultipleText");
            } else {
              data.label = cal.l10n.getLtnString("imipBarUpdateText");
            }
          } else if (actionFunc.method == "REQUEST:NEEDS-ACTION") {
            if (isRecurringMaster) {
              data.label = cal.l10n.getLtnString("imipBarProcessedSeriesNeedsAction");
            } else if (itipItem.getItemList().length > 1) {
              data.label = cal.l10n.getLtnString("imipBarProcessedMultipleNeedsAction");
            } else {
              data.label = cal.l10n.getLtnString("imipBarProcessedNeedsAction");
            }
          }

          if (itipItem.getItemList().length > 1 || isRecurringMaster) {
            data.showItems.push("imipAcceptRecurrencesButton");
            if (separateButtons) {
              data.showItems.push("imipTentativeRecurrencesButton");
              data.hideItems.push("imipAcceptRecurrencesButton_AcceptLabel");
              data.hideItems.push("imipAcceptRecurrencesButton_TentativeLabel");
              data.hideItems.push("imipAcceptRecurrencesButton_Tentative");
              data.hideItems.push("imipAcceptRecurrencesButton_TentativeDontSend");
            } else {
              data.hideItems.push("imipTentativeRecurrencesButton");
              data.showItems.push("imipAcceptRecurrencesButton_AcceptLabel");
              data.showItems.push("imipAcceptRecurrencesButton_TentativeLabel");
              data.showItems.push("imipAcceptRecurrencesButton_Tentative");
              data.showItems.push("imipAcceptRecurrencesButton_TentativeDontSend");
            }
            data.showItems.push("imipDeclineRecurrencesButton");
          } else {
            data.showItems.push("imipAcceptButton");
            if (separateButtons) {
              data.showItems.push("imipTentativeButton");
              data.hideItems.push("imipAcceptButton_AcceptLabel");
              data.hideItems.push("imipAcceptButton_TentativeLabel");
              data.hideItems.push("imipAcceptButton_Tentative");
              data.hideItems.push("imipAcceptButton_TentativeDontSend");
            } else {
              data.hideItems.push("imipTentativeButton");
              data.showItems.push("imipAcceptButton_AcceptLabel");
              data.showItems.push("imipAcceptButton_TentativeLabel");
              data.showItems.push("imipAcceptButton_Tentative");
              data.showItems.push("imipAcceptButton_TentativeDontSend");
            }
            data.showItems.push("imipDeclineButton");
          }
          data.showItems.push("imipMoreButton");
          // Use data.hideItems.push("idOfMenuItem") to hide specific menuitems
          // from the dropdown menu of a button.  This might be useful to remove
          // a generally available option for a specific invitation, because the
          // respective feature is not available for the calendar, the invitation
          // is in or the feature is prohibited by the organizer
          break;
        }
        case "CANCEL": {
          data.showItems.push("imipDeleteButton");
          break;
        }
        case "REFRESH": {
          data.showItems.push("imipReconfirmButton");
          break;
        }
        case "COUNTER": {
          if (disallowedCounter) {
            data.label = cal.l10n.getLtnString("imipBarDisallowedCounterText");
          }
          data.showItems.push("imipDeclineCounterButton");
          data.showItems.push("imipRescheduleButton");
          break;
        }
        default:
          data.label = cal.l10n.getLtnString("imipBarUnsupportedText");
          break;
      }
    } else {
      data.label = cal.l10n.getLtnString("imipBarUnsupportedText");
    }

    return data;
  },

  /**
   * Scope: iTIP message receiver
   * Retrieves the message sender.
   *
   * @param {nsIMsgDBHdr} aMsgHdr     The message header to check.
   * @return {String}                 The email address of the intended recipient.
   */
  getMessageSender(aMsgHdr) {
    let author = (aMsgHdr && aMsgHdr.author) || "";
    let compFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
      Ci.nsIMsgCompFields
    );
    let addresses = compFields.splitRecipients(author, true);
    if (addresses.length != 1) {
      cal.LOG("No unique email address for lookup in message.\r\n" + cal.STACK(20));
    }
    return addresses[0] || null;
  },

  /**
   * Scope: iTIP message receiver
   *
   * Retrieves the intended recipient for this message.
   *
   * @param {nsIMsgDBHdr} aMsgHdr     The message to check.
   * @return {String}                 The email of the intended recipient.
   */
  getMessageRecipient(aMsgHdr) {
    if (!aMsgHdr) {
      return null;
    }

    let identities;
    if (aMsgHdr.accountKey) {
      // First, check if the message has an account key. If so, we can use the
      // account identities to find the correct recipient
      identities = MailServices.accounts.getAccount(aMsgHdr.accountKey).identities;
    } else if (aMsgHdr.folder) {
      // Without an account key, we have to revert back to using the server
      identities = MailServices.accounts.getIdentitiesForServer(aMsgHdr.folder.server);
    }

    let emailMap = {};
    if (!identities || identities.length == 0) {
      let identity;
      // If we were not able to retrieve identities above, then we have no
      // choice but to revert to the default identity.
      let defaultAccount = MailServices.accounts.defaultAccount;
      if (defaultAccount) {
        identity = defaultAccount.defaultIdentity;
      }
      if (!identity) {
        // If there isn't a default identity (i.e Local Folders is your
        // default identity), then go ahead and use the first available
        // identity.
        let allIdentities = MailServices.accounts.allIdentities;
        if (allIdentities.length > 0) {
          identity = allIdentities[0];
        } else {
          // If there are no identities at all, we cannot get a recipient.
          return null;
        }
      }
      emailMap[identity.email.toLowerCase()] = true;
    } else {
      // Build a map of usable email addresses
      for (let identity of identities) {
        emailMap[identity.email.toLowerCase()] = true;
      }
    }

    // First check the recipient list
    let toList = MailServices.headerParser.makeFromDisplayAddress(aMsgHdr.recipients || "");
    for (let recipient of toList) {
      if (recipient.email.toLowerCase() in emailMap) {
        // Return the first found recipient
        return recipient;
      }
    }

    // Maybe we are in the CC list?
    let ccList = MailServices.headerParser.makeFromDisplayAddress(aMsgHdr.ccList || "");
    for (let recipient of ccList) {
      if (recipient.email.toLowerCase() in emailMap) {
        // Return the first found recipient
        return recipient;
      }
    }

    // Hrmpf. Looks like delegation or maybe Bcc.
    return null;
  },

  /**
   * Scope: iTIP message receiver
   *
   * Prompt for the target calendar, if needed for the given method. This calendar will be set on
   * the passed itip item.
   *
   * @param {String} aMethod          The method to check.
   * @param {calIItipItem} aItipItem  The itip item to set the target calendar on.
   * @param {DOMWindpw} aWindow       The window to open the dialog on.
   * @return {Boolean}                True, if a calendar was selected or no selection is needed.
   */
  promptCalendar(aMethod, aItipItem, aWindow) {
    let needsCalendar = false;
    let targetCalendar = null;
    switch (aMethod) {
      // methods that don't require the calendar chooser:
      case "REFRESH":
      case "REQUEST:UPDATE":
      case "REQUEST:UPDATE-MINOR":
      case "PUBLISH:UPDATE":
      case "REPLY":
      case "CANCEL":
      case "COUNTER":
      case "DECLINECOUNTER":
        needsCalendar = false;
        break;
      default:
        needsCalendar = true;
        break;
    }

    if (needsCalendar) {
      let calendars = cal
        .getCalendarManager()
        .getCalendars()
        .filter(calitip.isSchedulingCalendar);

      if (aItipItem.receivedMethod == "REQUEST") {
        // try to further limit down the list to those calendars that
        // are configured to a matching attendee;
        let item = aItipItem.getItemList()[0];
        let matchingCals = calendars.filter(
          calendar => calitip.getInvitedAttendee(item, calendar) != null
        );
        // if there's none, we will show the whole list of calendars:
        if (matchingCals.length > 0) {
          calendars = matchingCals;
        }
      }

      if (calendars.length == 0) {
        let msg = cal.l10n.getLtnString("imipNoCalendarAvailable");
        aWindow.alert(msg);
      } else if (calendars.length == 1) {
        // There's only one calendar, so it's silly to ask what calendar
        // the user wants to import into.
        targetCalendar = calendars[0];
      } else {
        // Ask what calendar to import into
        let args = {};
        args.calendars = calendars;
        args.onOk = aCal => {
          targetCalendar = aCal;
        };
        args.promptText = cal.l10n.getCalString("importPrompt");
        aWindow.openDialog(
          "chrome://calendar/content/chooseCalendarDialog.xhtml",
          "_blank",
          "chrome,titlebar,modal,resizable",
          args
        );
      }

      if (targetCalendar) {
        aItipItem.targetCalendar = targetCalendar;
      }
    }

    return !needsCalendar || targetCalendar != null;
  },

  /**
   * Clean up after the given iTIP item. This needs to be called once for each time
   * processItipItem is called. May be called with a null itipItem in which case it will do
   * nothing.
   *
   * @param {calIItipItem} itipItem      The iTIP item to clean up for.
   */
  cleanupItipItem(itipItem) {
    if (itipItem) {
      let itemList = itipItem.getItemList();
      if (itemList.length > 0) {
        // Again, we can assume the id is the same over all items per spec
        ItipItemFinderFactory.cleanup(itemList[0].id);
      }
    }
  },

  /**
   * Scope: iTIP message receiver
   *
   * Checks the passed iTIP item and calls the passed function with options offered. Be sure to
   * call cleanupItipItem at least once after calling this function.
   *
   * The action func has a property |method| showing the options:
   *   * REFRESH -- send the latest item (sent by attendee(s))
   *   * PUBLISH -- initial publish, no reply (sent by organizer)
   *   * PUBLISH:UPDATE -- update of a published item (sent by organizer)
   *   * REQUEST -- initial invitation (sent by organizer)
   *   * REQUEST:UPDATE -- rescheduling invitation, has major change (sent by organizer)
   *   * REQUEST:UPDATE-MINOR -- update of invitation, minor change (sent by organizer)
   *   * REPLY -- invitation reply (sent by attendee(s))
   *   * CANCEL -- invitation cancel (sent by organizer)
   *   * COUNTER -- counterproposal (sent by attendee)
   *   * DECLINECOUNTER -- denial of a counterproposal (sent by organizer)
   *
   * @param {calIItipItem} itipItem       The iTIP item
   * @param {Function} optionsFunc        The function being called with parameters: itipItem,
   *                                          resultCode, actionFunc
   */
  processItipItem(itipItem, optionsFunc) {
    switch (itipItem.receivedMethod.toUpperCase()) {
      case "REFRESH":
      case "PUBLISH":
      case "REQUEST":
      case "CANCEL":
      case "COUNTER":
      case "DECLINECOUNTER":
      case "REPLY": {
        // Per iTIP spec (new Draft 4), multiple items in an iTIP message MUST have
        // same ID, this simplifies our searching, we can just look for Item[0].id
        let itemList = itipItem.getItemList();
        if (!itipItem.targetCalendar) {
          optionsFunc(itipItem, Ci.calIErrors.CAL_IS_READONLY);
        } else if (itemList.length > 0) {
          ItipItemFinderFactory.findItem(itemList[0].id, itipItem, optionsFunc);
        } else if (optionsFunc) {
          optionsFunc(itipItem, Cr.NS_OK);
        }
        break;
      }
      default: {
        if (optionsFunc) {
          optionsFunc(itipItem, Cr.NS_ERROR_NOT_IMPLEMENTED);
        }
        break;
      }
    }
  },

  /**
   * Scope: iTIP message sender
   *
   * Checks to see if e.g. attendees were added/removed or an item has been deleted and sends out
   * appropriate iTIP messages.
   *
   * @param {Number} aOpType                    Type of operation - (e.g. ADD, MODIFY or DELETE)
   * @param {calIItemBase} aItem                The updated item
   * @param {calIItemBase} aOriginalItem        The original item
   * @param {?Object} aExtResponse              An object to provide additional
   *                                            parameters for sending itip messages as response
   *                                            mode, comments or a subset of recipients. Currently
   *                                            implemented attributes are:
   *                             * responseMode Response mode (long) as defined for autoResponse
   *                                            of calIItipItem. The default mode is USER (which
   *                                            will trigger displaying the previously known popup
   *                                            to ask the user whether to send)
   */
  checkAndSend(aOpType, aItem, aOriginalItem, aExtResponse = null) {
    // balance out parts of the modification vs delete confusion, deletion of occurrences
    // are notified as parent modifications and modifications of occurrences are notified
    // as mixed new-occurrence, old-parent (IIRC).
    if (aOriginalItem && aItem.recurrenceInfo) {
      if (aOriginalItem.recurrenceId && !aItem.recurrenceId) {
        // sanity check: assure aItem doesn't refer to the master
        aItem = aItem.recurrenceInfo.getOccurrenceFor(aOriginalItem.recurrenceId);
        cal.ASSERT(aItem, "unexpected!");
        if (!aItem) {
          return;
        }
      }

      if (aOriginalItem.recurrenceInfo && aItem.recurrenceInfo) {
        // check whether the two differ only in EXDATEs
        let clonedItem = aItem.clone();
        let exdates = [];
        for (let ritem of clonedItem.recurrenceInfo.getRecurrenceItems()) {
          let wrappedRItem = cal.wrapInstance(ritem, Ci.calIRecurrenceDate);
          if (
            ritem.isNegative &&
            wrappedRItem &&
            !aOriginalItem.recurrenceInfo.getRecurrenceItems().some(recitem => {
              let wrappedR = cal.wrapInstance(recitem, Ci.calIRecurrenceDate);
              return (
                recitem.isNegative && wrappedR && wrappedR.date.compare(wrappedRItem.date) == 0
              );
            })
          ) {
            exdates.push(wrappedRItem);
          }
        }
        if (exdates.length > 0) {
          // check whether really only EXDATEs have been added:
          let recInfo = clonedItem.recurrenceInfo;
          exdates.forEach(recInfo.deleteRecurrenceItem, recInfo);
          if (cal.item.compareContent(clonedItem, aOriginalItem)) {
            // transition into "delete occurrence(s)"
            // xxx todo: support multiple
            aItem = aOriginalItem.recurrenceInfo.getOccurrenceFor(exdates[0].date);
            aOriginalItem = null;
            aOpType = Ci.calIOperationListener.DELETE;
          }
        }
      }
    }
    // for backward compatibility, we assume USER mode if not set otherwise
    let autoResponse = { mode: Ci.calIItipItem.USER };
    if (aExtResponse && aExtResponse.hasOwnProperty("responseMode")) {
      switch (aExtResponse.responseMode) {
        case Ci.calIItipItem.AUTO:
        case Ci.calIItipItem.NONE:
        case Ci.calIItipItem.USER:
          autoResponse.mode = aExtResponse.responseMode;
          break;
        default:
          cal.ERROR(
            "cal.itip.checkAndSend(): Invalid value " +
              aExtResponse.responseMode +
              " provided for responseMode attribute in argument aExtResponse." +
              " Falling back to USER mode.\r\n" +
              cal.STACK(20)
          );
      }
    } else if (
      (aOriginalItem && aOriginalItem.getAttendees().length) ||
      aItem.getAttendees().length
    ) {
      // let's log something useful to notify addon developers or find any
      // missing pieces in the conversions if the current or original item
      // has attendees - the latter is to prevent logging if creating events
      // by click and slide in day or week views
      cal.LOG(
        "cal.itip.checkAndSend: no response mode provided, " +
          "falling back to USER mode.\r\n" +
          cal.STACK(20)
      );
    }
    if (autoResponse.mode == Ci.calIItipItem.NONE) {
      // we stop here and don't send anything if the user opted out before
      return;
    }

    let invitedAttendee = calitip.isInvitation(aItem) && calitip.getInvitedAttendee(aItem);
    if (invitedAttendee) {
      // actually is an invitation copy, fix attendee list to send REPLY
      /* We check if the attendee id matches one of of the
       * userAddresses. If they aren't equal, it means that
       * someone is accepting invitations on behalf of an other user. */
      if (aItem.calendar.aclEntry) {
        let userAddresses = aItem.calendar.aclEntry.getUserAddresses();
        if (
          userAddresses.length > 0 &&
          !cal.email.attendeeMatchesAddresses(invitedAttendee, userAddresses)
        ) {
          invitedAttendee = invitedAttendee.clone();
          invitedAttendee.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
        }
      }

      if (aItem.organizer) {
        let origInvitedAttendee =
          aOriginalItem && aOriginalItem.getAttendeeById(invitedAttendee.id);

        if (aOpType == Ci.calIOperationListener.DELETE) {
          // in case the attendee has just deleted the item, we want to send out a DECLINED REPLY:
          origInvitedAttendee = invitedAttendee;
          invitedAttendee = invitedAttendee.clone();
          invitedAttendee.participationStatus = "DECLINED";
        }

        // We want to send a REPLY send if:
        // - there has been a PARTSTAT change
        // - in case of an organizer SEQUENCE bump we'd go and reconfirm our PARTSTAT
        if (
          !origInvitedAttendee ||
          origInvitedAttendee.participationStatus != invitedAttendee.participationStatus ||
          (aOriginalItem && calitip.getSequence(aItem) != calitip.getSequence(aOriginalItem))
        ) {
          aItem = aItem.clone();
          aItem.removeAllAttendees();
          aItem.addAttendee(invitedAttendee);
          // we remove X-MS-OLK-SENDER to avoid confusing Outlook 2007+ (w/o Exchange)
          // about the notification sender (see bug 603933)
          if (aItem.hasProperty("X-MS-OLK-SENDER")) {
            aItem.deleteProperty("X-MS-OLK-SENDER");
          }
          // if the event was delegated to the replying attendee, we may also notify also
          // the delegator due to chapter 3.2.2.3. of RfC 5546
          let replyTo = [];
          let delegatorIds = invitedAttendee.getProperty("DELEGATED-FROM");
          if (
            delegatorIds &&
            Services.prefs.getBoolPref("calendar.itip.notifyDelegatorOnReply", false)
          ) {
            let getDelegator = function(aDelegatorId) {
              let delegator = aOriginalItem.getAttendeeById(aDelegatorId);
              if (delegator) {
                replyTo.push(delegator);
              }
            };
            // Our backends currently do not support multi-value params. libical just
            // swallows any value but the first, while ical.js fails to parse the item
            // at all. Single values are handled properly by both backends though.
            // Once bug 1206502 lands, ical.js will handle multi-value params, but
            // we end up in different return types of getProperty. A native exposure of
            // DELEGATED-FROM and DELEGATED-TO in calIAttendee may change this.
            if (Array.isArray(delegatorIds)) {
              for (let delegatorId of delegatorIds) {
                getDelegator(delegatorId);
              }
            } else if (typeof delegatorIds == "string") {
              getDelegator(delegatorIds);
            }
          }
          replyTo.push(aItem.organizer);
          sendMessage(aItem, "REPLY", replyTo, autoResponse);
        }
      }
      return;
    }

    if (aItem.getProperty("X-MOZ-SEND-INVITATIONS") != "TRUE") {
      // Only send invitations/cancellations
      // if the user checked the checkbox
      return;
    }

    // special handling for invitation with event status cancelled
    if (aItem.getAttendees().length > 0 && aItem.getProperty("STATUS") == "CANCELLED") {
      if (calitip.getSequence(aItem) > 0) {
        // make sure we send a cancellation and not an request
        aOpType = Ci.calIOperationListener.DELETE;
      } else {
        // don't send an invitation, if the event was newly created and has status cancelled
        return;
      }
    }

    if (aOpType == Ci.calIOperationListener.DELETE) {
      sendMessage(aItem, "CANCEL", aItem.getAttendees(), autoResponse);
      return;
    } // else ADD, MODIFY:

    let originalAtt = aOriginalItem ? aOriginalItem.getAttendees() : [];
    let itemAtt = aItem.getAttendees();
    let canceledAttendees = [];
    let addedAttendees = [];

    if (itemAtt.length > 0 || originalAtt.length > 0) {
      let attMap = {};
      for (let att of originalAtt) {
        attMap[att.id.toLowerCase()] = att;
      }

      for (let att of itemAtt) {
        if (att.id.toLowerCase() in attMap) {
          // Attendee was in original item.
          delete attMap[att.id.toLowerCase()];
        } else {
          // Attendee only in new item
          addedAttendees.push(att);
        }
      }

      for (let id in attMap) {
        let cancAtt = attMap[id];
        canceledAttendees.push(cancAtt);
      }
    }

    // setting default value to control for sending (cancellation) messages
    // this will be set to false, once the user cancels sending manually
    let sendOut = true;
    // Check to see if some part of the item was updated, if so, re-send REQUEST
    if (!aOriginalItem || calitip.compare(aItem, aOriginalItem) > 0) {
      // REQUEST
      // check whether it's a simple UPDATE (no SEQUENCE change) or real (RE)REQUEST,
      // in case of time or location/description change.
      let isMinorUpdate =
        aOriginalItem && calitip.getSequence(aItem) == calitip.getSequence(aOriginalItem);

      if (
        !isMinorUpdate ||
        !cal.item.compareContent(stripUserData(aItem), stripUserData(aOriginalItem))
      ) {
        let requestItem = aItem.clone();
        if (!requestItem.organizer) {
          requestItem.organizer = createOrganizer(requestItem.calendar);
        }

        // Fix up our attendees for invitations using some good defaults
        let recipients = [];
        let reqItemAtt = requestItem.getAttendees();
        if (!isMinorUpdate) {
          requestItem.removeAllAttendees();
        }
        for (let attendee of reqItemAtt) {
          if (!isMinorUpdate) {
            attendee = attendee.clone();
            if (!attendee.role) {
              attendee.role = "REQ-PARTICIPANT";
            }
            attendee.participationStatus = "NEEDS-ACTION";
            attendee.rsvp = "TRUE";
            requestItem.addAttendee(attendee);
          }
          recipients.push(attendee);
        }

        // if send out should be limited to newly added attendees and no major
        // props (attendee is not such) have changed, only the respective attendee
        // is added to the recipient list while the attendee information in the
        // ical is left to enable the new attendee to see who else is attending
        // the event (if not prevented otherwise)
        if (
          isMinorUpdate &&
          addedAttendees.length > 0 &&
          Services.prefs.getBoolPref("calendar.itip.updateInvitationForNewAttendeesOnly", false)
        ) {
          recipients = addedAttendees;
        }

        if (recipients.length > 0) {
          sendOut = sendMessage(requestItem, "REQUEST", recipients, autoResponse);
        }
      }
    }

    // Cancel the event for all canceled attendees
    if (canceledAttendees.length > 0) {
      let cancelItem = aOriginalItem.clone();
      cancelItem.removeAllAttendees();
      for (let att of canceledAttendees) {
        cancelItem.addAttendee(att);
      }
      if (sendOut) {
        sendMessage(cancelItem, "CANCEL", canceledAttendees, autoResponse);
      }
    }
  },

  /**
   * Bumps the SEQUENCE in case of a major change; XXX todo may need more fine-tuning.
   *
   * @param {calIItemBase} newItem        The new item to set the sequence on
   * @param {calIItemBase} oldItem        The old item to get the previous version from.
   * @return {calIItemBase}               The newly changed item
   */
  prepareSequence(newItem, oldItem) {
    if (calitip.isInvitation(newItem)) {
      return newItem; // invitation copies don't bump the SEQUENCE
    }

    if (newItem.recurrenceId && !oldItem.recurrenceId && oldItem.recurrenceInfo) {
      // XXX todo: there's still the bug that modifyItem is called with mixed occurrence/parent,
      //           find original occurrence
      oldItem = oldItem.recurrenceInfo.getOccurrenceFor(newItem.recurrenceId);
      cal.ASSERT(oldItem, "unexpected!");
      if (!oldItem) {
        return newItem;
      }
    }

    let hashMajorProps = function(aItem) {
      const majorProps = {
        DTSTART: true,
        DTEND: true,
        DURATION: true,
        DUE: true,
        RDATE: true,
        RRULE: true,
        EXDATE: true,
        STATUS: true,
        LOCATION: true,
      };

      let propStrings = [];
      for (let item of cal.iterate.items([aItem])) {
        for (let prop of cal.iterate.icalProperty(item.icalComponent)) {
          if (prop.propertyName in majorProps) {
            propStrings.push(item.recurrenceId + "#" + prop.icalString);
          }
        }
      }
      propStrings.sort();
      return propStrings.join("");
    };

    let hash1 = hashMajorProps(newItem);
    let hash2 = hashMajorProps(oldItem);
    if (hash1 != hash2) {
      newItem = newItem.clone();
      // bump SEQUENCE, it never decreases (mind undo scenario here)
      newItem.setProperty(
        "SEQUENCE",
        String(Math.max(calitip.getSequence(oldItem), calitip.getSequence(newItem)) + 1)
      );
    }

    return newItem;
  },

  /**
   * Returns a copy of an itipItem with modified properties and items build from scratch Use
   * itipItem.clone() instead if only a simple copy is required
   *
   * @param  {calIItipItem} aItipItem  ItipItem to derive a new one from
   * @param  {calIItemBase[]} aItems   calIEvent or calITodo items to be contained in the new itipItem
   * @param  {Object} aProps           Properties to be different in the new itipItem
   * @return {calIItipItem}            The copied and modified item
   */
  getModifiedItipItem(aItipItem, aItems = [], aProps = {}) {
    let itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
    let serializedItems = "";
    for (let item of aItems) {
      serializedItems += cal.item.serialize(item);
    }
    itipItem.init(serializedItems);

    itipItem.autoResponse = "autoResponse" in aProps ? aProps.autoResponse : aItipItem.autoResponse;
    itipItem.identity = "identity" in aProps ? aProps.identity : aItipItem.identity;
    itipItem.isSend = "isSend" in aProps ? aProps.isSend : aItipItem.isSend;
    itipItem.localStatus = "localStatus" in aProps ? aProps.localStatus : aItipItem.localStatus;
    itipItem.receivedMethod =
      "receivedMethod" in aProps ? aProps.receivedMethod : aItipItem.receivedMethod;
    itipItem.responseMethod =
      "responseMethod" in aProps ? aProps.responseMethod : aItipItem.responseMethod;
    itipItem.targetCalendar =
      "targetCalendar" in aProps ? aProps.targetCalendar : aItipItem.targetCalendar;

    return itipItem;
  },

  /**
   * A shortcut to send DECLINECOUNTER messages - for everything else use calitip.checkAndSend
   *
   * @param {calIItipItem} aItem              item to be sent
   * @param {String} aMethod                  iTIP method
   * @param {calIAttendee[]} aRecipientsList  array of calIAttendee objects the message should be sent to
   * @param {Object} aAutoResponse            JS object whether the transport should ask before sending
   * @return {Boolean}                        True
   */
  sendDeclineCounterMessage(aItem, aMethod, aRecipientsList, aAutoResponse) {
    if (aMethod == "DECLINECOUNTER") {
      return sendMessage(aItem, aMethod, aRecipientsList, aAutoResponse);
    }
    return false;
  },

  /**
   * Returns a copy of an event that
   * - has a relation set to the original event
   * - has the same organizer but
   * - has any attendee removed
   * Intended to get a copy of a normal event invitation that behaves as if the PUBLISH method was
   * chosen instead.
   *
   * @param {calIItemBase} aItem      Original item
   * @param {?String} aUid            UID to use for the new item
   * @return {calIItemBase}           The copied item for publishing
   */
  getPublishLikeItemCopy(aItem, aUid) {
    // avoid changing aItem
    let item = aItem.clone();
    // reset to a new UUID if applicable
    item.id = aUid || cal.getUUID();
    // add a relation to the original item
    let relation = cal.createRelation();
    relation.relId = aItem.id;
    relation.relType = "SIBLING";
    item.addRelation(relation);
    // remove attendees
    item.removeAllAttendees();
    if (!aItem.isMutable) {
      item = item.makeImmutable();
    }
    return item;
  },

  /**
   * Shortcut function to check whether an item is an invitation copy.
   *
   * @param {calIItemBase} aItem      The item to check for an invitation.
   * @return {Boolean}                True, if the item is an invitation.
   */
  isInvitation(aItem) {
    let isInvitation = false;
    let calendar = cal.wrapInstance(aItem.calendar, Ci.calISchedulingSupport);
    if (calendar) {
      isInvitation = calendar.isInvitation(aItem);
    }
    return isInvitation;
  },

  /**
   * Shortcut function to check whether an item is an invitation copy and has a participation
   * status of either NEEDS-ACTION or TENTATIVE.
   *
   * @param {calIAttendee|calIItemBase} aItem     either calIAttendee or calIItemBase
   * @return {Boolean}                            True, if the attendee partstat is NEEDS-ACTION
   *                                                or TENTATIVE
   */
  isOpenInvitation(aItem) {
    let wrappedItem = cal.wrapInstance(aItem, Ci.calIAttendee);
    if (!wrappedItem) {
      aItem = calitip.getInvitedAttendee(aItem);
    }
    if (aItem) {
      switch (aItem.participationStatus) {
        case "NEEDS-ACTION":
        case "TENTATIVE":
          return true;
      }
    }
    return false;
  },

  /**
   * Resolves delegated-to/delegated-from calusers for a given attendee to also include the
   * respective CNs if available in a given set of attendees
   *
   * @param {calIAttendee} aAttendee          The attendee to resolve the delegation information for
   * @param {calIAttendee[]} aAttendees       An array of calIAttendee objects to look up
   * @return {Object}                         An object with string attributes for delegators and delegatees
   */
  resolveDelegation(aAttendee, aAttendees) {
    let attendees = aAttendees || [aAttendee];

    // this will be replaced by a direct property getter in calIAttendee
    let delegators = [];
    let delegatees = [];
    let delegatorProp = aAttendee.getProperty("DELEGATED-FROM");
    if (delegatorProp) {
      delegators = typeof delegatorProp == "string" ? [delegatorProp] : delegatorProp;
    }
    let delegateeProp = aAttendee.getProperty("DELEGATED-TO");
    if (delegateeProp) {
      delegatees = typeof delegateeProp == "string" ? [delegateeProp] : delegateeProp;
    }

    for (let att of attendees) {
      let resolveDelegation = function(e, i, a) {
        if (e == att.id) {
          a[i] = att.toString();
        }
      };
      delegators.forEach(resolveDelegation);
      delegatees.forEach(resolveDelegation);
    }
    return {
      delegatees: delegatees.join(", "),
      delegators: delegators.join(", "),
    };
  },

  /**
   * Shortcut function to get the invited attendee of an item.
   *
   * @param {calIItemBase} aItem          Event or task to get the invited attendee for
   * @param {?calICalendar} aCalendar     The calendar to use for checking, defaults to the item
   *                                        calendar
   * @return {?calIAttendee}              The attendee that was invited
   */
  getInvitedAttendee(aItem, aCalendar) {
    if (!aCalendar) {
      aCalendar = aItem.calendar;
    }
    let invitedAttendee = null;
    let calendar = cal.wrapInstance(aCalendar, Ci.calISchedulingSupport);
    if (calendar) {
      invitedAttendee = calendar.getInvitedAttendee(aItem);
    }
    return invitedAttendee;
  },

  /**
   * Returns all attendees from given set of attendees matching based on the attendee id
   * or a sent-by parameter compared to the specified email address
   *
   * @param {calIAttendee[]} aAttendees       An array of calIAttendee objects
   * @param {String} aEmailAddress            A string containing the email address for lookup
   * @return {calIAttendee[]}                 Returns an array of matching attendees
   */
  getAttendeesBySender(aAttendees, aEmailAddress) {
    let attendees = [];
    // we extract the email address to make it work also for a raw header value
    let compFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(
      Ci.nsIMsgCompFields
    );
    let addresses = compFields.splitRecipients(aEmailAddress, true);
    if (addresses.length == 1) {
      let searchFor = cal.email.prependMailTo(addresses[0]);
      aAttendees.forEach(aAttendee => {
        if ([aAttendee.id, aAttendee.getProperty("SENT-BY")].includes(searchFor)) {
          attendees.push(aAttendee);
        }
      });
    } else {
      cal.WARN("No unique email address for lookup!");
    }
    return attendees;
  },
};

/** local to this module file
 * Sets the received info either on the passed attendee or item object.
 *
 * @param {calIItemBase|calIAttendee} item      The item to set info on
 * @param {calIItipItem} itipItemItem           The received iTIP item
 */
function setReceivedInfo(item, itipItemItem) {
  let wrappedItem = cal.wrapInstance(item, Ci.calIAttendee);
  item.setProperty(
    wrappedItem ? "RECEIVED-SEQUENCE" : "X-MOZ-RECEIVED-SEQUENCE",
    String(calitip.getSequence(itipItemItem))
  );
  let dtstamp = calitip.getStamp(itipItemItem);
  if (dtstamp) {
    item.setProperty(
      wrappedItem ? "RECEIVED-DTSTAMP" : "X-MOZ-RECEIVED-DTSTAMP",
      dtstamp.getInTimezone(cal.dtz.UTC).icalString
    );
  }
}

/**
 * Strips user specific data, e.g. categories and alarm settings and returns the stripped item.
 *
 * @param {calIItemBase} item_      The item to strip data from
 * @return {calIItemBase}           The stripped item
 */
function stripUserData(item_) {
  let item = item_.clone();
  let stamp = item.stampTime;
  let lastModified = item.lastModifiedTime;
  item.clearAlarms();
  item.alarmLastAck = null;
  item.setCategories([]);
  item.deleteProperty("RECEIVED-SEQUENCE");
  item.deleteProperty("RECEIVED-DTSTAMP");
  for (let [name] of item.properties) {
    let pname = name;
    if (pname.substr(0, "X-MOZ-".length) == "X-MOZ-") {
      item.deleteProperty(name);
    }
  }
  item.getAttendees().forEach(att => {
    att.deleteProperty("RECEIVED-SEQUENCE");
    att.deleteProperty("RECEIVED-DTSTAMP");
  });

  // according to RfC 6638, the following items must not be exposed in client side
  // scheduling messages, so let's remove it if present
  let removeSchedulingParams = aCalUser => {
    aCalUser.deleteProperty("SCHEDULE-AGENT");
    aCalUser.deleteProperty("SCHEDULE-FORCE-SEND");
    aCalUser.deleteProperty("SCHEDULE-STATUS");
  };
  item.getAttendees().forEach(removeSchedulingParams);
  if (item.organizer) {
    removeSchedulingParams(item.organizer);
  }

  item.setProperty("DTSTAMP", stamp);
  item.setProperty("LAST-MODIFIED", lastModified); // need to be last to undirty the item
  return item;
}

/** local to this module file
 * Takes over relevant item information from iTIP item and sets received info.
 *
 * @param {calIItemBase} item           The stored calendar item to update
 * @param {calIItipItem} itipItemItem   The received item
 * @return {calIItemBase}               A copy of the item with correct received info
 */
function updateItem(item, itipItemItem) {
  /**
   * Migrates some user data from the old to new item
   *
   * @param {calIItemBase} newItem        The new item to copy to
   * @param {calIItemBase} oldItem        The old item to copy from
   */
  function updateUserData(newItem, oldItem) {
    // preserve user settings:
    newItem.generation = oldItem.generation;
    newItem.clearAlarms();
    for (let alarm of oldItem.getAlarms()) {
      newItem.addAlarm(alarm);
    }
    newItem.alarmLastAck = oldItem.alarmLastAck;
    let cats = oldItem.getCategories();
    newItem.setCategories(cats);
  }

  let newItem = item.clone();
  newItem.icalComponent = itipItemItem.icalComponent;
  setReceivedInfo(newItem, itipItemItem);
  updateUserData(newItem, item);

  let recInfo = itipItemItem.recurrenceInfo;
  if (recInfo) {
    // keep care of installing all overridden items, and mind existing alarms, categories:
    for (let rid of recInfo.getExceptionIds()) {
      let excItem = recInfo.getExceptionFor(rid).clone();
      cal.ASSERT(excItem, "unexpected!");
      let newExc = newItem.recurrenceInfo.getOccurrenceFor(rid).clone();
      newExc.icalComponent = excItem.icalComponent;
      setReceivedInfo(newExc, itipItemItem);
      let existingExcItem = item.recurrenceInfo && item.recurrenceInfo.getExceptionFor(rid);
      if (existingExcItem) {
        updateUserData(newExc, existingExcItem);
      }
      newItem.recurrenceInfo.modifyException(newExc, true);
    }
  }

  return newItem;
}

/** local to this module file
 * Copies the provider-specified properties from the itip item to the passed
 * item. Special case property "METHOD" uses the itipItem's receivedMethod.
 *
 * @param {calIItipItem} itipItem      The itip item containing the receivedMethod.
 * @param {calIItemBase} itipItemItem  The calendar item inside the itip item.
 * @param {calIItemBase} item          The target item to copy to.
 */
function copyProviderProperties(itipItem, itipItemItem, item) {
  // Copy over itip properties to the item if requested by the provider
  let copyProps = item.calendar.getProperty("itip.copyProperties") || [];
  for (let prop of copyProps) {
    if (prop == "METHOD") {
      // Special case, this copies over the received method
      item.setProperty("METHOD", itipItem.receivedMethod.toUpperCase());
    } else if (itipItemItem.hasProperty(prop)) {
      // Otherwise just copy from the item contained in the itipItem
      item.setProperty(prop, itipItemItem.getProperty(prop));
    }
  }
}

/** local to this module file
 * Creates an organizer calIAttendee object based on the calendar's configured organizer id.
 *
 * @param {calICalendar} aCalendar      The calendar to get the organizer id from
 * @return {calIAttendee}               The organizer attendee
 */
function createOrganizer(aCalendar) {
  let orgId = aCalendar.getProperty("organizerId");
  if (!orgId) {
    return null;
  }
  let organizer = cal.createAttendee();
  organizer.id = orgId;
  organizer.commonName = aCalendar.getProperty("organizerCN");
  organizer.role = "REQ-PARTICIPANT";
  organizer.participationStatus = "ACCEPTED";
  organizer.isOrganizer = true;
  return organizer;
}

/** local to this module file
 * Sends an iTIP message using the passed item's calendar transport.
 *
 * @param {calIEvent} aItem                 item to be sent
 * @param {String} aMethod                  iTIP method
 * @param {calIAttendee[]} aRecipientsList  array of calIAttendee objects the message should be sent to
 * @param {Object} autoResponse             inout object whether the transport should ask before sending
 * @return {Boolean}                        True, if the message could be sent
 */
function sendMessage(aItem, aMethod, aRecipientsList, autoResponse) {
  let calendar = cal.wrapInstance(aItem.calendar, Ci.calISchedulingSupport);
  if (calendar) {
    if (calendar.QueryInterface(Ci.calISchedulingSupport).canNotify(aMethod, aItem)) {
      // provider will handle that, so we return - we leave it also to the provider to
      // deal with user canceled notifications (if possible), so set the return value
      // to true as false would prevent any further notification within this cycle
      return true;
    }
  }

  if (aRecipientsList.length == 0) {
    return false;
  }

  let transport = aItem.calendar.getProperty("itip.transport");
  if (!transport) {
    // can only send if there's a transport for the calendar
    return false;
  }
  transport = transport.QueryInterface(Ci.calIItipTransport);

  let _sendItem = function(aSendToList, aSendItem) {
    let itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
    itipItem.init(cal.item.serialize(aSendItem));
    itipItem.responseMethod = aMethod;
    itipItem.targetCalendar = aSendItem.calendar;
    itipItem.autoResponse = autoResponse.mode;
    // we switch to AUTO for each subsequent call of _sendItem()
    autoResponse.mode = Ci.calIItipItem.AUTO;
    // XXX I don't know whether the below is used at all, since we don't use the itip processor
    itipItem.isSend = true;

    return transport.sendItems(aSendToList, itipItem);
  };

  // split up transport, if attendee undisclosure is requested
  // and this is a message send by the organizer
  if (
    aItem.getProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED") == "TRUE" &&
    aMethod != "REPLY" &&
    aMethod != "REFRESH" &&
    aMethod != "COUNTER"
  ) {
    for (let recipient of aRecipientsList) {
      // create a list with a single recipient
      let sendToList = [recipient];
      // remove other recipients from vevent attendee list
      let sendItem = aItem.clone();
      sendItem.removeAllAttendees();
      sendItem.addAttendee(recipient);
      // send message
      if (!_sendItem(sendToList, sendItem)) {
        return false;
      }
    }
    return true;
  }
  return _sendItem(aRecipientsList, aItem);
}

/** local to this module file
 * An operation listener that is used on calendar operations which checks and sends further iTIP
 * messages based on the calendar action.
 *
 * @param {Object} aOpListener          operation listener to forward
 * @param {calIItemBase} aOldItem       The previous item before modification (if any)
 * @param {?Object} aExtResponse        An object to provide additional parameters for sending itip
 *                                        messages as response mode, comments or a subset of
 *                                        recipients.
 */
function ItipOpListener(aOpListener, aOldItem, aExtResponse = null) {
  this.mOpListener = aOpListener;
  this.mOldItem = aOldItem;
  this.mExtResponse = aExtResponse;
}
ItipOpListener.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),

  mOpListener: null,
  mOldItem: null,
  mExtResponse: null,

  onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
    cal.ASSERT(Components.isSuccessCode(aStatus), "error on iTIP processing");
    if (Components.isSuccessCode(aStatus)) {
      calitip.checkAndSend(aOperationType, aDetail, this.mOldItem, this.mExtResponse);
    }
    if (this.mOpListener) {
      this.mOpListener.onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail);
    }
  },
  onGetResult(calendar, status, itemType, detail, items) {},
};

/** local to this module file
 * Add a parameter SCHEDULE-AGENT=CLIENT to the item before it is
 * created or updated so that the providers knows scheduling will
 * be handled by the client.
 *
 * @param {calIItemBase} item       item about to be added or updated
 * @param {calICalendar} calendar   calendar into which the item is about to be added or updated
 */
function addScheduleAgentClient(item, calendar) {
  if (calendar.getProperty("capabilities.autoschedule.supported") === true) {
    if (item.organizer) {
      item.organizer.setProperty("SCHEDULE-AGENT", "CLIENT");
    }
  }
}

var ItipItemFinderFactory = {
  /**  Map to save finder instances for given ids */
  _findMap: {},

  /**
   * Create an item finder and track its progress. Be sure to clean up the
   * finder for this id at some point.
   *
   * @param {String} aId              The item id to search for
   * @param {calIIipItem} aItipItem   The iTIP item used for processing
   * @param {Function} aOptionsFunc   The options function used for processing the found item
   */
  findItem(aId, aItipItem, aOptionsFunc) {
    this.cleanup(aId);
    let finder = new ItipItemFinder(aId, aItipItem, aOptionsFunc);
    this._findMap[aId] = finder;
    finder.findItem();
  },

  /**
   * Clean up tracking for the given id. This needs to be called once for
   * every time findItem is called.
   *
   * @param {String} aId           The item id to clean up for
   */
  cleanup(aId) {
    if (aId in this._findMap) {
      let finder = this._findMap[aId];
      finder.destroy();
      delete this._findMap[aId];
    }
  },
};

/** local to this module file
 * An operation listener triggered by cal.itip.processItipItem() for lookup of the sent iTIP item's UID.
 *
 * @param {String} aId              The search identifier for the item to find
 * @param {calIItipItem} itipItem   Sent iTIP item
 * @param {Function} optionsFunc    Options func, see cal.itip.processItipItem()
 */
function ItipItemFinder(aId, itipItem, optionsFunc) {
  this.mItipItem = itipItem;
  this.mOptionsFunc = optionsFunc;
  this.mSearchId = aId;
}

ItipItemFinder.prototype = {
  QueryInterface: cal.generateQI([Ci.calIObserver, Ci.calIOperationListener]),

  mSearchId: null,
  mItipItem: null,
  mOptionsFunc: null,
  mFoundItems: null,

  findItem() {
    this.mFoundItems = [];
    this._unobserveChanges();
    this.mItipItem.targetCalendar.getItem(this.mSearchId, this);
  },

  _observeChanges(aCalendar) {
    this._unobserveChanges();
    this.mObservedCalendar = aCalendar;

    if (this.mObservedCalendar) {
      this.mObservedCalendar.addObserver(this);
    }
  },
  _unobserveChanges() {
    if (this.mObservedCalendar) {
      this.mObservedCalendar.removeObserver(this);
      this.mObservedCalendar = null;
    }
  },

  onStartBatch() {},
  onEndBatch() {},
  onError() {},
  onPropertyChanged() {},
  onPropertyDeleting() {},
  onLoad(aCalendar) {
    // Its possible that the item was updated. We need to re-retrieve the
    // items now.
    this.findItem();
  },

  onModifyItem(aNewItem, aOldItem) {
    let refItem = aOldItem || aNewItem;
    if (refItem.id == this.mSearchId) {
      // Check existing found items to see if it already exists
      let found = false;
      for (let [idx, item] of Object.entries(this.mFoundItems)) {
        if (item.id == refItem.id && item.calendar.id == refItem.calendar.id) {
          if (aNewItem) {
            this.mFoundItems.splice(idx, 1, aNewItem);
          } else {
            this.mFoundItems.splice(idx, 1);
          }
          found = true;
          break;
        }
      }

      // If it hasn't been found and there is to add a item, add it to the end
      if (!found && aNewItem) {
        this.mFoundItems.push(aNewItem);
      }
      this.processFoundItems();
    }
  },

  onAddItem(aItem) {
    // onModifyItem is set up to also handle additions
    this.onModifyItem(aItem, null);
  },

  onDeleteItem(aItem) {
    // onModifyItem is set up to also handle deletions
    this.onModifyItem(null, aItem);
  },

  onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
    this.processFoundItems();
  },

  destroy() {
    this._unobserveChanges();
  },

  processFoundItems() {
    let rc = Cr.NS_OK;
    const method = this.mItipItem.receivedMethod.toUpperCase();
    let actionMethod = method;
    let operations = [];

    if (this.mFoundItems.length > 0) {
      // Save the target calendar on the itip item
      this.mItipItem.targetCalendar = this.mFoundItems[0].calendar;
      this._observeChanges(this.mItipItem.targetCalendar);

      cal.LOG("iTIP on " + method + ": found " + this.mFoundItems.length + " items.");
      switch (method) {
        // XXX todo: there's still a potential flaw, if multiple PUBLISH/REPLY/REQUEST on
        //           occurrences happen at once; those lead to multiple
        //           occurrence modifications. Since those modifications happen
        //           implicitly on the parent (ics/memory/storage calls modifyException),
        //           the generation check will fail. We should really consider to allow
        //           deletion/modification/addition of occurrences directly on the providers,
        //           which would ease client code a lot.
        case "REFRESH":
        case "PUBLISH":
        case "REQUEST":
        case "REPLY":
        case "COUNTER":
        case "DECLINECOUNTER":
          for (let itipItemItem of this.mItipItem.getItemList()) {
            for (let item of this.mFoundItems) {
              let rid = itipItemItem.recurrenceId; //  XXX todo support multiple
              if (rid) {
                // actually applies to individual occurrence(s)
                if (item.recurrenceInfo) {
                  item = item.recurrenceInfo.getOccurrenceFor(rid);
                  if (!item) {
                    continue;
                  }
                } else {
                  // the item has been rescheduled with master:
                  itipItemItem = itipItemItem.parentItem;
                }
              }

              switch (method) {
                case "REFRESH": {
                  // xxx todo test
                  let attendees = itipItemItem.getAttendees();
                  cal.ASSERT(attendees.length == 1, "invalid number of attendees in REFRESH!");
                  if (attendees.length > 0) {
                    let action = function(opListener, partStat, extResponse) {
                      if (!item.organizer) {
                        let org = createOrganizer(item.calendar);
                        if (org) {
                          item = item.clone();
                          item.organizer = org;
                        }
                      }
                      sendMessage(
                        item,
                        "REQUEST",
                        attendees,
                        { responseMode: Ci.calIItipItem.AUTO } /* don't ask */
                      );
                    };
                    operations.push(action);
                  }
                  break;
                }
                case "PUBLISH":
                  cal.ASSERT(
                    itipItemItem.getAttendees().length == 0,
                    "invalid number of attendees in PUBLISH!"
                  );
                  if (
                    item.calendar.getProperty("itip.disableRevisionChecks") ||
                    calitip.compare(itipItemItem, item) > 0
                  ) {
                    let newItem = updateItem(item, itipItemItem);
                    let action = function(opListener, partStat, extResponse) {
                      return newItem.calendar.modifyItem(newItem, item, opListener);
                    };
                    actionMethod = method + ":UPDATE";
                    operations.push(action);
                  }
                  break;
                case "REQUEST": {
                  let newItem = updateItem(item, itipItemItem);
                  let att = calitip.getInvitedAttendee(newItem);
                  if (!att) {
                    // fall back to using configured organizer
                    att = createOrganizer(newItem.calendar);
                    if (att) {
                      att.isOrganizer = false;
                    }
                  }
                  if (att) {
                    let firstFoundItem = this.mFoundItems[0];
                    // again, fall back to using configured organizer if not found
                    let foundAttendee = firstFoundItem.getAttendeeById(att.id) || att;

                    // If the the user hasn't responded to the invitation yet and we
                    // are viewing the current representation of the item, show the
                    // accept/decline buttons. This means newer events will show the
                    // "Update" button and older events will show the "already
                    // processed" text.
                    if (
                      foundAttendee.participationStatus == "NEEDS-ACTION" &&
                      (item.calendar.getProperty("itip.disableRevisionChecks") ||
                        calitip.compare(itipItemItem, item) == 0)
                    ) {
                      actionMethod = "REQUEST:NEEDS-ACTION";
                      operations.push((opListener, partStat, extResponse) => {
                        let changedItem = firstFoundItem.clone();
                        changedItem.removeAttendee(foundAttendee);
                        foundAttendee = foundAttendee.clone();
                        if (partStat) {
                          foundAttendee.participationStatus = partStat;
                        }
                        changedItem.addAttendee(foundAttendee);

                        return changedItem.calendar.modifyItem(
                          changedItem,
                          firstFoundItem,
                          new ItipOpListener(opListener, firstFoundItem, extResponse)
                        );
                      });
                    } else if (
                      item.calendar.getProperty("itip.disableRevisionChecks") ||
                      calitip.compare(itipItemItem, item) > 0
                    ) {
                      addScheduleAgentClient(newItem, item.calendar);

                      let isMinorUpdate = calitip.getSequence(newItem) == calitip.getSequence(item);
                      actionMethod = isMinorUpdate ? method + ":UPDATE-MINOR" : method + ":UPDATE";
                      operations.push((opListener, partStat, extResponse) => {
                        if (!partStat) {
                          // keep PARTSTAT
                          let att_ = calitip.getInvitedAttendee(item);
                          partStat = att_ ? att_.participationStatus : "NEEDS-ACTION";
                        }
                        newItem.removeAttendee(att);
                        att = att.clone();
                        att.participationStatus = partStat;
                        newItem.addAttendee(att);
                        return newItem.calendar.modifyItem(
                          newItem,
                          item,
                          new ItipOpListener(opListener, item, extResponse)
                        );
                      });
                    }
                  }
                  break;
                }
                case "DECLINECOUNTER":
                  // nothing to do right now, but once countering is implemented,
                  // we probably need some action here to remove the proposal from
                  // the countering attendee's calendar
                  break;
                case "COUNTER":
                case "REPLY": {
                  let attendees = itipItemItem.getAttendees();
                  if (method == "REPLY") {
                    cal.ASSERT(attendees.length == 1, "invalid number of attendees in REPLY!");
                  } else {
                    attendees = cal.itip.getAttendeesBySender(attendees, this.mItipItem.sender);
                    cal.ASSERT(
                      attendees.length == 1,
                      "ambiguous resolution of replying attendee in COUNTER!"
                    );
                  }
                  // we get the attendee from the event stored in the calendar
                  let replyer = item.getAttendeeById(attendees[0].id);
                  if (!replyer && method == "REPLY") {
                    // We accepts REPLYs also from previously uninvited
                    // attendees, so we always have one for REPLY
                    replyer = attendees[0];
                  }
                  let noCheck = item.calendar.getProperty("itip.disableRevisionChecks");
                  let revCheck = false;
                  if (replyer && !noCheck) {
                    revCheck = calitip.compare(itipItemItem, replyer) > 0;
                    if (revCheck && method == "COUNTER") {
                      revCheck = calitip.compareSequence(itipItemItem, item) == 0;
                    }
                  }

                  if (replyer && (noCheck || revCheck)) {
                    let newItem = item.clone();
                    newItem.removeAttendee(replyer);
                    replyer = replyer.clone();
                    setReceivedInfo(replyer, itipItemItem);
                    let newPS = itipItemItem.getAttendeeById(replyer.id).participationStatus;
                    replyer.participationStatus = newPS;
                    newItem.addAttendee(replyer);

                    // Make sure the provider-specified properties are copied over
                    copyProviderProperties(this.mItipItem, itipItemItem, newItem);

                    let action = function(opListener, partStat, extResponse) {
                      // n.b.: this will only be processed in case of reply or
                      // declining the counter request - of sending the
                      // appropriate reply will be taken care within the
                      // opListener (defined in imip-bar.js)
                      // TODO: move that from imip-bar.js to here
                      return newItem.calendar.modifyItem(
                        newItem,
                        item,
                        newItem.calendar.getProperty("itip.notify-replies")
                          ? new ItipOpListener(opListener, item, extResponse)
                          : opListener
                      );
                    };
                    operations.push(action);
                  }
                  break;
                }
              }
            }
          }
          break;
        case "CANCEL": {
          let modifiedItems = {};
          for (let itipItemItem of this.mItipItem.getItemList()) {
            for (let item of this.mFoundItems) {
              let rid = itipItemItem.recurrenceId; //  XXX todo support multiple
              if (rid) {
                // actually a CANCEL of occurrence(s)
                if (item.recurrenceInfo) {
                  // collect all occurrence deletions into a single parent modification:
                  let newItem = modifiedItems[item.id];
                  if (!newItem) {
                    newItem = item.clone();
                    modifiedItems[item.id] = newItem;

                    // Make sure the provider-specified properties are copied over
                    copyProviderProperties(this.mItipItem, itipItemItem, newItem);

                    operations.push((opListener, partStat, extResponse) =>
                      newItem.calendar.modifyItem(newItem, item, opListener)
                    );
                  }
                  newItem.recurrenceInfo.removeOccurrenceAt(rid);
                } else if (item.recurrenceId && item.recurrenceId.compare(rid) == 0) {
                  // parentless occurrence to be deleted (future)
                  operations.push((opListener, partStat, extResponse) =>
                    item.calendar.deleteItem(item, opListener)
                  );
                }
              } else {
                operations.push((opListener, partStat, extResponse) =>
                  item.calendar.deleteItem(item, opListener)
                );
              }
            }
          }
          break;
        }
        default:
          rc = Cr.NS_ERROR_NOT_IMPLEMENTED;
          break;
      }
    } else {
      // not found:
      cal.LOG("iTIP on " + method + ": no existing items.");

      // If the item was not found, observe the target calendar anyway.
      // It will likely be the composite calendar, so we should update
      // if an item was added or removed
      this._observeChanges(this.mItipItem.targetCalendar);

      for (let itipItemItem of this.mItipItem.getItemList()) {
        switch (method) {
          case "REQUEST":
          case "PUBLISH": {
            let action = (opListener, partStat, extResponse) => {
              let newItem = itipItemItem.clone();
              setReceivedInfo(newItem, itipItemItem);
              newItem.parentItem.calendar = this.mItipItem.targetCalendar;
              addScheduleAgentClient(newItem, this.mItipItem.targetCalendar);
              if (partStat) {
                if (partStat != "DECLINED") {
                  cal.alarms.setDefaultValues(newItem);
                }
                let att = calitip.getInvitedAttendee(newItem);
                if (!att) {
                  // fall back to using configured organizer
                  att = createOrganizer(newItem.calendar);
                  if (att) {
                    att.isOrganizer = false;
                    newItem.addAttendee(att);
                  }
                }
                if (att) {
                  att.participationStatus = partStat;
                } else {
                  cal.ASSERT(att, "no attendee to reply REQUEST!");
                  return null;
                }
              } else {
                cal.ASSERT(
                  itipItemItem.getAttendees().length == 0,
                  "invalid number of attendees in PUBLISH!"
                );
                cal.alarms.setDefaultValues(newItem);
              }
              return newItem.calendar.addItem(
                newItem,
                method == "REQUEST" ? new ItipOpListener(opListener, null, extResponse) : opListener
              );
            };
            operations.push(action);
            break;
          }
          case "CANCEL": // has already been processed
          case "REPLY": // item has been previously removed from the calendar
          case "COUNTER": // the item has been previously removed form the calendar
            break;
          default:
            rc = Cr.NS_ERROR_NOT_IMPLEMENTED;
            break;
        }
      }
    }

    cal.LOG("iTIP operations: " + operations.length);
    let actionFunc = null;
    if (operations.length > 0) {
      actionFunc = function(opListener, partStat = null, extResponse = null) {
        for (let operation of operations) {
          try {
            operation(opListener, partStat, extResponse);
          } catch (exc) {
            cal.ERROR(exc);
          }
        }
      };
      actionFunc.method = actionMethod;
    }

    this.mOptionsFunc(this.mItipItem, rc, actionFunc, this.mFoundItems);
  },

  onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
    if (Components.isSuccessCode(aStatus)) {
      this.mFoundItems = this.mFoundItems.concat(aItems);
    }
  },
};
