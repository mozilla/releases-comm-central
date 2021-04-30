/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

const EXPORTED_SYMBOLS = ["MidProtocolHandler"];

/**
 * MidProtocolHandler is an nsIProtocolHandler implementation for mid urls.
 * @see RFC 2392
 * @implements {nsIProtocolHandler}
 */
class MidProtocolHandler {
  classDescription = "MID Protocol Handler";
  classID = Components.ID("{d512ddac-a2c1-11eb-bcbc-0242ac130002}");
  contractID = "@mozilla.org/network/protocol;1?name=mid";
  QueryInterface = ChromeUtils.generateQI([Ci.nsIProtocolHandler]);

  scheme = "mid";
  defaultPort = -1;
  protocolFlags =
    Ci.nsIProtocolHandler.URI_NORELATIVE |
    Ci.nsIProtocolHandler.URI_NOAUTH |
    Ci.nsIProtocolHandler.URI_IS_UI_RESOURCE |
    Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE;

  newChannel(uri, loadInfo) {
    let id = uri.spec.replace(/^mid:/, "");
    let hdr = MailUtils.getMsgHdrForMsgId(id);

    if (!hdr) {
      throw new Components.Exception(
        `Message not found: ${id}`,
        Cr.NS_ERROR_FILE_NOT_FOUND
      );
    }

    let msgUri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(
      Ci.nsIURI
    );
    msgUri = msgUri
      .mutate()
      .setSpec(hdr.folder.getUriForMsg(hdr))
      .finalize();

    let channel = Services.io.newChannelFromURIWithLoadInfo(msgUri, loadInfo);
    channel.originalURI = msgUri;
    return msgUri;
  }

  allowPort() {
    return false;
  }
}
