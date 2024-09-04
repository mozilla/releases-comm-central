/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import * as SmtpD from "resource://testing-common/mailnews/Smtpd.sys.mjs";
import { nsMailServer } from "resource://testing-common/mailnews/Maild.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * A simple SMTP server for testing purposes.
 */
export class SMTPServer {
  constructor(options = {}) {
    this.options = options;
    this.open(options.handler);
  }

  open(handlerName = "RFC2821") {
    if (!this.daemon) {
      this.daemon = new SmtpD.SmtpDaemon();
    }
    this.server = new nsMailServer(daemon => {
      const handler = new SmtpD[`SMTP_${handlerName}_handler`](
        daemon,
        this.options
      );
      if (this.options.offerStartTLS) {
        // List startTLS as a capability, even though we don't support it.
        handler.kCapabilities.push("STARTTLS");
      }
      return handler;
    }, this.daemon);
    this.server.tlsCert = this.options.tlsCert;
    this.server.start();
    dump(`SMTP server at localhost:${this.server.port} opened\n`);

    TestUtils.promiseTestFinished?.then(() => {
      this.close();
      dump(`SMTP server at localhost:${this.server.port} closed\n`);
    });
  }

  close() {
    this.server.stop();
  }

  get port() {
    return this.server.port;
  }

  get lastMessage() {
    return this.daemon.post;
  }
}
