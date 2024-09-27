/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

/**
 * A module to import iCalendar (.ics) file.
 */
export class CalendarFileImporter {
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
    const importer = Cc["@mozilla.org/calendar/import;1?type=ics"].getService(
      Ci.calIImporter
    );

    const inputStream = Cc[
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
      this._logger.error(`Import from ${file.path} FAILED!`, e);
      throw e;
    } finally {
      inputStream.close();
    }

    // Sort the items by when they occur and their name, because that's a
    // logical way to present them to the user.
    const collator = new Intl.Collator(undefined, { numeric: true });
    items.sort((a, b) => {
      const aStartDate =
        a.startDate?.nativeTime ||
        a.entryDate?.nativeTime ||
        a.dueDate?.nativeTime ||
        Number.MAX_SAFE_INTEGER;
      const bStartDate =
        b.startDate?.nativeTime ||
        b.entryDate?.nativeTime ||
        b.dueDate?.nativeTime ||
        Number.MAX_SAFE_INTEGER;
      return aStartDate - bStartDate || collator.compare(a.title, b.title);
    });

    return items;
  }

  /**
   * Get all calendars that the current user can import items to.
   *
   * @returns {calICalendar[]}
   */
  getTargetCalendars() {
    const calendars = lazy.cal.manager
      .getCalendars()
      .filter(
        calendar =>
          !calendar.getProperty("disabled") &&
          !calendar.readOnly &&
          lazy.cal.acl.userCanAddItemsToCalendar(calendar)
      );
    const sortOrderPref = Services.prefs.getCharPref(
      "calendar.list.sortOrder",
      ""
    );
    const sortOrder = sortOrderPref ? sortOrderPref.split(" ") : [];
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
    const total = items.length;

    this._logger.debug(`Importing ${total} items into ${targetCalendar.name}`);

    for (const item of items) {
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
