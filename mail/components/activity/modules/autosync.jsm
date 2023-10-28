/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["autosyncModule"];

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

/**
 * This code aims to mediate between the auto-sync code and the activity mgr.
 *
 * Not every auto-sync activity is directly  mapped to a process or event.
 * To prevent a possible event overflow, Auto-Sync monitor generates one
 * sync'd event per account when after all its _pending_ folders are sync'd,
 * rather than generating one event per folder sync.
 */

var autosyncModule = {
  _inQFolderList: [],
  _running: false,
  _syncInfoPerFolder: new Map(),
  _syncInfoPerServer: new Map(),
  _lastMessage: new Map(),

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

  get autoSyncManager() {
    delete this.autoSyncManager;
    return (this.autoSyncManager = Cc[
      "@mozilla.org/imap/autosyncmgr;1"
    ].getService(Ci.nsIAutoSyncManager));
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

  createSyncMailProcess(folder) {
    try {
      // create an activity process for this folder
      const msg = this.bundle.formatStringFromName(
        "autosyncProcessDisplayText",
        [folder.prettyName]
      );
      const process = new nsActProcess(msg, this.autoSyncManager);
      // we want to use default auto-sync icon
      process.iconClass = "syncMail";
      process.addSubject(folder);
      // group processes under folder's imap account
      process.contextType = "account";
      process.contextDisplayText = this.bundle.formatStringFromName(
        "autosyncContextDisplayText",
        [folder.server.prettyName]
      );

      process.contextObj = folder.server;

      return process;
    } catch (e) {
      this.log.error("createSyncMailProcess: " + e);
      throw e;
    }
  },

  createSyncMailEvent(syncItem) {
    try {
      // extract the relevant parts
      const process = syncItem.activity;
      const folder = syncItem.syncFolder;

      // create an activity event

      const msg = this.bundle.formatStringFromName("autosyncEventDisplayText", [
        folder.server.prettyName,
      ]);

      let statusMsg;
      const numOfMessages = this._syncInfoPerServer.get(
        folder.server
      ).totalDownloads;
      if (numOfMessages) {
        statusMsg = this.bundle.formatStringFromName(
          "autosyncEventStatusText",
          [numOfMessages]
        );
      } else {
        statusMsg = this.getString("autosyncEventStatusTextNoMsgs");
      }

      const event = new nsActEvent(
        msg,
        this.autoSyncManager,
        statusMsg,
        this._syncInfoPerServer.get(folder.server).startTime,
        Date.now()
      ); // completion time

      // since auto-sync events do not have undo option by nature,
      // setting these values are informational only.
      event.contextType = process.contextType;
      event.contextDisplayText = this.bundle.formatStringFromName(
        "autosyncContextDisplayText",
        [folder.server.prettyName]
      );
      event.contextObj = process.contextObj;
      event.iconClass = "syncMail";

      // transfer all subjects.
      // same as above, not mandatory
      const subjects = process.getSubjects();
      for (const subject of subjects) {
        event.addSubject(subject);
      }

      return event;
    } catch (e) {
      this.log.error("createSyncMailEvent: " + e);
      throw e;
    }
  },

  onStateChanged(running) {
    try {
      this._running = running;
      this.log.info(
        "OnStatusChanged: " + (running ? "running" : "sleeping") + "\n"
      );
    } catch (e) {
      this.log.error("onStateChanged: " + e);
      throw e;
    }
  },

  onFolderAddedIntoQ(queue, folder) {
    try {
      if (
        folder instanceof Ci.nsIMsgFolder &&
        queue == Ci.nsIAutoSyncMgrListener.PriorityQueue
      ) {
        this._inQFolderList.push(folder);
        this.log.info(
          "Auto_Sync OnFolderAddedIntoQ [" +
            this._inQFolderList.length +
            "] " +
            folder.prettyName +
            " of " +
            folder.server.prettyName
        );
        // create an activity process for this folder
        const process = this.createSyncMailProcess(folder);

        // create a sync object to keep track of the process of this folder
        const imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
        const syncItem = {
          syncFolder: folder,
          activity: process,
          percentComplete: 0,
          totalDownloaded: 0,
          pendingMsgCount: imapFolder.autoSyncStateObj.pendingMessageCount,
        };

        // if this is the first folder of this server in the queue, then set the sync start time
        // for activity event
        if (!this._syncInfoPerServer.has(folder.server)) {
          this._syncInfoPerServer.set(folder.server, {
            startTime: Date.now(),
            totalDownloads: 0,
          });
        }

        // associate the sync object with the folder in question
        // use folder.URI as key
        this._syncInfoPerFolder.set(folder.URI, syncItem);
      }
    } catch (e) {
      this.log.error("onFolderAddedIntoQ: " + e);
      throw e;
    }
  },
  onFolderRemovedFromQ(queue, folder) {
    try {
      if (
        folder instanceof Ci.nsIMsgFolder &&
        queue == Ci.nsIAutoSyncMgrListener.PriorityQueue
      ) {
        const i = this._inQFolderList.indexOf(folder);
        if (i > -1) {
          this._inQFolderList.splice(i, 1);
        }

        this.log.info(
          "OnFolderRemovedFromQ [" +
            this._inQFolderList.length +
            "] " +
            folder.prettyName +
            " of " +
            folder.server.prettyName +
            "\n"
        );

        const syncItem = this._syncInfoPerFolder.get(folder.URI);
        const process = syncItem.activity;
        let canceled = false;
        if (process instanceof Ci.nsIActivityProcess) {
          canceled = process.state == Ci.nsIActivityProcess.STATE_CANCELED;
          process.state = Ci.nsIActivityProcess.STATE_COMPLETED;

          try {
            this.activityMgr.removeActivity(process.id);
          } catch (e) {
            // It is OK to end up here; If the folder is queued and the
            // message get manually downloaded by the user, we might get
            // a folder removed notification even before a download
            // started for this folder. This behavior stems from the fact
            // that we add activities into the activity manager in
            // onDownloadStarted notification rather than onFolderAddedIntoQ.
            // This is an expected side effect.
            // Log a warning, but do not throw an error.
            this.log.warn("onFolderRemovedFromQ: " + e);
          }

          // remove the folder/syncItem association from the table
          this._syncInfoPerFolder.delete(folder.URI);
        }

        // if this is the last folder of this server in the queue
        // create a sync event and clean the sync start time
        let found = false;
        for (const value of this._syncInfoPerFolder.values()) {
          if (value.syncFolder.server == folder.server) {
            found = true;
            break;
          }
        }
        this.log.info(
          "Auto_Sync OnFolderRemovedFromQ Last folder of the server: " + !found
        );
        if (!found) {
          // create an sync event for the completed process if it's not canceled
          if (!canceled) {
            const key = folder.server.prettyName;
            if (
              this._lastMessage.has(key) &&
              this.activityMgr.containsActivity(this._lastMessage.get(key))
            ) {
              this.activityMgr.removeActivity(this._lastMessage.get(key));
            }
            this._lastMessage.set(
              key,
              this.activityMgr.addActivity(this.createSyncMailEvent(syncItem))
            );
          }
          this._syncInfoPerServer.delete(folder.server);
        }
      }
    } catch (e) {
      this.log.error("onFolderRemovedFromQ: " + e);
      throw e;
    }
  },
  onDownloadStarted(folder, numOfMessages, totalPending) {
    try {
      if (folder instanceof Ci.nsIMsgFolder) {
        this.log.info(
          "OnDownloadStarted (" +
            numOfMessages +
            "/" +
            totalPending +
            "): " +
            folder.prettyName +
            " of " +
            folder.server.prettyName +
            "\n"
        );

        const syncItem = this._syncInfoPerFolder.get(folder.URI);
        const process = syncItem.activity;

        // Update the totalPending number. if new messages have been discovered in the folder
        // after we added the folder into the q, totalPending might be greater than what we have
        // initially set
        if (totalPending > syncItem.pendingMsgCount) {
          syncItem.pendingMsgCount = totalPending;
        }

        if (process instanceof Ci.nsIActivityProcess) {
          // if the process has not beed added to activity manager already, add now
          if (!this.activityMgr.containsActivity(process.id)) {
            this.log.info(
              "Auto_Sync OnDownloadStarted: No process, adding a new process"
            );
            this.activityMgr.addActivity(process);
          }

          syncItem.totalDownloaded += numOfMessages;

          process.state = Ci.nsIActivityProcess.STATE_INPROGRESS;
          const percent =
            (syncItem.totalDownloaded / syncItem.pendingMsgCount) * 100;
          if (percent > syncItem.percentComplete) {
            syncItem.percentComplete = percent;
          }

          const msg = this.bundle.formatStringFromName(
            "autosyncProcessProgress2",
            [
              syncItem.totalDownloaded,
              syncItem.pendingMsgCount,
              folder.prettyName,
              folder.server.prettyName,
            ]
          );

          process.setProgress(
            msg,
            syncItem.totalDownloaded,
            syncItem.pendingMsgCount
          );

          const serverInfo = this._syncInfoPerServer.get(
            syncItem.syncFolder.server
          );
          serverInfo.totalDownloads += numOfMessages;
          this._syncInfoPerServer.set(syncItem.syncFolder.server, serverInfo);
        }
      }
    } catch (e) {
      this.log.error("onDownloadStarted: " + e);
      throw e;
    }
  },

  onDownloadCompleted(folder) {
    try {
      if (folder instanceof Ci.nsIMsgFolder) {
        this.log.info(
          "OnDownloadCompleted: " +
            folder.prettyName +
            " of " +
            folder.server.prettyName
        );

        const process = this._syncInfoPerFolder.get(folder.URI).activity;
        if (process instanceof Ci.nsIActivityProcess && !this._running) {
          this.log.info(
            "OnDownloadCompleted: Auto-Sync Manager is paused, pausing the process"
          );
          process.state = Ci.nsIActivityProcess.STATE_PAUSED;
        }
      }
    } catch (e) {
      this.log.error("onDownloadCompleted: " + e);
      throw e;
    }
  },

  onDownloadError(folder) {
    if (folder instanceof Ci.nsIMsgFolder) {
      this.log.error(
        "OnDownloadError: " +
          folder.prettyName +
          " of " +
          folder.server.prettyName +
          "\n"
      );
    }
  },

  onDiscoveryQProcessed(folder, numOfHdrsProcessed, leftToProcess) {
    this.log.info(
      "onDiscoveryQProcessed: Processed " +
        numOfHdrsProcessed +
        "/" +
        (leftToProcess + numOfHdrsProcessed) +
        " of " +
        folder.prettyName +
        "\n"
    );
  },

  onAutoSyncInitiated(folder) {
    this.log.info(
      "onAutoSyncInitiated: " +
        folder.prettyName +
        " of " +
        folder.server.prettyName +
        " has been updated.\n"
    );
  },

  init() {
    this.log.info("initing");
    Cc["@mozilla.org/imap/autosyncmgr;1"]
      .getService(Ci.nsIAutoSyncManager)
      .addListener(this);
  },

  cleanUp() {
    this.log.info("cleaning up");
    Cc["@mozilla.org/imap/autosyncmgr;1"]
      .getService(Ci.nsIAutoSyncManager)
      .removeListener(this);
  },
};

// Disconnect the listener at shutdown to avoid memory leaking.
Services.obs.addObserver(
  {
    observe() {
      autosyncModule.cleanUp();
      Services.obs.removeObserver(this, "xpcom-shutdown");
    },
  },
  "xpcom-shutdown"
);
