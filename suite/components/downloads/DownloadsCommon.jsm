/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = [
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
 */

// Globals
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } =
  ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const { AppConstants } =
  ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  NetUtil: "resource://gre/modules/NetUtil.jsm",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  DownloadHistory: "resource://gre/modules/DownloadHistory.jsm",
  Downloads: "resource://gre/modules/Downloads.jsm",
  DownloadUIHelper: "resource://gre/modules/DownloadUIHelper.jsm",
  DownloadUtils: "resource://gre/modules/DownloadUtils.jsm",
  OS: "resource://gre/modules/osfile.jsm",
});

XPCOMUtils.defineLazyGetter(this, "DownloadsLogger", () => {
  let { ConsoleAPI } =
    ChromeUtils.import("resource://gre/modules/Console.jsm", {});
  let consoleOptions = {
    maxLogLevelPref: "browser.download.loglevel",
    prefix: "Downloads"
  };
  return new ConsoleAPI(consoleOptions);
});

const kDownloadsStringBundleUrl =
  "chrome://communicator/locale/downloads/downloadmanager.properties";

// Currently not used. Keep for future updates.
const kDownloadsStringsRequiringFormatting = {
  fileExecutableSecurityWarning: true
};

// Currently not used. Keep for future updates.
const kDownloadsStringsRequiringPluralForm = {
  otherDownloads3: true
};

const kPartialDownloadSuffix = ".part";

const kPrefBranch = Services.prefs.getBranch("browser.download.");

const PREF_DM_BEHAVIOR = "browser.download.manager.behavior";
const PROGRESS_DIALOG_URL = "chrome://communicator/content/downloads/progressDialog.xul";

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
var DownloadsCommon = {
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
   * Returns an object whose keys are the string names from the downloads string
   * bundle, and whose values are either the translated strings or functions
   * returning formatted strings.
   */
  get strings() {
    let strings = {};
    let sb = Services.strings.createBundle(kDownloadsStringBundleUrl);
    let enumerator = sb.getSimpleEnumeration();
    while (enumerator.hasMoreElements()) {
      let string = enumerator.getNext().QueryInterface(Ci.nsIPropertyElement);
      let stringName = string.key;
      if (stringName in kDownloadsStringsRequiringFormatting) {
        strings[stringName] = function() {
          // Convert "arguments" to a real array before calling into XPCOM.
          return sb.formatStringFromName(stringName,
                                         Array.slice(arguments, 0),
                                         arguments.length);
        };
      } else if (stringName in kDownloadsStringsRequiringPluralForm) {
        strings[stringName] = function(aCount) {
          // Convert "arguments" to a real array before calling into XPCOM.
          let formattedString = sb.formatStringFromName(stringName,
                                         Array.slice(arguments, 0),
                                         arguments.length);
          return PluralForm.get(aCount, formattedString);
        };
      } else {
        strings[stringName] = string.value;
      }
    }
    delete this.strings;
    return this.strings = strings;
  },

  /**
   * Get access to one of the DownloadsData or HistoryDownloadsData objects
   * depending on whether history downloads should be included.
   *
   * @param window
   *        The browser window which owns the download button.
   * @param [optional] history
   *        True to include history downloads when the window is public.
   */
   // does not apply in SM
  getData(window, history = false) {
    if (history) {
      return HistoryDownloadsData;
    }
    return DownloadsData;
  },

  /**
   * Initializes the Downloads Manager common code.
   */
  init() {
    const { DownloadsData } =
      ChromeUtils.import("resource://gre/modules/Downloads.jsm");
    const { DownloadIntegration } =
        ChromeUtils.import("resource://gre/modules/DownloadIntegration.jsm");
    DownloadIntegration.shouldPersistDownload = function() { return true; };
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

  /**
   * Returns the state as a string for the provided Download object.
   */
  stateOfDownloadText(download) {
    // Don't duplicate the logic so just call stateOfDownload.
    let state = this.stateOfDownload(download);
    let s = DownloadsCommon.strings;
    let title = s.unblockHeaderUnblock;
    let verboseState;

    switch (state) {
      case DownloadsCommon.DOWNLOAD_PAUSED:
        verboseState = s.statePaused;
        break;
      case DownloadsCommon.DOWNLOAD_DOWNLOADING:
        verboseState = s.stateDownloading;
        break;
      case DownloadsCommon.DOWNLOAD_FINISHED:
        verboseState = s.stateCompleted;
        break;
      case DownloadsCommon.DOWNLOAD_FAILED:
        verboseState = s.stateFailed;
        break;
      case DownloadsCommon.DOWNLOAD_CANCELED:
        verboseState = s.stateCanceled;
        break;
      // Security Zone Policy
      case DownloadsCommon.DOWNLOAD_BLOCKED_PARENTAL:
      // Security Zone Policy
        verboseState = s.stateBlockedParentalControls;
        break;
      // Security Zone Policy
      case DownloadsCommon.DOWNLOAD_BLOCKED_POLICY:
        verboseState = s.stateBlockedPolicy;
        break;
      // possible virus/spyware
      case DownloadsCommon.DOWNLOAD_DIRTY:
        verboseState = s.stateDirty;
        break;
      // Currently not returned.
      case DownloadsCommon.DOWNLOAD_UPLOADING:
        verboseState = s.stateNotStarted;
        break;
      case DownloadsCommon.DOWNLOAD_NOTSTARTED:
        verboseState = s.stateNotStarted;
        break;
      // Whoops!
      default:
        verboseState = s.stateUnknown;
        break;
    }

    return verboseState;
  },

  /**
   * Returns the transfer progress text for the provided Download object.
   */
  getTransferredBytes(download) {
    let currentBytes;
    let totalBytes;
    // Download in progress.
    // Download paused / canceled and has partial data.
    if (!download.stopped ||
        (download.canceled && download.hasPartialData)) {
      currentBytes = download.currentBytes,
      totalBytes = download.hasProgress ? download.totalBytes : -1;
    // Download done but file missing.
    } else if (download.succeeded && !download.exists) {
      currentBytes = download.totalBytes ? download.totalBytes : -1;
      totalBytes = -1;
    // For completed downloads, show the file size
    } else if (download.succeeded && download.target.size !== undefined) {
       currentBytes = download.target.size;
       totalBytes = -1;
    // Some local files saves e.g. from attachments also have no size.
    // They only have a target in downloads.json but no target.path.
    // FIX ME later.
    } else {
      currentBytes = -1;
      totalBytes = -1;
    }

    // We do not want to show 0 of xxx bytes.
    if (currentBytes == 0) {
      currentBytes = -1;
    }

    if (totalBytes == 0) {
      totalBytes = -1;
    }

    // We tried everything.
    if (currentBytes == -1 && totalBytes == -1) {
      return "";
    }

    return DownloadUtils.getTransferTotal(currentBytes, totalBytes);
  },

  /**
   * Returns the time remaining text for the provided Download object.
   * For calculation a variable is stored in it.
   */
  getTimeRemaining(download) {
    // If you do changes here please check progressDialog.js.
    if (!download.stopped) {
      let lastSec = (download.lastSec == null) ? Infinity : download.lastSec;
      // Calculate the time remaining if we have valid values
      let seconds = (download.speed > 0) && (download.totalBytes > 0)
                    ? (download.totalBytes - download.currentBytes) / download.speed
                    : -1;
      let [timeLeft, newLast] = DownloadUtils.getTimeLeft(seconds, lastSec);
      // Store it back for next calculation.
      download.lastSec = newLast;
      return timeLeft;
    }
    return "";
  },

  /**
   * Opens a downloaded file.
   *
   * @param aFile
   *        the downloaded file to be opened.
   * @param aMimeInfo
   *        the mime type info object.  May be null.
   * @param aOwnerWindow
   *        the window with which this action is associated.
   */
  openDownloadedFile(aFile, aMimeInfo, aOwnerWindow) {
    if (!(aFile instanceof Ci.nsIFile)) {
      throw new Error("aFile must be a nsIFile object");
    }
    if (aMimeInfo && !(aMimeInfo instanceof Ci.nsIMIMEInfo)) {
      throw new Error("Invalid value passed for aMimeInfo");
    }
    if (!(aOwnerWindow instanceof Ci.nsIDOMWindow)) {
      throw new Error("aOwnerWindow must be a dom-window object");
    }

    let isWindowsExe = AppConstants.platform == "win" &&
      aFile.leafName.toLowerCase().endsWith(".exe");

    let promiseShouldLaunch;
    // Don't prompt on Windows for .exe since there will be a native prompt.
    if (aFile.isExecutable() && !isWindowsExe) {
      // We get a prompter for the provided window here, even though anchoring
      // to the most recently active window should work as well.
      promiseShouldLaunch =
        DownloadUIHelper.getPrompter(aOwnerWindow)
                        .confirmLaunchExecutable(aFile.path);
    } else {
      promiseShouldLaunch = Promise.resolve(true);
    }

    promiseShouldLaunch.then(shouldLaunch => {
      if (!shouldLaunch) {
        return;
      }

      // Actually open the file.
      try {
        if (aMimeInfo && aMimeInfo.preferredAction == aMimeInfo.useHelperApp) {
          aMimeInfo.launchWithFile(aFile);
          return;
        }
      } catch (ex) { }

      // If either we don't have the mime info, or the preferred action failed,
      // attempt to launch the file directly.
      try {
        aFile.launch();
      } catch (ex) {
        // If launch fails, try sending it through the system's external "file:"
        // URL handler.
        Cc["@mozilla.org/uriloader/external-protocol-service;1"]
          .getService(Ci.nsIExternalProtocolService)
          .loadUrl(NetUtil.newURI(aFile));
      }
    }).catch(Cu.reportError);
  },

  /**
   * Show a downloaded file in the system file manager.
   *
   * @param aFile
   *        a downloaded file.
   */
  showDownloadedFile(aFile) {
    if (!(aFile instanceof Ci.nsIFile)) {
      throw new Error("aFile must be a nsIFile object");
    }
    try {
      // Show the directory containing the file and select the file.
      aFile.reveal();
    } catch (ex) {
      // If reveal fails for some reason (e.g., it's not implemented on unix
      // or the file doesn't exist), try using the parent if we have it.
      let parent = aFile.parent;
      if (parent) {
        this.showDirectory(parent);
      }
    }
  },

  /**
   * Show the specified folder in the system file manager.
   *
   * @param aDirectory
   *        a directory to be opened with system file manager.
   */
  showDirectory(aDirectory) {
    if (!(aDirectory instanceof Ci.nsIFile)) {
      throw new Error("aDirectory must be a nsIFile object");
    }
    try {
      aDirectory.launch();
    } catch (ex) {
      // If launch fails (probably because it's not implemented), let
      // the OS handler try to open the directory.
      Cc["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(Ci.nsIExternalProtocolService)
        .loadUrl(NetUtil.newURI(aDirectory));
    }
  },

  /**
   * Displays an alert message box which asks the user if they want to
   * unblock the downloaded file or not.
   *
   * @param options
   *        An object with the following properties:
   *        {
   *          verdict:
   *            The detailed reason why the download was blocked, according to
   *            the "Downloads.Error.BLOCK_VERDICT_" constants. If an unknown
   *            reason is specified, "Downloads.Error.BLOCK_VERDICT_MALWARE" is
   *            assumed.
   *          window:
   *            The window with which this action is associated.
   *          dialogType:
   *            String that determines which actions are available:
   *             - "unblock" to offer just "unblock".
   *             - "chooseUnblock" to offer "unblock" and "confirmBlock".
   *             - "chooseOpen" to offer "open" and "confirmBlock".
   *        }
   *
   * @return {Promise}
   * @resolves String representing the action that should be executed:
   *            - "open" to allow the download and open the file.
   *            - "unblock" to allow the download without opening the file.
   *            - "confirmBlock" to delete the blocked data permanently.
   *            - "cancel" to do nothing and cancel the operation.
   */
  async confirmUnblockDownload({ verdict, window,
                                                  dialogType }) {
    let s = DownloadsCommon.strings;

    // All the dialogs have an action button and a cancel button, while only
    // some of them have an additonal button to remove the file. The cancel
    // button must always be the one at BUTTON_POS_1 because this is the value
    // returned by confirmEx when using ESC or closing the dialog (bug 345067).
    let title = s.unblockHeaderUnblock;
    let firstButtonText = s.unblockButtonUnblock;
    let firstButtonAction = "unblock";
    let buttonFlags =
        (Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_0) +
        (Ci.nsIPrompt.BUTTON_TITLE_CANCEL * Ci.nsIPrompt.BUTTON_POS_1);

    switch (dialogType) {
      case "unblock":
        // Use only the unblock action. The default is to cancel.
        buttonFlags += Ci.nsIPrompt.BUTTON_POS_1_DEFAULT;
        break;
      case "chooseUnblock":
        // Use the unblock and remove file actions. The default is remove file.
        buttonFlags +=
          (Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_2) +
          Ci.nsIPrompt.BUTTON_POS_2_DEFAULT;
        break;
      case "chooseOpen":
        // Use the unblock and open file actions. The default is open file.
        title = s.unblockHeaderOpen;
        firstButtonText = s.unblockButtonOpen;
        firstButtonAction = "open";
        buttonFlags +=
          (Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_2) +
          Ci.nsIPrompt.BUTTON_POS_0_DEFAULT;
        break;
      default:
        Cu.reportError("Unexpected dialog type: " + dialogType);
        return "cancel";
    }

    let message;
    switch (verdict) {
      case Downloads.Error.BLOCK_VERDICT_UNCOMMON:
        message = s.unblockTypeUncommon2;
        break;
      case Downloads.Error.BLOCK_VERDICT_POTENTIALLY_UNWANTED:
        message = s.unblockTypePotentiallyUnwanted2;
        break;
      default: // Assume Downloads.Error.BLOCK_VERDICT_MALWARE
        message = s.unblockTypeMalware;
        break;
    }
    message += "\n\n" + s.unblockTip2;

    Services.ww.registerNotification(function onOpen(subj, topic) {
      if (topic == "domwindowopened" && subj instanceof Ci.nsIDOMWindow) {
        // Make sure to listen for "DOMContentLoaded" because it is fired
        // before the "load" event.
        subj.addEventListener("DOMContentLoaded", function() {
          if (subj.document.documentURI ==
              "chrome://global/content/commonDialog.xul") {
            Services.ww.unregisterNotification(onOpen);
            let dialog = subj.document.getElementById("commonDialog");
            if (dialog) {
              // Change the dialog to use a warning icon.
              dialog.classList.add("alert-dialog");
            }
          }
        }, {once: true});
      }
    });

    let rv = Services.prompt.confirmEx(window, title, message, buttonFlags,
                                       firstButtonText, null,
                                       s.unblockButtonConfirmBlock, null, {});
    return [firstButtonAction, "cancel", "confirmBlock"][rv];
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
   * Used by sound logic when download ends.
   */
  _sound: null,
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
        Cc["@mozilla.org/suite/suiteglue;1"]
          .getService(Ci.nsISuiteGlue)
          .showDownloadManager(true);
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

    if (oldState != newState &&
        (download.succeeded ||
         (download.canceled && !download.hasPartialData) ||
          download.error)) {
      // Store the end time that may be displayed by the views.
      download.endTime = Date.now();

      // This state transition code should actually be located in a Downloads
      // API module (bug 941009).
      // This might end with an exception if it is an unsupported uri scheme.
      DownloadHistory.updateMetaData(download);

      if (download.succeeded) {
        this.playDownloadSound();
      }
    }
  },

  onDownloadRemoved(download) {
    this.oldDownloadStates.delete(download);
  },

  // Download summary
  onSummaryChanged: function() {

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

  // Play a download sound.
  playDownloadSound: function()
  {
    if (Services.prefs.getBoolPref("browser.download.finished_download_sound")) {
      if (!this._sound)
        this._sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);
      try {
        let url = Services.prefs.getStringPref("browser.download.finished_sound_url");
        this._sound.play(Services.io.newURI(url));
      } catch (e) {
        this._sound.beep();
      }
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
