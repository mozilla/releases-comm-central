/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * CalItipOutgoingMessage contains information needed for sending an outgoing
 * iTIP message via a calIItipTransport instance.
 */
export class CalItipOutgoingMessage {
  /**
   * @param {string} method - The iTIP request method.
   * @param {calIAttendee[]} recipients - A list of attendees who will receive
   *                                      the message.
   * @param {calIEvent} item - The item the message relates to.
   * @param {?calIAttendee} sender - The attendee the message comes from for
   *                                 replies.
   * @param {?object} autoResponse - The inout object whether the transport
   *                                 should ask before sending
   */
  constructor(method, recipients, item, sender, autoResponse) {
    this.method = method;
    this.recipients = recipients;
    this.item = item;
    this.sender = sender;
    this.autoResponse = autoResponse;
  }

  /**
   * Sends the iTIP message using the item's calendar transport.
   *
   * @param {calIItipTransport} transport - The transport to use when sending.
   *
   * @returns {boolean} - True, if the message could be sent
   */
  send(transport) {
    if (this.item.calendar && this.item.calendar.supportsScheduling) {
      const calendar = this.item.calendar.getSchedulingSupport();
      if (calendar.canNotify(this.method, this.item)) {
        // provider will handle that, so we return - we leave it also to the provider to
        // deal with user canceled notifications (if possible), so set the return value
        // to true as false would prevent any further notification within this cycle
        return true;
      }
    }

    if (this.recipients.length == 0 || !transport) {
      return false;
    }

    const { method, sender, autoResponse } = this;
    const _sendItem = function (aSendToList, aSendItem) {
      const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
      itipItem.init(cal.item.serialize(aSendItem));
      itipItem.responseMethod = method;
      itipItem.targetCalendar = aSendItem.calendar;
      itipItem.autoResponse = autoResponse.mode;
      // we switch to AUTO for each subsequent call of _sendItem()
      autoResponse.mode = Ci.calIItipItem.AUTO;
      // XXX I don't know whether the below is used at all, since we don't use the itip processor
      itipItem.isSend = true;

      return transport.sendItems(aSendToList, itipItem, sender);
    };

    // split up transport, if attendee undisclosure is requested
    // and this is a message send by the organizer
    if (
      this.item.getProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED") == "TRUE" &&
      this.method != "REPLY" &&
      this.method != "REFRESH" &&
      this.method != "COUNTER"
    ) {
      for (const recipient of this.recipients) {
        // create a list with a single recipient
        const sendToList = [recipient];
        // remove other recipients from vevent attendee list
        const sendItem = this.item.clone();
        sendItem.removeAllAttendees();
        sendItem.addAttendee(recipient);
        // send message
        if (!_sendItem(sendToList, sendItem)) {
          return false;
        }
      }
      return true;
    }
    return _sendItem(this.recipients, this.item);
  }
}
