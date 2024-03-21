/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MsgAccountManager, MozElements */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
  AccountCreationUtils:
    "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

var { gAccountSetupLogger } = AccountCreationUtils;

// AbortController to handle timeouts and abort the fetch requests.
var gAbortController;
var RETRY_TIMEOUT = 5000; // 5 seconds
var CONNECTION_TIMEOUT = 15000; // 15 seconds
var MAX_SMALL_ADDRESSES = 2;

// Keep track of the prefers-reduce-motion media query for JS based animations.
var gReducedMotion;

// The main 3 Pane Window that we need to define on load in order to properly
// update the UI when a new account is created.
var gMainWindow;

// Define window event listeners.
window.addEventListener("load", () => {
  gAccountProvisioner.onLoad();
});
window.addEventListener("unload", () => {
  gAccountProvisioner.onUnload();
});

// Object to collect all the extra providers attributes to be used when
// building the URL for the API call to purchase an item.
var storedData = {};

/**
 * Helper method to split a value based on its first available blank space.
 *
 * @param {string} str - The string to split.
 * @returns {Array} - An array with the generated first and last name.
 */
function splitName(str) {
  const i = str.lastIndexOf(" ");
  if (i >= 1) {
    return [str.substring(0, i), str.substring(i + 1)];
  }
  return [str, ""];
}

/**
 * Quick and simple HTML sanitization.
 *
 * @param {string} inputID - The ID of the currently used input field.
 * @returns {string} - The HTML sanitized input value.
 */
function sanitizeName(inputID) {
  const div = document.createElement("div");
  div.textContent = document.getElementById(inputID).value;
  return div.innerHTML.trim();
}

/**
 * Replace occurrences of placeholder with the given node
 *
 * @param aTextContainer {Node} - DOM node containing the text child
 * @param aTextNode {Node} - Text node containing the text, child of the aTextContainer
 * @param aPlaceholder {String} - String to look for in aTextNode's textContent
 * @param aReplacement {Node} - DOM node to insert instead of the found replacement
 */
function insertHTMLReplacement(
  aTextContainer,
  aTextNode,
  aPlaceholder,
  aReplacement
) {
  if (aTextNode.textContent.includes(aPlaceholder)) {
    const placeIndex = aTextNode.textContent.indexOf(aPlaceholder);
    const restNode = aTextNode.splitText(placeIndex + aPlaceholder.length);
    aTextContainer.insertBefore(aReplacement, restNode);
    const placeholderNode = aTextNode.splitText(placeIndex);
    placeholderNode.remove();
  }
}

/**
 * This is our controller for the entire account provisioner setup process.
 */
var gAccountProvisioner = {
  // If the setup wizard has already been initialized.
  _isInited: false,
  // If the data fetching of the providers is currently in progress.
  _isLoadingProviders: false,
  // If the providers have already been loaded.
  _isLoadedProviders: false,
  // Store a timeout retry in case fetching the providers fails.
  _loadProviderRetryId: null,
  // Array containing all fetched providers.
  allProviders: [],
  // Array containing all fetched provider names that only offer email.
  mailProviders: [],
  // Array containing all fetched provider names that also offer custom domain.
  domainProviders: [],
  // Handle a timeout to abort the fetch requests.
  timeoutId: null,

  /**
   * Returns the URL for retrieving suggested names from the selected providers.
   */
  get suggestFromName() {
    return Services.prefs.getCharPref("mail.provider.suggestFromName");
  },

  /**
   * Initialize the main notification box for the account setup process.
   */
  get notificationBox() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "top");
        document
          .getElementById("accountProvisionerNotifications")
          .append(element);
      });
    }
    return this._notificationBox;
  },

  /**
   * Clear currently running async fetches and reset important variables.
   */
  onUnload() {
    this.clearAbortTimeout();
    gAbortController.abort();
    gAbortController = null;
  },

  async onLoad() {
    // We can only init once, so bail out if we've been called again.
    if (this._isInited) {
      return;
    }

    gAccountSetupLogger.debug("Initializing provisioner wizard");
    gReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Store the main window.
    gMainWindow = Services.wm.getMostRecentWindow("mail:3pane");

    // Initialize the fetch abort controller.
    gAbortController = new AbortController();

    // If we have a name stored, populate the search field with it.
    if ("@mozilla.org/userinfo;1" in Cc) {
      const userInfo = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo);
      // Assume that it's a genuine full name if it includes a space.
      if (userInfo.fullname.includes(" ")) {
        document.getElementById("mailName").value = userInfo.fullname;
        document.getElementById("domainName").value = userInfo.fullname;
      }
    }

    this.setupEventListeners();
    await this.tryToFetchProviderList();

    gAccountSetupLogger.debug("Provisioner wizard init complete.");

    // Move the focus on the first available field.
    document.getElementById("mailName").focus();
    this._isInited = true;

    Services.telemetry.scalarAdd("tb.account.opened_account_provisioner", 1);

    UIDensity.registerWindow(window);
    UIFontSize.registerWindow(window);
  },

  /**
   * Set up the event listeners for the static elements in the page.
   */
  setupEventListeners() {
    document.getElementById("cancelButton").onclick = () => {
      window.close();
    };

    document.getElementById("existingButton").onclick = () => {
      window.close();
      gMainWindow.postMessage("open-account-setup-tab", "*");
    };

    document.getElementById("backButton").onclick = () => {
      this.backToSetupView();
    };
  },

  /**
   * Return to the initial view without resetting any existing data.
   */
  backToSetupView() {
    this.clearAbortTimeout();
    this.clearNotifications();

    // Clear search results.
    const mailResultsArea = document.getElementById("mailResultsArea");
    while (mailResultsArea.hasChildNodes()) {
      mailResultsArea.lastChild.remove();
    }
    const domainResultsArea = document.getElementById("domainResultsArea");
    while (domainResultsArea.hasChildNodes()) {
      domainResultsArea.lastChild.remove();
    }

    // Update the UI to show the initial view.
    document.getElementById("mailSearch").hidden = false;
    document.getElementById("domainSearch").hidden = false;
    document.getElementById("mailSearchResults").hidden = true;
    document.getElementById("domainSearchResults").hidden = true;

    // Update the buttons visibility.
    document.getElementById("backButton").hidden = true;
    document.getElementById("cancelButton").hidden = false;
    document.getElementById("existingButton").hidden = false;

    // Move the focus back on the first available field.
    document.getElementById("mailName").focus();
  },

  /**
   * Show a loading notification.
   */
  async startLoadingState(stringName) {
    this.clearNotifications();

    const notificationMessage = await document.l10n.formatValue(stringName);

    gAccountSetupLogger.debug(`Status msg: ${notificationMessage}`);

    const notification = await this.notificationBox.appendNotification(
      "accountSetupLoading",
      {
        label: notificationMessage,
        priority: this.notificationBox.PRIORITY_INFO_LOW,
      },
      null
    );
    notification.setAttribute("align", "center");

    // Hide the close button to prevent dismissing the notification.
    notification.dismissable = false;

    this.ensureVisibleNotification();
  },

  /**
   * Show an error notification in case something went wrong.
   *
   * @param {string} stringName - The name of the fluent string that needs to
   *   be attached to the notification.
   * @param {boolean} isMsgError - True if the message comes from a server error
   *   response or try/catch.
   */
  async showErrorNotification(stringName, isMsgError) {
    gAccountSetupLogger.debug(`Status error: ${stringName}`);

    // Always remove any leftover notification before creating a new one.
    this.clearNotifications();

    // Fetch the fluent string only if this is not an error message coming from
    // a previous method.
    const notificationMessage = isMsgError
      ? stringName
      : await document.l10n.formatValue(stringName);

    const notification = await this.notificationBox.appendNotification(
      "accountProvisionerError",
      {
        label: notificationMessage,
        priority: this.notificationBox.PRIORITY_WARNING_MEDIUM,
      },
      null
    );

    // Hide the close button to prevent dismissing the notification.
    notification.dismissable = false;

    this.ensureVisibleNotification();
  },

  async showSuccessNotification(stringName) {
    // Always remove any leftover notification before creating a new one.
    this.clearNotifications();

    const notification = await this.notificationBox.appendNotification(
      "accountProvisionerSuccess",
      {
        label: await document.l10n.formatValue(stringName),
        priority: this.notificationBox.PRIORITY_WARNING_MEDIUM,
      },
      null
    );
    notification.setAttribute("type", "success");
    // Hide the close button to prevent dismissing the notification.
    notification.dismissable = false;

    this.ensureVisibleNotification();
  },

  /**
   * Clear all leftover notifications.
   */
  clearNotifications() {
    this.notificationBox.removeAllNotifications();
  },

  /**
   * Event handler for when the user selects an address by clicking on the price
   * button for that address. This function spawns the content tab for the
   * address order form, and then closes the Account Provisioner tab.
   *
   * @param {string} providerId - The ID of the chosen provider.
   * @param {string} email - The chosen email address.
   * @param {boolean} [isDomain=false] - If the fetched data comes from a domain
   *  search form.
   */
  onAddressSelected(providerId, email, isDomain = false) {
    gAccountSetupLogger.debug("An address was selected by the user.");
    const provider = this.allProviders.find(p => p.id == providerId);

    let url = provider.api;
    const inputID = isDomain ? "domainName" : "mailName";
    const [firstName, lastName] = splitName(sanitizeName(inputID));
    // Replace the variables in the API url.
    url = url.replace("{firstname}", firstName);
    url = url.replace("{lastname}", lastName);
    url = url.replace("{email}", email);

    // And add the extra data.
    const data = storedData[providerId];
    delete data.provider;
    for (const name in data) {
      url += `${!url.includes("?") ? "?" : "&"}${name}=${encodeURIComponent(
        data[name]
      )}`;
    }

    gAccountSetupLogger.debug("Opening up a contentTab with the order form.");
    // Open the checkout content tab.
    const mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
    const tabmail = mail3Pane.document.getElementById("tabmail");
    tabmail.openTab("provisionerCheckoutTab", {
      url,
      realName: (firstName + " " + lastName).trim(),
      email,
    });

    const providerHostname = new URL(url).hostname;
    // Collect telemetry on which provider was selected for a new email account.
    Services.telemetry.keyedScalarAdd(
      "tb.account.selected_account_from_provisioner",
      providerHostname,
      1
    );

    // The user has made a selection. Close the provisioner window and let the
    // provider setup process take place in a dedicated tab.
    window.close();
  },

  /**
   * Attempt to fetch the provider list from the server.
   */
  async tryToFetchProviderList() {
    // If we're already in the middle of getting the provider list, or we
    // already got it before, bail out.
    if (this._isLoadingProviders || this._isLoadedProviders) {
      return;
    }

    this._isLoadingProviders = true;

    // If there's a timeout ID for waking the account provisioner, clear it.
    if (this._loadProviderRetryId) {
      window.clearTimeout(this._loadProviderRetryId);
      this._loadProviderRetryId = null;
    }

    await this.startLoadingState("account-provisioner-fetching-provisioners");

    const providerListUrl = Services.prefs.getCharPref(
      "mail.provider.providerList"
    );

    gAccountSetupLogger.debug(
      `Trying to populate provider list from ${providerListUrl}…`
    );

    try {
      const res = await fetch(providerListUrl, {
        signal: gAbortController.signal,
      });
      this.startAbortTimeout();
      const data = await res.json();
      this.populateProvidersLists(data);
    } catch (error) {
      // Ugh, we couldn't get the JSON file. Maybe we're not online. Or maybe
      // the server is down, or the file isn't being served. Regardless, if
      // we get here, none of this stuff is going to work.
      this._loadProviderRetryId = window.setTimeout(
        () => this.tryToFetchProviderList(),
        RETRY_TIMEOUT
      );
      this._isLoadingProviders = false;
      this.showErrorNotification("account-provisioner-connection-issues");
      gAccountSetupLogger.warn(`Failed to populate providers: ${error}`);
    }
  },

  /**
   * Validate a provider fetched during an API request to be sure we have all
   * the necessary fields to complete a setup process.
   *
   * @param {object} provider - The fetched provider.
   * @returns {boolean} - True if all the fields in the provider match the
   *   required fields.
   */
  providerHasCorrectFields(provider) {
    let result = true;

    const required = [
      "id",
      "label",
      "paid",
      "languages",
      "api",
      "tos_url",
      "privacy_url",
      "sells_domain",
    ];

    for (const field of required) {
      const fieldExists = field in provider;
      result &= fieldExists;

      if (!fieldExists) {
        gAccountSetupLogger.warn(
          `A provider did not have the field ${field}, and will be skipped.`
        );
      }
    }

    return result;
  },

  /**
   * Take the fetched providers, create checkboxes, icons and labels, and insert
   * them below the corresponding search input.
   *
   * @param {?object} data - The object containing all fetched providers.
   */
  populateProvidersLists(data) {
    gAccountSetupLogger.debug("Populating the provider list");
    this.clearAbortTimeout();

    if (!data || !data.length) {
      gAccountSetupLogger.warn(
        "The provider list we got back from the server was empty!"
      );
      this.showErrorNotification("account-provisioner-connection-issues");
      return;
    }

    const mailProviderList = document.getElementById("mailProvidersList");
    const domainProviderList = document.getElementById("domainProvidersList");

    this.allProviders = data;
    this.mailProviders = [];
    this.domainProviders = [];

    for (const provider of data) {
      if (!this.providerHasCorrectFields(provider)) {
        gAccountSetupLogger.warn(
          "A provider had incorrect fields, and has been skipped"
        );
        continue;
      }

      const entry = document.createElement("li");
      entry.setAttribute("id", provider.id);

      if (provider.icon) {
        const icon = document.createElement("img");
        icon.setAttribute("src", provider.icon);
        icon.setAttribute("alt", "");
        entry.appendChild(icon);
      }

      const name = document.createElement("span");
      name.textContent = provider.label;
      entry.appendChild(name);

      if (provider.sells_domain) {
        domainProviderList.appendChild(entry);
        this.domainProviders.push(provider.id);
      } else {
        mailProviderList.appendChild(entry);
        this.mailProviders.push(provider.id);
      }
    }

    this._isLoadedProviders = true;
    this.clearNotifications();
  },

  /**
   * Enable or disable the form fields when a fetch request starts or ends.
   *
   * @param {boolean} state - True if a fetch request is in progress.
   */
  updateSearchingState(state) {
    for (const element of document.querySelectorAll(".disable-on-submit")) {
      element.disabled = state;
    }
  },

  /**
   * Search for available email accounts.
   *
   * @param {DOMEvent} event - The form submit event.
   */
  async onMailFormSubmit(event) {
    // Always prevent the actual form submission.
    event.preventDefault();

    // Quick HTML sanitization.
    const name = sanitizeName("mailName");

    // Bail out if the user didn't type anything.
    if (!name) {
      return;
    }

    const resultsArea = document.getElementById("mailSearchResults");
    resultsArea.hidden = true;

    this.startLoadingState("account-provisioner-searching-email");
    const data = await this.submitFormRequest(
      name,
      this.mailProviders.join(",")
    );
    this.clearAbortTimeout();

    const count = this.populateSearchResults(data);
    if (!count) {
      // Bail out if we didn't get any usable data.
      gAccountSetupLogger.warn(
        "We got nothing back from the server for search results!"
      );
      this.showErrorNotification("account-provisioner-searching-error");
      return;
    }

    const resultsTitle = document.getElementById("mailResultsTitle");
    const resultsString = await document.l10n.formatValue(
      "account-provisioner-results-title",
      { count }
    );
    // Attach the sanitized search terms to avoid HTML conversion in fluent.
    resultsTitle.textContent = `${resultsString} "${name}"`;

    // Hide the domain section.
    document.getElementById("domainSearch").hidden = true;
    // Show the results area.
    resultsArea.hidden = false;
    // Update the buttons visibility.
    document.getElementById("cancelButton").hidden = true;
    document.getElementById("existingButton").hidden = true;
    // Show the back button.
    document.getElementById("backButton").hidden = false;
  },

  /**
   * Search for available domain names.
   *
   * @param {DOMEvent} event - The form submit event.
   */
  async onDomainFormSubmit(event) {
    // Always prevent the actual form submission.
    event.preventDefault();

    // Quick HTML sanitization.
    const name = sanitizeName("domainName");

    // Bail out if the user didn't type anything.
    if (!name) {
      return;
    }

    const resultsArea = document.getElementById("domainSearchResults");
    resultsArea.hidden = true;

    this.startLoadingState("account-provisioner-searching-domain");
    const data = await this.submitFormRequest(
      name,
      this.domainProviders.join(",")
    );
    this.clearAbortTimeout();

    const count = this.populateSearchResults(data, true);
    if (!count) {
      // Bail out if we didn't get any usable data.
      gAccountSetupLogger.warn(
        "We got nothing back from the server for search results!"
      );
      this.showErrorNotification("account-provisioner-searching-error");
      return;
    }

    const resultsTitle = document.getElementById("domainResultsTitle");
    const resultsString = await document.l10n.formatValue(
      "account-provisioner-results-title",
      { count }
    );
    // Attach the sanitized search terms to avoid HTML conversion in fluent.
    resultsTitle.textContent = `${resultsString} "${name}"`;

    // Hide the mail section.
    document.getElementById("mailSearch").hidden = true;
    // Show the results area.
    resultsArea.hidden = false;
    // Update the buttons visibility.
    document.getElementById("cancelButton").hidden = true;
    document.getElementById("existingButton").hidden = true;
    // Show the back button.
    document.getElementById("backButton").hidden = false;
  },

  /**
   * Update the UI to show the fetched address data.
   *
   * @param {object} data - The fetched data from an email or domain search.
   * @param {boolean} [isDomain=false] - If the fetched data comes from a domain
   *  search form.
   */
  populateSearchResults(data, isDomain = false) {
    if (!data || !data.length) {
      return 0;
    }

    this.clearNotifications();

    const resultsArea = isDomain
      ? document.getElementById("domainResultsArea")
      : document.getElementById("mailResultsArea");
    // Clear previously generated content.
    while (resultsArea.hasChildNodes()) {
      resultsArea.lastChild.remove();
    }

    // Filter out possible errors or empty lists.
    const validData = data.filter(
      result => result.succeeded && result.addresses.length
    );

    if (!validData || !validData.length) {
      return 0;
    }

    const providersList = isDomain ? this.domainProviders : this.mailProviders;

    let count = 0;
    for (const provider of validData) {
      count += provider.addresses.length;

      // Don't add a provider header if only 1 is currently available.
      if (providersList.length > 1) {
        const header = document.createElement("h5");
        header.classList.add("result-list-header");
        header.textContent = this.allProviders.find(
          p => p.id == provider.provider
        ).label;
        resultsArea.appendChild(header);
      }

      const list = document.createElement("ul");

      // Only show a chink of addresses if we got a long list.
      const isLongList = provider.addresses.length > 5;
      const addresses = isLongList
        ? provider.addresses.slice(0, 4)
        : provider.addresses;

      for (const address of addresses) {
        list.appendChild(this.createAddressRow(address, provider, isDomain));
      }

      resultsArea.appendChild(list);

      // If we got more than 5 addresses, create an hidden bug expandable list
      // with the rest of the data.
      if (isLongList) {
        const hiddenList = document.createElement("ul");
        hiddenList.hidden = true;

        for (const address of provider.addresses.slice(5)) {
          hiddenList.appendChild(
            this.createAddressRow(address, provider, isDomain)
          );
        }

        const button = document.createElement("button");
        button.setAttribute("type", "button");
        button.classList.add("btn-link", "self-center");
        document.l10n.setAttributes(
          button,
          "account-provisioner-all-results-button"
        );
        button.onclick = () => {
          hiddenList.hidden = false;
          button.hidden = true;
        };

        resultsArea.appendChild(button);
        resultsArea.appendChild(hiddenList);
      }
    }

    for (const provider of data) {
      delete provider.succeeded;
      delete provider.addresses;
      delete provider.price;
      storedData[provider.provider] = provider;
    }

    return count;
  },

  /**
   * Create the list item to show the suggested address returned from a search.
   *
   * @param {object} address - The address returned from the provider search.
   * @param {object} provider - The provider from which the address is
   * @param {boolean} [isDomain=false] - If the fetched data comes from a domain
   *  search form.
   *   available.
   * @returns {HTMLLIElement}
   */
  createAddressRow(address, provider, isDomain = false) {
    const row = document.createElement("li");
    row.classList.add("result-item");

    const suggestedAddress = address.address || address;

    const button = document.createElement("button");
    button.setAttribute("type", "button");
    button.onclick = () => {
      this.onAddressSelected(provider.provider, suggestedAddress, isDomain);
    };

    const leftArea = document.createElement("span");
    leftArea.classList.add("result-data");

    const name = document.createElement("span");
    name.classList.add("result-name");
    name.textContent = suggestedAddress;
    leftArea.appendChild(name);
    row.setAttribute("data-label", suggestedAddress);

    const price = document.createElement("span");
    price.classList.add("result-price");

    // Build the pricing text and handle possible free trials.
    if (address.price) {
      if (address.price != 0) {
        // Some pricing is defined.
        document.l10n.setAttributes(price, "account-provision-price-per-year", {
          price: address.price,
        });
      } else if (address.price == 0) {
        // Price is defined by it's zero.
        document.l10n.setAttributes(price, "account-provisioner-free-account");
      }
    } else if (provider.price && provider.price != 0) {
      // We don't have a price for the current result so let's try to use
      // the general Provider's price.
      document.l10n.setAttributes(price, "account-provision-price-per-year", {
        price: provider.price,
      });
    } else {
      // No price was specified, let's return "Free".
      document.l10n.setAttributes(price, "account-provisioner-free-account");
    }
    leftArea.appendChild(price);

    button.appendChild(leftArea);

    const img = document.createElement("img");
    document.l10n.setAttributes(img, "account-provisioner-open-in-tab-img");
    img.setAttribute("alt", "");
    img.setAttribute("src", "chrome://global/skin/icons/open-in-new.svg");
    button.appendChild(img);

    row.appendChild(button);

    return row;
  },

  /**
   * Fetches a list of suggested email addresses or domain names from a list of
   * selected providers.
   *
   * @param {string} name - The search value typed by the user.
   * @param {Array} providers - Array of providers to search for.
   * @returns {object} - A list of available emails or domains.
   */
  async submitFormRequest(name, providers) {
    // If the focused element is disabled by `updateSearchingState`, focus is
    // lost. Save the focused element to restore it later.
    const activeElement = document.activeElement;
    this.updateSearchingState(true);

    const [firstName, lastName] = splitName(name);
    const url = `${this.suggestFromName}?first_name=${encodeURIComponent(
      firstName
    )}&last_name=${encodeURIComponent(lastName)}&providers=${encodeURIComponent(
      providers
    )}&version=2`;

    let data;
    try {
      const res = await fetch(url, { signal: gAbortController.signal });
      this.startAbortTimeout();
      data = await res.json();
    } catch (error) {
      gAccountSetupLogger.warn(`Failed to fetch address data: ${error}`);
    }

    this.updateSearchingState(false);
    // Restore focus.
    activeElement.focus();
    return data;
  },

  /**
   * Start a timeout to abort a fetch request based on a time limit.
   */
  startAbortTimeout() {
    this.timeoutId = setTimeout(() => {
      gAbortController.abort();
      this.showErrorNotification("account-provisioner-connection-timeout");
      gAccountSetupLogger.warn("Connection timed out");
    }, CONNECTION_TIMEOUT);
  },

  /**
   * Clear any leftover timeout to prevent an unnecessary fetch abort.
   */
  clearAbortTimeout() {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  },

  /**
   * Always ensure the notification area is visible when a new notification is
   * created.
   */
  ensureVisibleNotification() {
    document.getElementById("accountProvisionerNotifications").scrollIntoView({
      behavior: gReducedMotion ? "auto" : "smooth",
      block: "start",
      inline: "nearest",
    });
  },
};
