/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calXMLUtils.jsm");
Components.utils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
Components.utils.import("resource://calendar/modules/ltnInvitationUtils.jsm");

function ltnMimeConverter() {
    this.wrappedJSObject = this;
}

var ltnMimeConverterClassID = Components.ID("{c70acb08-464e-4e55-899d-b2c84c5409fa}");
var ltnMimeConverterInterfaces = [Components.interfaces.nsISimpleMimeConverter];
ltnMimeConverter.prototype = {
    classID: ltnMimeConverterClassID,
    QueryInterface: XPCOMUtils.generateQI(ltnMimeConverterInterfaces),

    classInfo: XPCOMUtils.generateCI({
        classID: ltnMimeConverterClassID,
        contractID: "@mozilla.org/lightning/mime-converter;1",
        classDescription: "Lightning text/calendar handler",
        interfaces: ltnMimeConverterInterfaces
    }),

    uri: null,

    convertToHTML: function lmcCTH(contentType, data) {
        let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                               .createInstance(Components.interfaces.calIIcsParser);
        parser.parseString(data);
        let event = null;
        for (let item of parser.getItems({})) {
            if (cal.isEvent(item)) {
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
            return '';
        }

        let itipItem = null;
        let msgOverlay = '';

        try {
            // this.uri is the message URL that we are processing.
            // We use it to get the nsMsgHeaderSink to store the calItipItem.
            if (this.uri) {
                let msgWindow = null;
                try {
                    let msgUrl = this.uri.QueryInterface(Components.interfaces.nsIMsgMailNewsUrl);
                    // msgWindow is optional in some scenarios
                    // (e.g. gloda in action, throws NS_ERROR_INVALID_POINTER then)
                    msgWindow = msgUrl.msgWindow;
                } catch (exc) {
                }
                if (msgWindow) {
                    itipItem = Components.classes["@mozilla.org/calendar/itip-item;1"]
                                         .createInstance(Components.interfaces.calIItipItem);
                    itipItem.init(data);
                    let dom = ltn.invitation.createInvitationOverlay(event, itipItem);
                    msgOverlay = cal.xml.serializeDOM(dom);

                    let sinkProps = msgWindow.msgHeaderSink.properties;
                    sinkProps.setPropertyAsInterface("itipItem", itipItem);
                    sinkProps.setPropertyAsAUTF8String("msgOverlay", msgOverlay);

                    // Notify the observer that the itipItem is available
                    Services.obs.notifyObservers(null, "onItipItemCreation", 0);
                }
            }
        } catch (e) {
            cal.ERROR("[ltnMimeConverter] convertToHTML: " + e);
        }

        // Create the HTML string for display
        return msgOverlay;
    }
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ltnMimeConverter]);
