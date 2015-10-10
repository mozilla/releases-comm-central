/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ['pop3DownloadModule'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var nsActProcess = Components.Constructor("@mozilla.org/activity-process;1",
                                            "nsIActivityProcess", "init");
var nsActEvent = Components.Constructor("@mozilla.org/activity-event;1",
                                          "nsIActivityEvent", "init");
var nsActWarning = Components.Constructor("@mozilla.org/activity-warning;1",
                                            "nsIActivityWarning", "init");

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("resource:///modules/gloda/log4moz.js");

// This module provides a link between the pop3 service code and the activity
// manager.
var pop3DownloadModule =
{
  // hash table of most recent download items per folder
  _mostRecentActivityForFolder: {},
  // hash table of prev download items per folder, so we can
  // coalesce consecutive no new message events.
  _prevActivityForFolder: {},

  get log() {
    delete this.log;
    return this.log = Log4Moz.getConfiguredLogger("pop3DownloadsModule");
  },

  get activityMgr() {
    delete this.activityMgr;
    return this.activityMgr = Cc["@mozilla.org/activity-manager;1"]
                                .getService(Ci.nsIActivityManager);
  },

  get bundle() {
    delete this.bundle;
    return this.bundle = Services.strings
      .createBundle("chrome://messenger/locale/activity.properties");
  },

  getString: function(stringName) {
    try {
      return this.bundle.GetStringFromName(stringName)
    } catch (e) {
      this.log.error("error trying to get a string called: " + stringName);
      throw(e);
    }
  },

  onDownloadStarted : function(aFolder) {
    this.log.info("in onDownloadStarted");

    let displayText = this.bundle
                          .formatStringFromName("pop3EventStartDisplayText",
                                               [aFolder.prettiestName], 1);
    // remember the prev activity for this folder, if any.
    this._prevActivityForFolder[aFolder.URI] =
      this._mostRecentActivityForFolder[aFolder.URI];
    let statusText = aFolder.server.prettyName;

    // create an activity event
    let event = new nsActEvent(displayText,
                               aFolder,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.iconClass = "syncMail";

    let downloadItem = {};
    downloadItem.eventID = this.activityMgr.addActivity(event);
    this._mostRecentActivityForFolder[aFolder.URI] = downloadItem;
  },

  onDownloadProgress : function(aFolder, aNumMsgsDownloaded, aTotalMsgs) {
    this.log.info("in onDownloadProgress");
  },

  onDownloadCompleted : function(aFolder, aNumMsgsDownloaded) {
    this.log.info("in onDownloadCompleted");

    this.activityMgr.removeActivity(this._mostRecentActivityForFolder[aFolder.URI].eventID);

    let displayText;
    if (aNumMsgsDownloaded > 0)
    {
      displayText = PluralForm.get(aNumMsgsDownloaded, this.getString("pop3EventStatusText"));
      displayText = displayText.replace("#1", aNumMsgsDownloaded);
    }
    else
      displayText = this.getString("pop3EventStatusTextNoMsgs");

    let statusText = aFolder.server.prettyName;

    // create an activity event
    let event = new nsActEvent(displayText,
                               aFolder,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.iconClass = "syncMail";

    let downloadItem = {numMsgsDownloaded: aNumMsgsDownloaded};
    this._mostRecentActivityForFolder[aFolder.URI] = downloadItem;
    downloadItem.eventID = this.activityMgr.addActivity(event);
    if (!aNumMsgsDownloaded) {
      // if we didn't download any messages this time, and the prev event
      // for this folder also didn't download any messages, remove the
      // prev event from the activity manager.
      let prevItem = this._prevActivityForFolder[aFolder.URI];
      if (prevItem != undefined && !prevItem.numMsgsDownloaded) {
        if (this.activityMgr.containsActivity(prevItem.eventID))
          this.activityMgr.removeActivity(prevItem.eventID);
      }
    }
  },
  init: function() {
    // XXX when do we need to remove ourselves?
    MailServices.pop3.addListener(this);
  }
};
