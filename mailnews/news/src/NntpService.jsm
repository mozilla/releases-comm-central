/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  NntpClient: "resource:///modules/NntpClient.jsm",
});

/**
 * Set the mailnews.nntp.jsmodule pref to true to use this module.
 *
 * @implements {nsINntpService}
 */
class NntpService {
  QueryInterface = ChromeUtils.generateQI(["nsINntpService"]);

  getNewNews(server, uri, getOld, urlListener, msgWindow) {
    let client = new NntpClient(server, uri);
    client.connect();

    client.onOpen = () => {
      client.getNewNews(getOld, urlListener, msgWindow);
    };
    return client.runningUri;
  }
}

NntpService.prototype.classID = Components.ID(
  "{b13db263-a219-4168-aeaf-8266f001087e}"
);
