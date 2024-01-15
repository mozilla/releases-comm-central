/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Pop3Daemon,
  POP3_RFC5034_handler,
} from "resource://testing-common/mailnews/Pop3d.sys.mjs";
import { nsMailServer } from "resource://testing-common/mailnews/Maild.sys.mjs";

/**
 * A simple POP3 server for testing purposes.
 */
export class POP3Server {
  constructor(testScope, options = {}) {
    this.testScope = testScope;
    this.options = options;
    this.open();
  }

  open() {
    if (!this.daemon) {
      this.daemon = new Pop3Daemon();
    }
    this.server = new nsMailServer(daemon => {
      const handler = new POP3_RFC5034_handler(daemon, this.options);
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
}
