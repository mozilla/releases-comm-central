/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalStorageModelBase } from "resource:///modules/calendar/CalStorageModelBase.sys.mjs";

/**
 * CalStorageMetaDataModel provides methods for manipulating the metadata stored
 * on items.
 */
export class CalStorageMetaDataModel extends CalStorageModelBase {
  /**
   * Adds meta data for an item.
   *
   * @param {string} id
   * @param {string} value
   */
  addMetaData(id, value) {
    try {
      this.db.prepareStatement(this.statements.mInsertMetaData);
      const params = this.statements.mInsertMetaData.params;
      params.item_id = id;
      params.value = value;
      this.statements.mInsertMetaData.executeStep();
    } catch (e) {
      if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
        this.db.logError("Unknown error!", e);
      } else {
        // The storage service throws an NS_ERROR_ILLEGAL_VALUE in
        // case pval is something complex (i.e not a string or
        // number). Swallow this error, leaving the value empty.
        this.db.logError("Error setting metadata for id " + id + "!", e);
      }
    } finally {
      this.statements.mInsertMetaData.reset();
    }
  }

  /**
   * Deletes meta data for an item using its id.
   */
  deleteMetaDataById(id) {
    this.db.executeSyncItemStatement(this.statements.mDeleteMetaData, "item_id", id);
  }

  /**
   * Gets meta data for an item given its id.
   *
   * @param {string} id
   */
  getMetaData(id) {
    const query = this.statements.mSelectMetaData;
    let value = null;
    try {
      this.db.prepareStatement(query);
      query.params.item_id = id;

      if (query.executeStep()) {
        value = query.row.value;
      }
    } catch (e) {
      this.db.logError("Error getting metadata for id " + id + "!", e);
    } finally {
      query.reset();
    }

    return value;
  }

  /**
   * Returns the meta data for all items.
   *
   * @param {string} key - Specifies which column to return.
   */
  getAllMetaData(key) {
    const query = this.statements.mSelectAllMetaData;
    const results = [];
    try {
      this.db.prepareStatement(query);
      while (query.executeStep()) {
        results.push(query.row[key]);
      }
    } catch (e) {
      this.db.logError(`Error getting all metadata ${key == "item_id" ? "IDs" : "values"} ` + e);
    } finally {
      query.reset();
    }
    return results;
  }
}
