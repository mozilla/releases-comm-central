/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var ITIP_HANDLER_MIMETYPE = "application/x-itip-internal";
var ITIP_HANDLER_PROTOCOL = "moz-cal-handle-itip";
var NS_ERROR_WONT_HANDLE_CONTENT = 0x805d0001;

function NYI() {
  throw Cr.NS_ERROR_NOT_IMPLEMENTED;
}

function ItipChannel(URI, aLoadInfo) {
  this.wrappedJSObject = this;
  this.URI = this.originalURI = URI;
  this.loadInfo = aLoadInfo;
}
ItipChannel.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIChannel, Ci.nsIRequest]),
  classID: Components.ID("{643e0328-36f6-411d-a107-16238dff9cd7}"),

  contentType: ITIP_HANDLER_MIMETYPE,
  loadAttributes: null,
  contentLength: 0,
  owner: null,
  loadGroup: null,
  notificationCallbacks: null,
  securityInfo: null,

  open: NYI,
  asyncOpen: function(observer) {
    observer.onStartRequest(this, null);
  },
  asyncRead: function(listener, ctxt) {
    return listener.onStartRequest(this, ctxt);
  },

  isPending: function() {
    return true;
  },
  status: Cr.NS_OK,
  cancel: function(status) {
    this.status = status;
  },
  suspend: NYI,
  resume: NYI,
};

function ItipProtocolHandler() {
  this.wrappedJSObject = this;
}
ItipProtocolHandler.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIProtocolHandler]),
  classID: Components.ID("{6e957006-b4ce-11d9-b053-001124736B74}"),

  protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE | Ci.nsIProtocolHandler.URI_DANGEROUS_TO_LOAD,
  allowPort: () => false,
  isSecure: false,
  newChannel: function(URI, aLoadInfo) {
    dump("Creating new ItipChannel for " + URI + "\n");
    return new ItipChannel(URI, aLoadInfo);
  },
};

function ItipContentHandler() {
  this.wrappedJSObject = this;
}
ItipContentHandler.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIContentHandler]),
  classID: Components.ID("{47c31f2b-b4de-11d9-bfe6-001124736B74}"),

  handleContent: function(contentType, windowTarget, request) {
    let channel = request.QueryInterface(Ci.nsIChannel);
    let uri = channel.URI.spec;
    if (!uri.startsWith(ITIP_HANDLER_PROTOCOL + ":")) {
      cal.ERROR("Unexpected iTIP uri: " + uri + "\n");
      throw NS_ERROR_WONT_HANDLE_CONTENT;
    }
    // moz-cal-handle-itip:///?
    let paramString = uri.substring(ITIP_HANDLER_PROTOCOL.length + 4);
    let paramArray = paramString.split("&");
    let paramBlock = {};
    paramArray.forEach(value => {
      let parts = value.split("=");
      paramBlock[parts[0]] = unescape(unescape(parts[1]));
    });
    // dump("content-handler: have params " + paramBlock.toSource() + "\n");
    let event = cal.createEvent(paramBlock.data);
    dump(
      "Processing iTIP event '" +
        event.title +
        "' from " +
        event.organizer.id +
        " (" +
        event.id +
        ")\n"
    );
    let calMgr = cal.getCalendarManager();
    let cals = calMgr.getCalendars();
    cals[0].addItem(event, null);
  },
};

var components = [ItipChannel, ItipProtocolHandler, ItipContentHandler];
this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
