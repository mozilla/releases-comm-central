/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AsyncShutdown } from "resource://gre/modules/AsyncShutdown.sys.mjs";

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const connections = new Map();

/**
 * Checks for an existing SQLite connection to `file`, or creates a new one.
 * Calls to `openConnectionTo` and `closeConnection` are counted so we know
 * if a connection is no longer used.
 *
 * @param {nsIFile} file
 * @returns {mozIStorageConnection}
 */
function openConnectionTo(file) {
  const data = connections.get(file.path);

  if (data) {
    data.useCount++;
    return data.connection;
  }

  const connection = Services.storage.openDatabase(file);
  connections.set(file.path, { connection, useCount: 1 });
  return connection;
}

/**
 * Closes an SQLite connection if it is no longer in use.
 *
 * @param {mozIStorageConnection} connection
 * @returns {Promise} - resolves when the connection is closed, or immediately
 *   if the database is still in use.
 */
function closeConnection(connection, forceClosed) {
  const file = connection.databaseFile;
  const data = connections.get(file.path);

  if (forceClosed || !data || --data.useCount == 0) {
    return new Promise(resolve => {
      connection.asyncClose({
        complete() {
          resolve();
        },
      });
      connections.delete(file.path);
    });
  }

  return Promise.resolve();
}

// Clean up all open databases at shutdown. All storage statements must be closed by now,
// which CalStorageCalendar does during profile-change-teardown.
AsyncShutdown.profileBeforeChange.addBlocker("Calendar: closing databases", async () => {
  const promises = [];
  for (const data of connections.values()) {
    promises.push(closeConnection(data.connection, true));
  }
  await Promise.allSettled(promises);
});

/**
 * CalStorageDatabase is a mozIStorageAsyncConnection wrapper used by the
 * storage calendar.
 */
export class CalStorageDatabase {
  /**
   * @type {mozIStorageAsyncConnection}
   */
  db = null;

  /**
   * @type {string}
   */
  calendarId = null;

  /**
   * @type {mozIStorageAsyncStatement}
   */
  lastStatement = null;

  /**
   * @param {mozIStorageAsyncConnection} db
   * @param {string} calendarId
   */
  constructor(db, calendarId) {
    this.db = db;
    this.calendarId = calendarId;
  }

  /**
   * Initializes a CalStorageDatabase using the provided nsIURI and calendar
   * id.
   *
   * @param {nsIURI} uri
   * @param {string} calendarId
   *
   * @returns {CalStorageDatabase}
   */
  static connect(uri, calendarId) {
    if (uri.schemeIs("file")) {
      const fileURL = uri.QueryInterface(Ci.nsIFileURL);

      if (!fileURL) {
        throw new Components.Exception("Invalid file", Cr.NS_ERROR_NOT_IMPLEMENTED);
      }
      // open the database
      return new CalStorageDatabase(openConnectionTo(fileURL.file), calendarId);
    } else if (uri.schemeIs("moz-storage-calendar")) {
      // New style uri, no need for migration here
      const localDB = cal.provider.getCalendarDirectory();
      localDB.append("local.sqlite");

      if (!localDB.exists()) {
        // This can happen with a database upgrade and the "too new schema" situation.
        localDB.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o700);
      }

      return new CalStorageDatabase(openConnectionTo(localDB), calendarId);
    }
    throw new Components.Exception("Invalid Scheme " + uri.spec);
  }

  /**
   * Calls the same method on the underlying database connection.
   *
   * @param {string} sql
   *
   * @returns {mozIStorageAsyncStatement}
   */
  createAsyncStatement(sql) {
    return this.db.createAsyncStatement(sql);
  }

  /**
   * Calls the same method on the underlying database connection.
   *
   * @param {string} sql
   *
   * @returns {mozIStorageStatement}
   */
  createStatement(sql) {
    return this.db.createStatement(sql);
  }

  /**
   * Calls the same method on the underlying database connection.
   *
   * @param {string} sql
   *
   * @returns
   */
  executeSimpleSQL(sql) {
    return this.db.executeSimpleSQL(sql);
  }

  /**
   * Takes care of necessary preparations for most of our statements.
   *
   * @param {mozIStorageAsyncStatement} aStmt
   */
  prepareStatement(aStmt) {
    try {
      aStmt.params.cal_id = this.calendarId;
      this.lastStatement = aStmt;
    } catch (e) {
      this.logError("prepareStatement exception", e);
    }
    return aStmt;
  }

  /**
   * Executes a statement using an item as a parameter.
   *
   * @param {mozIStorageStatement} stmt - The statement to execute.
   * @param {string} idParam - The name of the parameter referring to the item id.
   * @param {string} id - The id of the item.
   */
  executeSyncItemStatement(aStmt, aIdParam, aId) {
    try {
      aStmt.params.cal_id = this.calendarId;
      aStmt.params[aIdParam] = aId;
      aStmt.executeStep();
    } catch (e) {
      this.logError("executeSyncItemStatement exception", e);
      throw e;
    } finally {
      aStmt.reset();
    }
  }

  prepareAsyncStatement(aStmts, aStmt) {
    if (!aStmts.has(aStmt)) {
      aStmts.set(aStmt, aStmt.newBindingParamsArray());
    }
    return aStmts.get(aStmt);
  }

  prepareAsyncParams(aArray) {
    const params = aArray.newBindingParams();
    params.bindByName("cal_id", this.calendarId);
    return params;
  }

  /**
   * Executes one or more SQL statemets.
   *
   * @param {mozIStorageAsyncStatement|mozIStorageAsyncStatement[]} aStmts
   * @param {Function} aCallback
   */
  executeAsync(aStmts, aCallback) {
    if (!Array.isArray(aStmts)) {
      aStmts = [aStmts];
    }

    const self = this;
    return new Promise((resolve, reject) => {
      this.db.executeAsync(aStmts, {
        resultPromises: [],

        handleResult(aResultSet) {
          this.resultPromises.push(this.handleResultInner(aResultSet));
        },
        async handleResultInner(aResultSet) {
          let row = aResultSet.getNextRow();
          while (row) {
            try {
              await aCallback(row);
            } catch (ex) {
              this.handleError(ex);
            }
            if (this.finishCalled) {
              self.logError(
                "Async query completed before all rows consumed. This should never happen.",
                null
              );
            }
            row = aResultSet.getNextRow();
          }
        },
        handleError(aError) {
          cal.WARN(aError);
        },
        async handleCompletion(aReason) {
          await Promise.all(this.resultPromises);

          switch (aReason) {
            case Ci.mozIStorageStatementCallback.REASON_FINISHED:
              this.finishCalled = true;
              resolve();
              break;
            case Ci.mozIStorageStatementCallback.REASON_CANCELLED:
              reject(Components.Exception("async statement was cancelled", Cr.NS_ERROR_ABORT));
              break;
            default:
              reject(Components.Exception("error executing async statement", Cr.NS_ERROR_FAILURE));
              break;
          }
        },
      });
    });
  }

  prepareItemStatement(aStmts, aStmt, aIdParam, aId) {
    aStmt.params.cal_id = this.calendarId;
    aStmt.params[aIdParam] = aId;
    aStmts.push(aStmt);
  }

  /**
   * Internal logging function that should be called on any database error,
   * it will log as much info as possible about the database context and
   * last statement so the problem can be investigated more easily.
   *
   * @param message           Error message to log.
   * @param exception         Exception that caused the error.
   */
  logError(message, exception) {
    let logMessage = "Message: " + message;
    if (this.db) {
      if (this.db.connectionReady) {
        logMessage += "\nConnection Ready: " + this.db.connectionReady;
      }
      if (this.db.lastError) {
        logMessage += "\nLast DB Error Number: " + this.db.lastError;
      }
      if (this.db.lastErrorString) {
        logMessage += "\nLast DB Error Message: " + this.db.lastErrorString;
      }
      if (this.db.databaseFile) {
        logMessage += "\nDatabase File: " + this.db.databaseFile.path;
      }
      if (this.db.lastInsertRowId) {
        logMessage += "\nLast Insert Row Id: " + this.db.lastInsertRowId;
      }
      if (this.db.transactionInProgress) {
        logMessage += "\nTransaction In Progress: " + this.db.transactionInProgress;
      }
    }

    if (this.lastStatement) {
      logMessage += "\nLast DB Statement: " + this.lastStatement;
      // Async statements do not allow enumeration of parameters.
      if (this.lastStatement instanceof Ci.mozIStorageStatement && this.lastStatement.params) {
        for (const param in this.lastStatement.params) {
          logMessage +=
            "\nLast Statement param [" + param + "]: " + this.lastStatement.params[param];
        }
      }
    }

    if (exception) {
      logMessage += "\nException: " + exception;
    }
    cal.ERROR("[calStorageCalendar] " + logMessage + "\n" + cal.STACK(10));
  }

  /**
   * Close the underlying db connection.
   */
  close() {
    closeConnection(this.db);
    this.db = null;
  }
}
