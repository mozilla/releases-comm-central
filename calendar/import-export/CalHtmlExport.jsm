/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalHtmlExporter"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * HTML Export Plugin
 */
function CalHtmlExporter() {
  this.wrappedJSObject = this;
}

CalHtmlExporter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIExporter"]),
  classID: Components.ID("{72d9ab35-9b1b-442a-8cd0-ae49f00b159b}"),

  getFileTypes() {
    let wildmat = "*.html; *.htm";
    let label = cal.l10n.getCalString("filterHtml", [wildmat]);
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
    let document = cal.xml.parseFile("chrome://calendar/content/printing/calHtmlExport.html");
    let itemContainer = document.getElementById("item-container");
    document.getElementById("title").textContent = aTitle || cal.l10n.getCalString("HTMLTitle");

    // Sort aItems
    aItems.sort((a, b) => {
      let start_a = a[cal.dtz.startDateProp(a)];
      if (!start_a) {
        return -1;
      }
      let start_b = b[cal.dtz.startDateProp(b)];
      if (!start_b) {
        return 1;
      }
      return start_a.compare(start_b);
    });

    for (let item of aItems) {
      let itemNode = document.getElementById("item-template").cloneNode(true);
      itemNode.removeAttribute("id");

      let setupTextRow = function(classKey, propValue, prefixKey) {
        if (propValue) {
          let prefix = cal.l10n.getCalString(prefixKey);
          itemNode.querySelector("." + classKey + "key").textContent = prefix;
          itemNode.querySelector("." + classKey).textContent = propValue;
        } else {
          let row = itemNode.querySelector("." + classKey + "row");
          if (
            row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE
          ) {
            row.nextSibling.remove();
          }
          row.remove();
        }
      };

      let startDate = item[cal.dtz.startDateProp(item)];
      let endDate = item[cal.dtz.endDateProp(item)];
      if (startDate || endDate) {
        // This is a task with a start or due date, format accordingly
        let prefixWhen = cal.l10n.getCalString("htmlPrefixWhen");
        itemNode.querySelector(".intervalkey").textContent = prefixWhen;

        let startNode = itemNode.querySelector(".dtstart");
        let dateString = cal.dtz.formatter.formatItemInterval(item);
        startNode.setAttribute("title", startDate ? startDate.icalString : "none");
        startNode.textContent = dateString;
      } else {
        let row = itemNode.querySelector(".intervalrow");
        row.remove();
        if (
          row.nextSibling &&
          (row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE)
        ) {
          row.nextSibling.remove();
        }
      }

      let itemTitle = item.isCompleted
        ? cal.l10n.getCalString("htmlTaskCompleted", [item.title])
        : item.title;
      setupTextRow("summary", itemTitle, "htmlPrefixTitle");

      setupTextRow("location", item.getProperty("LOCATION"), "htmlPrefixLocation");
      setupTextRow("description", item.getProperty("DESCRIPTION"), "htmlPrefixDescription");

      itemContainer.appendChild(itemNode);
    }

    let templates = document.getElementById("templates");
    templates.remove();

    // Convert the javascript string to an array of bytes, using the utf8 encoder
    let convStream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
      Ci.nsIConverterOutputStream
    );
    convStream.init(aStream, "UTF-8");
    convStream.writeString(cal.xml.serializeDOM(document));
  },
};
