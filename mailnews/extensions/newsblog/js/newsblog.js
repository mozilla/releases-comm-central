/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource:///modules/FeedUtils.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function FeedDownloader() { }
FeedDownloader.prototype = {
  downloadFeed: function(aFolder, aUrlListener, aIsBiff, aMsgWindow) {
    FeedUtils.downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow);
  },
  subscribeToFeed: function(aUrl, aFolder, aMsgWindow) {
    FeedUtils.subscribeToFeed(aUrl, aFolder, aMsgWindow);
  },
  updateSubscriptionsDS: function(aFolder, aOrigFolder, aAction) {
    FeedUtils.updateSubscriptionsDS(aFolder, aOrigFolder, aAction);
  },

  classID: Components.ID("{5c124537-adca-4456-b2b5-641ab687d1f6}"),
  classInfo: XPCOMUtils.generateCI({
               classID: "{5c124537-adca-4456-b2b5-641ab687d1f6}",
               contractID: "@mozilla.org/newsblog-feed-downloader;1",
               classDescription: "Feed Downloader",
               interfaces: [Ci.nsINewsBlogFeedDownloader],
               flags: Ci.nsIClassInfo.SINGLETON}),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsINewsBlogFeedDownloader]),
};

function FeedAcctMgrExtension() { }
FeedAcctMgrExtension.prototype = {
  name: "newsblog",
  chromePackageName: "messenger-newsblog",
  showPanel: server => false,

  classID: Components.ID("{E109C05F-D304-4ca5-8C44-6DE1BFAF1F74}"),
  classInfo: XPCOMUtils.generateCI({
               classID: "{E109C05F-D304-4ca5-8C44-6DE1BFAF1F74}",
               contractID: "@mozilla.org/accountmanager/extension;1?name=newsblog",
               classDescription: "Feed Account Manager Extension",
               interfaces: [Ci.nsIMsgAccountManagerExtension],
               flags: Ci.nsIClassInfo.SINGLETON}),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgAccountManagerExtension]),
};

var components = [FeedDownloader, FeedAcctMgrExtension];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
