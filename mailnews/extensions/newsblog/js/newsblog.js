/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {FeedUtils} = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function FeedDownloader() { }
FeedDownloader.prototype = {
  downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow) {
    FeedUtils.downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow);
  },
  subscribeToFeed(aUrl, aFolder, aMsgWindow) {
    FeedUtils.subscribeToFeed(aUrl, aFolder, aMsgWindow);
  },
  updateSubscriptionsDS(aFolder, aOrigFolder, aAction) {
    FeedUtils.updateSubscriptionsDS(aFolder, aOrigFolder, aAction);
  },

  classID: Components.ID("{5c124537-adca-4456-b2b5-641ab687d1f6}"),
  QueryInterface: ChromeUtils.generateQI([Ci.nsINewsBlogFeedDownloader]),
};

function FeedAcctMgrExtension() { }
FeedAcctMgrExtension.prototype = {
  name: "newsblog",
  chromePackageName: "messenger-newsblog",
  showPanel: server => false,

  classID: Components.ID("{E109C05F-D304-4ca5-8C44-6DE1BFAF1F74}"),
  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgAccountManagerExtension]),
};

var components = [FeedDownloader, FeedAcctMgrExtension];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
