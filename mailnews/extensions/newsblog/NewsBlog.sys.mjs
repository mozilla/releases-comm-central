/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

export function FeedDownloader() {}
FeedDownloader.prototype = {
  downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow) {
    FeedUtils.downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow);
  },
  updateSubscriptionsDS(aFolder, aOrigFolder, aAction) {
    FeedUtils.updateSubscriptionsDS(aFolder, aOrigFolder, aAction);
  },

  QueryInterface: ChromeUtils.generateQI(["nsINewsBlogFeedDownloader"]),
};

export function FeedAcctMgrExtension() {}
FeedAcctMgrExtension.prototype = {
  name: "newsblog",
  chromePackageName: "messenger-newsblog",
  showPanel: server => false,

  QueryInterface: ChromeUtils.generateQI(["nsIMsgAccountManagerExtension"]),
};
