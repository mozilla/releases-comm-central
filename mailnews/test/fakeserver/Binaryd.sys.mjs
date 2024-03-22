/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const CC = Components.Constructor;

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

const BinaryOutputStream = CC(
  "@mozilla.org/binaryoutputstream;1",
  "nsIBinaryOutputStream",
  "setOutputStream"
);

/**
 * A binary stream-based server.
 * Listens on a socket, and whenever a new connection is made it runs
 * a user-supplied handler function.
 *
 * Example:
 * A trivial echo server (with a null daemon, so no state shared between
 * connections):
 *
 *   let echoServer = new BinaryServer(function(conn, daemon) {
 *     while(1) {
 *       let data = conn.read(1);
 *       conn.write(data);
 *     }
 *   }, null);
 *
 */

export class BinaryServer {
  /**
   * The handler function should be of the form:
   * async function handlerFn(conn, daemon)
   *
   * @async
   * @callback handlerFn
   * @param {Connection} conn
   * @param {object} daemon
   *
   * The handler function runs as long as it wants - reading and writing bytes
   * (via methods on conn) until it is finished with the connection.
   * The handler simply returns to indicate the connection is done, or throws
   * an exception to indicate that something went wrong.
   * The daemon is the object which holds the server data/state, shared with
   * all connection handler. The BinaryServer doesn't do anything with daemon
   * other than passing it directly on to the handler function.
   */

  /**
   * Construct a new BinaryServer.
   *
   * @param {handlerFn} handlerFn - Function to call to handle each new connection.
   * @param {object} daemon - Object to pass on to the handler, to share state
   *                 and functionality between across connections.
   */
  constructor(handlerFn, daemon) {
    this._port = -1;
    this._handlerFn = handlerFn;
    this._daemon = daemon;
    this._listener = null; // Listening socket to accept new connections.
    this._connections = new Set();
  }

  /**
   * Starts the server running.
   *
   * @param {number} port - The port to run on (or -1 to pick one automatically).
   */
  async start(port = -1) {
    if (this._listener) {
      throw Components.Exception(
        "Server already started",
        Cr.NS_ERROR_ALREADY_INITIALIZED
      );
    }

    const socket = new ServerSocket(
      port,
      true, // Loopback only.
      -1 // Default max pending connections.
    );

    const server = this;

    socket.asyncListen({
      async onSocketAccepted(socket, transport) {
        const conn = new Connection(transport);
        server._connections.add(conn);
        try {
          await server._handlerFn(conn, server._daemon);
          // If we get here, handler completed, without error.
        } catch (e) {
          if (conn.isClosed()) {
            // if we get here, assume the error occurred because we're
            // shutting down, and ignore it.
          } else {
            // if we get here, something went wrong.
            dump("ERROR " + e.toString());
          }
        }
        conn.close();
        server._connections.delete(conn);
      },
      onStopListening() {
        // Server is stopping, time to close any outstanding connections.
        server._connections.forEach(conn => conn.close());
        server._connections.clear();
      },
      QueryInterface: ChromeUtils.generateQI(["nsIServerSocketListener"]),
    });
    // We're running!
    this._listener = socket;
  }

  /**
   * Provides port, a read-only attribute to get which port the server
   * server is listening upon. Behaviour is undefined if server is not
   * running.
   */
  get port() {
    return this._listener.port;
  }

  /**
   * Stops the server, if it is running.
   */
  stop() {
    if (!this._listener) {
      // Already stopped.
      return;
    }
    this._listener.close();
    this._listener = null;
    // We could still be accepting new connections at this point,
    // so we wait until the onStopListening callback to tear down the
    // connections.
  }
}

/**
 * Connection wraps a nsITransport with read/write functions that are
 * javascript async, to simplify writing server handers.
 * Handlers should only need to use read() and write() from here, leaving
 * all connection management up to the BinaryServer.
 */
class Connection {
  constructor(transport) {
    this._transport = transport;
    this._input = transport.openInputStream(0, 0, 0);
    const outStream = transport.openOutputStream(0, 0, 0);
    this._output = new BinaryOutputStream(outStream);
  }

  /**
   * @returns true if close() has been called.
   */
  isClosed() {
    return this._transport === null;
  }

  /**
   * Closes the connection. Can be safely called multiple times.
   * The BinaryServer will call this - handlers don't need to worry about
   * the connection status.
   */
  close() {
    if (this.isClosed()) {
      return;
    }
    this._input.close();
    this._output.close();
    this._transport.close(Cr.NS_OK);
    this._input = null;
    this._output = null;
    this._transport = null;
  }

  /**
   * Read exactly nBytes from the connection.
   *
   * @param {number} nBytes - The number of bytes required.
   * @returns {Array.<number>} - An array containing the requested bytes.
   */
  async read(nBytes) {
    const conn = this;
    const buf = [];
    while (buf.length < nBytes) {
      const want = nBytes - buf.length;
      // A slightly odd-looking construct to wrap the listener-based
      // asyncwait() into a javascript async function.
      await new Promise((resolve, reject) => {
        try {
          conn._input.asyncWait(
            {
              onInputStreamReady(stream) {
                // how many bytes are actually available?
                let n;
                try {
                  n = stream.available();
                } catch (e) {
                  // stream was closed.
                  reject(e);
                }
                if (n > want) {
                  n = want;
                }
                const chunk = new BinaryInputStream(stream).readByteArray(n);
                Array.prototype.push.apply(buf, chunk);
                resolve();
              },
            },
            0,
            want,
            Services.tm.mainThread
          );
        } catch (e) {
          // asyncwait() failed
          reject(e);
        }
      });
    }
    return buf;
  }

  /**
   * Write data to the connection.
   *
   * @param {Array.<number>} data - The bytes to send.
   */
  async write(data) {
    // TODO: need to check outputstream for writeability here???
    // Might be an issue if we start throwing bigger chunks of data about...
    await this._output.writeByteArray(data);
  }
}
