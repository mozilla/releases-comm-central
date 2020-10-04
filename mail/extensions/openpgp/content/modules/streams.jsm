/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailStreams"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailCompat: "chrome://openpgp/content/modules/compat.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
});

const NS_STRING_INPUT_STREAM_CONTRACTID =
  "@mozilla.org/io/string-input-stream;1";
const NS_INPUT_STREAM_CHNL_CONTRACTID =
  "@mozilla.org/network/input-stream-channel;1";

var EnigmailStreams = {
  /**
   * Create a new channel from a URL or URI.
   *
   * @param url: String, nsIURI or nsIFile -  URL specification
   *
   * @return: channel
   */
  createChannel(url) {
    let c = NetUtil.newChannel({
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
    EnigmailLog.DEBUG("enigmailCommon.jsm: newStreamListener\n");

    let listener = {
      data: "",
      inStream: Cc["@mozilla.org/binaryinputstream;1"].createInstance(
        Ci.nsIBinaryInputStream
      ),
      _onStopCallback: onStopCallback,
      QueryInterface: EnigmailCompat.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),

      onStartRequest(channel) {
        // EnigmailLog.DEBUG("enigmailCommon.jsm: stringListener.onStartRequest\n");
      },

      onStopRequest(channel, status) {
        // EnigmailLog.DEBUG("enigmailCommon.jsm: stringListener.onStopRequest: "+ctxt+"\n");
        this.inStream = null;
        var cbFunc = this._onStopCallback;
        var cbData = this.data;

        setTimeout(function() {
          cbFunc(cbData);
        }, 0);
      },
    };

    listener.onDataAvailable = function(req, stream, offset, count) {
      // EnigmailLog.DEBUG("enigmailCommon.jsm: stringListener.onDataAvailable: "+count+"\n");
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
   * @return nsIChannel object
   */
  newStringChannel(uri, contentType, contentCharset, data, loadInfo) {
    EnigmailLog.DEBUG("enigmailCommon.jsm: newStringChannel\n");

    if (!loadInfo) {
      loadInfo = createLoadInfo();
    }

    const inputStream = Cc[NS_STRING_INPUT_STREAM_CONTRACTID].createInstance(
      Ci.nsIStringInputStream
    );
    inputStream.setData(data, -1);

    if (!contentCharset || contentCharset.length === 0) {
      const ioServ = Services.io;
      const netUtil = ioServ.QueryInterface(Ci.nsINetUtil);
      const newCharset = {};
      const hadCharset = {};
      netUtil.parseResponseContentType(contentType, newCharset, hadCharset);
      contentCharset = newCharset.value;
    }

    let isc = Cc[NS_INPUT_STREAM_CHNL_CONTRACTID].createInstance(
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

    EnigmailLog.DEBUG("enigmailCommon.jsm: newStringChannel - done\n");

    return isc;
  },

  newFileChannel(uri, file, contentType, deleteOnClose) {
    EnigmailLog.DEBUG(
      "enigmailCommon.jsm: newFileChannel for '" + file.path + "'\n"
    );

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

    let isc = Cc[NS_INPUT_STREAM_CHNL_CONTRACTID].createInstance(
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

    EnigmailLog.DEBUG("enigmailCommon.jsm: newStringChannel - done\n");

    return isc;
  },
};

function createLoadInfo() {
  let c = NetUtil.newChannel({
    uri: "chrome://openpgp/content/",
    loadUsingSystemPrincipal: true,
  });

  return c.loadInfo;
}
