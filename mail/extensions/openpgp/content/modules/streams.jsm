/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailStreams"];

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

var EnigmailStreams = {
  /**
   * Create a new channel from a URL or URI.
   *
   * @param url: String, nsIURI or nsIFile -  URL specification
   *
   * @return: channel
   */
  createChannel(url) {
    let c = lazy.NetUtil.newChannel({
      uri: url,
      loadUsingSystemPrincipal: true,
    });

    return c;
  },

  /**
   * create an nsIStreamListener object to read String data from an nsIInputStream
   *
   * @onStopCallback: Function - function(data) that is called when the stream has stopped
   *                             string data is passed as |data|
   *
   * @return: the nsIStreamListener to pass to the stream
   */
  newStringStreamListener(onStopCallback) {
    let listener = {
      data: "",
      inStream: Cc["@mozilla.org/binaryinputstream;1"].createInstance(
        Ci.nsIBinaryInputStream
      ),
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),

      onStartRequest(channel) {},

      onStopRequest(channel, status) {
        this.inStream = null;
        onStopCallback(this.data);
      },
    };

    listener.onDataAvailable = function (req, stream, offset, count) {
      this.inStream.setInputStream(stream);
      this.data += this.inStream.readBytes(count);
    };

    return listener;
  },

  /**
   * create a nsIInputStream object that is fed with string data
   *
   * @uri:            nsIURI - object representing the URI that will deliver the data
   * @contentType:    String - the content type as specified in nsIChannel
   * @contentCharset: String - the character set; automatically determined if null
   * @data:           String - the data to feed to the stream
   * @loadInfo        nsILoadInfo - loadInfo (optional)
   *
   * @returns nsIChannel object
   */
  newStringChannel(uri, contentType, contentCharset, data, loadInfo) {
    if (!loadInfo) {
      loadInfo = createLoadInfo();
    }

    let inputStream = Cc[
      "@mozilla.org/io/string-input-stream;1"
    ].createInstance(Ci.nsIStringInputStream);
    inputStream.setData(data, -1);

    if (!contentCharset || contentCharset.length === 0) {
      let netUtil = Services.io.QueryInterface(Ci.nsINetUtil);
      const newCharset = {};
      const hadCharset = {};
      netUtil.parseResponseContentType(contentType, newCharset, hadCharset);
      contentCharset = newCharset.value;
    }

    let isc = Cc["@mozilla.org/network/input-stream-channel;1"].createInstance(
      Ci.nsIInputStreamChannel
    );
    isc.QueryInterface(Ci.nsIChannel);
    isc.setURI(uri);
    isc.loadInfo = loadInfo;
    isc.contentStream = inputStream;

    if (contentType && contentType.length) {
      isc.contentType = contentType;
    }
    if (contentCharset && contentCharset.length) {
      isc.contentCharset = contentCharset;
    }

    return isc;
  },

  newFileChannel(uri, file, contentType, deleteOnClose) {
    let inputStream = Cc[
      "@mozilla.org/network/file-input-stream;1"
    ].createInstance(Ci.nsIFileInputStream);
    let behaviorFlags = Ci.nsIFileInputStream.CLOSE_ON_EOF;
    if (deleteOnClose) {
      behaviorFlags |= Ci.nsIFileInputStream.DELETE_ON_CLOSE;
    }
    const ioFlags = 0x01; // readonly
    const perm = 0;
    inputStream.init(file, ioFlags, perm, behaviorFlags);

    let isc = Cc["@mozilla.org/network/input-stream-channel;1"].createInstance(
      Ci.nsIInputStreamChannel
    );
    isc.QueryInterface(Ci.nsIChannel);
    isc.contentDisposition = Ci.nsIChannel.DISPOSITION_ATTACHMENT;
    isc.loadInfo = createLoadInfo();
    isc.setURI(uri);
    isc.contentStream = inputStream;

    if (contentType && contentType.length) {
      isc.contentType = contentType;
    }
    return isc;
  },
};

function createLoadInfo() {
  let c = lazy.NetUtil.newChannel({
    uri: "chrome://openpgp/content/",
    loadUsingSystemPrincipal: true,
  });

  return c.loadInfo;
}
