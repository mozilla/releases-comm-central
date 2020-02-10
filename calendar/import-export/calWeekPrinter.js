/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * Prints a two column view of a week of events, much like a paper day-planner
 */
function calWeekPrinter() {
  this.wrappedJSObject = this;
}

calWeekPrinter.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIPrintFormatter]),
  classID: Components.ID("{2d6ec97b-9109-4b92-89c5-d4b4806619ce}"),

  get name() {
    return cal.l10n.getCalString("weekPrinterName");
  },

  formatToHtml: function(aStream, aStart, aEnd, aItems, aTitle) {
    let document = cal.xml.parseFile("chrome://calendar/skin/shared/printing/calWeekPrinter.html");
    let defaultTimezone = cal.dtz.defaultTimezone;

    // Set page title
    document.getElementById("title").textContent = aTitle;

    cal.view.colorTracker.addColorsToDocument(document);

    // Table that maps YYYY-MM-DD to the DOM node container where items are to be added
    let dayTable = {};
    let weekInfoService = cal.getWeekInfoService();

    // Make sure to create tables from start to end, if passed
    if (aStart && aEnd) {
      for (
        let current = weekInfoService.getStartOfWeek(aStart);
        current.compare(aEnd) < 0;
        current.day += 7
      ) {
        this.setupWeek(document, current, dayTable);
      }
    }

    for (let item of aItems) {
      let itemStartDate = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
      let itemEndDate = item[cal.dtz.endDateProp(item)] || item[cal.dtz.startDateProp(item)];

      if (!itemStartDate && !itemEndDate) {
        cal.print.addItemToDayboxNodate(document, item);
        continue;
      }
      itemStartDate = itemStartDate.getInTimezone(defaultTimezone);
      itemEndDate = itemEndDate.getInTimezone(defaultTimezone);

      let boxDate = itemStartDate.clone();
      boxDate.isDate = true;
      for (boxDate; boxDate.compare(itemEndDate) < (itemEndDate.isDate ? 0 : 1); boxDate.day++) {
        // Ignore items outside of the range, i.e tasks without start date
        // where the end date is somewhere else.
        if (
          aStart &&
          aEnd &&
          boxDate &&
          (boxDate.compare(aStart) < 0 || boxDate.compare(aEnd) >= 0)
        ) {
          continue;
        }

        let boxDateKey = cal.print.getDateKey(boxDate);

        if (!(boxDateKey in dayTable)) {
          // Doesn't exist, we need to create a new table for it
          let startOfWeek = weekInfoService.getStartOfWeek(boxDate);
          this.setupWeek(document, startOfWeek, dayTable);
        }

        cal.print.addItemToDaybox(document, item, boxDate, dayTable[boxDateKey]);
      }
    }

    // Remove templates from HTML, no longer needed
    let templates = document.getElementById("templates");
    templates.remove();

    // Stream out the resulting HTML
    let html = cal.xml.serializeDOM(document);
    let convStream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
      Ci.nsIConverterOutputStream
    );
    convStream.init(aStream, "UTF-8");
    convStream.writeString(html);
  },

  setupWeek: function(document, startOfWeek, dayTable) {
    const weekdayMap = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    let weekTemplate = document.getElementById("week-template");
    let weekContainer = document.getElementById("week-container");
    let defaultTimezone = cal.dtz.defaultTimezone;

    // Clone the template week and make sure it doesn't have an id
    let currentPage = weekTemplate.cloneNode(true);
    currentPage.removeAttribute("id");
    currentPage.item = startOfWeek.clone();

    // Set up the week number title
    let weekInfo = cal.getWeekInfoService();
    let dateFormatter = cal.getDateFormatter();
    let weekno = weekInfo.getWeekTitle(startOfWeek);
    let weekTitle = cal.l10n.getCalString("WeekTitle", [weekno]);
    currentPage.querySelector(".week-number").textContent = weekTitle;

    // Set up the day boxes
    let endOfWeek = weekInfo.getEndOfWeek(startOfWeek);
    for (
      let currentDate = startOfWeek.clone();
      currentDate.compare(endOfWeek) <= 0;
      currentDate.day++
    ) {
      let weekday = currentDate.weekday;
      let weekdayName = weekdayMap[weekday];
      let dayOffPrefName = "calendar.week.d" + weekday + weekdayName + "soff";
      dayTable[cal.print.getDateKey(currentDate)] = currentPage.querySelector(
        "." + weekdayName + "-container"
      );

      let titleNode = currentPage.querySelector("." + weekdayName + "-title");
      titleNode.textContent = dateFormatter.formatDateLong(
        currentDate.getInTimezone(defaultTimezone)
      );

      if (Services.prefs.getBoolPref(dayOffPrefName, false)) {
        let daysOffNode = currentPage.querySelector("." + weekdayName + "-box");
        daysOffNode.className += " day-off";
      }
    }

    // Now insert the week into the week container, sorting by date (and therefore week number)
    function compareDates(a, b) {
      return !a || !b ? -1 : a.compare(b);
    }

    cal.data.binaryInsertNode(weekContainer, currentPage, currentPage.item, compareDates);
  },
};
