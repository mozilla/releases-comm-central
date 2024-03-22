/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * Handles remembering deleted items.
 *
 * This is (currently) not a real trashcan. Only ids and time deleted is stored.
 * Note also that the code doesn't strictly check the calendar of the item,
 * except when a calendar id is passed to getDeletedDate.
 */
export function CalDeletedItems() {
  this.wrappedJSObject = this;

  this.completedNotifier = {
    handleResult() {},
    handleError() {},
    handleCompletion() {},
  };
}

var calDeletedItemsClassID = Components.ID("{8e6799af-e7e9-4e6c-9a82-a2413e86d8c3}");
var calDeletedItemsInterfaces = [Ci.calIDeletedItems, Ci.nsIObserver, Ci.calIObserver];
CalDeletedItems.prototype = {
  classID: calDeletedItemsClassID,
  QueryInterface: cal.generateQI(["calIDeletedItems", "nsIObserver", "calIObserver"]),
  classInfo: cal.generateCI({
    classID: calDeletedItemsClassID,
    contractID: "@mozilla.org/calendar/deleted-items-manager;1",
    classDescription: "Database containing information about deleted items",
    interfaces: calDeletedItemsInterfaces,
    flags: Ci.nsIClassInfo.SINGLETON,
  }),

  DB_SCHEMA_VERSION: 1,
  STALE_TIME: (30 * 24 * 60 * 60) / 1000 /* 30 days */,

  // To make the tests more failsafe, we have an internal notifier function.
  // As the deleted items store is just meant to be a hint, this should not
  // be used in real code.
  completedNotifier: null,

  flush() {
    this.ensureStatements();
    this.stmtFlush.params.stale_time = cal.dtz.now().nativeTime - this.STALE_TIME;
    this.stmtFlush.executeAsync(this.completedNotifier);
  },

  getDeletedDate(aId, aCalId) {
    this.ensureStatements();
    let stmt;
    if (aCalId) {
      stmt = this.stmtGetWithCal;
      stmt.params.calId = aCalId;
    } else {
      stmt = this.stmtGet;
    }

    stmt.params.id = aId;
    try {
      if (stmt.executeStep()) {
        const date = cal.createDateTime();
        date.nativeTime = stmt.row.time_deleted;
        return date.getInTimezone(cal.dtz.defaultTimezone);
      }
    } catch (e) {
      cal.ERROR(e);
    } finally {
      stmt.reset();
    }
    return null;
  },

  markDeleted(aItem) {
    this.ensureStatements();
    this.stmtMarkDelete.params.calId = aItem.calendar.id;
    this.stmtMarkDelete.params.id = aItem.id;
    this.stmtMarkDelete.params.time = cal.dtz.now().nativeTime;
    this.stmtMarkDelete.params.rid = (aItem.recurrenceId && aItem.recurrenceId.nativeTime) || "";
    this.stmtMarkDelete.executeAsync(this.completedNotifier);
  },

  unmarkDeleted(aItem) {
    this.ensureStatements();
    this.stmtUnmarkDelete.params.id = aItem.id;
    this.stmtUnmarkDelete.executeAsync(this.completedNotifier);
  },

  initDB() {
    if (this.mDB) {
      // Looks like we've already initialized, exit early
      return;
    }

    const nsFile = Components.Constructor("@mozilla.org/file/local;1", "nsIFile", "initWithPath");
    const file = new nsFile(
      PathUtils.join(PathUtils.profileDir, "calendar-data", "deleted.sqlite")
    );
    if (!file.exists()) {
      file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o755);
    }
    this.mDB = Services.storage.openDatabase(file);

    // If this database needs changing, please start using a real schema
    // management, i.e using PRAGMA user_version and upgrading
    if (!this.mDB.tableExists("cal_deleted_items")) {
      const v1_schema = "cal_id TEXT, id TEXT, time_deleted INTEGER, recurrence_id INTEGER";
      const v1_index =
        "CREATE INDEX idx_deleteditems ON cal_deleted_items(id,cal_id,recurrence_id)";

      this.mDB.createTable("cal_deleted_items", v1_schema);
      this.mDB.executeSimpleSQL(v1_index);
      this.mDB.executeSimpleSQL("PRAGMA user_version = 1");
    }

    // We will not init the statements now, we can still do that the
    // first time this interface is used. What we should do though is
    // to clean up at shutdown
    cal.addShutdownObserver(this.shutdown.bind(this));
  },

  observe(aSubject, aTopic) {
    if (aTopic == "profile-after-change") {
      // Make sure to observe calendar changes so we know when things are
      // deleted. We don't initialize the statements until first use.
      cal.manager.addCalendarObserver(this);
    }
  },

  ensureStatements() {
    if (!this.mDB) {
      this.initDB();
    }

    if (!this.stmtMarkDelete) {
      const stmt =
        "INSERT OR REPLACE INTO cal_deleted_items (cal_id, id, time_deleted, recurrence_id) VALUES(:calId, :id, :time, :rid)";
      this.stmtMarkDelete = this.mDB.createStatement(stmt);
    }
    if (!this.stmtUnmarkDelete) {
      const stmt = "DELETE FROM cal_deleted_items WHERE id = :id";
      this.stmtUnmarkDelete = this.mDB.createStatement(stmt);
    }
    if (!this.stmtGetWithCal) {
      const stmt = "SELECT time_deleted FROM cal_deleted_items WHERE cal_id = :calId AND id = :id";
      this.stmtGetWithCal = this.mDB.createStatement(stmt);
    }
    if (!this.stmtGet) {
      const stmt = "SELECT time_deleted FROM cal_deleted_items WHERE id = :id";
      this.stmtGet = this.mDB.createStatement(stmt);
    }
    if (!this.stmtFlush) {
      const stmt = "DELETE FROM cal_deleted_items WHERE time_deleted < :stale_time";
      this.stmtFlush = this.mDB.createStatement(stmt);
    }
  },

  shutdown() {
    try {
      const stmts = [
        this.stmtMarkDelete,
        this.stmtUnmarkDelete,
        this.stmtGet,
        this.stmtGetWithCal,
        this.stmtFlush,
      ];
      for (const stmt of stmts) {
        stmt.finalize();
      }

      if (this.mDB) {
        this.mDB.asyncClose();
        this.mDB = null;
      }
    } catch (e) {
      cal.ERROR("Error closing deleted items database: " + e);
    }

    cal.manager.removeCalendarObserver(this);
  },

  // calIObserver
  onStartBatch() {},
  onEndBatch() {},
  onModifyItem() {},
  onError() {},
  onPropertyChanged() {},
  onPropertyDeleting() {},

  onAddItem(aItem) {
    this.unmarkDeleted(aItem);
  },

  onDeleteItem(aItem) {
    this.markDeleted(aItem);
  },

  onLoad() {
    this.flush();
  },
};
