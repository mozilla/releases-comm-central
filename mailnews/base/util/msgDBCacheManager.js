/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Message DB Cache manager
 */

/* :::::::: Constants and Helpers ::::::::::::::: */

this.EXPORTED_SYMBOLS = ["msgDBCacheManager"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource:///modules/mailServices.js");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/gloda/log4moz.js");
var log = Log4Moz.getConfiguredLogger("mailnews.database.dbcache");

/**
 */
var DBCACHE_INTERVAL_DEFAULT_MS = 60000; // 1 minute

/* :::::::: The Module ::::::::::::::: */

var msgDBCacheManager =
{
  _initialized: false,

  _msgDBCacheTimer: null,

  _msgDBCacheTimerIntervalMS: DBCACHE_INTERVAL_DEFAULT_MS,

  /**
   * This is called on startup
   */
  init: function dbcachemgr_init()
  {
    if (this._initialized)
      return;

    // we listen for "quit-application-granted" instead of
    // "quit-application-requested" because other observers of the
    // latter can cancel the shutdown.
    Services.obs.addObserver(this, "quit-application-granted", false);

    this.startPeriodicCheck();

    this._initialized = true;
  },

/* ........ Timer Callback ................*/

  _dbCacheCheckTimerCallback: function dbCache_CheckTimerCallback()
  {
    msgDBCacheManager.checkCachedDBs();
  },

/* ........ Observer Notification Handler ................*/

  observe: function dbCache_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
    // This is observed before any windows start unloading if something other
    // than the last 3pane window closing requested the application be
    // shutdown. For example, when the user quits via the file menu.
    case "quit-application-granted":
      Services.obs.removeObserver(this, "quit-application-granted");
      this.stopPeriodicCheck();
      break;
    }
  },

/* ........ Public API ................*/

  /**
   * Stops db cache check
   */
  stopPeriodicCheck: function dbcache_stopPeriodicCheck()
  {
    if (this._dbCacheCheckTimer) {
      this._dbCacheCheckTimer.cancel();

      delete this._dbCacheCheckTimer;
      this._dbCacheCheckTimer = null;
    }
  },

  /**
   * Starts periodic db cache check
   */
  startPeriodicCheck: function dbcache_startPeriodicCheck()
  {
    if (!this._dbCacheCheckTimer) {
      this._dbCacheCheckTimer = Cc["@mozilla.org/timer;1"]
                                   .createInstance(Ci.nsITimer);

      this._dbCacheCheckTimer.initWithCallback(
                                   this._dbCacheCheckTimerCallback,
                                   this._msgDBCacheTimerIntervalMS,
                                   Ci.nsITimer.TYPE_REPEATING_SLACK);
    }
  },
  checkCachedDBs : function ()
  {
    const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"]
                         .getService(Ci.nsIMsgDBService);

    let idleLimit = Services.prefs.getIntPref("mail.db.idle_limit");
    let maxOpenDBs = Services.prefs.getIntPref("mail.db.max_open");

    // db.lastUseTime below is in microseconds while Date.now and idleLimit pref
    // is in milliseconds.
    let closeThreshold = (Date.now() - idleLimit) * 1000;
    let cachedDBs = gDbService.openDBs;
    log.info("periodic check of cached dbs, count=" + cachedDBs.length);
    let numOpenDBs = 0;
    for (let i = 0; i < cachedDBs.length; i++) {
      let db = cachedDBs.queryElementAt(i, Ci.nsIMsgDatabase);
      if (!db.folder.databaseOpen) {
        log.debug("skipping cachedDB not open in folder: " + db.folder.name);
        continue;
      }

      if (MailServices.mailSession.IsFolderOpenInWindow(db.folder)) {
        log.debug("folder open in window, name: " + db.folder.name);
        numOpenDBs++;
        continue;
      }
      if (db.lastUseTime < closeThreshold)
      {
        log.debug("closing expired msgDatabase for folder: " + db.folder.name);
        db.folder.msgDatabase = null;
      }
      else
        numOpenDBs++;
    }
    cachedDBs = gDbService.openDBs;
    log.info("open db count " + numOpenDBs);
    if (numOpenDBs > maxOpenDBs) {
      // Close some DBs so that we do not have more than maxOpenDBs.
      // However, we do not close DB for a folder that is open in a window
      // so if there are so many windows open, it may be possible for
      // more than maxOpenDBs folders to stay open after this loop.
      let dbs = [];
      for (let i = 0; i < cachedDBs.length; i++) {
        let db = cachedDBs.queryElementAt(i, Ci.nsIMsgDatabase);
        if (db.folder.databaseOpen)
          dbs.push(db);
      }
      dbs.sort((a, b) => a.lastUseTime > b.lastUseTime);
      let dbsToClose = dbs.length - maxOpenDBs;
      if (dbsToClose > 0) {
        log.info("trying to close " + dbsToClose + " databases");
        for (let db of dbs) {
          if (MailServices.mailSession.IsFolderOpenInWindow(db.folder))
          {
            log.debug("not closing db open in window, name: " + db.folder.name);
            continue;
          }
          log.debug("closing db for folder: " + db.folder.name);
          db.folder.msgDatabase = null;
          if (--dbsToClose == 0)
            break;
        }
      }
    }
  },
};
