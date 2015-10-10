/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This component enables the JavaScript API for downloads at startup.  This
 * will eventually be removed when nsIDownloadManager will not be available
 * anymore (bug 851471).
 */

"use strict";

////////////////////////////////////////////////////////////////////////////////
//// Globals

var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DownloadIntegration",
                                  "resource://gre/modules/DownloadIntegration.jsm");

/**
 * CID and Contract ID of the JavaScript implementation of nsITransfer.
 */
var kTransferCid = Components.ID("{1b4c85df-cbdd-4bb6-b04e-613caece083c}");
var kTransferContractId = "@mozilla.org/transfer;1";

////////////////////////////////////////////////////////////////////////////////
//// DownloadsStartup

function DownloadsStartup() { }

DownloadsStartup.prototype = {
  classID: Components.ID("{a93f0d6f-02a3-4486-a662-8f49b8c1de48}"),

  _xpcom_factory: XPCOMUtils.generateSingletonFactory(DownloadsStartup),

  //////////////////////////////////////////////////////////////////////////////
  //// nsISupports

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  //////////////////////////////////////////////////////////////////////////////
  //// nsIObserver

  observe: function DS_observe(aSubject, aTopic, aData)
  {
    if (aTopic != "profile-after-change") {
      Cu.reportError("Unexpected observer notification.");
      return;
    }

    // Override Toolkit's nsITransfer implementation with the one from the
    // JavaScript API for downloads.
    Components.manager.QueryInterface(Ci.nsIComponentRegistrar)
                      .registerFactory(kTransferCid, "",
                                       kTransferContractId, null);

    // To preserve download list across sessions.
    DownloadIntegration.shouldPersistDownload = function(aDownload) {
      return true;
    };

  },
};

////////////////////////////////////////////////////////////////////////////////
//// Module

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([DownloadsStartup]);
