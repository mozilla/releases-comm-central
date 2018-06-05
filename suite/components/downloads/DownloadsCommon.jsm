/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = [
  "DownloadsCommon",
];

/**
 * Handles the Downloads panel shared methods and data access.
 *
 * This file includes the following constructors and global objects:
 *
 * DownloadsCommon
 * This object is exposed directly to the consumers of this JavaScript module,
 * and provides shared methods for all the instances of the user interface.
 *
 * DownloadsData
 * Retrieves the list of past and completed downloads from the underlying
 * Downloads API data, and provides asynchronous notifications allowing
 * to build a consistent view of the available data.
 *
 */

// Globals
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
                                  "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "AppConstants",
                                  "resource://gre/modules/AppConstants.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DownloadHistory",
                                  "resource://gre/modules/DownloadHistory.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Downloads",
                                  "resource://gre/modules/Downloads.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DownloadUIHelper",
                                  "resource://gre/modules/DownloadUIHelper.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DownloadUtils",
                                  "resource://gre/modules/DownloadUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "FileUtils",
                                  "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
                                  "resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyGetter(this, "DownloadsLogger", () => {
  let { ConsoleAPI } = Cu.import("resource://gre/modules/Console.jsm", {});
  let consoleOptions = {
    maxLogLevelPref: "browser.download.loglevel",
    prefix: "Downloads"
  };
  return new ConsoleAPI(consoleOptions);
});

const kPartialDownloadSuffix = ".part";

const kPrefBranch = Services.prefs.getBranch("browser.download.");

const PREF_DM_BEHAVIOR = "browser.download.manager.behavior";

var PrefObserver = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),
  getPref(name) {
    try {
      switch (typeof this.prefs[name]) {
        case "boolean":
          return kPrefBranch.getBoolPref(name);
      }
    } catch (ex) { }
    return this.prefs[name];
  },
  observe(aSubject, aTopic, aData) {
    if (this.prefs.hasOwnProperty(aData)) {
      delete this[aData];
      this[aData] = this.getPref(aData);
    }
  },
  register(prefs) {
    this.prefs = prefs;
    kPrefBranch.addObserver("", this, true);
    for (let key in prefs) {
      let name = key;
      XPCOMUtils.defineLazyGetter(this, name, function() {
        return PrefObserver.getPref(name);
      });
    }
  },
};

// PrefObserver.register({
  // prefName: defaultValue
// });


// DownloadsCommon

/**
 * This object is exposed directly to the consumers of this JavaScript module,
 * and provides shared methods for all the instances of the user interface.
 */
this.DownloadsCommon = {
  // The following legacy constants are still returned by stateOfDownload, but
  // individual properties of the Download object should normally be used.
  DOWNLOAD_NOTSTARTED: -1,
  DOWNLOAD_DOWNLOADING: 0,
  DOWNLOAD_FINISHED: 1,
  DOWNLOAD_FAILED: 2,
  DOWNLOAD_CANCELED: 3,
  DOWNLOAD_PAUSED: 4,
  DOWNLOAD_BLOCKED_PARENTAL: 6,
  DOWNLOAD_DIRTY: 8,
  DOWNLOAD_BLOCKED_POLICY: 9,

  // The following are the possible values of the "attention" property.
  ATTENTION_NONE: "",
  ATTENTION_SUCCESS: "success",
  ATTENTION_WARNING: "warning",
  ATTENTION_SEVERE: "severe",

  /**
   * Initializes the Downloads Manager common code.
   */
  init() {
    Cu.import("resource://gre/modules/Downloads.jsm");
    Cu.import("resource://gre/modules/DownloadIntegration.jsm");
    DownloadIntegration.shouldPersistDownload = function() { return true; }
    DownloadsData.initializeDataLink();
  },

  /**
   * Returns the legacy state integer value for the provided Download object.
   */
  stateOfDownload(download) {
    // Collapse state using the correct priority.
    if (!download.stopped) {
      return DownloadsCommon.DOWNLOAD_DOWNLOADING;
    }
    if (download.succeeded) {
      return DownloadsCommon.DOWNLOAD_FINISHED;
    }
    if (download.error) {
      if (download.error.becauseBlockedByParentalControls) {
        return DownloadsCommon.DOWNLOAD_BLOCKED_PARENTAL;
      }
      if (download.error.becauseBlockedByReputationCheck) {
        return DownloadsCommon.DOWNLOAD_DIRTY;
      }
      return DownloadsCommon.DOWNLOAD_FAILED;
    }
    if (download.canceled) {
      if (download.hasPartialData) {
        return DownloadsCommon.DOWNLOAD_PAUSED;
      }
      return DownloadsCommon.DOWNLOAD_CANCELED;
    }
    return DownloadsCommon.DOWNLOAD_NOTSTARTED;
  },
};

XPCOMUtils.defineLazyGetter(this.DownloadsCommon, "log", () => {
  return DownloadsLogger.log.bind(DownloadsLogger);
});
XPCOMUtils.defineLazyGetter(this.DownloadsCommon, "error", () => {
  return DownloadsLogger.error.bind(DownloadsLogger);
});

// DownloadsData

/**
 * Retrieves the list of past and completed downloads from the underlying
 * Downloads API data, and provides asynchronous notifications allowing to
 * build a consistent view of the available data.
 *
 * Note that using this object does not automatically initialize the list of
 * downloads. This is useful to display a neutral progress indicator in
 * the main browser window until the autostart timeout elapses.
 *
 * This powers the DownloadsData and HistoryDownloadsData singleton objects.
 */
 function DownloadsDataCtor({ isHistory } = {}) {

  // Contains all the available Download objects and their integer state.
  this.oldDownloadStates = new Map();

  // For the history downloads list we don't need to register this as a view,
  // but we have to ensure that the DownloadsData object is initialized before
  // we register more views. This ensures that the view methods of DownloadsData
  // are invoked before those of views registered on HistoryDownloadsData,
  // allowing the endTime property to be set correctly.
  if (isHistory) {
    DownloadsData.initializeDataLink();
    this._promiseList = DownloadsData._promiseList
                                     .then(() => DownloadHistory.getList());
    return;
  }

  // This defines "initializeDataLink" and "_promiseList" synchronously, then
  // continues execution only when "initializeDataLink" is called, allowing the
  // underlying data to be loaded only when actually needed.
  this._promiseList = (async () => {
    await new Promise(resolve => this.initializeDataLink = resolve);
    let list = await Downloads.getList(Downloads.ALL);

    await list.addView(this);
    this._downloadsLoaded = true;

    return list;
  })();
}

DownloadsDataCtor.prototype = {
  /**
   * Starts receiving events for current downloads.
   */
  initializeDataLink() {},

  /**
   * Promise resolved with the underlying DownloadList object once we started
   * receiving events for current downloads.
   */
  _promiseList: null,

  _downloadsLoaded: null,

  /**
   * Iterator for all the available Download objects. This is empty until the
   * data has been loaded using the JavaScript API for downloads.
   */
  get downloads() {
    return this.oldDownloadStates.keys();
  },

  /**
   * True if there are finished downloads that can be removed from the list.
   */
  get canRemoveFinished() {
    for (let download of this.downloads) {
      // Stopped, paused, and failed downloads with partial data are removed.
      if (download.stopped && !(download.canceled && download.hasPartialData)) {
        return true;
      }
    }
    return false;
  },

  /**
   * Asks the back-end to remove finished downloads from the list. This method
   * is only called after the data link has been initialized.
   */
  removeFinished() {
    Downloads.getList(Downloads.ALL)
             .then(list => list.removeFinished())
             .catch(Cu.reportError);
  },

  // Integration with the asynchronous Downloads back-end

  // Download view
  onDownloadAdded: function(download)
  {
    // Download objects do not store the end time of downloads, as the Downloads
    // API does not need to persist this information for all platforms. Once a
    // download terminates on a Desktop browser, it becomes a history download,
    // for which the end time is stored differently, as a Places annotation.
    download.endTime = Date.now();
    this.oldDownloadStates.set(download,
                               DownloadsCommon.stateOfDownload(download));

    download.displayName =
                 download.target.path ? OS.Path.basename(download.target.path)
                                       : download.source.url;
    this.onDownloadChanged(download);
    if (!this._downloadsLoaded)
      return;

    var behavior = download.source.isPrivate ? 1 :
                     Services.prefs.getIntPref(PREF_DM_BEHAVIOR);
    switch (behavior) {
      case 0:
        // TODO Better move this out of nsSuiteGlue.
        Cc["@mozilla.org/suite/suiteglue;1"]
          .getService(Ci.nsISuiteGlue)
          .showDownloadManager(download);
        break;
      case 1:
        Services.ww.openWindow(null, PROGRESS_DIALOG_URL, null,
                               "chrome,titlebar,centerscreen,minimizable=yes,dialog=no",
                               { wrappedJSObject: download });
        break;
    }

    return; // No UI for behavior >= 2
  },

  onDownloadChanged(download) {
    let oldState = this.oldDownloadStates.get(download);
    let newState = DownloadsCommon.stateOfDownload(download);
    this.oldDownloadStates.set(download, newState);

    if (oldState != newState) {
      if (download.succeeded ||
          (download.canceled && !download.hasPartialData) ||
          download.error) {
        // Store the end time that may be displayed by the views.
        download.endTime = Date.now();

        // This state transition code should actually be located in a Downloads
        // API module (bug 941009).
        DownloadHistory.updateMetaData(download);
      }

      if (download.succeeded ||
          (download.error && download.error.becauseBlocked)) {
        this._notifyDownloadEvent("finish");
      }
    }

    if (!download.newDownloadNotified) {
      download.newDownloadNotified = true;
      this._notifyDownloadEvent("start");
    }
  },

  onDownloadRemoved(download) {
    this.oldDownloadStates.delete(download);
  },

  onDownloadChanged: function(aDownload) {
    // This mighe be effective but the staement s*cks.
    aDownload.state = DownloadsCommon.stateOfDownload(aDownload);
    if (this._downloadsLoaded && (aDownload.succeeded || !aDownload.stopped))
      aDownload.endTime = Date.now();
  },

  // Download summary
  onSummaryChanged:  function() {

  if (!gTaskbarProgress)
    return;

  const nsITaskbarProgress = Ci.nsITaskbarProgress;
  var currentBytes = gDownloadsSummary.progressCurrentBytes;
  var totalBytes = gDownloadsSummary.progressTotalBytes;
  var state = gDownloadsSummary.allHaveStopped ?
                currentBytes ? nsITaskbarProgress.STATE_PAUSED :
                               nsITaskbarProgress.STATE_NO_PROGRESS :
                currentBytes < totalBytes ? nsITaskbarProgress.STATE_NORMAL :
                             nsITaskbarProgress.STATE_INDETERMINATE;
  switch (state) {
    case nsITaskbarProgress.STATE_NO_PROGRESS:
    case nsITaskbarProgress.STATE_INDETERMINATE:
      gTaskbarProgress.setProgressState(state, 0, 0);
      break;
    default:
      gTaskbarProgress.setProgressState(state, currentBytes, totalBytes);
      break;
  }
},

  // Registration of views

  /**
   * Adds an object to be notified when the available download data changes.
   * The specified object is initialized with the currently available downloads.
   *
   * @param aView
   *        DownloadsView object to be added.  This reference must be passed to
   *        removeView before termination.
   */
  addView(aView) {
    this._promiseList.then(list => list.addView(aView))
                     .catch(Cu.reportError);
  },

  /**
   * Removes an object previously added using addView.
   *
   * @param aView
   *        DownloadsView object to be removed.
   */
  removeView(aView) {
    this._promiseList.then(list => list.removeView(aView))
                     .catch(Cu.reportError);
  },

};

XPCOMUtils.defineLazyGetter(this, "HistoryDownloadsData", function() {
  return new DownloadsDataCtor({ isHistory: true });
});

XPCOMUtils.defineLazyGetter(this, "DownloadsData", function() {
  return new DownloadsDataCtor();
});

// DownloadsViewPrototype

/**
 * A prototype for an object that registers itself with DownloadsData as soon
 * as a view is registered with it.
 */
const DownloadsViewPrototype = {
  /**
   * Contains all the available Download objects and their current state value.
   *
   * SUBCLASSES MUST OVERRIDE THIS PROPERTY.
   */
  _oldDownloadStates: null,

  // Registration of views

  /**
   * Array of view objects that should be notified when the available status
   * data changes.
   *
   * SUBCLASSES MUST OVERRIDE THIS PROPERTY.
   */
  _views: null,

  /**
   * Adds an object to be notified when the available status data changes.
   * The specified object is initialized with the currently available status.
   *
   * @param aView
   *        View object to be added.  This reference must be
   *        passed to removeView before termination.
   */
  addView(aView) {
    // Start receiving events when the first of our views is registered.
    if (this._views.length == 0) {
      DownloadsData.addView(this);
    }

    this._views.push(aView);
    this.refreshView(aView);
  },

  /**
   * Updates the properties of an object previously added using addView.
   *
   * @param aView
   *        View object to be updated.
   */
  refreshView(aView) {
    // Update immediately even if we are still loading data asynchronously.
    // Subclasses must provide these two functions!
    this._refreshProperties();
    this._updateView(aView);
  },

  /**
   * Removes an object previously added using addView.
   *
   * @param aView
   *        View object to be removed.
   */
  removeView(aView) {
    let index = this._views.indexOf(aView);
    if (index != -1) {
      this._views.splice(index, 1);
    }

    // Stop receiving events when the last of our views is unregistered.
    if (this._views.length == 0) {
      DownloadsData.removeView(this);
    }
  },

  // Callback functions from DownloadList

  /**
   * Indicates whether we are still loading downloads data asynchronously.
   */
  _loading: false,

  /**
   * Called before multiple downloads are about to be loaded.
   */
  onDownloadBatchStarting() {
    this._loading = true;
  },

  /**
   * Called after data loading finished.
   */
  onDownloadBatchEnded() {
    this._loading = false;
  },

  /**
   * Called when a new download data item is available, either during the
   * asynchronous data load or when a new download is started.
   *
   * @param download
   *        Download object that was just added.
   *
   * @note Subclasses should override this and still call the base method.
   */
  onDownloadAdded(download) {
    this._oldDownloadStates.set(download,
                                DownloadsCommon.stateOfDownload(download));
  },

  /**
   * Called when the overall state of a Download has changed. In particular,
   * this is called only once when the download succeeds or is blocked
   * permanently, and is never called if only the current progress changed.
   *
   * The onDownloadChanged notification will always be sent afterwards.
   *
   * @note Subclasses should override this.
   */
  onDownloadStateChanged(download) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Called every time any state property of a Download may have changed,
   * including progress properties.
   *
   * Note that progress notification changes are throttled at the Downloads.jsm
   * API level, and there is no throttling mechanism in the front-end.
   *
   * @note Subclasses should override this and still call the base method.
   */
  onDownloadChanged(download) {
    let oldState = this._oldDownloadStates.get(download);
    let newState = DownloadsCommon.stateOfDownload(download);
    this._oldDownloadStates.set(download, newState);

    if (oldState != newState) {
      this.onDownloadStateChanged(download);
    }
  },

  /**
   * Called when a data item is removed, ensures that the widget associated with
   * the view item is removed from the user interface.
   *
   * @param download
   *        Download object that is being removed.
   *
   * @note Subclasses should override this.
   */
  onDownloadRemoved(download) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Private function used to refresh the internal properties being sent to
   * each registered view.
   *
   * @note Subclasses should override this.
   */
  _refreshProperties() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  /**
   * Private function used to refresh an individual view.
   *
   * @note Subclasses should override this.
   */
  _updateView() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
};
