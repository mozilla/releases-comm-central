/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  SmtpDaemon,
  SMTP_RFC2821_handler,
} from "resource://testing-common/mailnews/Smtpd.sys.mjs";
import { nsMailServer } from "resource://testing-common/mailnews/Maild.sys.mjs";

/**
 * A simple SMTP server for testing purposes.
 */
export class SMTPServer {
  constructor(testScope, options = {}) {
    this.testScope = testScope;
    this.options = options;
    this.open();
  }

  open() {
    if (!this.daemon) {
      this.daemon = new SmtpDaemon();
    }
    this.server = new nsMailServer(daemon => {
      const handler = new SMTP_RFC2821_handler(daemon, this.options);
      return handler;
    }, this.daemon);
    this.server.tlsCert = this.options.tlsCert;
    this.server.start();
    dump(`SMTP server at localhost:${this.server.port} opened\n`);

    this.testScope.registerCleanupFunction(() => {
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
}
