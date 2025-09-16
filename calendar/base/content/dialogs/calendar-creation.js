/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  MsgAuthPrompt: "resource:///modules/MsgAsyncPrompter.sys.mjs",
});

/* exported checkRequired, fillLocationPlaceholder, selectProvider, updateNoCredentials, */

/* import-globals-from calendar-identity-utils.js */

/**
 * For managing dialog button handler state. Stores the current handlers so we
 * can remove them with removeEventListener. Provides a way to look up the
 * button handler functions to be used with a given panel.
 */
var gButtonHandlers = {
  accept: null,
  extra2: null,

  // Maps a panel DOM node ID to the button handlers to use for that panel.
  forNodeId: {
    "panel-select-calendar-type": {
      accept: selectCalendarType,
    },
    "panel-local-calendar-settings": {
      accept: registerLocalCalendar,
      extra2: () => selectPanel("panel-select-calendar-type"),
    },
    "panel-network-calendar-settings": {
      accept: event => {
        event.preventDefault();
        event.stopPropagation();
        findCalendars();
      },
      extra2: () => selectPanel("panel-select-calendar-type"),
    },
    "panel-select-calendars": {
      accept: createNetworkCalendars,
      extra2: () => selectPanel("panel-network-calendar-settings"),
    },
    "panel-addon-calendar-settings": {
      extra2: () => selectPanel("panel-select-calendar-type"),
      // This 'accept' is set dynamically when the calendar type is selected.
      accept: null,
    },
  },
};

/** @type {calICalendar | null} */
var gLocalCalendar = null;

/**
 * A type of calendar that can be created with this dialog.
 *
 * @typedef {CalendarType}
 * @property {string} id              A unique ID for this type, e.g. "local" or
 *                                      "network" for built-in types and
 *                                      "3" or "4" for add-on types.
 * @property {boolean} builtIn        Whether this is a built in type.
 * @property {Function} onSelected    The "accept" button handler to call when
 *                                      the type is selected.
 * @property {string} [label]         Text to use in calendar type selection UI.
 * @property {string} [panelSrc]      The "src" property for the <browser> for
 *                                      this type's settings panel, typically a
 *                                      path to an html document. Only needed
 *                                      for types registered by add-ons.
 * @property {Function} [onCreated]   The "accept" button handler for this
 *                                      type's settings panel. Only needed for
 *                                      types registered by add-ons.
 */

/**
 * Registry of calendar types. The key should match the type's `id` property.
 * Add-ons may register additional types.
 *
 * @type {Map<string, CalendarType>}
 */
var gCalendarTypes = new Map([
  [
    "local",
    {
      id: "local",
      builtIn: true,
      onSelected: () => {
        // Create a local calendar to use, so we can share code with the calendar
        // preferences dialog.
        if (!gLocalCalendar) {
          gLocalCalendar = cal.manager.createCalendar(
            "storage",
            Services.io.newURI("moz-storage-calendar://")
          );

          initMailIdentitiesRow(gLocalCalendar);
          notifyOnIdentitySelection(gLocalCalendar);
        }
        selectPanel("panel-local-calendar-settings");
      },
    },
  ],
  [
    "network",
    {
      id: "network",
      builtIn: true,
      onSelected: () => selectPanel("panel-network-calendar-settings"),
    },
  ],
]);

/** @type {CalendarType | null} */
var gSelectedCalendarType = null;

/**
 * Register a calendar type to offer in the dialog. For add-ons to use. Add-on
 * code should store the returned ID and use it for unregistering the type.
 *
 * @param {CalendarType} type - The type object to register.
 * @returns {string} The generated ID for the type.
 */
function registerCalendarType(type) {
  type.id = String(gCalendarTypes.size + 1);
  type.builtIn = false;

  if (!type.onSelected) {
    type.onSelected = () => selectPanel("panel-addon-calendar-settings");
  }
  gCalendarTypes.set(type.id, type);

  // Add an option for this type to the "select calendar type" panel.
  const radiogroup = document.getElementById("calendar-type");
  const radio = document.createXULElement("radio");
  radio.setAttribute("value", type.id);
  radio.setAttribute("label", type.label);
  radiogroup.appendChild(radio);

  return type.id;
}

/**
 * Unregister a calendar type. For add-ons to use.
 *
 * @param {string} id - The ID of the type to unregister.
 */
function unregisterCalendarType(id) {
  // Don't allow unregistration of built-in types.
  if (gCalendarTypes.get(id)?.builtIn) {
    cal.WARN(
      `calendar creation dialog: unregistering calendar type "${id}"` +
        " failed because it is a built in type"
    );
    return;
  }
  // We are using the size of gCalendarTypes to generate unique IDs for
  // registered types, so don't fully remove the type.
  gCalendarTypes.set(id, undefined);

  // Remove the option for this type from the "select calendar type" panel.
  const radiogroup = document.getElementById("calendar-type");
  const radio = radiogroup.querySelector(`[value="${id}"]`);
  if (radio) {
    radiogroup.removeChild(radio);
  }
}

/**
 * Tools for managing how providers are used for calendar detection. May be used
 * by add-ons to modify which providers are used and which results are preferred.
 */
var gProviderUsage = {
  /**
   * A function that returns a list of provider types to filter out and not use
   * to detect calendars, for a given location and username. The providers are
   * filtered out before calendar detection. For example, the "Provider for
   * Google Calendar" add-on might filter out the "caldav" provider:
   *
   *  (providers, location, username) => {
   *    domain = username.split("@")[1];
   *    if (providers.includes("gdata") && (domain == "googlemail.com" || domain == "gmail.com")) {
   *      return ["caldav"];
   *    }
   *    return [];
   *  }
   *
   * @callback ProviderFilter
   * @param {string[]} providers - Array of provider types to be used (if not filtered out).
   * @param {string} location - Location to use for calendar detection.
   * @param {string} username - Username to use for calendar detection.
   * @returns {string[]} Array of provider types to be filtered out.
   */

  /** @type {ProviderFilter[]} */
  _preDetectFilters: [],

  /**
   * A mapping from a less preferred provider type to a set of more preferred
   * provider types. Used after calendar detection to default to a more
   * preferred provider when there are results from more than one provider.
   *
   * @typedef {Map<string, Set<string>>} ProviderPreferences
   */

  /**
   * @type {ProviderPreferences}
   */
  _postDetectPreferences: new Map(),

  get preDetectFilters() {
    return this._preDetectFilters;
  },

  get postDetectPreferences() {
    return this._postDetectPreferences;
  },

  /**
   * Add a new provider filter function.
   *
   * @param {ProviderFilter} providerFilter
   */
  addPreDetectFilter(providerFilter) {
    this._preDetectFilters.push(providerFilter);
  },

  /**
   * Add a preference for one provider type over another provider type.
   *
   * @param {string} preferredType - The preferred provider type.
   * @param {string} nonPreferredType - The non-preferred provider type.
   */
  addPostDetectPreference(preferredType, nonPreferredType) {
    const prefs = this._postDetectPreferences;

    if (this.detectPreferenceCycle(prefs, preferredType, nonPreferredType)) {
      cal.WARN(
        `Adding a preference for provider type "${preferredType}" over ` +
          `type "${nonPreferredType}" would cause a preference cycle, ` +
          `not adding this preference to prevent a cycle`
      );
    } else {
      const current = prefs.get(nonPreferredType);
      if (current) {
        current.add(preferredType);
      } else {
        prefs.set(nonPreferredType, new Set([preferredType]));
      }
    }
  },

  /**
   * Check whether adding a preference for one provider type over another would
   * cause a cycle in the order of preferences. We assume that the preferences
   * do not contain any cycles already.
   *
   * @param {ProviderPreferences} prefs - The current preferences.
   * @param {string} preferred - Potential preferred provider.
   * @param {string} nonPreferred - Potential non-preferred provider.
   * @returns {boolean} True if it would cause a cycle.
   */
  detectPreferenceCycle(prefs, preferred, nonPreferred) {
    let cycle = false;

    const innerDetect = preferredSet => {
      if (cycle) {
        // Bail out, a cycle has already been detected.
        return;
      } else if (preferredSet.has(nonPreferred)) {
        // A cycle! We have arrived back at the nonPreferred provider type.
        cycle = true;
        return;
      }
      // Recursively check each preferred type.
      for (const item of preferredSet) {
        const nextPreferredSet = prefs.get(item);
        if (nextPreferredSet) {
          innerDetect(nextPreferredSet);
        }
      }
    };

    innerDetect(new Set([preferred]));
    return cycle;
  },
};

// If both ics and caldav results exist, default to the caldav results.
gProviderUsage.addPostDetectPreference("caldav", "ics");

/**
 * Select a specific panel in the dialog. Used to move from one panel to another.
 *
 * @param {string} id - The id of the panel node to select.
 */
function selectPanel(id) {
  for (const element of document.getElementById("calendar-creation-dialog").children) {
    element.hidden = element.id != id;
  }
  const panel = document.getElementById(id);
  updateButton("accept", panel);
  updateButton("extra2", panel);
  selectNetworkStatus("none");
  checkRequired();

  const firstInput = panel.querySelector("input");
  if (firstInput) {
    firstInput.focus();
  }
}

/**
 * Set a specific network loading status for the network settings panel.
 * See the CSS file for appropriate values to set.
 *
 * @param {string} status - The status to set.
 */
function selectNetworkStatus(status) {
  for (const row of document.querySelectorAll(".network-status-row")) {
    row.setAttribute("status", status);
  }
}

/**
 * Update the label, accesskey, and event listener for a dialog button.
 *
 * @param {string} name - The dialog button name, e.g. 'accept', 'extra2'.
 * @param {Element} sourceNode - The source node to take attribute values from.
 */
function updateButton(name, sourceNode) {
  const dialog = document.getElementById("calendar-creation-dialog");
  const button = dialog.getButton(name);
  const label = sourceNode.getAttribute("buttonlabel" + name);
  const accesskey = sourceNode.getAttribute("buttonaccesskey" + name);

  const handler = gButtonHandlers.forNodeId[sourceNode.id][name];

  if (label) {
    button.setAttribute("label", label);
    button.hidden = false;
  } else {
    button.hidden = true;
  }

  button.setAttribute("accesskey", accesskey || "");

  // 'dialogaccept', 'dialogextra2', etc.
  const eventName = "dialog" + name;

  document.removeEventListener(eventName, gButtonHandlers[name]);
  if (handler) {
    document.addEventListener(eventName, handler);
    // Store a reference to the current handler, to allow removing it later.
    gButtonHandlers[name] = handler;
  }
}

/**
 * Update the disabled state of the accept button by checking the values of
 * required fields, based on the current panel.
 */
function checkRequired() {
  const dialog = document.getElementById("calendar-creation-dialog");
  let selectedPanel = null;
  for (const element of dialog.children) {
    if (!element.hidden) {
      selectedPanel = element;
    }
  }
  if (!selectedPanel) {
    dialog.setAttribute("buttondisabledaccept", "true");
    return;
  }

  let disabled = false;
  switch (selectedPanel.id) {
    case "panel-local-calendar-settings":
      disabled = !selectedPanel.querySelector("form").checkValidity();
      break;
    case "panel-network-calendar-settings": {
      const location = document.getElementById("network-location-input");
      const username = document.getElementById("network-username-input");

      disabled = !location.value && !username.value.split("@")[1];
      break;
    }
  }

  if (disabled) {
    dialog.setAttribute("buttondisabledaccept", "true");
  } else {
    dialog.removeAttribute("buttondisabledaccept");
  }
}

/**
 * Update the placeholder text for the network location field. If the username
 * is a valid email address use the domain part of the username, otherwise use
 * the default placeholder.
 */
function fillLocationPlaceholder() {
  const location = document.getElementById("network-location-input");
  const userval = document.getElementById("network-username-input").value;
  const parts = userval.split("@");
  const domain = parts.length == 2 && parts[1] ? parts[1] : null;

  if (domain) {
    location.setAttribute("placeholder", domain);
  } else {
    location.setAttribute("placeholder", location.getAttribute("default-placeholder"));
  }
}

/**
 * Update the select network calendar panel to show or hide the provider
 * selection dropdown.
 *
 * @param {boolean} isSingle - If true, there is just one matching provider.
 */
function setSingleProvider(isSingle) {
  document.getElementById("network-selectcalendar-description-single").hidden = !isSingle;
  document.getElementById("network-selectcalendar-description-multiple").hidden = isSingle;
  document.getElementById("network-selectcalendar-providertype-box").hidden = isSingle;
}

/**
 * Fill the providers menulist with the given provider types. The types must
 * correspond to the providers that detected calendars.
 *
 * @param {string[]} providerTypes - An array of provider types.
 * @returns {Element} The selected menuitem.
 */
function fillProviders(providerTypes) {
  const menulist = document.getElementById("network-selectcalendar-providertype-menulist");
  const popup = menulist.menupopup;
  while (popup.lastChild) {
    popup.removeChild(popup.lastChild);
  }

  const providers = cal.provider.detection.providers;

  for (const type of providerTypes) {
    const provider = providers.get(type);
    const menuitem = document.createXULElement("menuitem");
    menuitem.value = type;
    menuitem.setAttribute("label", provider.displayName || type);
    popup.appendChild(menuitem);
  }

  // Select a provider menu item based on provider preferences.
  const preferredTypes = new Set(providerTypes);

  for (const [nonPreferred, preferredSet] of gProviderUsage.postDetectPreferences) {
    if (preferredTypes.has(nonPreferred) && setsIntersect(preferredSet, preferredTypes)) {
      preferredTypes.delete(nonPreferred);
    }
  }
  const preferredIndex = providerTypes.findIndex(type => preferredTypes.has(type));
  menulist.selectedIndex = preferredIndex == -1 ? 0 : preferredIndex;

  return menulist.selectedItem;
}

/**
 * Return true if the intersection of two sets contains at least one item.
 *
 * @param {Set} setA - A set.
 * @param {Set} setB - A set.
 * @returns {boolean}
 */
function setsIntersect(setA, setB) {
  for (const item of setA) {
    if (setB.has(item)) {
      return true;
    }
  }
  return false;
}

/**
 * Select the given provider and update the calendar list to fill the
 * corresponding calendars. Will use the results from the last findCalendars
 * response.
 *
 * @param {string} type - The provider type to select.
 */
function selectProvider(type) {
  const providerMap = findCalendars.lastResult;
  const calendarList = document.getElementById("network-calendar-list");

  const calendars = providerMap.get(type) || [];
  renderCalendarList(calendarList, calendars);
}

/**
 * Empty a calendar list and then fill it with calendars.
 *
 * @param {Element} calendarList - A richlistbox element for listing calendars.
 * @param {calICalendar[]} calendars - An array of calendars to display in the list.
 */
function renderCalendarList(calendarList, calendars) {
  while (calendarList.hasChildNodes()) {
    calendarList.lastChild.remove();
  }
  calendars.forEach((calendar, index) => {
    const item = document.createXULElement("richlistitem");
    item.calendar = calendar;

    const checkbox = document.createXULElement("checkbox");
    const checkboxId = "checkbox" + index;
    checkbox.id = checkboxId;
    checkbox.classList.add("calendar-selected");
    item.appendChild(checkbox);

    const colorMarker = document.createElement("div");
    colorMarker.classList.add("calendar-color");
    colorMarker.style.backgroundColor = calendar.getProperty("color");
    item.appendChild(colorMarker);

    const label = document.createXULElement("label");
    label.classList.add("calendar-name");
    label.value = calendar.name;
    label.control = checkboxId;
    item.appendChild(label);

    const propertiesButton = document.createXULElement("button");
    propertiesButton.classList.add("calendar-edit-button");
    document.l10n.setAttributes(propertiesButton, "calendar-context-properties");
    propertiesButton.addEventListener("command", openCalendarPropertiesFromEvent);
    item.appendChild(propertiesButton);

    if (calendar.getProperty("disabled")) {
      item.disabled = true;
      item.toggleAttribute("calendar-disabled", true);
      checkbox.disabled = true;
      propertiesButton.disabled = true;
    } else {
      checkbox.checked = true;
    }
    calendarList.appendChild(item);
  });
}

/**
 * Make all enabled calendars' checkboxes checked/unchecked.
 *
 * @param {boolean} checked - Whether the checkboxes should be checked.
 */
function adjustCheckboxesForAllCalendars(checked) {
  for (const item of document.querySelectorAll(
    "#network-calendar-list > richlistitem > checkbox:not([disabled])"
  )) {
    item.checked = checked;
  }
}

/**
 * Update dialog fields based on the value of the "no credentials" checkbox.
 *
 * @param {boolean} noCredentials - True, if "no credentials" is checked.
 */
function updateNoCredentials(noCredentials) {
  if (noCredentials) {
    document.getElementById("network-username-input").setAttribute("disabled", "true");
    document.getElementById("network-username-input").value = "";
  } else {
    document.getElementById("network-username-input").removeAttribute("disabled");
  }
}

/**
 * The accept button event listener for the "select calendar type" panel.
 *
 * @param {Event} event
 */
function selectCalendarType(event) {
  event.preventDefault();
  event.stopPropagation();
  const radiogroup = document.getElementById("calendar-type");
  const calendarType = gCalendarTypes.get(radiogroup.value);

  if (!calendarType.builtIn && calendarType !== gSelectedCalendarType) {
    setUpAddonCalendarSettingsPanel(calendarType);
  }
  gSelectedCalendarType = calendarType;
  calendarType.onSelected();
}

/**
 * Set up the settings panel for calendar types registered by addons.
 *
 * @param {CalendarType} calendarType - The calendar type.
 */
function setUpAddonCalendarSettingsPanel(calendarType) {
  function setUpBrowser(browser, src) {
    // Allow keeping dialog background color without jumping through hoops.
    browser.setAttribute("transparent", "true");
    browser.setAttribute("flex", "1");
    browser.setAttribute("type", "content");
    browser.setAttribute("src", src);
  }
  const panel = document.getElementById("panel-addon-calendar-settings");
  let browser = panel.lastElementChild;

  if (browser) {
    setUpBrowser(browser, calendarType.panelSrc);
  } else {
    browser = document.createXULElement("browser");
    setUpBrowser(browser, calendarType.panelSrc);

    panel.appendChild(browser);
    // The following emit is needed for the browser to work with addon content.
    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
  }

  // Set up the accept button handler for the panel.
  gButtonHandlers.forNodeId["panel-addon-calendar-settings"].accept = calendarType.onCreated;
}

/**
 * Handle change of the email (identity) menu for local calendar creation.
 * Show a notification when "none" is selected.
 *
 * @param {Event} _event - The menu selection event.
 */
function onChangeIdentity(_event) {
  notifyOnIdentitySelection(gLocalCalendar);
}

/**
 * Prepare the local storage calendar with the information from the dialog.
 * This can be monkeypatched to add additional values.
 *
 * @param {calICalendar} calendar - The calendar to prepare.
 * @returns {calICalendar} The same calendar, prepared with any extra values.
 */
function prepareLocalCalendar(calendar) {
  calendar.name = document.getElementById("local-calendar-name-input").value;
  calendar.setProperty("color", document.getElementById("local-calendar-color-picker").value);

  if (!document.getElementById("local-fire-alarms-checkbox").checked) {
    calendar.setProperty("suppressAlarms", true);
  }

  saveMailIdentitySelection(calendar);
  return calendar;
}

/**
 * The accept button event listener for the "local calendar settings" panel.
 * Registers the local storage calendar and closes the dialog.
 */
function registerLocalCalendar() {
  cal.manager.registerCalendar(prepareLocalCalendar(gLocalCalendar));
}

/**
 * Start detection and find any calendars using the information from the
 * network settings panel.
 *
 * @param {string} [password] - The password for this attempt, if any.
 * @param {boolean} [savePassword] - Whether to save the password in the
 *   password manager.
 */
function findCalendars(password, savePassword = false) {
  selectNetworkStatus("loading");
  const username = document.getElementById("network-username-input");
  const location = document.getElementById("network-location-input");
  let locationValue = location.value || username.value.split("@")[1] || "";

  // webcal(s): doesn't work with content principal.
  locationValue = locationValue.replace(/^webcal(s)?(:.*)/, "http$1$2").trim();
  cal.provider.detection
    .detect(
      username.value,
      password,
      locationValue,
      savePassword,
      gProviderUsage.preDetectFilters,
      {}
    )
    .then(onDetectionSuccess, onDetectionError.bind(null, password, locationValue));
}

/**
 * Called when detection successfully finds calendars. Displays the UI for
 * selecting calendars to subscribe to.
 *
 * @param {Map<string, calICalendar[]>} providerMap - Map from provider type
 *   (e.g. "ics", "caldav") to an array of calendars.
 */
function onDetectionSuccess(providerMap) {
  // Disable the calendars the user has already subscribed to. In the future
  // we should show a string when all calendars are already subscribed.
  const existing = new Set(cal.manager.getCalendars({}).map(calendar => calendar.uri.spec));

  const calendarsMap = new Map();
  for (const [provider, calendars] of providerMap.entries()) {
    const newCalendars = calendars.map(calendar => {
      const newCalendar = prepareNetworkCalendar(calendar);
      if (existing.has(calendar.uri.spec)) {
        newCalendar.setProperty("disabled", true);
      }
      return newCalendar;
    });

    calendarsMap.set(provider.type, newCalendars);
  }

  if (!calendarsMap.size) {
    selectNetworkStatus("notfound");
    return;
  }

  // Update the panel with the results from the provider map.
  setSingleProvider(calendarsMap.size <= 1);
  findCalendars.lastResult = calendarsMap;

  const selectedItem = fillProviders([...calendarsMap.keys()]);
  selectProvider(selectedItem.value);

  // Select the panel and validate the fields.
  selectPanel("panel-select-calendars");
  checkRequired();
}

/**
 * Called when detection fails to find any calendars. Show an appropriate
 * error message, or if the error is an authentication error and no password
 * was entered for this attempt, prompt the user to enter a password.
 *
 * @param {string} [password] - The password entered, if any.
 * @param {string} [location] - The location input from the dialog.
 * @param {Error} error - An error object.
 */
function onDetectionError(password, location, error) {
  if (error instanceof cal.provider.detection.AuthFailedError) {
    if (password) {
      selectNetworkStatus("authfail");
    } else {
      findCalendarsWithPassword(location);
      return;
    }
  } else if (error instanceof cal.provider.detection.CertError) {
    selectNetworkStatus("certerror");
  } else if (error instanceof cal.provider.detection.CanceledError) {
    selectNetworkStatus("none");
  } else {
    selectNetworkStatus("notfound");
  }
  cal.ERROR(
    "Error during calendar detection: " +
      `${error.fileName || error.filename}:${error.lineNumber}: ${error}\n${error.stack}`
  );
}

/**
 * Prompt the user for a password and attempt to find calendars with it.
 *
 * @param {string} location - The location input from the dialog.
 */
function findCalendarsWithPassword(location) {
  const password = { value: "" };
  const savePassword = { value: 1 };

  const okWasClicked = new MsgAuthPrompt().promptPassword2(
    null,
    cal.l10n.getAnyString("messenger-mapi", "mapi", "loginText", [location]),
    password,
    MsgAuthPrompt.l10n.formatValueSync("remember-password-checkbox-label"),
    savePassword
  );

  if (okWasClicked) {
    findCalendars(password.value, savePassword.value);
  } else {
    selectNetworkStatus("authfail");
  }
}

/**
 * Make preparations on the given calendar (a detected calendar). This
 * function can be monkeypatched to make general preparations, e.g. for values
 * from additional form fields.
 *
 * @param {calICalendar} calendar - The calendar to prepare.
 * @returns {calICalendar} The same calendar, prepared with any extra values.
 */
function prepareNetworkCalendar(calendar) {
  const cached = document.getElementById("network-cache-checkbox").checked;

  if (!calendar.getProperty("cache.always")) {
    const cacheSupported = calendar.getProperty("cache.supported") !== false;
    calendar.setProperty("cache.enabled", cacheSupported ? cached : false);
  }

  return calendar;
}

/**
 * The accept button handler for the 'select network calendars' panel.
 * Subscribes to all of the selected network calendars and allows the dialog to
 * close.
 */
function createNetworkCalendars() {
  const registeredCalendars = cal.manager.getCalendars();
  for (const listItem of document.getElementById("network-calendar-list").children) {
    if (listItem.querySelector(".calendar-selected").checked) {
      if (registeredCalendars.some(c => c.id == listItem.calendar.id)) {
        // Already registered.
        continue;
      }
      cal.manager.registerCalendar(listItem.calendar);
    }
  }
}

/**
 * Open the calendar properties dialog for a calendar in the calendar list.
 *
 * @param {Event} event - The triggering event.
 */
function openCalendarPropertiesFromEvent(event) {
  const listItem = event.target.closest("richlistitem");
  if (listItem) {
    const calendar = listItem.calendar;
    if (calendar && !calendar.getProperty("disabled")) {
      cal.window.openCalendarProperties(window, { calendar, canDisable: false });

      // Update the calendar list item.
      listItem.querySelector(".calendar-name").value = calendar.name;
      listItem.querySelector(".calendar-color").style.backgroundColor =
        calendar.getProperty("color");
    }
  }
}

window.addEventListener("load", () => {
  fillLocationPlaceholder();
  selectPanel("panel-select-calendar-type");
  if (window.arguments[0]) {
    const spec = window.arguments[0].spec;
    if (/^webcals?:\/\//.test(spec)) {
      selectPanel("panel-network-calendar-settings");
      document.getElementById("network-location-input").value = spec;
      checkRequired();
    }
  }
  document.getElementById("selectcalendars-all").addEventListener("click", () => {
    adjustCheckboxesForAllCalendars(true);
  });
  document.getElementById("selectcalendars-none").addEventListener("click", () => {
    adjustCheckboxesForAllCalendars(false);
  });
});
