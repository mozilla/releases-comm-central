/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CalItipMessageSender"];

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * CalItipMessageSender is responsible for sending out the appropriate iTIP
 * messages when changes have been made to an invitation event.
 */
class CalItipMessageSender {
  /**
   * A CalItipMessageSender instance used to send cancellation messages when
   * attendees have been removed.
   * @type {CalItipMessageSender}
   */
  cancellationMessageSender;

  /**
   * The iTIP method for the sent message.
   * @type {string}
   */
  method;

  /**
   * A list of recipients to send the message to.
   * @type {string[]}
   */
  recipientsList = [];

  /**
   * For backward compatibility, we assume USER mode if not set otherwise
   * @type {object}
   */
  autoResponse = { mode: Ci.calIItipItem.USER };

  /**
   * @param {Number} opType                    Type of operation - (e.g. ADD, MODIFY or DELETE)
   * @param {calIItemBase} item                The updated item
   * @param {calIItemBase} originalItem        The original item
   * @param {?Object} extResponse              An object to provide additional
   *                                           parameters for sending itip messages as response
   *                                           mode, comments or a subset of recipients. Currently
   *                                           implemented attributes are:
   *                             * responseMode Response mode (long) as defined for autoResponse
   *                                           of calIItipItem. The default mode is USER (which
   *                                           will trigger displaying the previously known popup
   *                                           to ask the user whether to send)
   */
  constructor(opType, item, originalItem, extResponse = null) {
    this.opType = opType;
    this.item = item;
    this.originalItem = originalItem;
    this.extResponse = extResponse;
  }

  /**
   * This method checks whether the invitation item has been modified and
   * returns true if messages should be sent out. Note: This method should be
   * called before send() and may modify the internal properties of this
   * instance.
   *
   * @return {boolean}
   */
  detectChanges() {
    // balance out parts of the modification vs delete confusion, deletion of occurrences
    // are notified as parent modifications and modifications of occurrences are notified
    // as mixed new-occurrence, old-parent (IIRC).
    if (this.originalItem && this.item.recurrenceInfo) {
      if (this.originalItem.recurrenceId && !this.item.recurrenceId) {
        // sanity check: assure item doesn't refer to the master
        this.item = this.item.recurrenceInfo.getOccurrenceFor(this.originalItem.recurrenceId);
        cal.ASSERT(this.item, "unexpected!");
        if (!this.item) {
          return false;
        }
      }

      if (this.originalItem.recurrenceInfo && this.item.recurrenceInfo) {
        // check whether the two differ only in EXDATEs
        let clonedItem = this.item.clone();
        let exdates = [];
        for (let ritem of clonedItem.recurrenceInfo.getRecurrenceItems()) {
          let wrappedRItem = cal.wrapInstance(ritem, Ci.calIRecurrenceDate);
          if (
            ritem.isNegative &&
            wrappedRItem &&
            !this.originalItem.recurrenceInfo.getRecurrenceItems().some(recitem => {
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
          if (cal.item.compareContent(clonedItem, this.originalItem)) {
            // transition into "delete occurrence(s)"
            // xxx todo: support multiple
            this.item = this.originalItem.recurrenceInfo.getOccurrenceFor(exdates[0].date);
            this.originalItem = null;
            this.opType = Ci.calIOperationListener.DELETE;
          }
        }
      }
    }

    if (this.extResponse && this.extResponse.hasOwnProperty("responseMode")) {
      switch (this.extResponse.responseMode) {
        case Ci.calIItipItem.AUTO:
        case Ci.calIItipItem.NONE:
        case Ci.calIItipItem.USER:
          this.autoResponse.mode = this.extResponse.responseMode;
          break;
        default:
          cal.ERROR(
            "cal.itip.checkAndSend(): Invalid value " +
              this.extResponse.responseMode +
              " provided for responseMode attribute in argument extResponse." +
              " Falling back to USER mode.\r\n" +
              cal.STACK(20)
          );
      }
    } else if (
      (this.originalItem && this.originalItem.getAttendees().length) ||
      this.item.getAttendees().length
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
    if (this.autoResponse.mode == Ci.calIItipItem.NONE) {
      // we stop here and don't send anything if the user opted out before
      return false;
    }

    let invitedAttendee =
      cal.itip.isInvitation(this.item) && cal.itip.getInvitedAttendee(this.item);
    if (invitedAttendee) {
      // actually is an invitation copy, fix attendee list to send REPLY
      /* We check if the attendee id matches one of of the
       * userAddresses. If they aren't equal, it means that
       * someone is accepting invitations on behalf of an other user. */
      if (this.item.calendar.aclEntry) {
        let userAddresses = this.item.calendar.aclEntry.getUserAddresses();
        if (
          userAddresses.length > 0 &&
          !cal.email.attendeeMatchesAddresses(invitedAttendee, userAddresses)
        ) {
          invitedAttendee = invitedAttendee.clone();
          invitedAttendee.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
        }
      }

      if (this.item.organizer) {
        let origInvitedAttendee =
          this.originalItem && this.originalItem.getAttendeeById(invitedAttendee.id);

        if (this.opType == Ci.calIOperationListener.DELETE) {
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
          (this.originalItem &&
            cal.itip.getSequence(this.item) != cal.itip.getSequence(this.originalItem))
        ) {
          this.item = this.item.clone();
          this.item.removeAllAttendees();
          this.item.addAttendee(invitedAttendee);
          // we remove X-MS-OLK-SENDER to avoid confusing Outlook 2007+ (w/o Exchange)
          // about the notification sender (see bug 603933)
          if (this.item.hasProperty("X-MS-OLK-SENDER")) {
            this.item.deleteProperty("X-MS-OLK-SENDER");
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
              let delegator = this.originalItem.getAttendeeById(aDelegatorId);
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
          replyTo.push(this.item.organizer);
          this.recipientsList = replyTo;
          this.method = "REPLY";
          return true;
        }
      }
      return false;
    }

    if (this.item.getProperty("X-MOZ-SEND-INVITATIONS") != "TRUE") {
      // Only send invitations/cancellations
      // if the user checked the checkbox
      return false;
    }

    // special handling for invitation with event status cancelled
    if (this.item.getAttendees().length > 0 && this.item.getProperty("STATUS") == "CANCELLED") {
      if (cal.itip.getSequence(this.item) > 0) {
        // make sure we send a cancellation and not an request
        this.opType = Ci.calIOperationListener.DELETE;
      } else {
        // don't send an invitation, if the event was newly created and has status cancelled
        return false;
      }
    }

    if (this.opType == Ci.calIOperationListener.DELETE) {
      this.recipientsList = this.item.getAttendees();
      this.method = "CANCEL";
      return true;
    } // else ADD, MODIFY:

    let originalAtt = this.originalItem ? this.originalItem.getAttendees() : [];
    let itemAtt = this.item.getAttendees();
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

    // Check to see if some part of the item was updated, if so, re-send REQUEST
    if (!this.originalItem || cal.itip.compare(this.item, this.originalItem) > 0) {
      // REQUEST
      // check whether it's a simple UPDATE (no SEQUENCE change) or real (RE)REQUEST,
      // in case of time or location/description change.
      let isMinorUpdate =
        this.originalItem &&
        cal.itip.getSequence(this.item) == cal.itip.getSequence(this.originalItem);

      if (
        !isMinorUpdate ||
        !cal.item.compareContent(stripUserData(this.item), stripUserData(this.originalItem))
      ) {
        let requestItem = this.item.clone();
        if (!requestItem.organizer) {
          requestItem.organizer = cal.itip.createOrganizer(requestItem.calendar);
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
          this.item = requestItem;
          this.recipientsList = recipients;
          this.method = "REQUEST";
          return true;
        }
      }
    }

    // Cancel the event for all canceled attendees
    if (canceledAttendees.length > 0) {
      let cancelItem = this.originalItem.clone();
      cancelItem.removeAllAttendees();
      for (let att of canceledAttendees) {
        cancelItem.addAttendee(att);
      }
      this.cancellationMessageSender = new CalItipMessageSender(
        this.opType,
        cancelItem,
        this.originalItem,
        this.autoResponse
      );
      this.cancellationMessageSender.method = "CANCEL";
    }
    return false;
  }

  /**
   * Sends the iTIP message using the item's calendar transport.
   *
   * @return {boolean}                        True, if the message could be sent
   */
  send() {
    let calendar = cal.wrapInstance(this.item.calendar, Ci.calISchedulingSupport);
    if (calendar) {
      if (calendar.QueryInterface(Ci.calISchedulingSupport).canNotify(this.method, this.item)) {
        // provider will handle that, so we return - we leave it also to the provider to
        // deal with user canceled notifications (if possible), so set the return value
        // to true as false would prevent any further notification within this cycle
        return true;
      }
    }

    if (this.recipientsList.length == 0) {
      return false;
    }

    let transport = this.item.calendar.getProperty("itip.transport");
    if (!transport) {
      // can only send if there's a transport for the calendar
      return false;
    }
    transport = transport.QueryInterface(Ci.calIItipTransport);

    let { method, autoResponse } = this;
    let _sendItem = function(aSendToList, aSendItem) {
      let itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
      itipItem.init(cal.item.serialize(aSendItem));
      itipItem.responseMethod = method;
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
      this.item.getProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED") == "TRUE" &&
      this.method != "REPLY" &&
      this.method != "REFRESH" &&
      this.method != "COUNTER"
    ) {
      for (let recipient of this.recipientsList) {
        // create a list with a single recipient
        let sendToList = [recipient];
        // remove other recipients from vevent attendee list
        let sendItem = this.item.clone();
        sendItem.removeAllAttendees();
        sendItem.addAttendee(recipient);
        // send message
        if (!_sendItem(sendToList, sendItem)) {
          return false;
        }
      }
      return true;
    }
    return _sendItem(this.recipientsList, this.item);
  }

  /**
   * Sends any pending cancellation messages.
   *
   * @returns {boolean}
   */
  sendCancellations() {
    return this.cancellationMessageSender?.send();
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
