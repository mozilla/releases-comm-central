/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file provides utilities useful in testing more advanced networking
 * scenarios, such as proxies and SSL connections.
 */

this.EXPORTED_SYMBOLS = ['NetworkTestUtils'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var CC = Components.Constructor;
var Cu = Components.utils;

Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/Promise.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/mailServices.js");

const ServerSocket = CC("@mozilla.org/network/server-socket;1",
                        "nsIServerSocket",
                        "init");
const BinaryInputStream = CC("@mozilla.org/binaryinputstream;1",
                             "nsIBinaryInputStream",
                             "setInputStream");

// The following code is adapted from network/test/unit/test_socks.js, in order
// to provide a SOCKS proxy server for our testing code.
//
// For more details on how SOCKSv5 works, please read RFC 1928.
var currentThread = Services.tm.currentThread;

const STATE_WAIT_GREETING = 1;
const STATE_WAIT_SOCKS5_REQUEST = 2;

/**
 * A client of a SOCKS connection.
 *
 * This doesn't implement all of SOCKSv5, just enough to get a simple proxy
 * working for the test code.
 *
 * @param client_in The nsIInputStream of the socket.
 * @param client_out The nsIOutputStream of the socket.
 */
function SocksClient(client_in, client_out) {
  this.client_in = client_in;
  this.client_out = client_out;
  this.inbuf = [];
  this.state = STATE_WAIT_GREETING;
  this.waitRead(this.client_in);
}
SocksClient.prototype = {
  // ... implement nsIInputStreamCallback ...
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIInputStreamCallback]),
  onInputStreamReady(input) {
    var len = input.available();
    var bin = new BinaryInputStream(input);
    var data = bin.readByteArray(len);
    this.inbuf = this.inbuf.concat(data);

    switch (this.state) {
      case STATE_WAIT_GREETING:
        this.handleGreeting();
        break;
      case STATE_WAIT_SOCKS5_REQUEST:
        this.handleSocks5Request();
        break;
    }

    if (!this.sub_transport)
      this.waitRead(input);
  },

  /// Listen on the input for the next packet
  waitRead(input) {
    input.asyncWait(this, 0, 0, currentThread);
  },

  /// Simple handler to write out a binary string (because xpidl sucks here)
  write(buf) {
    this.client_out.write(buf, buf.length);
  },

  /// Handle the first SOCKSv5 client message
  handleGreeting() {
    if (this.inbuf.length == 0)
      return;

    if (this.inbuf[0] != 5) {
      dump("Unknown protocol version: " + this.inbuf[0] + '\n');
      this.close();
      return;
    }

    // Some quality checks to make sure we've read the entire greeting.
    if (this.inbuf.length < 2)
      return;
    var nmethods = this.inbuf[1];
    if (this.inbuf.length < 2 + nmethods)
      return;
    var methods = this.inbuf.slice(2, 2 + nmethods);
    this.inbuf = [];

    // Tell them that we don't log into this SOCKS server.
    this.state = STATE_WAIT_SOCKS5_REQUEST;
    this.write('\x05\x00');
  },

  /// Handle the second SOCKSv5 message
  handleSocks5Request() {
    if (this.inbuf.length < 4)
      return;

    // Find the address:port requested.
    var version = this.inbuf[0];
    var cmd = this.inbuf[1];
    var atype = this.inbuf[3];
    if (atype == 0x01) { // IPv4 Address
      var len = 4;
      var addr = this.inbuf.slice(4, 8).join('.');
    } else if (atype == 0x03) { // Domain name
      var len = this.inbuf[4];
      var addr = String.fromCharCode.apply(null,
        this.inbuf.slice(5, 5 + len));
      len = len + 1;
    } else if (atype == 0x04) { // IPv6 address
      var len = 16;
      var addr = this.inbuf.slice(4, 20).map(i => i.toString(16)).join(':');
    }
    var port = this.inbuf[4 + len] << 8 | this.inbuf[5 + len];
    dump("Requesting " + addr + ":" + port + '\n');

    // Map that data to the port we report.
    var foundPort = gPortMap.get(addr + ":" + port);
    dump("This was mapped to " + foundPort + '\n');

    if (foundPort !== undefined) {
      this.write("\x05\x00\x00" + // Header for response
          "\x04" + "\x00".repeat(15) + "\x01" + // IPv6 address ::1
          String.fromCharCode(foundPort >> 8) +
          String.fromCharCode(foundPort & 0xff) // Port number
      );
    } else {
      this.write("\x05\x05\x00" + // Header for failed response
          "\x04" + "\x00".repeat(15) + "\x01" + // IPv6 address ::1
          "\x00\x00");
      this.close();
      return;
    }

    // At this point, we contact the local server on that port and then we feed
    // the data back and forth. Easiest way to do that is to open the connection
    // and use the async copy to do it in a background thread.
    let sts = Cc["@mozilla.org/network/socket-transport-service;1"]
                .getService(Ci.nsISocketTransportService);
    let trans = sts.createTransport([], 0, "localhost", foundPort, null);
    let tunnelInput = trans.openInputStream(0, 1024, 1024);
    let tunnelOutput = trans.openOutputStream(0, 1024, 1024);
    this.sub_transport = trans;
    NetUtil.asyncCopy(tunnelInput, this.client_out);
    NetUtil.asyncCopy(this.client_in, tunnelOutput);
  },

  close() {
    this.client_in.close();
    this.client_out.close();
    if (this.sub_transport)
      this.sub_transport.close(Cr.NS_OK);
  }
};

/// A SOCKS server that runs on a random port.
function SocksTestServer() {
  this.listener = ServerSocket(-1, true, -1);
  dump("Starting SOCKS server on " + this.listener.port + '\n');
  this.port = this.listener.port;
  this.listener.asyncListen(this);
  this.client_connections = [];
}
SocksTestServer.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIServerSocketListener]),

  onSocketAccepted(socket, trans) {
    var input = trans.openInputStream(0, 0, 0);
    var output = trans.openOutputStream(0, 0, 0);
    var client = new SocksClient(input, output);
    this.client_connections.push(client);
  },

  onStopListening(socket) { },

  close() {
    for (let client of this.client_connections)
      client.close();
    this.client_connections = [];
    if (this.listener) {
      this.listener.close();
      this.listener = null;
    }
  }
};

var gSocksServer = null;
/// hostname:port -> the port on localhost that the server really runs on.
var gPortMap = new Map();

var NetworkTestUtils = {
  /**
   * Set up a proxy entry such that requesting a connection to hostName:port
   * will instead cause a connection to localRemappedPort. This will use a SOCKS
   * proxy (because any other mechanism is too complicated). Since this is
   * starting up a server, it does behoove you to call shutdownServers when you
   * no longer need to use the proxy server.
   *
   * @param hostName          The DNS name to use for the client.
   * @param hostPort          The port number to use for the client.
   * @param localRemappedPort The port number on which the real server sits.
   */
  configureProxy(hostName, hostPort, localRemappedPort) {
    if (gSocksServer == null) {
      gSocksServer = new SocksTestServer();
      // Using PAC makes much more sense here. However, it turns out that PAC
      // appears to be broken with synchronous proxy resolve, so enabling the
      // PAC mode requires bug 791645 to be fixed first.
      /*
      let pac = 'data:text/plain,function FindProxyForURL(url, host) {' +
        "if (host == 'localhost' || host == '127.0.0.1') {" +
          'return "DIRECT";' +
        '}' +
        'return "SOCKS5 127.0.0.1:' + gSocksServer.port + '";' +
      '}';
      dump(pac + '\n');
      Services.prefs.setIntPref("network.proxy.type", 2);
      Services.prefs.setCharPref("network.proxy.autoconfig_url", pac);
      */

      // Until then, we'll serve the actual proxy via a proxy filter.
      let pps = Cc["@mozilla.org/network/protocol-proxy-service;1"]
                  .getService(Ci.nsIProtocolProxyService);
      let filter = {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolProxyFilter]),
        applyFilter(aProxyService, aURI, aProxyInfo) {
          if (aURI.host != "localhost" && aURI.host != "127.0.0.1") {
            return pps.newProxyInfo("socks", "localhost", gSocksServer.port,
              Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST, 0, null);
          }
          return aProxyInfo;
        },
      };
      pps.registerFilter(filter, 0);
    }
    dump("Requesting to map " + hostName + ":" + hostPort + "\n");
    gPortMap.set(hostName + ":" + hostPort, localRemappedPort);
  },

  /**
   * Turn off any servers started by this file (e.g., the SOCKS proxy server).
   */
  shutdownServers() {
    if (gSocksServer)
      gSocksServer.close();
  },
};
