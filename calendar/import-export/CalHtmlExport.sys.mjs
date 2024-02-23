/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * HTML Export Plugin
 */
export function CalHtmlExporter() {
  this.wrappedJSObject = this;
}

CalHtmlExporter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIExporter"]),
  classID: Components.ID("{72d9ab35-9b1b-442a-8cd0-ae49f00b159b}"),

  getFileTypes() {
    const wildmat = "*.html; *.htm";
    const label = cal.l10n.getCalString("filterHtml", [wildmat]);
    return [
      {
        QueryInterface: ChromeUtils.generateQI(["calIFileType"]),
        defaultExtension: "html",
        extensionFilter: wildmat,
        description: label,
      },
    ];
  },

  exportToStream(aStream, aItems, aTitle) {
    const document = cal.xml.parseFile("chrome://calendar/content/printing/calHtmlExport.html");
    const itemContainer = document.getElementById("item-container");
    document.getElementById("title").textContent = aTitle || cal.l10n.getCalString("HTMLTitle");

    // Sort aItems
    aItems.sort((a, b) => {
      const start_a = a[cal.dtz.startDateProp(a)];
      if (!start_a) {
        return -1;
      }
      const start_b = b[cal.dtz.startDateProp(b)];
      if (!start_b) {
        return 1;
      }
      return start_a.compare(start_b);
    });

    for (const item of aItems) {
      const itemNode = document.getElementById("item-template").cloneNode(true);
      itemNode.removeAttribute("id");

      const setupTextRow = function (classKey, propValue, prefixKey) {
        if (propValue) {
          const prefix = cal.l10n.getCalString(prefixKey);
          itemNode.querySelector("." + classKey + "key").textContent = prefix;
          itemNode.querySelector("." + classKey).textContent = propValue;
        } else {
          const row = itemNode.querySelector("." + classKey + "row");
          if (
            row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE
          ) {
            row.nextSibling.remove();
          }
          row.remove();
        }
      };

      const startDate = item[cal.dtz.startDateProp(item)];
      const endDate = item[cal.dtz.endDateProp(item)];
      if (startDate || endDate) {
        // This is a task with a start or due date, format accordingly
        const prefixWhen = cal.l10n.getCalString("htmlPrefixWhen");
        itemNode.querySelector(".intervalkey").textContent = prefixWhen;

        const startNode = itemNode.querySelector(".dtstart");
        const dateString = cal.dtz.formatter.formatItemInterval(item);
        startNode.setAttribute("title", startDate ? startDate.icalString : "none");
        startNode.textContent = dateString;
      } else {
        const row = itemNode.querySelector(".intervalrow");
        row.remove();
        if (
          row.nextSibling &&
          (row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE)
        ) {
          row.nextSibling.remove();
        }
      }

      const itemTitle = item.isCompleted
        ? cal.l10n.getCalString("htmlTaskCompleted", [item.title])
        : item.title;
      setupTextRow("summary", itemTitle, "htmlPrefixTitle");

      setupTextRow("location", item.getProperty("LOCATION"), "htmlPrefixLocation");
      setupTextRow("description", item.getProperty("DESCRIPTION"), "htmlPrefixDescription");

      itemContainer.appendChild(itemNode);
    }

    const templates = document.getElementById("templates");
    templates.remove();

    // Convert the javascript string to an array of bytes, using the utf8 encoder
    const convStream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
      Ci.nsIConverterOutputStream
    );
    convStream.init(aStream, "UTF-8");
    convStream.writeString(cal.xml.serializeDOM(document));
  },
};
