/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const PRINT_DEBUG = false;

import { Assert } from "resource://testing-common/Assert.sys.mjs";

/**
 * This is a partial implementation of an LDAP server as defined by RFC 4511.
 * It's not intended to serve any particular dataset, rather, tests should
 * cause the application to make requests and tell the server what to respond.
 *
 * https://docs.ldap.com/specs/rfc4511.txt
 *
 * @implements {nsIInputStreamCallback}
 * @implements {nsIServerSocketListener}
 */
export var LDAPServer = {
  BindRequest: 0x60,
  UnbindRequest: 0x42,
  SearchRequest: 0x63,
  AbandonRequest: 0x50,

  serverSocket: null,

  QueryInterface: ChromeUtils.generateQI([
    "nsIInputStreamCallback",
    "nsIServerSocketListener",
  ]),

  /**
   * Start listening on an OS-selected port. The port number can be found at
   * LDAPServer.port.
   */
  open() {
    this.serverSocket = Cc[
      "@mozilla.org/network/server-socket;1"
    ].createInstance(Ci.nsIServerSocket);
    this.serverSocket.init(-1, true, 1);
    console.log(`socket open on port ${this.serverSocket.port}`);

    this.serverSocket.asyncListen(this);
  },
  /**
   * Stop listening for new connections and close any that are open.
   */
  close() {
    this.serverSocket.close();
  },
  /**
   * The port this server is listening on.
   */
  get port() {
    return this.serverSocket.port;
  },

  /**
   * Retrieves any data sent to the server since connection or the previous
   * call to read(). This should be called every time the application is
   * expected to send data.
   *
   * @returns {Promise} Resolves when data is received by the server, with the
   *                    data as a byte array.
   */
  async read(expectedOperation) {
    let data;
    if (this._data) {
      data = this._data;
      delete this._data;
    } else {
      data = await new Promise(resolve => {
        this._inputStreamReadyResolve = resolve;
      });
    }

    // Simplified parsing to get the message ID and operation code.

    let index = 4;
    // The value at [1] may be more than one byte. If it is, skip more bytes.
    if (data[1] & 0x80) {
      index += data[1] & 0x7f;
    }

    // Assumes the ID is not greater than 127.
    this._lastMessageID = data[index];

    if (expectedOperation) {
      const actualOperation = data[index + 1];

      // Unbind and abandon requests can happen at any point, when an
      // nsLDAPConnection is destroyed. This is unpredictable, and irrelevant
      // for testing. Ignore.
      if (
        actualOperation == LDAPServer.UnbindRequest ||
        actualOperation == LDAPServer.AbandonRequest
      ) {
        if (PRINT_DEBUG) {
          console.log("Ignoring unbind or abandon request");
        }
        return this.read(expectedOperation);
      }

      Assert.equal(
        actualOperation.toString(16),
        expectedOperation.toString(16),
        "LDAP Operation type"
      );
    }

    return data;
  },
  /**
   * Sends raw data to the application. Generally this shouldn't be used
   * directly but it may be useful for testing.
   *
   * @param {byte[]} data - The data to write.
   */
  write(data) {
    if (PRINT_DEBUG) {
      console.log(
        ">>> " + data.map(b => b.toString(16).padStart(2, 0)).join(" ")
      );
    }
    this._outputStream.writeByteArray(data);
  },
  /**
   * Sends a simple BindResponse to the application.
   * See section 4.2.2 of the RFC.
   */
  writeBindResponse() {
    const message = new Sequence(0x30, new IntegerValue(this._lastMessageID));
    const person = new Sequence(
      0x61,
      new EnumeratedValue(0),
      new StringValue(""),
      new StringValue("")
    );
    message.children.push(person);
    this.write(message.getBytes());
  },
  /**
   * Sends a SearchResultEntry to the application.
   * See section 4.5.2 of the RFC.
   *
   * @param {object} entry
   * @param {string} entry.dn - The LDAP DN of the person.
   * @param {string} entry.attributes - A key/value or key/array-of-values
   *   object representing the person.
   */
  writeSearchResultEntry({ dn, attributes }) {
    const message = new Sequence(0x30, new IntegerValue(this._lastMessageID));

    const person = new Sequence(0x64, new StringValue(dn));
    message.children.push(person);

    const attributeSequence = new Sequence(0x30);
    person.children.push(attributeSequence);

    for (let [key, value] of Object.entries(attributes)) {
      const seq = new Sequence(0x30, new StringValue(key), new Sequence(0x31));
      if (typeof value == "string") {
        value = [value];
      }
      for (const v of value) {
        seq.children[1].children.push(new StringValue(v));
      }
      attributeSequence.children.push(seq);
    }

    this.write(message.getBytes());
  },
  /**
   * Sends a SearchResultDone to the application.
   * See RFC 4511 section 4.5.2.
   */
  writeSearchResultDone() {
    const message = new Sequence(0x30, new IntegerValue(this._lastMessageID));
    const person = new Sequence(
      0x65,
      new EnumeratedValue(0),
      new StringValue(""),
      new StringValue("")
    );
    message.children.push(person);
    this.write(message.getBytes());
  },

  /**
   * nsIServerSocketListener.onSocketAccepted
   */
  onSocketAccepted(socket, transport) {
    const inputStream = transport
      .openInputStream(0, 8192, 1024)
      .QueryInterface(Ci.nsIAsyncInputStream);

    const outputStream = transport.openOutputStream(0, 0, 0);
    this._outputStream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
      Ci.nsIBinaryOutputStream
    );
    this._outputStream.setOutputStream(outputStream);

    if (this._socketConnectedResolve) {
      this._socketConnectedResolve();
      delete this._socketConnectedResolve;
    }
    inputStream.asyncWait(this, 0, 0, Services.tm.mainThread);
  },
  /**
   * nsIServerSocketListener.onStopListening
   */
  onStopListening(socket, status) {
    console.log(`socket closed with status ${status.toString(16)}`);
  },

  /**
   * nsIInputStreamCallback.onInputStreamReady
   */
  onInputStreamReady(stream) {
    let available;
    try {
      available = stream.available();
    } catch (ex) {
      if (
        [Cr.NS_BASE_STREAM_CLOSED, Cr.NS_ERROR_NET_RESET].includes(ex.result)
      ) {
        return;
      }
      throw ex;
    }

    const binaryInputStream = Cc[
      "@mozilla.org/binaryinputstream;1"
    ].createInstance(Ci.nsIBinaryInputStream);
    binaryInputStream.setInputStream(stream);
    const data = binaryInputStream.readByteArray(available);
    if (PRINT_DEBUG) {
      console.log(
        "<<< " + data.map(b => b.toString(16).padStart(2, 0)).join(" ")
      );
    }

    if (this._inputStreamReadyResolve) {
      this._inputStreamReadyResolve(data);
      delete this._inputStreamReadyResolve;
    } else {
      this._data = data;
    }

    stream.asyncWait(this, 0, 0, Services.tm.mainThread);
  },
};

/**
 * Helper classes to convert primitives to LDAP byte sequences.
 */

class Sequence {
  constructor(number, ...children) {
    this.number = number;
    this.children = children;
  }
  getBytes() {
    let bytes = [];
    for (const c of this.children) {
      bytes = bytes.concat(c.getBytes());
    }
    return [this.number].concat(getLengthBytes(bytes.length), bytes);
  }
}
class IntegerValue {
  constructor(int) {
    this.int = int;
    this.number = 0x02;
  }
  getBytes() {
    let temp = this.int;
    const bytes = [];

    while (temp >= 128) {
      bytes.unshift(temp & 255);
      temp >>= 8;
    }
    bytes.unshift(temp);
    return [this.number].concat(getLengthBytes(bytes.length), bytes);
  }
}
class StringValue {
  constructor(str) {
    this.str = str;
  }
  getBytes() {
    return [0x04].concat(
      getLengthBytes(this.str.length),
      Array.from(this.str, c => c.charCodeAt(0))
    );
  }
}
class EnumeratedValue extends IntegerValue {
  constructor(int) {
    super(int);
    this.number = 0x0a;
  }
}

function getLengthBytes(int) {
  if (int < 128) {
    return [int];
  }

  let temp = int;
  const bytes = [];

  while (temp >= 128) {
    bytes.unshift(temp & 255);
    temp >>= 8;
  }
  bytes.unshift(temp);
  bytes.unshift(0x80 | bytes.length);
  return bytes;
}
