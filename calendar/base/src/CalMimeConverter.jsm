/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalMimeConverter"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function CalMimeConverter() {
  this.wrappedJSObject = this;
}

CalMimeConverter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISimpleMimeConverter"]),
  classID: Components.ID("{c70acb08-464e-4e55-899d-b2c84c5409fa}"),

  uri: null,

  convertToHTML(contentType, data) {
    let parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseString(data);
    let event = null;
    for (let item of parser.getItems()) {
      if (item.isEvent()) {
        if (item.hasProperty("X-MOZ-FAKED-MASTER")) {
          // if it's a faked master, take any overridden item to get a real occurrence:
          let exc = item.recurrenceInfo.getExceptionFor(item.startDate);
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

    let msgWindow = null;

    let itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
    itipItem.init(data);

    // this.uri is the message URL that we are processing.
    // We use it to get the nsMsgHeaderSink to store the calItipItem.
    if (this.uri) {
      try {
        let msgUrl = this.uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
        msgWindow = msgUrl.msgWindow;
        itipItem.sender = msgUrl.mimeHeaders.extractHeader("From", false);
      } catch (exc) {
        // msgWindow is optional in some scenarios
        // (e.g. gloda in action, throws NS_ERROR_INVALID_POINTER then)
      }
    }

    // msgOverlay needs to be defined irrespectively of the existence of msgWindow to not break
    // printing of invitation emails
    let dom = cal.invitation.createInvitationOverlay(event, itipItem);
    let msgOverlay = cal.xml.serializeDOM(dom);

    if (msgWindow) {
      let sinkProps = msgWindow.msgHeaderSink.properties;
      sinkProps.setPropertyAsInterface("itipItem", itipItem);

      // Notify the observer that the itipItem is available
      Services.obs.notifyObservers(null, "onItipItemCreation");
    }
    return msgOverlay;
  },
};
