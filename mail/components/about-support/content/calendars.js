/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals CLASS_DATA_PRIVATE */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

let boolean = val => (!val && val !== false ? "" : val);
let string = val => (val ? String(val) : "");

/**
 * A list of tuples for each calendar property displayed where each tuple
 * contains the following elements:
 * 0 - The name of the property passed to getProperty().
 * 1 - A function that accepts the property value and attempts it into a string.
 * 2 - Boolean indicating whether the property is private data (optional).
 */
let gCalendarProperties = [
  ["name", string, true],
  ["type", string],
  ["disabled", boolean],
  ["username", string, true],
  ["uri", string, true],
  ["refreshInterval", string],
  ["readOnly", boolean],
  ["suppressAlarms", boolean],
  ["cache.enabled", boolean],
  ["imip.identity", identity => string(identity && identity.key)],
  ["imip.identity.disabled", boolean],
  ["imip.identity.account", account => string(account && account.key)],
  ["organizerId", string, true],
  ["forceEmailScheduling", boolean],
  ["capabilities.alarms.popup.supported", boolean],
  ["capabilities.alarms.oninviations.supported", boolean],
  ["capabilities.alarms.maxCount", string],
  ["capabilities.attachments.supported", boolean],
  ["capabilities.categories.maxCount", string],
  ["capabilities.privacy.supported", boolean],
  ["capabilities.priority.supported", boolean],
  ["capabilities.events.supported", boolean],
  ["capabilities.tasks.supported", boolean],
  ["capabilities.timezones.floating.supported", boolean],
  ["capabilities.timezones.UTC.supported", boolean],
  ["capabilities.autoschedule.supported", boolean],
];

/**
 * Populates the "Calendars" section of the troubleshooting information page
 * with the properties of each configured calendar.
 */
function populateCalendarsSection() {
  let container = document.getElementById("calendar-tables");
  let tableTmpl = document.getElementById("calendars-table-template");
  let rowTmpl = document.getElementById("calendars-table-row-template");

  for (let calendar of cal.getCalendarManager().getCalendars()) {
    let table = tableTmpl.content.cloneNode(true).querySelector("table");
    table.firstElementChild.textContent = calendar.name;

    let tbody = table.querySelector("tbody");
    for (let [prop, transform, isPrivate] of gCalendarProperties) {
      let tr = rowTmpl.content.cloneNode(true).querySelector("tr");
      let l10nKey = `calendars-table-${prop
        .toLowerCase()
        .replaceAll(".", "-")}`;

      tr.cells[0].setAttribute("data-l10n-id", l10nKey);
      tr.cells[1].textContent = transform(calendar.getProperty(prop));
      if (isPrivate) {
        tr.cells[1].setAttribute("class", CLASS_DATA_PRIVATE);
      }
      tbody.appendChild(tr);
    }
    container.appendChild(table);
  }
}
