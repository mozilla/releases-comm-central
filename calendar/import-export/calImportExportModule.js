/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calIcsImportExport.js */
/* import-globals-from calHtmlExport.js */
/* import-globals-from calOutlookCSVImportExport.js */
/* import-globals-from calListFormatter.js */
/* import-globals-from calMonthGridPrinter.js */
/* import-globals-from calWeekPrinter.js */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

this.NSGetFactory = cid => {
  let scriptLoadOrder = [
    "resource:///components/calIcsImportExport.js",
    "resource:///components/calHtmlExport.js",
    "resource:///components/calOutlookCSVImportExport.js",

    "resource:///components/calListFormatter.js",
    "resource:///components/calMonthGridPrinter.js",
    "resource:///components/calWeekPrinter.js",
  ];

  for (let script of scriptLoadOrder) {
    Services.scriptloader.loadSubScript(script, this);
  }

  let components = [
    calIcsImporter,
    calIcsExporter,
    calHtmlExporter,
    calOutlookCSVImporter,
    calOutlookCSVExporter,
    calListFormatter,
    calMonthPrinter,
    calWeekPrinter,
  ];

  this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
  return this.NSGetFactory(cid);
};
