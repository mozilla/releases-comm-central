/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const NS_ERROR_MODULE_NETWORK = 2152398848;

const NS_ERROR_UNKNOWN_HOST = NS_ERROR_MODULE_NETWORK + 30;
const NS_ERROR_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 13;
const NS_ERROR_NET_TIMEOUT = NS_ERROR_MODULE_NETWORK + 14;
const NS_ERROR_OFFLINE = NS_ERROR_MODULE_NETWORK + 16;
const NS_ERROR_NET_RESET = NS_ERROR_MODULE_NETWORK + 20;
const NS_ERROR_UNKNOWN_PROXY_HOST = NS_ERROR_MODULE_NETWORK + 42;
const NS_ERROR_NET_INTERRUPT = NS_ERROR_MODULE_NETWORK + 71;
const NS_ERROR_PROXY_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 72;

// Offline error constants:
const NS_ERROR_BINDING_ABORTED = NS_ERROR_MODULE_NETWORK + 2;
const NS_ERROR_ABORT = 0x80004004;

const NS_NET_STATUS_RESOLVING_HOST = NS_ERROR_MODULE_NETWORK + 3;
const NS_NET_STATUS_CONNECTED_TO = NS_ERROR_MODULE_NETWORK + 4;
const NS_NET_STATUS_SENDING_TO = NS_ERROR_MODULE_NETWORK + 5;
const NS_NET_STATUS_RECEIVING_FROM = NS_ERROR_MODULE_NETWORK + 6;
const NS_NET_STATUS_CONNECTING_TO = NS_ERROR_MODULE_NETWORK + 7;

// Security Constants.
const STATE_IS_BROKEN = 1;
const STATE_IS_SECURE = 2;
const STATE_IS_INSECURE = 3;

function toSInputStream(stream) {
  let sstream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  sstream.setInputStream(stream);

  return sstream;
}

function toSOutputStream(stream) {
  let sstream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
    Ci.nsIBinaryOutputStream
  );
  sstream.setOutputStream(stream);

  return sstream;
}

/* This object implements nsIBadCertListener2
 * The idea is to suppress the default UI's alert box
 * and allow the exception to propagate normally
 */
function BadCertHandler() {}

BadCertHandler.prototype.getInterface = function (aIID) {
  return this.QueryInterface(aIID);
};

BadCertHandler.prototype.QueryInterface = XPCOMUtils.generateQI([
  Ci.nsIBadCertListener2,
  Ci.nsIInterfaceRequestor,
  Ci.nsISupports,
]);

/* Returning true in the following two callbacks
 * means suppress default the error UI (modal alert).
 */
BadCertHandler.prototype.notifyCertProblem = function (
  socketInfo,
  sslStatus,
  targetHost
) {
  return true;
};

/**
 * Wraps up various mechanics of sockets for easy consumption by other code.
 */
function CBSConnection() {
  this._sockService = Cc[
    "@mozilla.org/network/socket-transport-service;1"
  ].getService(Ci.nsISocketTransportService);
  if (!this._sockService) {
    throw Components.Exception(
      "Couldn't get socket service.",
      Cr.NS_ERROR_FAILURE
    );
  }

  this.wrappedJSObject = this;
}

CBSConnection.prototype.connect = function (host, port, config, observer) {
  this.host = host.toLowerCase();
  this.port = port;

  /* The APIs below want host:port. Later on, we also reformat the host to
   * strip IPv6 literal brackets.
   */
  var hostPort = host + ":" + port;

  if (!config) {
    config = {};
  }

  if (!("proxyInfo" in config)) {
    // Lets get a transportInfo for this.
    let pps = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(
      Ci.nsIProtocolProxyService
    );

    /* Force Necko to supply the HTTP proxy info if desired. For none,
     * force no proxy. Other values will get default treatment.
     */
    var uri = "irc://" + hostPort;
    if ("proxy" in config) {
      if (config.proxy == "http") {
        uri = "http://" + hostPort;
      } else if (config.proxy == "none") {
        uri = "";
      }
    }

    var self = this;
    function continueWithProxy(proxyInfo) {
      config.proxyInfo = proxyInfo;
      try {
        self.connect(host, port, config, observer);
      } catch (ex) {
        if ("onSocketConnection" in observer) {
          observer.onSocketConnection(host, port, config, ex);
        }
        return;
      }
      if ("onSocketConnection" in observer) {
        observer.onSocketConnection(host, port, config);
      }
    }

    if (uri) {
      uri = Services.io.newURI(uri);
      try {
        pps.asyncResolve(uri, 0, {
          onProxyAvailable(request, uri, proxyInfo, status) {
            continueWithProxy(proxyInfo);
          },
        });
      } catch (ex) {
        throw Components.Exception(
          "Unable to find method to resolve proxies",
          Cr.NS_ERROR_FAILURE
        );
      }
    } else {
      continueWithProxy(null);
    }
    return true;
  }

  // Strip the IPv6 literal brackets; all the APIs below don't want them.
  if (host[0] == "[" && host[host.length - 1] == "]") {
    host = host.substr(1, host.length - 2);
  }

  /* Since the proxy info is opaque, we need to check that we got
   * something for our HTTP proxy - we can't just check proxyInfo.type.
   */
  var proxyInfo = config.proxyInfo || null;
  var usingHTTPCONNECT =
    "proxy" in config && config.proxy == "http" && proxyInfo;

  if (proxyInfo && "type" in proxyInfo && proxyInfo.type == "unknown") {
    throw Components.Exception(JSIRC_ERR_PAC_LOADING, Cr.NS_ERROR_FAILURE);
  }

  /* use new necko interfaces */
  if ("isSecure" in config && config.isSecure) {
    this._transport = this._sockService.createTransport(
      ["ssl"],
      1,
      host,
      port,
      proxyInfo
    );
    this._transport.securityCallbacks = new BadCertHandler();
  } else {
    this._transport = this._sockService.createTransport(
      ["starttls"],
      1,
      host,
      port,
      proxyInfo
    );
  }
  if (!this._transport) {
    throw Components.Exception(
      "Error creating transport.",
      Cr.NS_ERROR_FAILURE
    );
  }

  var openFlags = 0;

  /* no limit on the output stream buffer */
  this._outputStream = this._transport.openOutputStream(openFlags, 4096, -1);
  if (!this._outputStream) {
    throw Components.Exception(
      "Error getting output stream.",
      Cr.NS_ERROR_FAILURE
    );
  }
  this._sOutputStream = toSOutputStream(this._outputStream);

  this._inputStream = this._transport.openInputStream(openFlags, 0, 0);
  if (!this._inputStream) {
    throw Components.Exception(
      "Error getting input stream.",
      Cr.NS_ERROR_FAILURE
    );
  }
  this._sInputStream = toSInputStream(this._inputStream);

  this.connectDate = new Date();
  this.isConnected = true;

  // Bootstrap the connection if we're proxying via an HTTP proxy.
  if (usingHTTPCONNECT) {
    this.sendData("CONNECT " + hostPort + " HTTP/1.1\r\n\r\n");
  }

  return true;
};

CBSConnection.prototype.startTLS = function () {
  if (!this.isConnected || !this._transport.securityInfo) {
    return;
  }

  var secInfo = this._transport.securityInfo;
  var sockControl = secInfo.QueryInterface(Ci.nsITLSSocketControl);
  sockControl.StartTLS();
};

CBSConnection.prototype.listen = function (port, observer) {
  this._serverSock = Cc["@mozilla.org/network/server-socket;1"].createInstance(
    Ci.nsIServerSocket
  );

  this._serverSock.init(port, false, -1);

  this._serverSockListener = new SocketListener(this, observer);

  this._serverSock.asyncListen(this._serverSockListener);

  this.port = this._serverSock.port;

  return true;
};

CBSConnection.prototype.accept = function (transport, observer) {
  this._transport = transport;
  this.host = this._transport.host.toLowerCase();
  this.port = this._transport.port;

  var openFlags = 0;

  /* no limit on the output stream buffer */
  this._outputStream = this._transport.openOutputStream(openFlags, 4096, -1);
  if (!this._outputStream) {
    throw Components.Exception(
      "Error getting output stream.",
      Cr.NS_ERROR_FAILURE
    );
  }
  this._sOutputStream = toSOutputStream(this._outputStream);

  this._inputStream = this._transport.openInputStream(openFlags, 0, 0);
  if (!this._inputStream) {
    throw Components.Exception(
      "Error getting input stream.",
      Cr.NS_ERROR_FAILURE
    );
  }
  this._sInputStream = toSInputStream(this._inputStream);

  this.connectDate = new Date();
  this.isConnected = true;

  // Clean up listening socket.
  this.close();

  return this.isConnected;
};

CBSConnection.prototype.close = function () {
  if ("_serverSock" in this && this._serverSock) {
    this._serverSock.close();
  }
};

CBSConnection.prototype.disconnect = function () {
  if ("_inputStream" in this && this._inputStream) {
    this._inputStream.close();
  }
  if ("_outputStream" in this && this._outputStream) {
    this._outputStream.close();
  }
  this.isConnected = false;
  /*
    this._streamProvider.close();
    if (this._streamProvider.isBlocked)
      this._write_req.resume();
    */
};

CBSConnection.prototype.sendData = function (str) {
  if (!this.isConnected) {
    throw Components.Exception("Not Connected.", Cr.NS_ERROR_FAILURE);
  }

  this.sendDataNow(str);
};

CBSConnection.prototype.readData = function (timeout, count) {
  if (!this.isConnected) {
    throw Components.Exception("Not Connected.", Cr.NS_ERROR_FAILURE);
  }

  var rv;

  if (!("_sInputStream" in this)) {
    this._sInputStream = toSInputStream(this._inputStream);
    dump("OMG, setting up _sInputStream!\n");
  }

  try {
    // XPCshell h4x
    if (typeof count == "undefined") {
      count = this._sInputStream.available();
    }
    rv = this._sInputStream.readBytes(count);
  } catch (ex) {
    dd("*** Caught " + ex + " while reading.");
    this.disconnect();
    throw Components.Exception(ex, Cr.NS_ERROR_FAILURE);
  }

  return rv;
};

CBSConnection.prototype.startAsyncRead = function (observer) {
  let pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
    Ci.nsIInputStreamPump
  );
  pump.init(this._inputStream, 0, 0, false);
  pump.asyncRead(new StreamListener(observer), this);
};

CBSConnection.prototype.asyncWrite = function (str) {
  this._streamProvider.pendingData += str;
  if (this._streamProvider.isBlocked) {
    this._write_req.resume();
    this._streamProvider.isBlocked = false;
  }
};

CBSConnection.prototype.hasPendingWrite = function () {
  return false; /* data already pushed to necko */
};

CBSConnection.prototype.sendDataNow = function (str) {
  var rv = false;

  try {
    this._sOutputStream.writeBytes(str, str.length);
    rv = true;
  } catch (ex) {
    dd("*** Caught " + ex + " while sending.");
    this.disconnect();
    throw Components.Exception(ex, Cr.NS_ERROR_FAILURE);
  }

  return rv;
};

/**
 * Gets information about the security of the connection.
 *
 * |STATE_IS_BROKEN| is returned if any errors occur and |STATE_IS_INSECURE| is
 * returned for disconnected sockets.
 *
 * @returns A value from the |STATE_IS_*| enumeration at the top of this file.
 */
CBSConnection.prototype.getSecurityState = function () {
  if (!this.isConnected || !this._transport.securityInfo) {
    return STATE_IS_INSECURE;
  }

  try {
    // Get the actual SSL Status
    let sslSp = this._transport.securityInfo.QueryInterface(
      Ci.nsISSLStatusProvider
    );
    if (!sslSp.SSLStatus) {
      return STATE_IS_BROKEN;
    }
    let sslStatus = sslSp.SSLStatus.QueryInterface(Ci.nsISSLStatus);
    // Store appropriate status
    if (!("keyLength" in sslStatus) || !sslStatus.keyLength) {
      return STATE_IS_BROKEN;
    }

    return STATE_IS_SECURE;
  } catch (ex) {
    // Something goes wrong -> broken security icon
    dd("Exception getting certificate for connection: " + ex.message);
    return STATE_IS_BROKEN;
  }
};

CBSConnection.prototype.getCertificate = function () {
  if (!this.isConnected || !this._transport.securityInfo) {
    return null;
  }

  // Get the actual SSL Status
  let sslSp = this._transport.securityInfo.QueryInterface(
    Ci.nsISSLStatusProvider
  );
  if (!sslSp.SSLStatus) {
    return null;
  }
  let sslStatus = sslSp.SSLStatus.QueryInterface(Ci.nsISSLStatus);

  // return the certificate
  return sslStatus.serverCert;
};

CBSConnection.prototype.asyncWrite = function () {
  throw Components.Exception("Not Implemented.", Cr.NS_ERROR_NOT_IMPLEMENTED);
};

function StreamProvider(observer) {
  this._observer = observer;
}

StreamProvider.prototype.pendingData = "";
StreamProvider.prototype.isBlocked = true;

StreamProvider.prototype.close = function () {
  this.isClosed = true;
};

StreamProvider.prototype.onDataWritable = function (
  request,
  ctxt,
  ostream,
  offset,
  count
) {
  //dd ("StreamProvider.prototype.onDataWritable");

  if ("isClosed" in this && this.isClosed) {
    throw Components.Exception("", Cr.NS_BASE_STREAM_CLOSED);
  }

  if (!this.pendingData) {
    this.isBlocked = true;
    throw Components.Exception("", Cr.NS_BASE_STREAM_WOULD_BLOCK);
  }

  var len = ostream.write(this.pendingData, this.pendingData.length);
  this.pendingData = this.pendingData.substr(len);
};

StreamProvider.prototype.onStartRequest = function (request, ctxt) {
  //dd ("StreamProvider::onStartRequest: " + request + ", " + ctxt);
};

StreamProvider.prototype.onStopRequest = function (request, ctxt, status) {
  //dd ("StreamProvider::onStopRequest: " + request + ", " + ctxt + ", " +
  //    status);
  if (this._observer) {
    this._observer.onStreamClose(status);
  }
};

function StreamListener(observer) {
  this._observer = observer;
}

StreamListener.prototype.onStartRequest = function (request, ctxt) {
  //dd ("StreamListener::onStartRequest: " + request + ", " + ctxt);
};

StreamListener.prototype.onStopRequest = function (request, ctxt, status) {
  //dd ("StreamListener::onStopRequest: " + request + ", " + ctxt + ", " +
  //status);
  if (this._observer) {
    this._observer.onStreamClose(status);
  }
};

StreamListener.prototype.onDataAvailable = function (
  request,
  ctxt,
  inStr,
  sourceOffset,
  count
) {
  ctxt = ctxt.wrappedJSObject;
  if (!ctxt) {
    dd(
      "*** Can't get wrappedJSObject from ctxt in " +
        "StreamListener.onDataAvailable ***"
    );
    return;
  }

  if (!("_sInputStream" in ctxt)) {
    ctxt._sInputStream = toSInputStream(inStr);
  }

  if (this._observer) {
    this._observer.onStreamDataAvailable(request, inStr, sourceOffset, count);
  }
};

function SocketListener(connection, observer) {
  this._connection = connection;
  this._observer = observer;
}

SocketListener.prototype.onSocketAccepted = function (socket, transport) {
  this._observer.onSocketAccepted(socket, transport);
};
SocketListener.prototype.onStopListening = function (socket, status) {
  delete this._connection._serverSockListener;
  delete this._connection._serverSock;
};
