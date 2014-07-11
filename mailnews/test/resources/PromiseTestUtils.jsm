/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file provides utilities useful in using Promises and Task.jsm
 * with mailnews tests.
 */

const EXPORTED_SYMBOLS = ['PromiseTestUtils'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var CC = Components.Constructor;
var Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Promise.jsm");
Cu.import("resource:///modules/mailServices.js");

/**
 * Url listener that can wrap another listener and trigger a callback.
 *
 * @param [aWrapped] The nsIUrlListener to pass all notifications through to.
 *     This gets called prior to the callback (or async resumption).
 */

var PromiseTestUtils = {};

PromiseTestUtils.PromiseUrlListener = function(aWrapped) {
  this.wrapped = aWrapped ? aWrapped.QueryInterface(Ci.nsIUrlListener) : null;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
};

PromiseTestUtils.PromiseUrlListener.prototype = {
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIUrlListener]),

  OnStartRunningUrl: function(aUrl) {
    if (this.wrapped)
      this.wrapped.OnStartRunningUrl(aUrl);
  },
  OnStopRunningUrl: function(aUrl, aExitCode) {
    if (this.wrapped)
      this.wrapped.OnStopRunningUrl(aUrl, aExitCode);
    if (aExitCode == Cr.NS_OK)
      this._resolve();
    else
      this._reject(aExitCode);
  },
  get promise() { return this._promise; },
};


/**
 * Copy listener that can wrap another listener and trigger a callback.
 *
 * @param [aWrapped] The nsIMsgCopyServiceListener to pass all notifications through to.
 *     This gets called prior to the callback (or async resumption).
 */
PromiseTestUtils.PromiseCopyListener = function(aWrapped) {
  this.wrapped = aWrapped ? aWrapped.QueryInterface(Ci.nsIMsgCopyServiceListener) : null;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
};

PromiseTestUtils.PromiseCopyListener.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgCopyServiceListener]),
  OnStartCopy: function() {
    if (this.wrapped)
      this.wrapped.OnStartCopy();
  },
  OnProgress: function(aProgress, aProgressMax) {
    if (this.wrapped)
      this.wrapped.OnProgress(aProgress, aProgressMax);
  },
  SetMessageKey: function(aKey) {
    if (this.wrapped)
      this.wrapped.SetMessageKey(aKey);
  },
  SetMessageId: function(aMessageId) {
    if (this.wrapped)
      this.wrapped.SetMessageId(aMessageId);
  },
  OnStopCopy: function(aStatus) {
    if (this.wrapped)
      this.wrapped.OnStopCopy(aStatus);

    if (aStatus == Cr.NS_OK)
      this._resolve(aStatus);
    else
      this._reject(aStatus);
  },
  get promise() { return this._promise; }
};

/**
 * Stream listener that can wrap another listener and trigger a callback.
 *
 * @param [aWrapped] The nsIStreamListener to pass all notifications through to.
 *     This gets called prior to the callback (or async resumption).
 */
PromiseTestUtils.PromiseStreamListener = function(aWrapped) {
  this.wrapped = aWrapped ? aWrapped.QueryInterface(Ci.nsIStreamListener) :
                 null;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
  this._data = null;
  this._stream = null;
};

PromiseTestUtils.PromiseStreamListener.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener]),

  onStartRequest : function (aRequest, aContext) {
    if (this.wrapped)
      this.wrapped.onStartRequest(aRequest, aContext);
    this._data = "";
    this._stream = null;
  },

  onStopRequest : function (aRequest, aContext, aStatusCode) {
    if (this.wrapped)
      this.wrapped.onStopRequest(aRequest, aContext, aStatusCode);
    if (aStatusCode == Cr.NS_OK)
      this._resolve(this._data);
    else
      this._reject(aStatusCode);
  },

  onDataAvailable : function (aRequest, aContext, aInputStream, aOff, aCount) {
    if (this.wrapped)
      this.wrapped.onDataAvailable(aRequest, aContext, aInputStream, aOff, aCount);
    if (!this._stream) {
      this._stream = Cc["@mozilla.org/scriptableinputstream;1"]
                     .createInstance(Ci.nsIScriptableInputStream);
      this._stream.init(aInputStream);
    }
    this._data += this._stream.read(aCount);
  },

  get promise() { return this._promise; }
};

/**
 * Folder listener to resolve a promise when a folder with a certain
 * name is added.
 *
 * @param name     folder name to listen for
 * @return         promise{folder} that resolves with the new folder when the
 *                 folder add completes
 */

PromiseTestUtils.promiseFolderAdded = function promiseFolderAdded(folderName) {
  return new Promise((resolve, reject) => {
    listener = {
       folderAdded: aFolder => {
         if (aFolder.name == folderName) {
           MailServices.mfn.removeListener(listener);
           resolve(aFolder);
         }
       }
    };
    MailServices.mfn.addListener(listener,
      Ci.nsIMsgFolderNotificationService.folderAdded);
  });
}
