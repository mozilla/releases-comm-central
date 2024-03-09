/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var nsActProcess = Components.Constructor(
  "@mozilla.org/activity-process;1",
  "nsIActivityProcess",
  "init"
);
var nsActEvent = Components.Constructor(
  "@mozilla.org/activity-event;1",
  "nsIActivityEvent",
  "init"
);

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  Gloda: "resource:///modules/gloda/GlodaPublic.jsm",
  GlodaConstants: "resource:///modules/gloda/GlodaConstants.jsm",
  GlodaIndexer: "resource:///modules/gloda/GlodaIndexer.jsm",
});

/**
 * Gloda message indexer feedback.
 */
export var glodaIndexerActivity = {
  get log() {
    delete this.log;
    return (this.log = console.createInstance({
      prefix: "mail.activity",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mail.activity.loglevel",
    }));
  },

  get activityMgr() {
    delete this.activityMgr;
    return (this.activityMgr = Cc["@mozilla.org/activity-manager;1"].getService(
      Ci.nsIActivityManager
    ));
  },

  get bundle() {
    delete this.bundle;
    return (this.bundle = Services.strings.createBundle(
      "chrome://messenger/locale/activity.properties"
    ));
  },

  getString(stringName) {
    try {
      return this.bundle.GetStringFromName(stringName);
    } catch (e) {
      this.log.error("error trying to get a string called: " + stringName);
      throw e;
    }
  },

  init() {
    // Register a listener with the Gloda indexer that receives notifications
    // about Gloda indexing status.  We wrap the listener in this function so we
    // can set |this| to the GlodaIndexerActivity object inside the listener.
    function listenerWrapper(...aArgs) {
      glodaIndexerActivity.listener(...aArgs);
    }
    lazy.GlodaIndexer.addListener(listenerWrapper);
  },

  /**
   * Information about the current job.  An object with these properties:
   *
   *   folder       {String}
   *                the name of the folder being processed by the job
   *   jobNumber    {Number}
   *                the index of the job in the list of jobs
   *   process      {nsIActivityProcess}
   *                the activity process corresponding to the current job
   *   startTime    {Date}
   *                the time at which we were first notified about the job
   *   totalItemNum {Number}
   *                the total number of messages being indexed in the job
   *   jobType      {String}
   *                The IndexinbJob jobType (ex: "folder", "folderCompact")
   */
  currentJob: null,

  listener(aStatus, aFolder, aJobNumber, aItemNumber, aTotalItemNum, aJobType) {
    this.log.debug("Gloda Indexer Folder/Status: " + aFolder + "/" + aStatus);
    this.log.debug("Gloda Indexer Job: " + aJobNumber);
    this.log.debug("Gloda Indexer Item: " + aItemNumber + "/" + aTotalItemNum);

    if (aStatus == lazy.GlodaConstants.kIndexerIdle) {
      if (this.currentJob) {
        this.onJobCompleted();
      }
    } else {
      // If the job numbers have changed, the indexer has finished the job
      // we were previously tracking, so convert the corresponding process
      // into an event and start a new process to track the new job.
      if (this.currentJob && aJobNumber != this.currentJob.jobNumber) {
        this.onJobCompleted();
      }

      // If we aren't tracking a job, either this is the first time we've been
      // called or the last job we were tracking was completed.  Either way,
      // start tracking the new job.
      if (!this.currentJob) {
        this.onJobBegun(aFolder, aJobNumber, aTotalItemNum, aJobType);
      }

      // If there is only one item, don't bother creating a progress item.
      if (aTotalItemNum != 1) {
        this.onJobProgress(aFolder, aItemNumber, aTotalItemNum);
      }
    }
  },

  onJobBegun(aFolder, aJobNumber, aTotalItemNum, aJobType) {
    const displayText = aFolder
      ? this.getString("indexingFolder").replace("#1", aFolder)
      : this.getString("indexing");
    const process = new nsActProcess(displayText, lazy.Gloda);

    process.iconClass = "indexMail";
    process.contextType = "account";
    process.contextObj = aFolder;
    process.addSubject(aFolder);

    this.currentJob = {
      folder: aFolder,
      jobNumber: aJobNumber,
      process,
      startTime: new Date(),
      totalItemNum: aTotalItemNum,
      jobType: aJobType,
    };

    this.activityMgr.addActivity(process);
  },

  onJobProgress(aFolder, aItemNumber, aTotalItemNum) {
    this.currentJob.process.state = Ci.nsIActivityProcess.STATE_INPROGRESS;
    // The total number of items being processed in the job can change, as can
    // the folder being processed, since we sometimes get notified about a job
    // before it has determined these things, so we update them here.
    this.currentJob.folder = aFolder;
    this.currentJob.totalItemNum = aTotalItemNum;

    let statusText;
    if (aTotalItemNum == null) {
      statusText = aFolder
        ? this.getString("indexingFolderStatusVague").replace("#1", aFolder)
        : this.getString("indexingStatusVague");
    } else {
      const percentComplete =
        aTotalItemNum == 0
          ? 100
          : parseInt((aItemNumber / aTotalItemNum) * 100);
      // Note: we must replace the folder name placeholder last; otherwise,
      // if the name happens to contain another one of the placeholders, we'll
      // hork the name when replacing it.
      statusText = this.getString(
        aFolder ? "indexingFolderStatusExact" : "indexingStatusExact"
      );
      statusText = lazy.PluralForm.get(aTotalItemNum, statusText)
        .replace("#1", aItemNumber + 1)
        .replace("#2", aTotalItemNum)
        .replace("#3", percentComplete)
        .replace("#4", aFolder);
    }

    this.currentJob.process.setProgress(statusText, aItemNumber, aTotalItemNum);
  },

  onJobCompleted() {
    this.currentJob.process.state = Ci.nsIActivityProcess.STATE_COMPLETED;

    this.activityMgr.removeActivity(this.currentJob.process.id);

    // this.currentJob.totalItemNum might still be null at this point
    // if we were first notified about the job before the indexer determined
    // the number of messages to index and then it didn't find any to index.
    const totalItemNum = this.currentJob.totalItemNum || 0;

    // We only create activity events when specific folders get indexed,
    // since event-driven indexing jobs are too numerous.  We also only create
    // them when we ended up indexing something in the folder, since otherwise
    // we'd spam the activity manager with too many "indexed 0 messages" items
    // that aren't useful enough to justify their presence in the manager.
    // TODO: Aggregate event-driven indexing jobs into batches significant
    // enough for us to create activity events for them.
    if (
      this.currentJob.jobType == "folder" &&
      this.currentJob.folder &&
      totalItemNum > 0
    ) {
      // Note: we must replace the folder name placeholder last; otherwise,
      // if the name happens to contain another one of the placeholders, we'll
      // hork the name when replacing it.
      const displayText = lazy.PluralForm.get(
        totalItemNum,
        this.getString("indexedFolder")
      )
        .replace("#1", totalItemNum)
        .replace("#2", this.currentJob.folder);

      const endTime = new Date();
      const secondsElapsed = parseInt(
        (endTime - this.currentJob.startTime) / 1000
      );

      const statusText = lazy.PluralForm.get(
        secondsElapsed,
        this.getString("indexedFolderStatus")
      ).replace("#1", secondsElapsed);

      const event = new nsActEvent(
        displayText,
        lazy.Gloda,
        statusText,
        this.currentJob.startTime,
        endTime
      );
      event.contextType = this.currentJob.contextType;
      event.contextObj = this.currentJob.contextObj;
      event.iconClass = "indexMail";

      // Transfer subjects.
      const subjects = this.currentJob.process.getSubjects();
      for (const subject of subjects) {
        event.addSubject(subject);
      }

      this.activityMgr.addActivity(event);
    }

    this.currentJob = null;
  },
};
