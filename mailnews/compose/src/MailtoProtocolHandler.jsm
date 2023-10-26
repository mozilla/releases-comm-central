/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MailtoProtocolHandler"];

/**
 * Protocol handler for mailto: url.
 *
 * @implements {nsIProtocolHandler}
 */
class MailtoProtocolHandler {
  QueryInterface = ChromeUtils.generateQI([Ci.nsIProtocolHandler]);

  scheme = "mailto";
  allowPort = false;

  newChannel(uri, loadInfo) {
    // Create an empty pipe to get an inputStream.
    const pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    pipe.outputStream.close();

    // Create a channel so that we can set contentType onto it.
    const streamChannel = Cc[
      "@mozilla.org/network/input-stream-channel;1"
    ].createInstance(Ci.nsIInputStreamChannel);
    streamChannel.setURI(uri);
    streamChannel.contentStream = pipe.inputStream;

    const channel = streamChannel.QueryInterface(Ci.nsIChannel);
    // With this set, a nsIContentHandler instance will take over to open a
    // compose window.
    channel.contentType = "application/x-mailto";
    channel.loadInfo = loadInfo;
    return channel;
  }
}
