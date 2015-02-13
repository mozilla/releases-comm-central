/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This component enables the Legacy API for downloads at startup.
 */

"use strict";

////////////////////////////////////////////////////////////////////////////////
//// Globals

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * CID and Contract ID of the JavaScript implementation of nsITransfer.
 */
const kTransferCid = Components.ID("{b02be33b-d47c-4bd3-afd9-402a942426b0}");
const kTransferContractId = "@mozilla.org/transfer;1";

////////////////////////////////////////////////////////////////////////////////
//// DownloadsStartup

function DownloadsStartup() { }

DownloadsStartup.prototype = {
  classID: Components.ID("{49507fe5-2cee-4824-b6a3-e999150ce9b8}"),

  _xpcom_factory: XPCOMUtils.generateSingletonFactory(DownloadsStartup),

  //////////////////////////////////////////////////////////////////////////////
  //// nsISupports

  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver]),

  //////////////////////////////////////////////////////////////////////////////
  //// nsIObserver

  observe: function DS_observe(aSubject, aTopic, aData)
  {
    const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
    // Override the JavaScript nsITransfer implementation with the
    // Legacy version.
    Components.manager.QueryInterface(nsIComponentRegistrar)
                      .registerFactory(kTransferCid, "",
                                       kTransferContractId, null);
  },
};

////////////////////////////////////////////////////////////////////////////////
//// Module

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([DownloadsStartup]);
