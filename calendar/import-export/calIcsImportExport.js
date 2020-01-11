/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * ICS Import and Export Plugin
 */

// Shared functions
function getIcsFileTypes() {
  return [
    {
      QueryInterface: ChromeUtils.generateQI([Ci.calIFileType]),
      defaultExtension: "ics",
      extensionFilter: "*.ics",
      description: cal.l10n.getCalString("filterIcs", ["*.ics"]),
    },
  ];
}

// Importer
function calIcsImporter() {
  this.wrappedJSObject = this;
}

calIcsImporter.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIImporter]),
  classID: Components.ID("{1e3e33dc-445a-49de-b2b6-15b2a050bb9d}"),

  getFileTypes: getIcsFileTypes,

  importFromStream: function(aStream) {
    let parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseFromStream(aStream, null);
    return parser.getItems();
  },
};

// Exporter
function calIcsExporter() {
  this.wrappedJSObject = this;
}

calIcsExporter.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIExporter]),
  classID: Components.ID("{a6a524ce-adff-4a0f-bb7d-d1aaad4adc60}"),

  getFileTypes: getIcsFileTypes,

  exportToStream: function(aStream, aItems, aTitle) {
    let serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
      Ci.calIIcsSerializer
    );
    serializer.addItems(aItems);
    serializer.serializeToStream(aStream);
  },
};
