/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module implements the folder lookup service. Presently, this uses RDF as
 * the backing store, but the intent is that this will eventually become the
 * authoritative map.
 */

"use strict";

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function isValidFolder(folder) {
  // RDF is liable to return folders that don't exist, and we may be working
  // with a deleted folder but we're still holding on to the reference. For
  // valid folders, one of two scenarios is true: either the folder has a parent
  // (the deletion code clears the parent to indicate its nonvalidity), or the
  // folder is a root folder of some server. Getting the root folder may throw
  // an exception if we attempted to create a server that doesn't exist, so we
  // need to guard for that error.
  try {
    return folder.parent != null || folder.rootFolder == folder;
  } catch (e) {
    return false;
  }
}

// This insures that the service is only created once
var gCreated = false;

function folderLookupService() {
  if (gCreated)
    throw Cr.NS_ERROR_ALREADY_INITIALIZED;
  this._map = new Map();
  gCreated = true;
}
folderLookupService.prototype = {
  // XPCOM registration stuff
  QueryInterface: ChromeUtils.generateQI([Ci.nsIFolderLookupService]),
  classID: Components.ID("{a30be08c-afc8-4fed-9af7-79778a23db23}"),

  // nsIFolderLookupService impl
  getFolderForURL(aUrl) {
    let folder = null;
    // First, see if the folder is in our cache.
    if (this._map.has(aUrl)) {
      let valid = false;
      try {
        folder = this._map.get(aUrl).QueryReferent(Ci.nsIMsgFolder);
        // We don't want to return "dangling" (parentless) folders.
        valid = isValidFolder(folder);
      } catch (e) {
        // The object was deleted, so it's not valid
      }

      if (valid)
        return folder;

      // Don't keep around invalid folders.
      this._map.delete(aUrl);
      folder = null;
    }

    // If we get here, then the folder was not in our map. It could be that the
    // folder was created by somebody else, so try to find that folder.
    // For now, we use the RDF service, since it results in minimal changes. But
    // RDF has a tendency to create objects without checking to see if they
    // really exist---use the parent property to see if the folder is a real
    // folder.
    if (folder == null) {
      folder = this.getOrCreateFolderForURL(aUrl);
      if (!folder)
        return null;
    }
    // We don't want to return "dangling" (parentless) folders.
    if (!isValidFolder(folder))
      return null;

    // Add the new folder to our map. Store a weak reference instead, so that
    // the folder can be closed when necessary.
    let weakRef = folder.QueryInterface(Ci.nsISupportsWeakReference)
                        .GetWeakReference();
    this._map.set(aUrl, weakRef);
    return folder;
  },
  getOrCreateFolderForURL(aUrl) {
    // Check that aUrl has an active scheme, in case this folder is from
    // an extension that is currently disabled or hasn't started up yet.
    // Extract the scheme in the same way that the RDF service does.
    let scheme = aUrl.match(/\w*/)[0];
    let contractID = "@mozilla.org/rdf/resource-factory;1?name=" + scheme;
    if (!(contractID in Cc))
      return null;

    // NOTE: this doesn't update _map, but it'll work fine and
    // it's a transitional function we want deleted anyway.
    let rdf = Cc["@mozilla.org/rdf/rdf-service;1"]
                .getService(Ci.nsIRDFService);
    try {
      let folder = rdf.GetResource(aUrl)
                      .QueryInterface(Ci.nsIMsgFolder);
      return folder;
    } catch (e) {
      // If the QI fails, then we somehow picked up an RDF resource that isn't
      // a folder. Return null in this case.
      return null;
    }
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([folderLookupService]);
