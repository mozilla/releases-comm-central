/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["GlodaDatabind"];

function GlodaDatabind(aNounDef, aDatastore) {
  this._nounDef = aNounDef;
  this._tableName = aNounDef.tableName;
  this._tableDef = aNounDef.schema;
  this._datastore = aDatastore;
  this._log = console.createInstance({
    prefix: `gloda.databind.${this._tableName}`,
    maxLogLevel: "Warn",
    maxLogLevelPref: "gloda.loglevel",
  });

  // process the column definitions and make sure they have an attribute mapping
  for (const [iColDef, coldef] of this._tableDef.columns.entries()) {
    // default to the other dude's thing.
    if (coldef.length < 3) {
      coldef[2] = coldef[0];
    }
    if (coldef[0] == "id") {
      this._idAttr = coldef[2];
    }
    // colDef[3] is the index of us in our SQL bindings, storage-numbering
    coldef[3] = iColDef;
  }

  // XXX This is obviously synchronous and not perfectly async.  Since we are
  //  doing this, we don't actually need to move to ordinal binding below
  //  since we could just as well compel creation of the name map and thereby
  //  avoid ever acquiring the mutex after bootstrap.
  // However, this specific check can be cleverly avoided with future work.
  // Namely, at startup we can scan for extension-defined tables and get their
  //  maximum id so that we don't need to do it here.  The table will either
  //  be brand new and thus have a maximum id of 1 or we will already know it
  //  because of that scan.
  this._nextId = 1;
  const stmt = this._datastore._createSyncStatement(
    "SELECT MAX(id) FROM " + this._tableName,
    true
  );
  if (stmt.executeStep()) {
    // no chance of this SQLITE_BUSY on this call
    this._nextId = stmt.getInt64(0) + 1;
  }
  stmt.finalize();

  const insertColumns = [];
  const insertValues = [];
  const updateItems = [];
  for (const [iColDef, coldef] of this._tableDef.columns.entries()) {
    const column = coldef[0];
    const placeholder = "?" + (iColDef + 1);
    insertColumns.push(column);
    insertValues.push(placeholder);
    if (column != "id") {
      updateItems.push(column + " = " + placeholder);
    }
  }

  const insertSql =
    "INSERT INTO " +
    this._tableName +
    " (" +
    insertColumns.join(", ") +
    ") VALUES (" +
    insertValues.join(", ") +
    ")";

  // For the update, we want the 'id' to be a constraint and not a value
  //  that gets set...
  const updateSql =
    "UPDATE " +
    this._tableName +
    " SET " +
    updateItems.join(", ") +
    " WHERE id = ?1";
  this._insertStmt = aDatastore._createAsyncStatement(insertSql);
  this._updateStmt = aDatastore._createAsyncStatement(updateSql);

  if (this._tableDef.fulltextColumns) {
    for (const [iColDef, coldef] of this._tableDef.fulltextColumns.entries()) {
      if (coldef.length < 3) {
        coldef[2] = coldef[0];
      }
      // colDef[3] is the index of us in our SQL bindings, storage-numbering
      coldef[3] = iColDef + 1;
    }

    const insertColumns = [];
    const insertValues = [];
    const updateItems = [];
    for (var [iColDef, coldef] of this._tableDef.fulltextColumns.entries()) {
      const column = coldef[0];
      // +2 instead of +1 because docid is implied
      const placeholder = "?" + (iColDef + 2);
      insertColumns.push(column);
      insertValues.push(placeholder);
      if (column != "id") {
        updateItems.push(column + " = " + placeholder);
      }
    }

    const insertFulltextSql =
      "INSERT INTO " +
      this._tableName +
      "Text (docid," +
      insertColumns.join(", ") +
      ") VALUES (?1," +
      insertValues.join(", ") +
      ")";

    // For the update, we want the 'id' to be a constraint and not a value
    //  that gets set...
    const updateFulltextSql =
      "UPDATE " +
      this._tableName +
      "Text SET " +
      updateItems.join(", ") +
      " WHERE docid = ?1";

    this._insertFulltextStmt =
      aDatastore._createAsyncStatement(insertFulltextSql);
    this._updateFulltextStmt =
      aDatastore._createAsyncStatement(updateFulltextSql);
  }
}

GlodaDatabind.prototype = {
  /**
   * Perform appropriate binding coercion based on the schema provided to us.
   * Although we end up effectively coercing JS Date objects to numeric values,
   *  we should not be provided with JS Date objects!  There is no way for us
   *  to know to turn them back into JS Date objects on the way out.
   *  Additionally, there is the small matter of storage's bias towards
   *  PRTime representations which may not always be desirable.
   */
  bindByType(aStmt, aColDef, aValue) {
    aStmt.bindByIndex(aColDef[3], aValue);
  },

  objFromRow(aRow) {
    const getVariant = this._datastore._getVariant;
    const obj = new this._nounDef.class();
    for (const [iCol, colDef] of this._tableDef.columns.entries()) {
      obj[colDef[2]] = getVariant(aRow, iCol);
    }
    return obj;
  },

  objInsert(aThing) {
    const bindByType = this.bindByType;
    if (!aThing[this._idAttr]) {
      aThing[this._idAttr] = this._nextId++;
    }

    let stmt = this._insertStmt;
    for (const colDef of this._tableDef.columns) {
      bindByType(stmt, colDef, aThing[colDef[2]]);
    }

    stmt.executeAsync(this._datastore.trackAsync());

    if (this._insertFulltextStmt) {
      stmt = this._insertFulltextStmt;
      stmt.bindByIndex(0, aThing[this._idAttr]);
      for (const colDef of this._tableDef.fulltextColumns) {
        bindByType(stmt, colDef, aThing[colDef[2]]);
      }
      stmt.executeAsync(this._datastore.trackAsync());
    }
  },

  objUpdate(aThing) {
    const bindByType = this.bindByType;
    let stmt = this._updateStmt;
    // note, we specially bound the location of 'id' for the insert, but since
    //  we're using named bindings, there is nothing special about setting it
    for (const colDef of this._tableDef.columns) {
      bindByType(stmt, colDef, aThing[colDef[2]]);
    }
    stmt.executeAsync(this._datastore.trackAsync());

    if (this._updateFulltextStmt) {
      stmt = this._updateFulltextStmt;
      // fulltextColumns doesn't include id/docid, need to explicitly set it
      stmt.bindByIndex(0, aThing[this._idAttr]);
      for (const colDef of this._tableDef.fulltextColumns) {
        bindByType(stmt, colDef, aThing[colDef[2]]);
      }
      stmt.executeAsync(this._datastore.trackAsync());
    }
  },

  adjustAttributes(...aArgs) {
    // just proxy the call over to the datastore... we have to do this for
    //  'this' reasons.  we don't refactor things to avoid this because it does
    //  make some sense to have all the methods exposed from a single object,
    //  even if the implementation does live elsewhere.
    return this._datastore.adjustAttributes(...aArgs);
  },

  // also proxied...
  queryFromQuery(...aArgs) {
    return this._datastore.queryFromQuery(...aArgs);
  },
};
