/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CalendarFileImporter"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.jsm",
});

/**
 * A module to import iCalendar (.ics) file.
 */
class CalendarFileImporter {
  /**
   * Callback for progress updates.
   *
   * @param {number} current - Current imported items count.
   * @param {number} total - Total items count.
   */
  onProgress = () => {};

  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });

  /**
   * Parse an ics file to an array of items.
   *
   * @param {string} file - The file path of an ics file.
   * @returns {calIItemBase[]}
   */
  async parseIcsFile(file) {
    this._logger.debug(`Getting items from ${file.path}`);
    let importer = Cc["@mozilla.org/calendar/import;1?type=ics"].getService(
      Ci.calIImporter
    );

    let inputStream = Cc[
      "@mozilla.org/network/file-input-stream;1"
    ].createInstance(Ci.nsIFileInputStream);
    let items = [];

    try {
      // 0x01 means MODE_RDONLY.
      inputStream.init(file, 0x01, 0o444, {});
      items = importer.importFromStream(inputStream);
      if (!items.length) {
        throw new Error("noItemsFound");
      }
    } catch (e) {
      this._logger.error(e);
      throw e;
    } finally {
      inputStream.close();
    }

    return items;
  }

  /**
   * Get all calendars that the current user can import items to.
   *
   * @returns {calICalendar[]}
   */
  getTargetCalendars() {
    let calendars = lazy.cal.manager
      .getCalendars()
      .filter(
        calendar =>
          !calendar.getProperty("disabled") &&
          !calendar.readOnly &&
          lazy.cal.acl.userCanAddItemsToCalendar(calendar)
      );
    let sortOrderPref = Services.prefs.getCharPref(
      "calendar.list.sortOrder",
      ""
    );
    let sortOrder = sortOrderPref ? sortOrderPref.split(" ") : [];
    return calendars.sort(
      (x, y) => sortOrder.indexOf(x.id) - sortOrder.indexOf(y.id)
    );
  }

  /**
   * Actually start importing items into a calendar.
   *
   * @param {nsIFile} sourceFile - The source file to import from.
   * @param {calICalendar} targetCalendar - The calendar to import into.
   */
  async startImport(items, targetCalendar) {
    let count = 0;
    let total = items.length;

    this._logger.debug(`Importing ${total} items into ${targetCalendar.name}`);

    for (let item of items) {
      try {
        await targetCalendar.addItem(item);
      } catch (e) {
        this._logger.error(e);
        throw e;
      }

      count++;

      if (count % 10 == 0) {
        this.onProgress(count, total);
        // Give the UI a chance to update the progress bar.
        await new Promise(resolve => lazy.setTimeout(resolve));
      }
    }
    this.onProgress(total, total);
  }
}
