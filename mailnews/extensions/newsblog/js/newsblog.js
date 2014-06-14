/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource:///modules/FeedUtils.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var nsNewsBlogFeedDownloader =
{
  downloadFeed: function(aFolder, aUrlListener, aIsBiff, aMsgWindow)
  {
    FeedUtils.downloadFeed(aFolder, aUrlListener, aIsBiff, aMsgWindow);
  },

  subscribeToFeed: function(aUrl, aFolder, aMsgWindow)
  {
    FeedUtils.subscribeToFeed(aUrl, aFolder, aMsgWindow);
  },

  updateSubscriptionsDS: function(aFolder, aOrigFolder, aAction)
  {
    FeedUtils.updateSubscriptionsDS(aFolder, aOrigFolder, aAction);
  },

  QueryInterface: function(aIID)
  {
    if (aIID.equals(Ci.nsINewsBlogFeedDownloader) ||
        aIID.equals(Ci.nsISupports))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
}

var nsNewsBlogAcctMgrExtension =
{
  name: "newsblog",
  chromePackageName: "messenger-newsblog",
  showPanel: function (server)
  {
    return false;
  },
  QueryInterface: function(aIID)
  {
    if (aIID.equals(Ci.nsIMsgAccountManagerExtension) ||
        aIID.equals(Ci.nsISupports))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
}

function FeedDownloader() {}

FeedDownloader.prototype =
{
  classID: Components.ID("{5c124537-adca-4456-b2b5-641ab687d1f6}"),
  _xpcom_factory:
  {
    createInstance: function (aOuter, aIID)
    {
      if (aOuter != null)
        throw Cr.NS_ERROR_NO_AGGREGATION;
      if (!aIID.equals(Ci.nsINewsBlogFeedDownloader) &&
          !aIID.equals(Ci.nsISupports))
        throw Cr.NS_ERROR_INVALID_ARG;

      // return the singleton
      return nsNewsBlogFeedDownloader.QueryInterface(aIID);
    }
  } // factory
}; // feed downloader

function AcctMgrExtension() {}

AcctMgrExtension.prototype =
{
  classID: Components.ID("{E109C05F-D304-4ca5-8C44-6DE1BFAF1F74}"),
  _xpcom_factory:
  {
    createInstance: function (aOuter, aIID)
    {
      if (aOuter != null)
        throw Cr.NS_ERROR_NO_AGGREGATION;
      if (!aIID.equals(Ci.nsIMsgAccountManagerExtension) &&
          !aIID.equals(Ci.nsISupports))
        throw Cr.NS_ERROR_INVALID_ARG;

      // return the singleton
      return nsNewsBlogAcctMgrExtension.QueryInterface(aIID);
    }
  } // factory
}; // account manager extension

var components = [FeedDownloader, AcctMgrExtension];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
