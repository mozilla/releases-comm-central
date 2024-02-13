/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import * as Pop3D from "resource://testing-common/mailnews/Pop3d.sys.mjs";
import { nsMailServer } from "resource://testing-common/mailnews/Maild.sys.mjs";

/**
 * A simple POP3 server for testing purposes.
 */
export class POP3Server {
  constructor(testScope, options = {}) {
    this.testScope = testScope;
    this.options = options;
    this.open(options.handler);
  }

  open(handlerName = "RFC5034") {
    if (!this.daemon) {
      this.daemon = new Pop3D.Pop3Daemon();
    }
    this.server = new nsMailServer(daemon => {
      const handler = new Pop3D[`POP3_${handlerName}_handler`](
        daemon,
        this.options
      );
      if (this.options.offerStartTLS) {
        // List startTLS as a capability, even though we don't support it.
        handler.kCapabilities.push("STLS");
      }
      return handler;
    }, this.daemon);
    this.server.tlsCert = this.options.tlsCert;
    this.server.start();
    dump(`POP3 server at localhost:${this.server.port} opened\n`);

    this.testScope.registerCleanupFunction(() => {
      this.close();
      dump(`POP3 server at localhost:${this.server.port} closed\n`);
    });
  }

  close() {
    this.server.stop();
  }

  get port() {
    return this.server.port;
  }

  /**
   * @param {SyntheticMessage[]} messages
   */
  addMessages(messages) {
    const existingMessages = this.daemon._messages;
    messages.forEach(message => {
      if (typeof message != "string") {
        message = message.toMessageString();
      }
      existingMessages.push({ fileData: message + "\r\n" });
    });
    this.daemon.setMessages(existingMessages);
  }
}
