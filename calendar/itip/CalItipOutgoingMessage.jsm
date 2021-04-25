/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CalItipOutgoingMessage"];

const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * CalItipOutgoingMessage contains information needed for sending an outgoing
 * iTIP message via a calIItipTransport instance.
 */
class CalItipOutgoingMessage {
  /**
   * @param {string} method - The iTIP request method.
   * @param {calIAttendee[]} recipients - A list of attendees who will receive the message.
   * @param {calIEvent} item - The item the message relates to.
   * @param {Object} autoResponse - The inout object whether the transport should ask before sending
   */
  constructor(method, recipients, item, autoResponse) {
    this.method = method;
    this.recipients = recipients;
    this.item = item;
    this.autoResponse = autoResponse;
  }

  /** Sends the iTIP message using the item's calendar transport.
   *
   * @return {boolean} - True, if the message could be sent
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

    if (this.recipients.length == 0) {
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
      for (let recipient of this.recipients) {
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
    return _sendItem(this.recipients, this.item);
  }
}
