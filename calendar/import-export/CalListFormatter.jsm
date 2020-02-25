/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalListFormatter"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * A thin wrapper around the html list exporter for the list print format.
 */
function CalListFormatter() {
  this.wrappedJSObject = this;
}

CalListFormatter.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIPrintFormatter]),
  classID: Components.ID("{9ae04413-fee3-45b9-8bbb-1eb39a4cbd1b}"),

  get name() {
    return cal.l10n.getCalString("formatListName");
  },

  formatToHtml(aStream, aStart, aEnd, aItems, aTitle) {
    let htmlexporter = Cc["@mozilla.org/calendar/export;1?type=htmllist"].createInstance(
      Ci.calIExporter
    );
    htmlexporter.exportToStream(aStream, aItems, aTitle);
  },
};
