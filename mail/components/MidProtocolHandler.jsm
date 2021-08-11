/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MidProtocolHandler"];

/**
 * MidProtocolHandler is an nsIProtocolHandler implementation for mid urls.
 * @see RFC 2392
 * @implements {nsIProtocolHandler}
 */
class MidProtocolHandler {
  QueryInterface = ChromeUtils.generateQI([Ci.nsIProtocolHandler]);

  scheme = "mid";
  allowPort = false;
  defaultPort = -1;
  protocolFlags =
    Ci.nsIProtocolHandler.URI_NORELATIVE |
    Ci.nsIProtocolHandler.ALLOWS_PROXY |
    Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
    Ci.nsIProtocolHandler.URI_NON_PERSISTABLE |
    Ci.nsIProtocolHandler.URI_DOES_NOT_RETURN_DATA |
    Ci.nsIProtocolHandler.URI_FORBIDS_COOKIE_ACCESS;

  newChannel(uri, loadInfo) {
    // Create an empty pipe to get an inputStream.
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    pipe.outputStream.close();

    // Create a channel so that we can set contentType onto it.
    let streamChannel = Cc[
      "@mozilla.org/network/input-stream-channel;1"
    ].createInstance(Ci.nsIInputStreamChannel);
    streamChannel.setURI(uri);
    streamChannel.contentStream = pipe.inputStream;

    let channel = streamChannel.QueryInterface(Ci.nsIChannel);
    // With this set, a nsIContentHandler instance will take over to actually
    // load the mid url.
    channel.contentType = "application/x-mid";
    channel.loadInfo = loadInfo;
    return channel;
  }
}
