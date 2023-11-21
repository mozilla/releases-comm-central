/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

window.addEventListener("DOMContentLoaded", onLoad);
function onLoad() {
  const extension = window.arguments[0].extension;
  document.getElementById("provider-name-label").value = extension.name;

  const calendarList = document.getElementById("calendar-list");

  for (const calendar of cal.manager.getCalendars()) {
    if (calendar.providerID != extension.id) {
      continue;
    }

    const item = document.createXULElement("richlistitem");
    item.setAttribute("calendar-id", calendar.id);

    const checkbox = document.createXULElement("checkbox");
    checkbox.classList.add("calendar-selected");
    item.appendChild(checkbox);

    const colorMarker = document.createElement("div");
    colorMarker.classList.add("calendar-color");
    item.appendChild(colorMarker);
    colorMarker.style.backgroundColor = calendar.getProperty("color");

    const label = document.createXULElement("label");
    label.classList.add("calendar-name");
    label.value = calendar.name;
    item.appendChild(label);

    calendarList.appendChild(item);
  }
}

document.addEventListener("dialogaccept", () => {
  // Tell our caller that the extension should be uninstalled.
  const args = window.arguments[0];
  args.shouldUninstall = true;

  const calendarList = document.getElementById("calendar-list");

  // Unsubscribe from all selected calendars
  for (const item of calendarList.children) {
    if (item.querySelector(".calendar-selected").checked) {
      cal.manager.unregisterCalendar(cal.manager.getCalendarById(item.getAttribute("calendar-id")));
    }
  }
});

document.addEventListener("dialogcancel", () => {
  const args = window.arguments[0];
  args.shouldUninstall = false;
});
