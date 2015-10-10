/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file provides utilities useful in using Promises and Task.jsm
 * with mailnews tests.
 */

this.EXPORTED_SYMBOLS = ['PromiseTestUtils'];

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
  this._result = { messageKeys: [], messageIds: [] };
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

    this._result.messageKeys.push(aKey);
  },
  SetMessageId: function(aMessageId) {
    if (this.wrapped)
      this.wrapped.SetMessageId(aMessageId);

    this._result.messageIds.push(aMessageId);
  },
  OnStopCopy: function(aStatus) {
    if (this.wrapped)
      this.wrapped.OnStopCopy(aStatus);

    if (aStatus == Cr.NS_OK)
      this._resolve(this._result);
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
 * Folder listener to resolve a promise when a certain folder event occurs.
 *
 * @param folder   nsIMsgFolder to listen to
 * @param event    string event name to listen for. Example event is
 *                 "DeleteOrMoveMsgCompleted".
 * @return         promise that resolves when the event occurs
 */

var nsIMFNService = Ci.nsIMsgFolderNotificationService;
PromiseTestUtils.promiseFolderEvent = function promiseFolderEvent(folder, event) {
  return new Promise( (resolve, reject) => {
    let eventAtom = Cc["@mozilla.org/atom-service;1"]
                      .getService(Ci.nsIAtomService)
                      .getAtom(event);
    let folderListener = {
      QueryInterface: XPCOMUtils.generateQI([Ci.nsIFolderListener]),
      OnItemEvent: function onItemEvent(aEventFolder, aEvent) {
        if (folder === aEventFolder &&
            event == aEvent) {
          MailServices.mailSession.RemoveFolderListener(folderListener);
          resolve();
        }
      },
    };
    MailServices.mailSession.AddFolderListener(folderListener, Ci.nsIFolderListener.event);
  });
};

/**
 * Folder listener to resolve a promise when a certain folder event occurs.
 *
 * @param folder            nsIMsgFolder to listen to
 * @param listenerMethod    string listener method to listen for. Example listener
                            method is "msgsClassified".
 * @return                  promise that resolves when the event occurs
 */
PromiseTestUtils.promiseFolderNotification = function(folder, listenerMethod) {
  return new Promise( (resolve, reject) => {
    let mfnListener = {};
    mfnListener[listenerMethod] = function() {
      let args = Array.prototype.slice.call(arguments);
      let flag = true;
      for (arg of args) {
        if (folder && arg instanceof Ci.nsIMsgFolder) {
          if (arg == folder) {
            flag = true;
            break;
          } else {
            return;
          }
        }
      }

      if (flag) {
        MailServices.mfn.removeListener(mfnListener);
        resolve(args);
      }
    }
    MailServices.mfn.addListener(
      mfnListener, Ci.nsIMsgFolderNotificationService[listenerMethod]);
  });
}

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
    var listener = {
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

/**
 * Timer to resolve a promise after a delay
 *
 * @param aDelay    delay in milliseconds
 * @return          promise that resolves after the delay
 */

PromiseTestUtils.promiseDelay = function promiseDelay(aDelay)
{
  return new Promise((resolve, reject) => {
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(resolve, aDelay, Ci.nsITimer.TYPE_ONE_SHOT);
  });
}

/**
 * Search listener to resolve a promise when a search completes
 *
 * @param [aSearchSession] The nsIMsgSearchSession to search
 * @param [aWrapped] The nsIMsgSearchNotify to pass all notifications through to.
 *     This gets called prior to the callback (or async resumption).
 */

PromiseTestUtils.PromiseSearchNotify = function(aSearchSession, aWrapped) {
  this._searchSession = aSearchSession;
  this._searchSession.registerListener(this);
  this.wrapped = aWrapped ? aWrapped.QueryInterface(Ci.nsIMsgSearchNotify) : null;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
}
 
PromiseTestUtils.PromiseSearchNotify.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgSearchNotify]),
  onSearchHit: function(aHeader, aFolder) {
    if (this.wrapped && this.wrapped.onSearchHit)
      this.wrapped.onSearchHit(aHeader, aFolder);
  },
  onSearchDone: function onSearchDone(aResult) {
    this._searchSession.unregisterListener(this);
    if (this.wrapped && this.wrapped.onSearchDone)
      this.wrapped.onSearchDone(aResult);
    if (aResult == Cr.NS_OK)
      this._resolve();
    else
      this._reject(aResult);
  },
  onNewSearch: function onNewSearch() {
    if (this.wrapped && this.wrapped.onNewSearch)
      this.wrapped.onNewSearch();
  }
}
