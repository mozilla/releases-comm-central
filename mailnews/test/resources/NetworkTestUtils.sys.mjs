/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file provides utilities useful in testing more advanced networking
 * scenarios, such as proxies and SSL connections.
 */

var CC = Components.Constructor;

import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

const ServerSocket = CC(
  "@mozilla.org/network/server-socket;1",
  "nsIServerSocket",
  "init"
);
const BinaryInputStream = CC(
  "@mozilla.org/binaryinputstream;1",
  "nsIBinaryInputStream",
  "setInputStream"
);

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
 * @param {nsIInputStream} client_in - The nsIInputStream of the socket.
 * @param {nsIOutputStream} client_out - The nsIOutputStream of the socket.
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
  QueryInterface: ChromeUtils.generateQI(["nsIInputStreamCallback"]),
  onInputStreamReady(input) {
    try {
      var len = input.available();
    } catch {
      // It turns out the input stream wasn't ready.
      return;
    }
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

    if (!this.sub_transport) {
      this.waitRead(input);
    }
  },

  // Listen on the input for the next packet
  waitRead(input) {
    input.asyncWait(this, 0, 0, currentThread);
  },

  // Simple handler to write out a binary string (because xpidl sucks here)
  write(buf) {
    this.client_out.write(buf, buf.length);
  },

  // Handle the first SOCKSv5 client message
  handleGreeting() {
    if (this.inbuf.length == 0) {
      return;
    }

    if (this.inbuf[0] != 5) {
      dump("Unknown protocol version: " + this.inbuf[0] + "\n");
      this.close();
      return;
    }

    // Some quality checks to make sure we've read the entire greeting.
    if (this.inbuf.length < 2) {
      return;
    }
    var nmethods = this.inbuf[1];
    if (this.inbuf.length < 2 + nmethods) {
      return;
    }
    this.inbuf = [];

    // Tell them that we don't log into this SOCKS server.
    this.state = STATE_WAIT_SOCKS5_REQUEST;
    this.write("\x05\x00");
  },

  // Handle the second SOCKSv5 message
  handleSocks5Request() {
    if (this.inbuf.length < 4) {
      return;
    }

    // Find the address:port requested.
    var atype = this.inbuf[3];
    var len, addr;
    if (atype == 0x01) {
      // IPv4 Address
      len = 4;
      addr = this.inbuf.slice(4, 8).join(".");
    } else if (atype == 0x03) {
      // Domain name
      len = this.inbuf[4];
      addr = String.fromCharCode.apply(null, this.inbuf.slice(5, 5 + len));
      len = len + 1;
    } else if (atype == 0x04) {
      // IPv6 address
      len = 16;
      addr = this.inbuf
        .slice(4, 20)
        .map(i => i.toString(16))
        .join(":");
    }
    var port = (this.inbuf[4 + len] << 8) | this.inbuf[5 + len];
    dump("Requesting " + addr + ":" + port + "\n");

    // Map that data to the port we report.
    var foundPort = gPortMap.get(addr + ":" + port);
    dump("This was mapped to " + foundPort + "\n");

    if (foundPort !== undefined) {
      this.write(
        "\x05\x00\x00" + // Header for response
          "\x04" +
          "\x00".repeat(15) +
          "\x01" + // IPv6 address ::1
          String.fromCharCode(foundPort >> 8) +
          String.fromCharCode(foundPort & 0xff) // Port number
      );
    } else {
      this.write(
        "\x05\x05\x00" + // Header for failed response
          "\x04" +
          "\x00".repeat(15) +
          "\x01" + // IPv6 address ::1
          "\x00\x00"
      );
      this.close();
      return;
    }

    // At this point, we contact the local server on that port and then we feed
    // the data back and forth. Easiest way to do that is to open the connection
    // and use the async copy to do it in a background thread.
    const sts = Cc[
      "@mozilla.org/network/socket-transport-service;1"
    ].getService(Ci.nsISocketTransportService);
    const trans = sts.createTransport([], "localhost", foundPort, null, null);
    const tunnelInput = trans.openInputStream(0, 1024, 1024);
    const tunnelOutput = trans.openOutputStream(0, 1024, 1024);
    this.sub_transport = trans;
    NetUtil.asyncCopy(tunnelInput, this.client_out, () => this.close());
    NetUtil.asyncCopy(this.client_in, tunnelOutput, () => this.close());
  },

  close() {
    this.client_in.close();
    this.client_out.close();
    if (this.sub_transport) {
      this.sub_transport.close(Cr.NS_OK);
    }
  },
};

// A SOCKS server that runs on a random port.
function SocksTestServer() {
  this.listener = ServerSocket(-1, true, -1);
  dump("Starting SOCKS server on " + this.listener.port + "\n");
  this.port = this.listener.port;
  this.listener.asyncListen(this);
  this.client_connections = [];
}
SocksTestServer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIServerSocketListener"]),

  onSocketAccepted(socket, trans) {
    var input = trans.openInputStream(0, 0, 0);
    var output = trans.openOutputStream(0, 0, 0);
    var client = new SocksClient(input, output);
    this.client_connections.push(client);
  },

  onStopListening() {},

  close() {
    for (const client of this.client_connections) {
      client.close();
    }
    this.client_connections = [];
    if (this.listener) {
      dump("Closing SOCKS server on " + this.listener.port + "\n");
      this.listener.close();
      this.listener = null;
    }
  },
};

var gSocksServer = null;
// hostname:port -> the port on localhost that the server really runs on.
var gPortMap = new Map();

export var NetworkTestUtils = {
  /**
   * Set up a proxy entry such that requesting a connection to hostname:port
   * will instead cause a connection to localRemappedPort. This will use a SOCKS
   * proxy (because any other mechanism is too complicated). Since this is
   * starting up a server, it does behoove you to call shutdownServers when you
   * no longer need to use the proxy server.
   *
   * @param {string} hostname - The DNS name to use for the client.
   * @param {integer} port - The port number to use for the client.
   * @param {integer} localRemappedPort - The port number on which the real server sits.
   */
  configureProxy(hostname, port, localRemappedPort) {
    if (gSocksServer == null) {
      gSocksServer = new SocksTestServer();

      // Save the existing proxy PAC for later restoration.
      this._oldProxyType = Services.prefs.getIntPref("network.proxy.type");
      this._oldProxyPAC = Services.prefs.getCharPref(
        "network.proxy.autoconfig_url"
      );

      // Create a PAC that sends most requests to our SOCKS server.
      // For some specific domains this replicates the usual Mochitest proxy,
      // so that if we need it we can use the Mochitest HTTP server.
      const pac = `data:text/plain,function FindProxyForURL(url, host) {
        if (host == "localhost" || host == "127.0.0.1") {
          return "DIRECT";
        }
        if (url.startsWith("http://mochi.test")) {
          return "PROXY 127.0.0.1:8888";
        }
        if (url.startsWith("https://example.org")) {
          return "PROXY 127.0.0.1:4443";
        }
        return "SOCKS5 127.0.0.1:${gSocksServer.port}";
      }`;
      Services.prefs.setIntPref("network.proxy.type", 2);
      Services.prefs.setCharPref("network.proxy.autoconfig_url", pac);

      TestUtils.promiseTestFinished?.then(() => {
        this.clearProxy();
      });
    }

    const key = `${hostname}:${port}`;
    dump(`Requesting to map ${key}\n`);
    gPortMap.set(key, localRemappedPort);
  },

  /**
   * Remove up a proxy entry.
   *
   * @param {string} hostname - The DNS name to use for the client.
   * @param {integer} port - The port number to use for the client.
   */
  unconfigureProxy(hostname, port) {
    const key = `${hostname}:${port}`;
    dump(`Requesting to remove ${key}\n`);
    if (!gPortMap.has(key)) {
      dump(`${key} was not configured!\n`);
    }
    gPortMap.delete(key);
  },

  /**
   * Shut down the SOCKS server and restore the proxy to its earlier state.
   */
  clearProxy() {
    this.shutdownServers();
    gPortMap.clear();

    if (this._oldProxyPAC) {
      // Restore the earlier proxy.
      Services.prefs.setIntPref("network.proxy.type", this._oldProxyType);
      Services.prefs.setCharPref(
        "network.proxy.autoconfig_url",
        this._oldProxyPAC
      );
    }
  },

  /**
   * Turn off any servers started by this file (e.g., the SOCKS proxy server).
   */
  shutdownServers() {
    if (gSocksServer) {
      gSocksServer.close();
      gSocksServer = null;
    }
  },
};
