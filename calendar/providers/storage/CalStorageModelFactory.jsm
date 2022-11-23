/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalStorageModelFactory"];

var { CalStorageItemModel } = ChromeUtils.import(
  "resource:///modules/calendar/CalStorageItemModel.jsm"
);
var { CalStorageCachedItemModel } = ChromeUtils.import(
  "resource:///modules/calendar/CalStorageCachedItemModel.jsm"
);
var { CalStorageOfflineModel } = ChromeUtils.import(
  "resource:///modules/calendar/CalStorageOfflineModel.jsm"
);
var { CalStorageMetaDataModel } = ChromeUtils.import(
  "resource:///modules/calendar/CalStorageMetaDataModel.jsm"
);

/**
 * CalStorageModelFactory provides a convenience method for creating instances
 * of the storage calendar models. Use to avoid having to import each one
 * directly.
 */
class CalStorageModelFactory {
  /**
   * Creates an instance of a CalStorageModel for the specified type.
   *
   * @param {"item"|"offline"|"metadata"} type - The model type desired.
   * @param {mozIStorageAsyncConnection} db - The database connection to use.
   * @param {CalStorageStatement} stmts
   * @param {CalStorageCalendar} calendar - The calendar associated with the
   *                                             model.
   */
  static createInstance(type, db, stmts, calendar) {
    switch (type) {
      case "item":
        return new CalStorageItemModel(db, stmts, calendar);

      case "cached-item":
        return new CalStorageCachedItemModel(db, stmts, calendar);

      case "offline":
        return new CalStorageOfflineModel(db, stmts, calendar);

      case "metadata":
        return new CalStorageMetaDataModel(db, stmts, calendar);
    }

    throw new Error(`Unknown model type "${type}" specified!`);
  }
}
