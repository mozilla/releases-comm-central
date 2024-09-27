/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

// Shared functions
function getIcsFileTypes() {
  return [
    {
      QueryInterface: ChromeUtils.generateQI(["calIFileType"]),
      defaultExtension: "ics",
      extensionFilter: "*.ics",
      description: lazy.l10n.formatValueSync("filter-ics", { wildmat: "*.ics" }),
    },
  ];
}

export function CalIcsImporter() {
  this.wrappedJSObject = this;
}

/**
 * @implements {calIImporter}
 */
CalIcsImporter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIImporter"]),
  classID: Components.ID("{1e3e33dc-445a-49de-b2b6-15b2a050bb9d}"),

  /**
   * @returns {calIFileType[]}
   */
  getFileTypes: getIcsFileTypes,

  /**
   * @param {nsIInputStream} aStream
   */
  importFromStream(aStream) {
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseFromStream(aStream);
    return parser.getItems();
  },
};

export function CalIcsExporter() {
  this.wrappedJSObject = this;
}

/** @implements {calIExporter} */
CalIcsExporter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIExporter"]),
  classID: Components.ID("{a6a524ce-adff-4a0f-bb7d-d1aaad4adc60}"),

  /**
   * @returns {calIFileType[]}
   */
  getFileTypes: getIcsFileTypes,

  /**
   * Export the items into the stream.
   *
   * @param {nsIOutputStream} stream - The stream to put the data into.
   * @param {calIItemBase[]} items - The items to be exported.
   * @param {?string} title - Title the exporter can choose to use.
   */
  exportToStream(stream, items, title) {
    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );

    if (title) {
      serializer.addProperty(cal.icsService.createIcalPropertyFromString(`NAME:${title}`));
      serializer.addProperty(cal.icsService.createIcalPropertyFromString(`X-WR-CALNAME:${title}`));
    }
    serializer.addItems(items);
    serializer.serializeToStream(stream);
  },
};
