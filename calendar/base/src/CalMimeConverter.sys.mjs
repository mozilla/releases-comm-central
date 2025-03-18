/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

export function CalMimeConverter() {
  this.wrappedJSObject = this;
}

CalMimeConverter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISimpleMimeConverter"]),
  classID: Components.ID("{c70acb08-464e-4e55-899d-b2c84c5409fa}"),

  mailChannel: null,
  uri: null,

  convertToHTML(contentType, data) {
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseString(data);
    let event = null;
    for (let item of parser.getItems()) {
      if (item.isEvent()) {
        if (item.hasProperty("X-MOZ-FAKED-MASTER")) {
          // if it's a faked master, take any overridden item to get a real occurrence:
          const exc = item.recurrenceInfo.getExceptionFor(item.startDate);
          cal.ASSERT(exc, "unexpected!");
          if (exc) {
            item = exc;
          }
        }
        event = item;
        break;
      }
    }
    if (!event) {
      return "";
    }

    const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
    itipItem.init(data);

    // this.uri is the message URL that we are processing.
    if (this.uri) {
      try {
        const msgUrl = this.uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
        itipItem.sender = msgUrl.mimeHeaders.extractHeader("From", false);
      } catch (exc) {
        // msgWindow is optional in some scenarios
        // (e.g. gloda in action, throws NS_ERROR_INVALID_POINTER then)
      }
    }

    // msgOverlay needs to be defined irrespectively of the existence of msgWindow to not break
    // printing of invitation emails
    let msgOverlay = "";

    if (!Services.prefs.getBoolPref("calendar.itip.newInvitationDisplay")) {
      try {
        const dom = cal.invitation.createInvitationOverlay(event, itipItem);
        msgOverlay = cal.xml.serializeDOM(dom);
      } catch (e) {
        console.error(`Could not display invitation data: ${data}`, e);
      }
    }

    this.mailChannel.imipItem = itipItem;

    return msgOverlay;
  },
};
