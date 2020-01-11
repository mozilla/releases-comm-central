/* -*- Mode: javascript; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, initLocationPage, initCustomizePage, onSelectProvider,
 *          onInitialAdvance, doCreateCalendar, setCanRewindFalse
 */

/* global MozElements */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var gCalendar;

var errorConstants = {
  SUCCESS: 0,
  INVALID_URI: 1,
  ALREADY_EXISTS: 2,
};

var l10nStrings = {};
l10nStrings[errorConstants.SUCCESS] = "";
l10nStrings[errorConstants.INVALID_URI] = cal.l10n.getString(
  "calendarCreation",
  "error.invalidUri"
);
l10nStrings[errorConstants.ALREADY_EXISTS] = cal.l10n.getString(
  "calendarCreation",
  "error.alreadyExists"
);

var gNotification = {};
XPCOMUtils.defineLazyGetter(gNotification, "notificationbox", () => {
  return new MozElements.NotificationBox(element => {
    element.setAttribute("flex", "1");
    document.getElementById("calendar-notification-location").append(element);
  });
});

function onLoad() {
  // The functions referred to here are not the ones in this file,
  // that's why this code is in an onload handler.
  // See lightning-calendar-creation.js.
  let initialPage = document.getElementById("initialPage");
  initialPage.addEventListener("pageshow", checkRequired);
  initialPage.addEventListener("pageadvanced", onInitialAdvance);

  let locationPage = document.getElementById("locationPage");
  locationPage.addEventListener("pageshow", initLocationPage);
  locationPage.addEventListener("pageadvanced", prepareCreateCalendar);

  let customizePage = document.getElementById("customizePage");
  customizePage.addEventListener("pageshow", initCustomizePage);
  customizePage.addEventListener("pageadvanced", doCreateCalendar);

  let finishPage = document.getElementById("finishPage");
  finishPage.addEventListener("pageshow", setCanRewindFalse);
}

/**
 * Initialize the location page
 */
function initLocationPage() {
  checkRequired();
}

/**
 * Initialize the customize page
 */
function initCustomizePage() {
  initNameFromURI();
  checkRequired();

  let suppressAlarmsRow = document.getElementById("customize-suppressAlarms-row");
  suppressAlarmsRow.toggleAttribute(
    "hidden",
    gCalendar && gCalendar.getProperty("capabilities.alarms.popup.supported") === false
  );
  document.getElementById("calendar-color").value = "#A8C2E1";
}

/**
 * Sets up notifications for the location page. On aReason == SUCCESS, all
 * notifications are removed. Otherwise, the respective notification is added to
 * the notification box. Only one notification per reason will be shown.
 *
 * @param {errorConstants} aReason   The reason of notification, one of |errorConstants|.
 */
function setNotification(aReason) {
  if (aReason == errorConstants.SUCCESS) {
    gNotification.notificationbox.removeAllNotifications();
  } else {
    let existingBox = gNotification.notificationbox.getNotificationWithValue(aReason);
    if (!existingBox) {
      gNotification.notificationbox.appendNotification(
        l10nStrings[aReason],
        aReason,
        null,
        gNotification.notificationbox.PRIORITY_WARNING_MEDIUM,
        null
      );
      gNotification.notificationbox
        .getNotificationWithValue(aReason)
        .setAttribute("hideclose", "true");
    }
  }
}

/**
 * Called when a provider is selected in the network calendar list. Makes sure
 * the page is set up for the provider.
 *
 * @param {string} type   The provider type selected
 */
function onSelectProvider(type) {
  let cache = document.getElementById("cache");
  let tempCal;
  try {
    tempCal = Cc["@mozilla.org/calendar/calendar;1?type=" + type].createInstance(Ci.calICalendar);
  } catch (e) {
    // keep tempCal undefined if the calendar can not be created
  }

  document
    .getElementById("calendar-username-row")
    .toggleAttribute(
      "hidden",
      !(tempCal && tempCal.getProperty("capabilities.username.supported") === true)
    );

  if (tempCal && tempCal.getProperty("cache.always")) {
    cache.oldValue = cache.checked;
    cache.checked = true;
    cache.disabled = true;
  } else {
    if (cache.oldValue !== undefined) {
      cache.checked = cache.oldValue;
      cache.oldValue = undefined;
    }
    cache.disabled = false;
  }
}

/**
 * Checks if the required information is set so that the wizard can advance. On
 * an error, notifications are shown and the wizard can not be advanced.
 */
function checkRequired() {
  let canAdvance = true;
  let curPage = document.querySelector("wizard").currentPage;
  if (curPage) {
    let eList = curPage.getElementsByAttribute("required", "required");
    for (let i = 0; i < eList.length && canAdvance; ++i) {
      canAdvance = eList[i].value != "";
    }

    if (
      canAdvance &&
      document.getElementById("calendar-uri").value &&
      curPage.pageid == "locationPage"
    ) {
      // eslint-disable-next-line array-bracket-spacing
      let [reason] = parseUri(document.getElementById("calendar-uri").value);
      canAdvance = reason == errorConstants.SUCCESS;
      setNotification(reason);
    } else {
      gNotification.notificationbox.removeAllNotifications();
    }
    document.querySelector("wizard").canAdvance = canAdvance;
  }
}

/**
 * Handler function called when the advance button is pressed on the initial
 * wizard page
 */
function onInitialAdvance() {
  let type = document.getElementById("calendar-type").selectedItem.value;
  let page = document.getElementsByAttribute("pageid", "initialPage")[0];
  if (type == "local") {
    prepareCreateCalendar();
    page.next = "customizePage";
  } else {
    page.next = "locationPage";
  }
}

/**
 * Create the calendar, so that the customize page can already check for
 * calendar capabilities of the provider.
 */
function prepareCreateCalendar(event) {
  gCalendar = null;

  let provider;
  let url;
  let reason;
  let type = document.getElementById("calendar-type").selectedItem.value;
  if (type == "local") {
    provider = "storage";
    [reason, url] = parseUri("moz-storage-calendar://");
  } else {
    provider = document.getElementById("calendar-format").selectedItem.value;
    [reason, url] = parseUri(document.getElementById("calendar-uri").value);
  }

  if (reason != errorConstants.SUCCESS || !url) {
    event.preventDefault();
  }

  try {
    gCalendar = cal.getCalendarManager().createCalendar(provider, url);
  } catch (ex) {
    dump(ex);
    event.preventDefault();
  }
}

/**
 * The actual process of registering the created calendar.
 */
function doCreateCalendar() {
  let cal_name = document.getElementById("calendar-name").value;
  let cal_color = document.getElementById("calendar-color").value;

  gCalendar.name = cal_name;
  gCalendar.setProperty("color", cal_color);
  if (!gCalendar.getProperty("cache.always")) {
    gCalendar.setProperty(
      "cache.enabled",
      gCalendar.getProperty("cache.supported") === false
        ? false
        : document.getElementById("cache").checked
    );
  }

  if (gCalendar.getProperty("capabilities.username.supported") === true) {
    gCalendar.setProperty("username", document.getElementById("calendar-username").value);
  }

  if (!document.getElementById("fire-alarms").checked) {
    gCalendar.setProperty("suppressAlarms", true);
  }

  cal.getCalendarManager().registerCalendar(gCalendar);
  return true;
}

/**
 * Initializes the calendar name from its uri
 */
function initNameFromURI() {
  let path = document.getElementById("calendar-uri").value;
  let nameField = document.getElementById("calendar-name");
  if (!path || nameField.value) {
    return;
  }

  let fullPathRegex = new RegExp("([^/:]+)[.]ics$");
  let captures = path.match(fullPathRegex);
  if (captures && captures.length >= 1) {
    nameField.value = decodeURIComponent(captures[1]);
  }
}

/**
 * Parses the given uri value to check if it is valid and there is not already
 * a calendar with this uri.
 *
 * @param {string} aUri     The string to parse as an uri.
 * @return [error, uri]     |error| is the error code from errorConstants,
 *                          |uri| the parsed nsIURI, or null on error.
 */
function parseUri(aUri) {
  let uri;
  try {
    // Test if the entered uri can be parsed.
    uri = Services.io.newURI(aUri);
  } catch (ex) {
    return [errorConstants.INVALID_URI, null];
  }

  let calManager = cal.getCalendarManager();
  let cals = calManager.getCalendars();
  let type = document.getElementById("calendar-type").selectedItem.value;
  if (type != "local" && cals.some(calendar => calendar.uri.spec == uri.spec)) {
    // If the calendar is not local, we check if there is already a calendar
    // with the same uri spec. Storage calendars all have the same uri, so
    // we have to specialcase them.
    return [errorConstants.ALREADY_EXISTS, null];
  }

  return [errorConstants.SUCCESS, uri];
}

/**
 * Disables the back button, in case we are far enough that its not possible to
 * undo.
 */
function setCanRewindFalse() {
  document.querySelector("wizard").canRewind = false;
}
