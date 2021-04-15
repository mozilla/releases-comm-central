/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function onLoad() {
  let extension = window.arguments[0].extension;
  document.getElementById("provider-name-label").value = extension.name;

  let calendarList = document.getElementById("calendar-list");

  for (let calendar of cal.getCalendarManager().getCalendars()) {
    if (calendar.providerID != extension.id) {
      continue;
    }

    let item = document.createXULElement("richlistitem");
    item.setAttribute("calendar-id", calendar.id);

    let checkbox = document.createXULElement("checkbox");
    checkbox.classList.add("calendar-selected");
    item.appendChild(checkbox);

    let colorMarker = document.createElement("div");
    colorMarker.classList.add("calendar-color");
    item.appendChild(colorMarker);
    colorMarker.style.backgroundColor = calendar.getProperty("color");

    let label = document.createXULElement("label");
    label.classList.add("calendar-name");
    label.value = calendar.name;
    item.appendChild(label);

    calendarList.appendChild(item);
  }
}

document.addEventListener("dialogaccept", () => {
  // Tell our caller that the extension should be uninstalled.
  let args = window.arguments[0];
  args.shouldUninstall = true;

  let calendarList = document.getElementById("calendar-list");

  // Unsubscribe from all selected calendars
  let calMgr = cal.getCalendarManager();
  for (let item of calendarList.children) {
    if (item.querySelector(".calendar-selected").checked) {
      calMgr.unregisterCalendar(calMgr.getCalendarById(item.getAttribute("calendar-id")));
    }
  }
});

document.addEventListener("dialogcancel", () => {
  let args = window.arguments[0];
  args.shouldUninstall = false;
});
