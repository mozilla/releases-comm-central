/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A proxy to convert HTTP requests to HTTPS for tests.
 */

import { CommonUtils } from "resource://services-common/utils.sys.mjs";
import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";

const socketTransportService = Cc[
  "@mozilla.org/network/socket-transport-service;1"
].getService(Ci.nsISocketTransportService);

/**
 * @implements {nsIServerSocketListener}
 */
export class HttpsProxy {
  QueryInterface = ChromeUtils.generateQI(["nsIServerSocketListener"]);

  /**
   * @type {HttpsProxyHandler[]}
   */
  handlers = [];

  /**
   * @param {object} testScope - The JS scope for the current test, so
   *   `registerCleanupFunction` can be used.
   * @param {integer} serverPort - The port number of the HTTP server.
   * @param {nsIX509Cert} tlsCert - The certificate to use for HTTPS requests.
   *   See ServerTestUtils.getCertificate.
   */
  constructor(testScope, serverPort, tlsCert) {
    this.serverPort = serverPort;

    this.socket = Cc["@mozilla.org/network/tls-server-socket;1"].createInstance(
      Ci.nsITLSServerSocket
    );
    this.socket.init(-1, true, -1);
    this.socket.serverCert = tlsCert;
    this.socket.setSessionTickets(false);
    this.socket.asyncListen(this);
    dump(
      `Reverse proxy from localhost:${this.serverPort} to localhost:${this.socket.port} opened\n`
    );

    testScope.registerCleanupFunction(() => {
      this.close();
      dump(
        `Reverse proxy from localhost:${this.serverPort} to localhost:${this.socket.port} closed\n`
      );
    });
  }

  close() {
    this.socket.close();
  }

  get port() {
    return this.socket.port;
  }

  onSocketAccepted(socket, transport) {
    const input = transport.openInputStream(0, 0, 0);
    const output = transport.openOutputStream(0, 0, 0);
    const handler = new HttpsProxyHandler(this, input, output);
    const connectionInfo = transport.securityCallbacks.getInterface(
      Ci.nsITLSServerConnectionInfo
    );
    connectionInfo.setSecurityObserver(handler);
    this.handlers.push(handler);
  }

  onStopListening() {
    for (const handler of this.handlers) {
      handler.close();
    }
    this.handlers.length = 0;
  }
}

/**
 * @implements {nsIInputStreamCallback}
 * @implements {nsITLSServerSecurityObserver}
 */
class HttpsProxyHandler {
  QueryInterface = ChromeUtils.generateQI([
    "nsIInputStreamCallback",
    "nsITLSServerSecurityObserver",
  ]);

  constructor(proxy, clientInputStream, clientOutputStream) {
    this.proxy = proxy;
    this.clientInputStream = clientInputStream;
    this.clientOutputStream = clientOutputStream;

    const transport = socketTransportService.createTransport(
      [],
      "localhost",
      proxy.serverPort,
      null,
      null
    );
    this.serverInputStream = transport.openInputStream(0, 1024, 1024);
    this.serverOutputStream = transport.openOutputStream(0, 1024, 1024);
  }

  close() {
    this.clientInputStream.close();
    this.clientOutputStream.close();
    this.serverInputStream?.close();
    this.serverOutputStream?.close();
  }

  onHandshakeDone(socket, status) {
    this.clientInputStream.asyncWait(this, 0, 0, Services.tm.currentThread);
  }

  async onInputStreamReady(clientInputStream) {
    try {
      const clientRequest =
        CommonUtils.readBytesFromInputStream(clientInputStream);
      let serverRequest = "";

      const lines = clientRequest.split("\r\n");
      serverRequest += `${lines[0]}\r\n`;
      serverRequest += `Host: localhost:${this.proxy.serverPort}\r\n`;

      for (let i = 1; i < lines.length; i++) {
        if (
          lines[i].startsWith("Content-Type: ") ||
          lines[i].startsWith("Content-Length: ")
        ) {
          serverRequest += `${lines[i]}\r\n`;
        } else if (lines[i] == "") {
          for (; i < lines.length; i++) {
            serverRequest += `${lines[i]}\r\n`;
          }
        }
      }
      this.serverOutputStream.write(serverRequest, serverRequest.length);

      NetUtil.asyncCopy(this.serverInputStream, this.clientOutputStream, () =>
        this.close()
      );
    } catch (ex) {
      console.error(ex.message);
    }
  }
}
