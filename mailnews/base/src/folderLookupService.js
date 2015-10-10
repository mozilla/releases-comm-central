/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module implements the folder lookup service. Presently, this uses RDF as
 * the backing store, but the intent is that this will eventually become the
 * authoritative map.
 */

"use strict";

var Cc = Components.classes;
var Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

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
  this._map = new Map();
  if (gCreated)
    throw Cr.NS_ERROR_ALREADY_INITIALIZED;
  gCreated = true;
}
folderLookupService.prototype = {
  // XPCOM registration stuff
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFolderLookupService]),
  classID: Components.ID("{a30be08c-afc8-4fed-9af7-79778a23db23}"),

  // nsIFolderLookupService impl
  getFolderForURL: function (aUrl) {
    let folder = null;
    // First, see if the folder is in our cache.
    if (this._map.has(aUrl)) {
      let valid = false;
      try {
        folder = this._map.get(aUrl).QueryReferent(Ci.nsIMsgFolder);
        valid = isValidFolder(folder);
      } catch (e) {
        // The object was deleted, so it's not valid
      }
      if (!valid) {
        // Don't keep around invalid folders.
        this._map.delete(aUrl);
        folder = null;
      }
    }

    // If we get here, then the folder was not in our map. It could be that the
    // folder was created by somebody else, so try to find that folder.
    // For now, we use the RDF service, since it results in minimal changes. But
    // RDF has a tendency to create objects without checking to see if they
    // really exist---use the parent property to see if the folder is a real
    // folder.
    if (folder == null) {
      let rdf = Cc["@mozilla.org/rdf/rdf-service;1"]
                  .getService(Ci.nsIRDFService);
      try {
        folder = rdf.GetResource(aUrl)
                    .QueryInterface(Ci.nsIMsgFolder);
      } catch (e) {
        // If the QI fails, then we somehow picked up an RDF resource that isn't
        // a folder. Return null in this case.
        return null;
      }
    }
    if (!isValidFolder(folder))
      return null;

    // Add the new folder to our map. Store a weak reference instead, so that
    // the folder can be closed when necessary.
    let weakRef = folder.QueryInterface(Ci.nsISupportsWeakReference)
                        .GetWeakReference();
    this._map.set(aUrl, weakRef);
    return folder;
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([folderLookupService]);
