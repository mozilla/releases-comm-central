/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3Service"];

var { Pop3Client } = ChromeUtils.import("resource:///modules/Pop3Client.jsm");

/**
 * Set mailnews.pop3.jsmodule to true to use this module.
 *
 * @implements {nsIPop3Service}
 */
class Pop3Service {
  QueryInterface = ChromeUtils.generateQI(["nsIPop3Service"]);

  constructor() {
    this._listeners = [];
  }

  GetNewMail(msgWindow, urlListener, inbox, server) {
    return this._getMail(true, msgWindow, urlListener, inbox, server);
  }

  CheckForNewMail(msgWindow, urlListener, inbox, server) {
    return this._getMail(false, msgWindow, urlListener, inbox, server);
  }

  addListener(listener) {
    this._listeners.push(listener);
  }

  _getMail(downloadNewMail, msgWindow, urlListener, inbox, server) {
    let client = new Pop3Client(server);
    client.connect();
  }
}

Pop3Service.prototype.classID = Components.ID(
  "{1e8f21c3-32c3-4114-9ea4-3d74006fb351}"
);
