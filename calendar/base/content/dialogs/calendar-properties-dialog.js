/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad */

/* import-globals-from ../../../../mail/base/content/utilityOverlay.js */
/* import-globals-from ../calendar-ui-utils.js */
/* import-globals-from calendar-identity-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
/**
 * The calendar to modify, is retrieved from window.arguments[0].calendar
 */
var gCalendar;

window.addEventListener("DOMContentLoaded", onLoad);

/**
 * Called when the calendar properties dialog gets opened. When opening the
 * window, use an object as argument with a 'calendar' property for the
 * calendar in question, and a `canDisable` property for whether to offer
 * disabling/enabling the calendar.
 */
function onLoad() {
  /** @type {{ calendar: calICalendar, canDisable: boolean}} */
  const args = window.arguments[0];

  gCalendar = args.calendar; // eslint-disable-line no-global-assign

  // Some servers provide colors as an 8-character hex string, which the color
  // picker can't handle. Strip the alpha component.
  let calColor = gCalendar.getProperty("color");
  const alphaHex = calColor?.match(/^(#[0-9A-Fa-f]{6})[0-9A-Fa-f]{2}$/);
  if (alphaHex) {
    gCalendar.setProperty("color", alphaHex[1]);
    calColor = alphaHex[1];
  }

  if (args.canDisable && !gCalendar.getProperty("force-disabled")) {
    document.documentElement.setAttribute("canDisable", "true");
  } else {
    document.getElementById("calendar-enabled-checkbox").hidden = true;
  }

  document.getElementById("calendar-name").value = gCalendar.name;
  document.getElementById("calendar-color").value = calColor || "#A8C2E1";
  if (["memory", "storage"].includes(gCalendar.type)) {
    document.getElementById("calendar-uri-row").hidden = true;
  } else {
    document.getElementById("calendar-uri").value = gCalendar.uri.spec;
  }
  document.getElementById("read-only").checked = gCalendar.readOnly;

  if (gCalendar.getProperty("capabilities.username.supported") === true) {
    document.getElementById("calendar-username").value = gCalendar.getProperty("username");
    document.getElementById("calendar-username-row").toggleAttribute("hidden", false);
  } else {
    document.getElementById("calendar-username-row").toggleAttribute("hidden", true);
  }

  // Set up refresh interval
  initRefreshInterval();

  // Set up the cache field
  const cacheBox = document.getElementById("cache");
  const canCache = gCalendar.getProperty("cache.supported") !== false;
  const alwaysCache = gCalendar.getProperty("cache.always");
  if (!canCache || alwaysCache) {
    cacheBox.setAttribute("disable-capability", "true");
    cacheBox.hidden = true;
    cacheBox.disabled = true;
  }
  cacheBox.checked = alwaysCache || (canCache && gCalendar.getProperty("cache.enabled"));

  // Set up the show alarms row and checkbox
  const suppressAlarmsRow = document.getElementById("calendar-suppressAlarms-row");
  const suppressAlarms = gCalendar.getProperty("suppressAlarms");
  document.getElementById("fire-alarms").checked = !suppressAlarms;

  suppressAlarmsRow.toggleAttribute(
    "hidden",
    gCalendar.getProperty("capabilities.alarms.popup.supported") === false
  );

  // Set up the identity and scheduling rows.
  initMailIdentitiesRow(gCalendar);
  notifyOnIdentitySelection(gCalendar);
  initForceEmailScheduling();

  // Set up the disabled checkbox
  let calendarDisabled = false;
  if (gCalendar.getProperty("force-disabled")) {
    document.getElementById("force-disabled-description").removeAttribute("hidden");
    document.getElementById("calendar-enabled-checkbox").setAttribute("disabled", "true");
  } else {
    calendarDisabled = gCalendar.getProperty("disabled");
    document.getElementById("calendar-enabled-checkbox").checked = !calendarDisabled;
    document.querySelector("dialog").getButton("extra1").setAttribute("hidden", "true");
  }
  setupEnabledCheckbox();

  // start focus on title, unless we are disabled
  if (!calendarDisabled) {
    document.getElementById("calendar-name").focus();
  }

  const notificationsSetting = document.getElementById("calendar-notifications-setting");
  notificationsSetting.value = gCalendar.getProperty("notifications.times");
}

/**
 * Called when the dialog is accepted, to save settings.
 */
function onAcceptDialog() {
  // Save calendar name
  gCalendar.name = document.getElementById("calendar-name").value;

  // Save calendar color
  gCalendar.setProperty("color", document.getElementById("calendar-color").value);

  // Save calendar user
  if (gCalendar.getProperty("capabilities.username.supported") === true) {
    gCalendar.setProperty("username", document.getElementById("calendar-username").value);
  }

  // Save readonly state
  gCalendar.readOnly = document.getElementById("read-only").checked;

  // Save supressAlarms
  gCalendar.setProperty("suppressAlarms", !document.getElementById("fire-alarms").checked);

  // Save refresh interval
  if (gCalendar.canRefresh) {
    const value = document.getElementById("calendar-refreshInterval-menulist").value;
    gCalendar.setProperty("refreshInterval", value);
  }

  // Save cache options
  const alwaysCache = gCalendar.getProperty("cache.always");
  if (!alwaysCache) {
    gCalendar.setProperty("cache.enabled", document.getElementById("cache").checked);
  }

  // Save identity and scheduling options.
  saveMailIdentitySelection(gCalendar);
  saveForceEmailScheduling();

  if (!gCalendar.getProperty("force-disabled")) {
    // Save disabled option (should do this last), remove auto-enabled
    gCalendar.setProperty(
      "disabled",
      !document.getElementById("calendar-enabled-checkbox").checked
    );
    gCalendar.deleteProperty("auto-enabled");
  }

  gCalendar.setProperty(
    "notifications.times",
    document.getElementById("calendar-notifications-setting").value
  );
}
// When this event fires, onAcceptDialog might not be the function defined
// above, so call it indirectly.
document.addEventListener("dialogaccept", () => onAcceptDialog());

/**
 * Called when an identity is selected.
 */
function onChangeIdentity() {
  notifyOnIdentitySelection(gCalendar);
  updateForceEmailSchedulingControl();
}

/**
 * When the calendar is disabled, we need to disable a number of other elements
 */
function setupEnabledCheckbox() {
  const isEnabled = document.getElementById("calendar-enabled-checkbox").checked;
  const els = document.getElementsByAttribute("disable-with-calendar", "true");
  for (let i = 0; i < els.length; i++) {
    els[i].disabled = !isEnabled || els[i].getAttribute("disable-capability") == "true";
  }
}

/**
 * Called to unsubscribe from a calendar. The button for this function is not
 * shown unless the provider for the calendar is missing (i.e force-disabled)
 */
document.addEventListener("dialogextra1", () => {
  cal.manager.unregisterCalendar(gCalendar);
  window.close();
});

function initRefreshInterval() {
  function createMenuItem(minutes) {
    const menuitem = document.createXULElement("menuitem");
    menuitem.setAttribute("value", minutes);

    document.l10n.setAttributes(menuitem, "calendar-properties-every-minute", {
      count: minutes,
    });

    return menuitem;
  }

  document
    .getElementById("calendar-refreshInterval-row")
    .toggleAttribute("hidden", !gCalendar.canRefresh);

  if (gCalendar.canRefresh) {
    let refreshInterval = gCalendar.getProperty("refreshInterval");
    if (refreshInterval === null) {
      refreshInterval = 30;
    }

    let foundValue = false;
    const separator = document.getElementById("calendar-refreshInterval-manual-separator");
    const menulist = document.getElementById("calendar-refreshInterval-menulist");
    for (const min of [1, 5, 15, 30, 60]) {
      const menuitem = createMenuItem(min);

      separator.parentNode.insertBefore(menuitem, separator);
      if (refreshInterval == min) {
        menulist.selectedItem = menuitem;
        foundValue = true;
      }
    }

    if (refreshInterval == 0) {
      menulist.selectedItem = document.getElementById("calendar-refreshInterval-manual");
      foundValue = true;
    }

    if (!foundValue) {
      // Special menuitem in case the user changed the value in the config editor.
      const menuitem = createMenuItem(refreshInterval);
      separator.parentNode.insertBefore(menuitem, separator.nextElementSibling);
      menulist.selectedItem = menuitem;
    }
  }
}

/**
 * Open the Preferences tab with global notifications setting.
 */
function showGlobalNotificationsPref() {
  openPreferencesTab("paneCalendar", "calendarNotificationCategory");
}
