/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://calendar/modules/calIteratorUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Scheduling and iTIP helper code
 */
this.EXPORTED_SYMBOLS = ["cal"]; // even though it's defined in calUtils.jsm, import needs this
cal.itip = {
    /**
     * Gets the sequence/revision number, either of the passed item or
     * the last received one of an attendee; see
     * <http://tools.ietf.org/html/draft-desruisseaux-caldav-sched-04#section-7.1>.
     */
    getSequence: function(item) {
        let seq = null;

        let wrappedItem = cal.wrapInstance(item, Components.interfaces.calIAttendee);
        if (wrappedItem) {
            seq = wrappedItem.getProperty("RECEIVED-SEQUENCE");
        } else if (item) {
            // Unless the below is standardized, we store the last original
            // REQUEST/PUBLISH SEQUENCE in X-MOZ-RECEIVED-SEQUENCE to test against it
            // when updates come in:
            seq = item.getProperty("X-MOZ-RECEIVED-SEQUENCE");
            if (seq === null) {
                seq = item.getProperty("SEQUENCE");
            }

            // Make sure we don't have a pre Outlook 2007 appointment, but if we do
            // use Microsoft's Sequence number. I <3 MS
            if ((seq === null) || (seq == "0")) {
                seq = item.getProperty("X-MICROSOFT-CDO-APPT-SEQUENCE");
            }
        }

        if (seq === null) {
            return 0;
        } else {
            seq = parseInt(seq, 10);
            return (isNaN(seq) ? 0 : seq);
        }
    },

    /**
     * Gets the stamp date-time, either of the passed item or
     * the last received one of an attendee; see
     * <http://tools.ietf.org/html/draft-desruisseaux-caldav-sched-04#section-7.2>.
     */
    getStamp: function(item) {
        let dtstamp = null;

        let wrappedItem = cal.wrapInstance(item, Components.interfaces.calIAttendee);
        if (wrappedItem) {
            let stamp = wrappedItem.getProperty("RECEIVED-DTSTAMP");
            if (stamp) {
                dtstamp = cal.createDateTime(stamp);
            }
        } else if (item) {
            // Unless the below is standardized, we store the last original
            // REQUEST/PUBLISH DTSTAMP in X-MOZ-RECEIVED-DTSTAMP to test against it
            // when updates come in:
            let stamp = item.getProperty("X-MOZ-RECEIVED-DTSTAMP");
            if (stamp) {
                dtstamp = cal.createDateTime(stamp);
            } else {
                // xxx todo: are there similar X-MICROSOFT-CDO properties to be considered here?
                dtstamp = item.stampTime;
            }
        }

        return dtstamp;
    },

    /**
     * Compares sequences and/or stamps of two items
     *
     * @param {calIEvent|calIToDo|calIAttendee} aItem1
     * @param {calIEvent|calIToDo|calIAttendee} aItem2
     * @return {Integer} +1 if item2 is newer, -1 if item1 is newer or 0 if both are equal
     */
    compare: function(aItem1, aItem2) {
        let comp = cal.itip.compareSequence(aItem1, aItem2);
        if (comp == 0) {
            comp = cal.itip.compareStamp(aItem1, aItem2);
        }
        return comp;
    },

    /**
     * Compares sequences of two items
     *
     * @param {calIEvent|calIToDo|calIAttendee} aItem1
     * @param {calIEvent|calIToDo|calIAttendee} aItem2
     * @return {Integer} +1 if item2 is newer, -1 if item1 is newer or 0 if both are equal
     */
    compareSequence: function(aItem1, aItem2) {
        let seq1 = cal.itip.getSequence(aItem1);
        let seq2 = cal.itip.getSequence(aItem2);
        if (seq1 > seq2) {
            return 1;
        } else if (seq1 < seq2) {
            return -1;
        } else {
            return 0;
        }
    },

    /**
     * Compares stamp of two items
     *
     * @param {calIEvent|calIToDo|calIAttendee} aItem1
     * @param {calIEvent|calIToDo|calIAttendee} aItem2
     * @return {Integer} +1 if item2 is newer, -1 if item1 is newer or 0 if both are equal
     */
    compareStamp: function(aItem1, aItem2) {
        let st1 = cal.itip.getStamp(aItem1);
        let st2 = cal.itip.getStamp(aItem2);
        if (st1 && st2) {
            return st1.compare(st2);
        } else if (!st1 && st2) {
            return -1;
        } else if (st1 && !st2) {
            return 1;
        } else {
            return 0;
        }
    },

    /**
     * Checks if the given calendar is a scheduling calendar. This means it
     * needs an organizer id and an itip transport. It should also be writable.
     *
     * @param calendar    The calendar to check
     * @return            True, if its a scheduling calendar.
     */
    isSchedulingCalendar: function(calendar) {
        return cal.isCalendarWritable(calendar) &&
               calendar.getProperty("organizerId") &&
               calendar.getProperty("itip.transport");
    },

    /**
     * Scope: iTIP message receiver
     *
     * Given an nsIMsgDBHdr and an imipMethod, set up the given itip item.
     *
     * @param itipItem    The item to set up
     * @param imipMethod  The received imip method
     * @param aMsgHdr     Information about the received email
     */
    initItemFromMsgData: function(itipItem, imipMethod, aMsgHdr) {
        // set the sender of the itip message
        itipItem.sender = cal.itip.getMessageSender(aMsgHdr);

        // Get the recipient identity and save it with the itip item.
        itipItem.identity = cal.itip.getMessageRecipient(aMsgHdr);

        // We are only called upon receipt of an invite, so ensure that isSend
        // is false.
        itipItem.isSend = false;

        // XXX Get these from preferences
        itipItem.autoResponse = Components.interfaces.calIItipItem.USER;

        if (imipMethod && imipMethod.length != 0 && imipMethod.toLowerCase() != "nomethod") {
            itipItem.receivedMethod = imipMethod.toUpperCase();
        } else { // There is no METHOD in the content-type header (spec violation).
                 // Fall back to using the one from the itipItem's ICS.
            imipMethod = itipItem.receivedMethod;
        }
        cal.LOG("iTIP method: " + imipMethod);

        let isWritableCalendar = function(aCalendar) {
            /* TODO: missing ACL check for existing items (require callback API) */
            return cal.itip.isSchedulingCalendar(aCalendar) &&
                   cal.userCanAddItemsToCalendar(aCalendar);
        };

        let writableCalendars = cal.getCalendarManager().getCalendars({}).filter(isWritableCalendar);
        if (writableCalendars.length > 0) {
            let compCal = Components.classes["@mozilla.org/calendar/calendar;1?type=composite"]
                                    .createInstance(Components.interfaces.calICompositeCalendar);
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
     * @param aStatus         The status of the processing (i.e NS_OK, an error code)
     * @param aOperationType  An operation type from calIOperationListener
     * @return                The suggested text.
     */
    getCompleteText: function(aStatus, aOperationType) {
        function _gs(strName, param) {
            return cal.calGetString("lightning", strName, param, "lightning");
        }

        let text = "";
        const cIOL = Components.interfaces.calIOperationListener;
        if (Components.isSuccessCode(aStatus)) {
            switch (aOperationType) {
                case cIOL.ADD: text = _gs("imipAddedItemToCal2"); break;
                case cIOL.MODIFY: text = _gs("imipUpdatedItem2"); break;
                case cIOL.DELETE: text = _gs("imipCanceledItem2"); break;
            }
        } else {
            text = _gs("imipBarProcessingFailed", [aStatus.toString(16)]);
        }
        return text;
    },

    /**
     * Scope: iTIP message receiver
     *
     * Gets a text describing the given itip method. The text is of the form
     * "This Message contains a ... ".
     *
     * @param method      The method to describe.
     * @return            The localized text about the method.
     */
    getMethodText: function(method) {
        function _gs(strName) {
            return cal.calGetString("lightning", strName, null, "lightning");
        }

        switch (method) {
            case "REFRESH": return _gs("imipBarRefreshText");
            case "REQUEST": return _gs("imipBarRequestText");
            case "PUBLISH": return _gs("imipBarPublishText");
            case "CANCEL": return _gs("imipBarCancelText");
            case "REPLY": return _gs("imipBarReplyText");
            case "COUNTER": return _gs("imipBarCounterText");
            case "DECLINECOUNTER": return _gs("imipBarDeclineCounterText");
            default:
                cal.ERROR("Unknown iTIP method: " + method);
                return _gs("imipBarUnsupportedText");
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
     *    buttons: ["imipXXXButton", ...],
     *    hideMenuItem: ["imipXXXButton_Option", ...]
     * }
     *
     * @see processItipItem   This takes the same parameters as its optionFunc.
     * @param itipItem        The itipItem to query.
     * @param rc              The result of retrieving the item
     * @param actionFunc      The action function.
     */
    getOptionsText: function(itipItem, rc, actionFunc, foundItems) {
        function _gs(strName) {
            return cal.calGetString("lightning", strName, null, "lightning");
        }
        let imipLabel = null;
        if (itipItem.receivedMethod) {
            imipLabel = cal.itip.getMethodText(itipItem.receivedMethod);
        }
        let data = { label: imipLabel, buttons: [], hideMenuItems: [] };

        let disallowedCounter = false;
        if (foundItems && foundItems.length) {
             let disallow = foundItems[0].getProperty("X-MICROSOFT-DISALLOW-COUNTER");
             disallowedCounter = disallow && disallow == "TRUE";
        }
        if (rc == Components.interfaces.calIErrors.CAL_IS_READONLY) {
            // No writable calendars, tell the user about it
            data.label = _gs("imipBarNotWritable");
        } else if (Components.isSuccessCode(rc) && !actionFunc) {
            // This case, they clicked on an old message that has already been
            // added/updated, we want to tell them that.
            data.label = _gs("imipBarAlreadyProcessedText");
            if (foundItems && foundItems.length) {
                data.buttons.push("imipDetailsButton");
                if (itipItem.receivedMethod == "COUNTER" && itipItem.sender) {
                    if (disallowedCounter) {
                        data.label = _gs("imipBarDisallowedCounterText");
                    } else {
                        let comparison;
                        for (let item of itipItem.getItemList({})) {
                            let attendees = cal.getAttendeesBySender(
                                    item.getAttendees({}),
                                    itipItem.sender
                            );
                            if (attendees.length == 1) {
                                let replyer = foundItems[0].getAttendeeById(attendees[0].id);
                                comparison = cal.itip.compareSequence(item, foundItems[0]);
                                if (comparison == 1) {
                                    data.label = _gs("imipBarCounterErrorText");
                                    break;
                                } else if (comparison == -1) {
                                    data.label = _gs("imipBarCounterPreviousVersionText");
                                }
                            }
                        }
                    }
                }
            } else if (itipItem.receivedMethod == "REPLY") {
                // The item has been previously removed from the available calendars or the calendar
                // containing the item is not available
                let delmgr = Components.classes["@mozilla.org/calendar/deleted-items-manager;1"]
                                       .getService(Components.interfaces.calIDeletedItems);
                let delTime = null;
                let items = itipItem.getItemList({});
                if (items && items.length) {
                    delTime = delmgr.getDeletedDate(items[0].id);
                }
                if (delTime) {
                    data.label = _gs("imipBarReplyToRecentlyRemovedItem", [delTime.toString()]);
                } else {
                    data.label = _gs("imipBarReplyToNotExistingItem");
                }
            } else if (itipItem.receivedMethod == "DECLINECOUNTER") {
                data.label = _gs("imipBarDeclineCounterText");
            }
        } else if (Components.isSuccessCode(rc)) {
            cal.LOG("iTIP options on: " + actionFunc.method);
            switch (actionFunc.method) {
                case "PUBLISH:UPDATE":
                case "REQUEST:UPDATE-MINOR":
                    data.label = _gs("imipBarUpdateText");
                    // falls through
                case "REPLY":
                    data.buttons.push("imipUpdateButton");
                    break;
                case "PUBLISH":
                    data.buttons.push("imipAddButton");
                    break;
                case "REQUEST:UPDATE":
                case "REQUEST:NEEDS-ACTION":
                case "REQUEST": {
                    if (actionFunc.method == "REQUEST:UPDATE") {
                        data.label = _gs("imipBarUpdateText");
                    } else if (actionFunc.method == "REQUEST:NEEDS-ACTION") {
                        data.label = _gs("imipBarProcessedNeedsAction");
                    }

                    let isRecurringMaster = false;
                    for (let item of itipItem.getItemList({})) {
                        if (item.recurrenceInfo) {
                            isRecurringMaster = true;
                        }
                    }
                    if (itipItem.getItemList({}).length > 1 || isRecurringMaster) {
                        data.buttons.push("imipAcceptRecurrencesButton");
                        data.buttons.push("imipDeclineRecurrencesButton");
                    } else {
                        data.buttons.push("imipAcceptButton");
                        data.buttons.push("imipDeclineButton");
                    }
                    data.buttons.push("imipMoreButton");
                    // Use data.hideMenuItems.push("idOfMenuItem") to hide specific menuitems
                    // from the dropdown menu of a button.  This might be useful to to remove
                    // a generally available option for a specific invitation, because the
                    // respective feature is not available for the calendar, the invitation
                    // is in or the feature is prohibited by the organizer
                    break;
                }
                case "CANCEL": {
                    data.buttons.push("imipDeleteButton");
                    break;
                }
                case "REFRESH": {
                    data.buttons.push("imipReconfirmButton");
                    break;
                }
                case "COUNTER": {
                    if (disallowedCounter) {
                        data.label = _gs("imipBarDisallowedCounterText");
                    }
                    data.buttons.push("imipDeclineCounterButton");
                    data.buttons.push("imipRescheduleButton");
                    break;
                }
                default:
                    data.label = _gs("imipBarUnsupportedText");
                    break;
            }
        } else {
            data.label = _gs("imipBarUnsupportedText");
        }

        return data;
    },

    /**
     * Scope: iTIP message receiver
     * Retrieves the message sender.
     *
     * @param {nsIMsgHdr} aMsgHdr     The message header to check.
     * @return                        The email address of the intended recipient.
     */
    getMessageSender: function(aMsgHdr) {
        let author = (aMsgHdr && aMsgHdr.author) || "";
        let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                                   .createInstance(Components.interfaces.nsIMsgCompFields);
        let addresses = compFields.splitRecipients(author, true, {});
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
     * @param aMsgHdr     The message to check.
     * @return            The email of the intended recipient.
     */
    getMessageRecipient: function(aMsgHdr) {
        if (!aMsgHdr) {
            return null;
        }

        let identities;
        let actMgr = MailServices.accounts;
        if (aMsgHdr.accountKey) {
            // First, check if the message has an account key. If so, we can use the
            // account identities to find the correct recipient
            identities = actMgr.getAccount(aMsgHdr.accountKey).identities;
        } else if (aMsgHdr.folder) {
            // Without an account key, we have to revert back to using the server
            identities = actMgr.getIdentitiesForServer(aMsgHdr.folder.server);
        }

        let emailMap = {};
        if (!identities || identities.length == 0) {
            // If we were not able to retrieve identities above, then we have no
            // choice but to revert to the default identity
            let identity = actMgr.defaultAccount.defaultIdentity;
            if (!identity) {
                // If there isn't a default identity (i.e Local Folders is your
                // default identity), then go ahead and use the first available
                // identity.
                let allIdentities = actMgr.allIdentities;
                if (allIdentities.length > 0) {
                    identity = allIdentities.queryElementAt(0, Components.interfaces.nsIMsgIdentity);
                } else {
                    // If there are no identities at all, we cannot get a recipient.
                    return null;
                }
            }
            emailMap[identity.email.toLowerCase()] = true;
        } else {
            // Build a map of usable email addresses
            for (let i = 0; i < identities.length; i++) {
                let identity = identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
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
     * Prompt for the target calendar, if needed for the given method. This
     * calendar will be set on the passed itip item.
     *
     * @param aMethod       The method to check.
     * @param aItipItem     The itip item to set the target calendar on.
     * @param aWindow       The window to open the dialog on.
     * @return              True, if a calendar was selected or no selection is
     *                        needed.
     */
    promptCalendar: function(aMethod, aItipItem, aWindow) {
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
            let calendars = cal.getCalendarManager().getCalendars({}).filter(cal.itip.isSchedulingCalendar);

            if (aItipItem.receivedMethod == "REQUEST") {
                // try to further limit down the list to those calendars that
                // are configured to a matching attendee;
                let item = aItipItem.getItemList({})[0];
                let matchingCals = calendars.filter(calendar => cal.getInvitedAttendee(item, calendar) != null);
                // if there's none, we will show the whole list of calendars:
                if (matchingCals.length > 0) {
                    calendars = matchingCals;
                }
            }

            if (calendars.length == 0) {
                let msg = cal.calGetString("lightning", "imipNoCalendarAvailable", null, "lightning");
                aWindow.alert(msg);
            } else if (calendars.length == 1) {
                // There's only one calendar, so it's silly to ask what calendar
                // the user wants to import into.
                targetCalendar = calendars[0];
            } else {
                // Ask what calendar to import into
                let args = {};
                args.calendars = calendars;
                args.onOk = (aCal) => { targetCalendar = aCal; };
                args.promptText = cal.calGetString("calendar", "importPrompt");
                aWindow.openDialog("chrome://calendar/content/chooseCalendarDialog.xul",
                                   "_blank", "chrome,titlebar,modal,resizable", args);
            }

            if (targetCalendar) {
                aItipItem.targetCalendar = targetCalendar;
            }
        }

        return !needsCalendar || targetCalendar != null;
    },

    /**
     * Clean up after the given iTIP item. This needs to be called once for each
     * time processItipItem is called. May be called with a null itipItem in
     * which case it will do nothing.
     *
     * @param itipItem      The iTIP item to clean up for.
     */
    cleanupItipItem: function(itipItem) {
        if (itipItem) {
            let itemList = itipItem.getItemList({});
            if (itemList.length > 0) {
                // Again, we can assume the id is the same over all items per spec
                ItipItemFinderFactory.cleanup(itemList[0].id);
            }
        }
    },

    /**
     * Scope: iTIP message receiver
     *
     * Checks the passed iTIP item and calls the passed function with options offered.
     * Be sure to call cleanupItipItem at least once after calling this function.
     *
     * @param itipItem iTIP item
     * @param optionsFunc function being called with parameters: itipItem, resultCode, actionFunc
     *                    The action func has a property |method| showing the options:
     *                    * REFRESH -- send the latest item (sent by attendee(s))
     *                    * PUBLISH -- initial publish, no reply (sent by organizer)
     *                    * PUBLISH:UPDATE -- update of a published item (sent by organizer)
     *                    * REQUEST -- initial invitation (sent by organizer)
     *                    * REQUEST:UPDATE -- rescheduling invitation, has major change (sent by organizer)
     *                    * REQUEST:UPDATE-MINOR -- update of invitation, minor change (sent by organizer)
     *                    * REPLY -- invitation reply (sent by attendee(s))
     *                    * CANCEL -- invitation cancel (sent by organizer)
     *                    * COUNTER -- counterproposal (sent by attendee)
     *                    * DECLINECOUNTER -- denial of a counterproposal (sent by organizer)
     */
    processItipItem: function(itipItem, optionsFunc) {
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
                let itemList = itipItem.getItemList({});
                if (!itipItem.targetCalendar) {
                    optionsFunc(itipItem, Components.interfaces.calIErrors.CAL_IS_READONLY);
                } else if (itemList.length > 0) {
                    ItipItemFinderFactory.findItem(itemList[0].id, itipItem, optionsFunc);
                } else if (optionsFunc) {
                    optionsFunc(itipItem, Components.results.NS_OK);
                }
                break;
            }
            default: {
                if (optionsFunc) {
                    optionsFunc(itipItem, Components.results.NS_ERROR_NOT_IMPLEMENTED);
                }
                break;
            }
        }
    },

    /**
     * Scope: iTIP message sender
     *
     * Checks to see if e.g. attendees were added/removed or an item has been
     * deleted and sends out appropriate iTIP messages.
     */
    checkAndSend: function(aOpType, aItem, aOriginalItem) {
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
                for (let ritem of clonedItem.recurrenceInfo.getRecurrenceItems({})) {
                    let wrappedRItem = cal.wrapInstance(ritem, Components.interfaces.calIRecurrenceDate);
                    if (ritem.isNegative &&
                        wrappedRItem &&
                        !aOriginalItem.recurrenceInfo.getRecurrenceItems({}).some((recitem) => {
                            let wrappedR = cal.wrapInstance(recitem, Components.interfaces.calIRecurrenceDate);
                            return recitem.isNegative &&
                                   wrappedR &&
                                   wrappedR.date.compare(wrappedRItem.date) == 0;
                        })) {
                        exdates.push(wrappedRItem);
                    }
                }
                if (exdates.length > 0) {
                    // check whether really only EXDATEs have been added:
                    let recInfo = clonedItem.recurrenceInfo;
                    exdates.forEach(recInfo.deleteRecurrenceItem, recInfo);
                    if (cal.compareItemContent(clonedItem, aOriginalItem)) { // transition into "delete occurrence(s)"
                        // xxx todo: support multiple
                        aItem = aOriginalItem.recurrenceInfo.getOccurrenceFor(exdates[0].date);
                        aOriginalItem = null;
                        aOpType = Components.interfaces.calIOperationListener.DELETE;
                    }
                }
            }
        }

        let autoResponse = { value: false }; // controls confirm to send email only once

        let invitedAttendee = cal.isInvitation(aItem) && cal.getInvitedAttendee(aItem);
        if (invitedAttendee) { // actually is an invitation copy, fix attendee list to send REPLY
            /* We check if the attendee id matches one of of the
             * userAddresses. If they aren't equal, it means that
             * someone is accepting invitations on behalf of an other user. */
            if (aItem.calendar.aclEntry) {
                let userAddresses = aItem.calendar.aclEntry.getUserAddresses({});
                if (userAddresses.length > 0 &&
                    !cal.attendeeMatchesAddresses(invitedAttendee, userAddresses)) {
                    invitedAttendee = invitedAttendee.clone();
                    invitedAttendee.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
                }
            }

            if (aItem.organizer) {
                let origInvitedAttendee = (aOriginalItem && aOriginalItem.getAttendeeById(invitedAttendee.id));

                if (aOpType == Components.interfaces.calIOperationListener.DELETE) {
                    // in case the attendee has just deleted the item, we want to send out a DECLINED REPLY:
                    origInvitedAttendee = invitedAttendee;
                    invitedAttendee = invitedAttendee.clone();
                    invitedAttendee.participationStatus = "DECLINED";
                }

                // We want to send a REPLY send if:
                // - there has been a PARTSTAT change
                // - in case of an organizer SEQUENCE bump we'd go and reconfirm our PARTSTAT
                if (!origInvitedAttendee ||
                    (origInvitedAttendee.participationStatus != invitedAttendee.participationStatus) ||
                    (aOriginalItem && (cal.itip.getSequence(aItem) != cal.itip.getSequence(aOriginalItem)))) {
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
                    if (delegatorIds &&
                        Preferences.get("calendar.itip.notifyDelegatorOnReply", false)) {
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

        if (aItem.getProperty("X-MOZ-SEND-INVITATIONS") != "TRUE") { // Only send invitations/cancellations
                                                                     // if the user checked the checkbox
            return;
        }

        // special handling for invitation with event status cancelled
        if (aItem.getAttendees({}).length > 0 &&
            aItem.getProperty("STATUS") == "CANCELLED") {
            if (cal.itip.getSequence(aItem) > 0) {
                // make sure we send a cancellation and not an request
                aOpType = Components.interfaces.calIOperationListener.DELETE;
            } else {
                // don't send an invitation, if the event was newly created and has status cancelled
                return;
            }
        }

        if (aOpType == Components.interfaces.calIOperationListener.DELETE) {
            sendMessage(aItem, "CANCEL", aItem.getAttendees({}), autoResponse);
            return;
        } // else ADD, MODIFY:

        let originalAtt = (aOriginalItem ? aOriginalItem.getAttendees({}) : []);
        let itemAtt = aItem.getAttendees({});
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
        if (!aOriginalItem || (cal.itip.compare(aItem, aOriginalItem) > 0)) { // REQUEST
            // check whether it's a simple UPDATE (no SEQUENCE change) or real (RE)REQUEST,
            // in case of time or location/description change.
            let isMinorUpdate = (aOriginalItem && (cal.itip.getSequence(aItem) == cal.itip.getSequence(aOriginalItem)));

            if (!isMinorUpdate || !cal.compareItemContent(stripUserData(aItem), stripUserData(aOriginalItem))) {
                let requestItem = aItem.clone();
                if (!requestItem.organizer) {
                    requestItem.organizer = createOrganizer(requestItem.calendar);
                }

                // Fix up our attendees for invitations using some good defaults
                let recipients = [];
                let reqItemAtt = requestItem.getAttendees({});
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
                if (isMinorUpdate &&
                    addedAttendees.length > 0 &&
                    Preferences.get("calendar.itip.updateInvitationForNewAttendeesOnly", false)) {
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
     */
    prepareSequence: function(newItem, oldItem) {
        if (cal.isInvitation(newItem)) {
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
                LOCATION: true
            };

            let propStrings = [];
            for (let item of cal.itemIterator([aItem])) {
                for (let prop of cal.ical.propertyIterator(item.icalComponent)) {
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
            newItem.setProperty("SEQUENCE",
                                String(Math.max(cal.itip.getSequence(oldItem),
                                                cal.itip.getSequence(newItem)) + 1));
        }

        return newItem;
    },

    /**
     * Returns a copy of an itipItem with modified properties and items build from scratch
     * Use itipItem.clone() instead if only a simple copy is required
     *
     * @param  {calIItipItem} aItipItem  ItipItem to derive a new one from
     * @param  {Array}        aItems     calIEvent or calITodo items to be contained in the new itipItem
     * @param  {JsObject}     aProps     Properties to be different in the new itipItem
     * @return {calIItipItem}
     */
    getModifiedItipItem: function(aItipItem, aItems=[], aProps={}) {
        let itipItem = Components.classes["@mozilla.org/calendar/itip-item;1"]
                                 .createInstance(Components.interfaces.calIItipItem);
        let serializedItems = "";
        for (let item of aItems) {
            serializedItems += cal.getSerializedItem(item);
        }
        itipItem.init(serializedItems);

        itipItem.autoResponse = ("autoResponse" in aProps) ? aProps.autoResponse : aItipItem.autoResponse;
        itipItem.identity = ("identity" in aProps) ? aProps.identity : aItipItem.identity;
        itipItem.isSend = ("isSend" in aProps) ? aProps.isSend : aItipItem.isSend;
        itipItem.localStatus = ("localStatus" in aProps) ? aProps.localStatus : aItipItem.localStatus;
        itipItem.receivedMethod = ("receivedMethod" in aProps) ? aProps.receivedMethod : aItipItem.receivedMethod;
        itipItem.responseMethod = ("responseMethod" in aProps) ? aProps.responseMethod : aItipItem.responseMethod;
        itipItem.targetCalendar = ("targetCalendar" in aProps) ? aProps.targetCalendar : aItipItem.targetCalendar;

        return itipItem;
    },

    /**
     * A shortcut to send DECLINECOUNTER messages - for everything else use cal.itip.checkAndSend
     *
     * @param aItem iTIP item to be sent
     * @param aMethod iTIP method
     * @param aRecipientsList an array of calIAttendee objects the message should be sent to
     * @param aAutoResponse an inout object whether the transport should ask before sending
     */
    sendDeclineCounterMessage: function(aItem, aMethod, aRecipientsList, aAutoResponse) {
        if (aMethod == "DECLINECOUNTER") {
            return sendMessage(aItem, aMethod, aRecipientsList, aAutoResponse);
        }
    }
};

/** local to this module file
 * Sets the received info either on the passed attendee or item object.
 *
 * @param item either  calIAttendee or calIItemBase
 * @param itipItemItem received iTIP item
 */
function setReceivedInfo(item, itipItemItem) {
    let wrappedItem = cal.wrapInstance(item, Components.interfaces.calIAttendee);
    item.setProperty(wrappedItem ? "RECEIVED-SEQUENCE"
                                 : "X-MOZ-RECEIVED-SEQUENCE",
                                 String(cal.itip.getSequence(itipItemItem)));
    let dtstamp = cal.itip.getStamp(itipItemItem);
    if (dtstamp) {
        item.setProperty(wrappedItem ? "RECEIVED-DTSTAMP"
                                     : "X-MOZ-RECEIVED-DTSTAMP",
                                     dtstamp.getInTimezone(cal.UTC()).icalString);
    }
}

/**
 * Strips user specific data, e.g. categories and alarm settings and returns the stripped item.
 */
function stripUserData(item_) {
    let item = item_.clone();
    let stamp = item.stampTime;
    let lastModified = item.lastModifiedTime;
    item.clearAlarms();
    item.alarmLastAck = null;
    item.setCategories(0, []);
    item.deleteProperty("RECEIVED-SEQUENCE");
    item.deleteProperty("RECEIVED-DTSTAMP");
    let propEnum = item.propertyEnumerator;
    while (propEnum.hasMoreElements()) {
        let prop = propEnum.getNext().QueryInterface(Components.interfaces.nsIProperty);
        let pname = prop.name;
        if (pname.substr(0, "X-MOZ-".length) == "X-MOZ-") {
            item.deleteProperty(prop.name);
        }
    }
    item.getAttendees({}).forEach((att) => {
        att.deleteProperty("RECEIVED-SEQUENCE");
        att.deleteProperty("RECEIVED-DTSTAMP");
    });
    item.setProperty("DTSTAMP", stamp);
    item.setProperty("LAST-MODIFIED", lastModified); // need to be last to undirty the item
    return item;
}

/** local to this module file
 * Takes over relevant item information from iTIP item and sets received info.
 *
 * @param item         the stored calendar item to update
 * @param itipItemItem the received item
 */
function updateItem(item, itipItemItem) {
    function updateUserData(newItem, oldItem) {
        // preserve user settings:
        newItem.generation = oldItem.generation;
        newItem.clearAlarms();
        for (let alarm of oldItem.getAlarms({})) {
            newItem.addAlarm(alarm);
        }
        newItem.alarmLastAck = oldItem.alarmLastAck;
        let cats = oldItem.getCategories({});
        newItem.setCategories(cats.length, cats);
    }

    let newItem = item.clone();
    newItem.icalComponent = itipItemItem.icalComponent;
    setReceivedInfo(newItem, itipItemItem);
    updateUserData(newItem, item);

    let recInfo = itipItemItem.recurrenceInfo;
    if (recInfo) {
        // keep care of installing all overridden items, and mind existing alarms, categories:
        for (let rid of recInfo.getExceptionIds({})) {
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
 * @param itipItem      The itip item containing the receivedMethod.
 * @param itipItemItem  The calendar item inside the itip item.
 * @param item          The target item to copy to.
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
 * @return calIAttendee object
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
 * @param aItem iTIP item to be sent
 * @param aMethod iTIP method
 * @param aRecipientsList an array of calIAttendee objects the message should be sent to
 * @param autoResponse an inout object whether the transport should ask before sending
 */
function sendMessage(aItem, aMethod, aRecipientsList, autoResponse) {
    if (aRecipientsList.length == 0) {
        return false;
    }
    let calendar = cal.wrapInstance(aItem.calendar, Components.interfaces.calISchedulingSupport);
    if (calendar) {
        if (calendar.QueryInterface(Components.interfaces.calISchedulingSupport)
                    .canNotify(aMethod, aItem)) {
            // provider will handle that, so we return - we leave it also to the provider to
            // deal with user canceled notifications (if possible), so set the return value
            // to true as false would prevent any further notification within this cycle
            return true;
        }
    }

    let aTransport = aItem.calendar.getProperty("itip.transport");
    if (!aTransport) { // can only send if there's a transport for the calendar
        return false;
    }
    aTransport = aTransport.QueryInterface(Components.interfaces.calIItipTransport);

    let _sendItem = function(aSendToList, aSendItem) {
        let cIII = Components.interfaces.calIItipItem;
        let itipItem = Components.classes["@mozilla.org/calendar/itip-item;1"]
                                 .createInstance(Components.interfaces.calIItipItem);
        itipItem.init(cal.getSerializedItem(aSendItem));
        itipItem.responseMethod = aMethod;
        itipItem.targetCalendar = aSendItem.calendar;
        itipItem.autoResponse = autoResponse && autoResponse.value ? cIII.AUTO : cIII.USER;
        if (autoResponse) {
            autoResponse.value = true; // auto every following
        }
        // XXX I don't know whether the below are used at all, since we don't use the itip processor
        itipItem.isSend = true;

        return aTransport.sendItems(aSendToList.length, aSendToList, itipItem);
    };

    // split up transport, if attendee undisclosure is requested
    // and this is a message send by the organizer
    if (aItem.getProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED") == "TRUE" &&
        aMethod != "REPLY" &&
        aMethod != "REFRESH" &&
        aMethod != "COUNTER") {
        for (let aRecipient of aRecipientsList) {
            // create a list with a single recipient
            let sendToList = [aRecipient];
            // remove other recipients from vevent attendee list
            let sendItem = aItem.clone();
            sendItem.removeAllAttendees();
            sendItem.addAttendee(aRecipient);
            // send message
            if (!_sendItem(sendToList, sendItem)) {
                return false;
            }
        }
        return true;
    } else {
        return _sendItem(aRecipientsList, aItem);
    }
}

/** local to this module file
 * An operation listener that is used on calendar operations which checks and sends further iTIP
 * messages based on the calendar action.
 *
 * @param opListener operation listener to forward
 * @param oldItem the previous item before modification (if any)
 */
function ItipOpListener(opListener, oldItem) {
    this.mOpListener = opListener;
    this.mOldItem = oldItem;
}
ItipOpListener.prototype = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
    onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
        cal.ASSERT(Components.isSuccessCode(aStatus), "error on iTIP processing");
        if (Components.isSuccessCode(aStatus)) {
            cal.itip.checkAndSend(aOperationType, aDetail, this.mOldItem);
        }
        if (this.mOpListener) {
            this.mOpListener.onOperationComplete(aCalendar,
                                                 aStatus,
                                                 aOperationType,
                                                 aId,
                                                 aDetail);
        }
    },
    onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
    }
};

/** local to this module file
 * Add a parameter SCHEDULE-AGENT=CLIENT to the item before it is
 * created or updated so that the providers knows scheduling will
 * be handled by the client.
 *
 * @param item item about to be added or updated
 * @param calendar calendar into which the item is about to be added or updated
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
     * @param aId           The item id to search for
     * @param aItipItem     The iTIP item used for processing
     * @param aOptionsFunc  The options function used for processing the found item
     */
    findItem: function(aId, aItipItem, aOptionsFunc) {
        this.cleanup(aId);
        let finder = new ItipItemFinder(aId, aItipItem, aOptionsFunc);
        this._findMap[aId] = finder;
        finder.findItem();
    },

    /**
     * Clean up tracking for the given id. This needs to be called once for
     * every time findItem is called.
     *
     * @param aId           The item id to clean up for
     */
    cleanup: function(aId) {
        if (aId in this._findMap) {
            let finder = this._findMap[aId];
            finder.destroy();
            delete this._findMap[aId];
        }
    }
};

/** local to this module file
 * An operation listener triggered by cal.itip.processItipItem() for lookup of the sent iTIP item's UID.
 *
 * @param itipItem sent iTIP item
 * @param optionsFunc options func, see cal.itip.processItipItem()
 */
function ItipItemFinder(aId, itipItem, optionsFunc) {
    this.mItipItem = itipItem;
    this.mOptionsFunc = optionsFunc;
    this.mSearchId = aId;
}

ItipItemFinder.prototype = {

    QueryInterface: XPCOMUtils.generateQI([
        Components.interfaces.calIObserver,
        Components.interfaces.calIOperationListener
    ]),

    mSearchId: null,
    mItipItem: null,
    mOptionsFunc: null,
    mFoundItems: null,

    findItem: function() {
        this.mFoundItems = [];
        this._unobserveChanges();
        this.mItipItem.targetCalendar.getItem(this.mSearchId, this);
    },

    _observeChanges: function(aCalendar) {
        this._unobserveChanges();
        this.mObservedCalendar = aCalendar;

        if (this.mObservedCalendar) {
            this.mObservedCalendar.addObserver(this);
        }
    },
    _unobserveChanges: function() {
        if (this.mObservedCalendar) {
            this.mObservedCalendar.removeObserver(this);
            this.mObservedCalendar = null;
        }
    },

    onStartBatch: function() {},
    onEndBatch: function() {},
    onError: function() {},
    onPropertyChanged: function() {},
    onPropertyDeleting: function() {},
    onLoad: function(aCalendar) {
        // Its possible that the item was updated. We need to re-retrieve the
        // items now.
        this.findItem();
    },

    onModifyItem: function(aNewItem, aOldItem) {
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

    onAddItem: function(aItem) {
        // onModifyItem is set up to also handle additions
        this.onModifyItem(aItem, null);
    },

    onDeleteItem: function(aItem) {
        // onModifyItem is set up to also handle deletions
        this.onModifyItem(null, aItem);
    },

    onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
        this.processFoundItems();
    },

    destroy: function() {
        this._unobserveChanges();
    },

    processFoundItems: function() {
        let rc = Components.results.NS_OK;
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
                    for (let itipItemItem of this.mItipItem.getItemList({})) {
                        for (let item of this.mFoundItems) {
                            let rid = itipItemItem.recurrenceId; //  XXX todo support multiple
                            if (rid) { // actually applies to individual occurrence(s)
                                if (item.recurrenceInfo) {
                                    item = item.recurrenceInfo.getOccurrenceFor(rid);
                                    if (!item) {
                                        continue;
                                    }
                                } else { // the item has been rescheduled with master:
                                    itipItemItem = itipItemItem.parentItem;
                                }
                            }

                            switch (method) {
                                case "REFRESH": { // xxx todo test
                                    let attendees = itipItemItem.getAttendees({});
                                    cal.ASSERT(attendees.length == 1,
                                               "invalid number of attendees in REFRESH!");
                                    if (attendees.length > 0) {
                                        let action = function(opListener) {
                                            if (!item.organizer) {
                                                let org = createOrganizer(item.calendar);
                                                if (org) {
                                                    item = item.clone();
                                                    item.organizer = org;
                                                }
                                            }
                                            sendMessage(item, "REQUEST", attendees, true /* don't ask */);
                                        };
                                        operations.push(action);
                                    }
                                    break;
                                }
                                case "PUBLISH":
                                    cal.ASSERT(itipItemItem.getAttendees({}).length == 0,
                                               "invalid number of attendees in PUBLISH!");
                                    if (item.calendar.getProperty("itip.disableRevisionChecks") ||
                                        cal.itip.compare(itipItemItem, item) > 0) {
                                        let newItem = updateItem(item, itipItemItem);
                                        let action = function(opListener) {
                                            return newItem.calendar.modifyItem(newItem, item, opListener);
                                        };
                                        actionMethod = method + ":UPDATE";
                                        operations.push(action);
                                    }
                                    break;
                                case "REQUEST": {
                                    let newItem = updateItem(item, itipItemItem);
                                    let att = cal.getInvitedAttendee(newItem);
                                    if (!att) { // fall back to using configured organizer
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
                                        if (foundAttendee.participationStatus == "NEEDS-ACTION" &&
                                            (item.calendar.getProperty("itip.disableRevisionChecks") ||
                                             cal.itip.compare(itipItemItem, item) == 0)) {
                                            actionMethod = "REQUEST:NEEDS-ACTION";
                                            operations.push((opListener, partStat) => {
                                                let changedItem = firstFoundItem.clone();
                                                changedItem.removeAttendee(foundAttendee);
                                                foundAttendee = foundAttendee.clone();
                                                if (partStat) {
                                                    foundAttendee.participationStatus = partStat;
                                                }
                                                changedItem.addAttendee(foundAttendee);

                                                return changedItem.calendar.modifyItem(
                                                    changedItem, firstFoundItem, new ItipOpListener(opListener, firstFoundItem));
                                            });
                                        } else if (item.calendar.getProperty("itip.disableRevisionChecks") ||
                                                   cal.itip.compare(itipItemItem, item) > 0) {
                                            addScheduleAgentClient(newItem, item.calendar);

                                            let isMinorUpdate = cal.itip.getSequence(newItem) ==
                                                                cal.itip.getSequence(item);
                                            actionMethod = (isMinorUpdate ? method + ":UPDATE-MINOR"
                                                                          : method + ":UPDATE");
                                            operations.push((opListener, partStat) => {
                                                if (!partStat) { // keep PARTSTAT
                                                    let att_ = cal.getInvitedAttendee(item);
                                                    partStat = att_ ? att_.participationStatus : "NEEDS-ACTION";
                                                }
                                                newItem.removeAttendee(att);
                                                att = att.clone();
                                                att.participationStatus = partStat;
                                                newItem.addAttendee(att);
                                                return newItem.calendar.modifyItem(
                                                    newItem, item, new ItipOpListener(opListener, item));
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
                                    let attendees = itipItemItem.getAttendees({});
                                    if (method == "REPLY") {
                                        cal.ASSERT(
                                            attendees.length == 1,
                                            "invalid number of attendees in REPLY!"
                                        );
                                    } else {
                                        attendees = cal.getAttendeesBySender(
                                            attendees,
                                            this.mItipItem.sender
                                        );
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
                                    let noCheck = item.calendar.getProperty(
                                        "itip.disableRevisionChecks");
                                    let revCheck = false;
                                    if (replyer && !noCheck) {
                                        revCheck = cal.itip.compare(itipItemItem, replyer) > 0;
                                        if (revCheck && method == "COUNTER") {
                                            revCheck = cal.itip.compareSequence(itipItemItem, item) == 0;
                                        }
                                    }

                                    if (replyer && (noCheck || revCheck)) {
                                        let newItem = item.clone();
                                        newItem.removeAttendee(replyer);
                                        replyer = replyer.clone();
                                        setReceivedInfo(replyer, itipItemItem);
                                        let newPS = itipItemItem.getAttendeeById(replyer.id)
                                                                .participationStatus;
                                        replyer.participationStatus = newPS;
                                        newItem.addAttendee(replyer);

                                        // Make sure the provider-specified properties are copied over
                                        copyProviderProperties(this.mItipItem, itipItemItem, newItem);

                                        let action = function(opListener) {
                                            // n.b.: this will only be processed in case of reply or
                                            // declining the counter request - of sending the
                                            // appropriate reply will be taken care within the
                                            // opListener (defined in imip-bar.js)
                                            // TODO: move that from imip-bar.js to here
                                            return newItem.calendar.modifyItem(
                                                newItem, item,
                                                newItem.calendar.getProperty("itip.notify-replies")
                                                ? new ItipOpListener(opListener, item)
                                                : opListener);
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
                    for (let itipItemItem of this.mItipItem.getItemList({})) {
                        for (let item of this.mFoundItems) {
                            let rid = itipItemItem.recurrenceId; //  XXX todo support multiple
                            if (rid) { // actually a CANCEL of occurrence(s)
                                if (item.recurrenceInfo) {
                                    // collect all occurrence deletions into a single parent modification:
                                    let newItem = modifiedItems[item.id];
                                    if (!newItem) {
                                        newItem = item.clone();
                                        modifiedItems[item.id] = newItem;

                                        // Make sure the provider-specified properties are copied over
                                        copyProviderProperties(this.mItipItem, itipItemItem, newItem);

                                        operations.push(opListener => newItem.calendar.modifyItem(newItem, item, opListener));
                                    }
                                    newItem.recurrenceInfo.removeOccurrenceAt(rid);
                                } else if (item.recurrenceId && (item.recurrenceId.compare(rid) == 0)) {
                                    // parentless occurrence to be deleted (future)
                                    operations.push(opListener => item.calendar.deleteItem(item, opListener));
                                }
                            } else {
                                operations.push(opListener => item.calendar.deleteItem(item, opListener));
                            }
                        }
                    }
                    break;
                }
                default:
                    rc = Components.results.NS_ERROR_NOT_IMPLEMENTED;
                    break;
            }
        } else { // not found:
            cal.LOG("iTIP on " + method + ": no existing items.");

            // If the item was not found, observe the target calendar anyway.
            // It will likely be the composite calendar, so we should update
            // if an item was added or removed
            this._observeChanges(this.mItipItem.targetCalendar);

            for (let itipItemItem of this.mItipItem.getItemList({})) {
                switch (method) {
                    case "REQUEST":
                    case "PUBLISH": {
                        let action = (opListener, partStat) => {
                            let newItem = itipItemItem.clone();
                            setReceivedInfo(newItem, itipItemItem);
                            newItem.parentItem.calendar = this.mItipItem.targetCalendar;
                            addScheduleAgentClient(newItem, this.mItipItem.targetCalendar);
                            if (partStat) {
                                if (partStat != "DECLINED") {
                                    cal.alarms.setDefaultValues(newItem);
                                }
                                let att = cal.getInvitedAttendee(newItem);
                                if (!att) { // fall back to using configured organizer
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
                                cal.ASSERT(itipItemItem.getAttendees({}).length == 0,
                                           "invalid number of attendees in PUBLISH!");
                            }
                            return newItem.calendar.addItem(newItem,
                                                            method == "REQUEST"
                                                            ? new ItipOpListener(opListener, null)
                                                            : opListener);
                        };
                        operations.push(action);
                        break;
                    }
                    case "CANCEL": // has already been processed
                    case "REPLY": // item has been previously removed from the calendar
                    case "COUNTER": // the item has been previously removed form the calendar
                        break;
                    default:
                        rc = Components.results.NS_ERROR_NOT_IMPLEMENTED;
                        break;
                }
            }
        }

        cal.LOG("iTIP operations: " + operations.length);
        let actionFunc = null;
        if (operations.length > 0) {
            actionFunc = function(opListener, partStat) {
                for (let operation of operations) {
                    try {
                        operation(opListener, partStat);
                    } catch (exc) {
                        cal.ERROR(exc);
                    }
                }
            };
            actionFunc.method = actionMethod;
        }

        this.mOptionsFunc(this.mItipItem, rc, actionFunc, this.mFoundItems);
    },

    onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
        if (Components.isSuccessCode(aStatus)) {
            this.mFoundItems = this.mFoundItems.concat(aItems);
        }
    }
};
