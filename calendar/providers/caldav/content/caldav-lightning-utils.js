/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported caldavInitForceEmailScheduling, caldavSaveForceEmailScheduling,
 *          caldavUpdateForceEmailSchedulingControl
 */

/* import-globals-from ../../../lightning/content/lightning-utils.js */
/* globals gCalendar */

/**
 * Initializing calendar creation wizard and properties dialog to display the
 * option to enforce email scheduling for outgoing scheduling operations
 * (shared between calendar creation wizard and properties dialog)
 */
function caldavInitForceEmailScheduling() {
  if (gCalendar && gCalendar.type == "caldav") {
    let checkbox = document.getElementById("force-email-scheduling");
    let curStatus = checkbox.getAttribute("checked") == "true";
    let newStatus = gCalendar.getProperty("forceEmailScheduling") || curStatus;
    if (curStatus != newStatus) {
      if (newStatus) {
        checkbox.setAttribute("checked", "true");
      } else {
        checkbox.removeAttribute("checked");
      }
    }
    caldavUpdateForceEmailSchedulingControl();
  } else {
    document.getElementById("calendar-force-email-scheduling-row").toggleAttribute("hidden", true);
  }
}

/**
 * Persisting the calendar property to enforce email scheduling
 * (shared between calendar creation wizard and properties dialog)
 */
function caldavSaveForceEmailScheduling() {
  if (gCalendar && gCalendar.type == "caldav") {
    let checkbox = document.getElementById("force-email-scheduling");
    if (checkbox && checkbox.getAttribute("disable-capability") != "true") {
      let status = checkbox.getAttribute("checked") == "true";
      gCalendar.setProperty("forceEmailScheduling", status);
    }
  }
}

/**
 * Updates the forceEmailScheduling control based on the currently assigned
 * email identity to this calendar
 * (shared between calendar creation wizard and properties dialog)
 */
function caldavUpdateForceEmailSchedulingControl() {
  let checkbox = document.getElementById("force-email-scheduling");
  if (
    gCalendar &&
    gCalendar.getProperty("capabilities.autoschedule.supported") &&
    ltnGetMailIdentitySelection() != "none"
  ) {
    checkbox.removeAttribute("disable-capability");
    checkbox.removeAttribute("disabled");
  } else {
    checkbox.setAttribute("disable-capability", "true");
    checkbox.setAttribute("disabled", "true");
  }
}
