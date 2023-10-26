/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3Service"];

var { Pop3Client } = ChromeUtils.import("resource:///modules/Pop3Client.jsm");

/**
 * @implements {nsIPop3Service}
 */
class Pop3Service {
  QueryInterface = ChromeUtils.generateQI(["nsIPop3Service"]);

  constructor() {
    this._listeners = new Set();
  }

  GetNewMail(msgWindow, urlListener, inbox, server) {
    return this._getMail(true, msgWindow, urlListener, inbox, server);
  }

  CheckForNewMail(msgWindow, urlListener, inbox, server) {
    return this._getMail(false, msgWindow, urlListener, inbox, server);
  }

  verifyLogon(server, urlListener, msgWindow) {
    const client = new Pop3Client(server);
    client.urlListener = urlListener;
    client.connect();
    client.onOpen = () => {
      client.verifyLogon(msgWindow);
    };
    return client.runningUri;
  }

  addListener(listener) {
    this._listeners.add(listener);
  }

  removeListener(listener) {
    this._listeners.remove(listener);
  }

  notifyDownloadStarted(folder) {
    for (const listener of this._listeners) {
      listener.onDownloadStarted(folder);
    }
  }

  notifyDownloadProgress(folder, numMessages, numTotalMessages) {
    for (const listener of this._listeners) {
      listener.onDownloadProgress(folder, numMessages, numTotalMessages);
    }
  }

  notifyDownloadCompleted(folder, numMessages) {
    for (const listener of this._listeners) {
      listener.onDownloadCompleted(folder, numMessages);
    }
  }

  _getMail(downloadNewMail, msgWindow, urlListener, inbox, server) {
    const client = new Pop3Client(server);
    client.runningUri.msgWindow = msgWindow;
    client.urlListener = urlListener;
    client.connect();
    client.onOpen = () => {
      client.getMail(downloadNewMail, msgWindow, inbox);
    };
    return client.runningUri;
  }
}

Pop3Service.prototype.classID = Components.ID(
  "{1e8f21c3-32c3-4114-9ea4-3d74006fb351}"
);
