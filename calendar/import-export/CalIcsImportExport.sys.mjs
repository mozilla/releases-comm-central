/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

// Shared functions
function getIcsFileTypes() {
  return [
    {
      QueryInterface: ChromeUtils.generateQI(["calIFileType"]),
      defaultExtension: "ics",
      extensionFilter: "*.ics",
      description: cal.l10n.getCalString("filterIcs", ["*.ics"]),
    },
  ];
}

export function CalIcsImporter() {
  this.wrappedJSObject = this;
}

CalIcsImporter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIImporter"]),
  classID: Components.ID("{1e3e33dc-445a-49de-b2b6-15b2a050bb9d}"),

  getFileTypes: getIcsFileTypes,

  importFromStream(aStream) {
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseFromStream(aStream);
    return parser.getItems();
  },
};

export function CalIcsExporter() {
  this.wrappedJSObject = this;
}

CalIcsExporter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIExporter"]),
  classID: Components.ID("{a6a524ce-adff-4a0f-bb7d-d1aaad4adc60}"),

  getFileTypes: getIcsFileTypes,

  exportToStream(aStream, aItems, aTitle) {
    const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems(aItems);
    serializer.serializeToStream(aStream);
  },
};
