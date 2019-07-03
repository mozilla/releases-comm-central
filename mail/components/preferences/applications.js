/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */
/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

// applications.inc.xul

var gNodeToObjectMap = new WeakMap();

// CloudFile account tools used by gCloudFileTab.
var {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

Preferences.addAll([
  { id: "mail.preferences.applications.selectedTabIndex", type: "int" },
  { id: "mail.compose.big_attachments.notify", type: "bool" },
  { id: "mail.compose.big_attachments.threshold_kb", type: "int" },
]);

if (document.getElementById("paneApplications"))
  document.getElementById("paneApplications")
          .addEventListener("paneload", () => gApplicationsTabController.init());

// ---------
// Utilities



var gApplicationsTabController = {
  mInitialized: false,
  // We default to displaying the Outgoing tab, which is the tab at index 1
  // of the attachmentPrefs tabs.
  mDefaultIndex: 1,

  init() {
    if (this.mInitialized)
      return;

    gApplicationsPane.init();

    this.mTabBox = document.getElementById("attachmentPrefs");

    // If BigFiles is disabled, hide the "Outgoing" tab, and the tab
    // selectors, and bail out.
    if (!Services.prefs.getBoolPref("mail.cloud_files.enabled")) {
      // Default to the first tab, "Incoming"
      this.mTabBox.selectedIndex = 0;
      // Hide the tab selector
      let tabs = document.getElementById("attachmentPrefsTabs");
      tabs.hidden = true;
      this.mInitialized = true;
      return;
    }

    gCloudFileTab.init();
    window.addEventListener("paneSelected", this.paneSelectionChanged);

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = Preferences.get("mail.preferences.applications.selectedTabIndex");
      this.mTabBox.selectedIndex = preference.value != null ? preference.value : this.mDefaultIndex;
    }

    this.mInitialized = true;
  },

  paneSelectionChanged() {
    gCloudFileTab.init();
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      Preferences.get("mail.preferences.applications.selectedTabIndex")
                 .valueFromPreferences = this.mTabBox.selectedIndex;
    }

    gCloudFileTab.init();
  },
};

var gCloudFileTab = {
  _initialized: false,
  _initializationStarted: false,
  _list: null,
  _buttonContainer: null,
  _listContainer: null,
  _settings: null,
  _settingsDeck: null,
  _tabpanel: null,
  _settingsPanelWrap: null,
  _defaultPanel: null,

  get _strings() {
    return Services.strings
                   .createBundle("chrome://messenger/locale/preferences/applications.properties");
  },

  init() {
    // Because this leads to another document being loaded, do it only when really necessary.
    if (this._initializationStarted) {
      return;
    }
    if (getCurrentPaneID() != "paneApplications") {
      return;
    }
    if (gApplicationsTabController.mTabBox.selectedIndex != 1) {
      return;
    }

    this._initializationStarted = true;
    window.removeEventListener("paneSelected", gApplicationsTabController.paneSelectionChanged);

    this._list = document.getElementById("cloudFileView");
    this._buttonContainer = document.getElementById("addCloudFileAccountButtons");
    this._addAccountButton = document.getElementById("addCloudFileAccount");
    this._listContainer = document.getElementById("addCloudFileAccountListItems");
    this._removeAccountButton = document.getElementById("removeCloudFileAccount");
    this._settingsDeck = document.getElementById("cloudFileSettingsDeck");
    this._defaultPanel = document.getElementById("cloudFileDefaultPanel");
    this._settingsPanelWrap = document.getElementById("cloudFileSettingsWrapper");

    this.updateThreshold();
    this.rebuildView();

    window.addEventListener("unload", this, {capture: false, once: true});

    this._onAccountConfigured = this._onAccountConfigured.bind(this);
    this._onProviderRegistered = this._onProviderRegistered.bind(this);
    this._onProviderUnregistered = this._onProviderUnregistered.bind(this);
    cloudFileAccounts.on("accountConfigured", this._onAccountConfigured);
    cloudFileAccounts.on("providerRegistered", this._onProviderRegistered);
    cloudFileAccounts.on("providerUnregistered", this._onProviderUnregistered);

    let element = document.getElementById("cloudFileThreshold");
    Preferences.addSyncFromPrefListener(element, () => this.readThreshold());
    Preferences.addSyncToPrefListener(element, () => this.writeThreshold());

    this._initialized = true;
  },

  destroy() {
    // Remove any controllers or observers here.
    cloudFileAccounts.off("accountConfigured", this._onAccountConfigured);
    cloudFileAccounts.off("providerRegistered", this._onProviderRegistered);
    cloudFileAccounts.off("providerUnregistered", this._onProviderUnregistered);
  },

  _onAccountConfigured(event, account) {
    for (let item of this._list.children) {
      if (item.value == account.accountKey) {
        item.querySelector("image.configuredWarning").hidden = account.configured;
      }
    }
  },

  _onProviderRegistered(event, provider) {
    let accounts = cloudFileAccounts.getAccountsForType(provider.type);
    accounts.sort(this._sortDisplayNames);

    // Always add newly-enabled accounts to the end of the list, this makes
    // it clearer to users what's happening.
    for (let account of accounts) {
      let item = this.makeRichListItemForAccount(account);
      this._list.appendChild(item);
    }

    this._buttonContainer.appendChild(this.makeButtonForProvider(provider));
    this._listContainer.appendChild(this.makeListItemForProvider(provider));
  },

  _onProviderUnregistered(event, type) {
    for (let item of [...this._list.children]) {
      // If the provider is unregistered, getAccount returns null.
      if (!cloudFileAccounts.getAccount(item.value)) {
        if (item.hasAttribute("selected")) {
          this._settingsDeck.selectedPanel = this._defaultPanel;
          if (this._settings) {
            this._settings.remove();
          }
          this._removeAccountButton.disabled = true;
        }
        item.remove();
      }
    }

    for (let button of this._buttonContainer.children) {
      if (button.getAttribute("value") == type) {
        button.remove();
      }
    }

    for (let item of this._listContainer.children) {
      if (item.getAttribute("value") == type) {
        item.remove();
      }
    }

    if (this._buttonContainer.childElementCount < 1) {
      this._buttonContainer.hidden = false;
      this._addAccountButton.hidden = true;
    }
  },

  makeRichListItemForAccount(aAccount) {
    let rli = document.createXULElement("richlistitem");
    rli.value = aAccount.accountKey;
    rli.setAttribute("align", "center");
    rli.setAttribute("class", "cloudfileAccount");
    rli.setAttribute("value", aAccount.accountKey);

    if (aAccount.iconURL)
      rli.style.listStyleImage = "url('" + aAccount.iconURL + "')";

    let icon = document.createXULElement("image");
    icon.setAttribute("class", "typeIcon");
    rli.appendChild(icon);

    let label = document.createXULElement("label");
    label.setAttribute("crop", "end");
    label.setAttribute("flex", "1");
    label.setAttribute("value", cloudFileAccounts.getDisplayName(aAccount.accountKey));
    label.addEventListener("click", this, true);
    rli.appendChild(label);

    let textBox = document.createXULElement("textbox");
    textBox.setAttribute("flex", "1");
    textBox.hidden = true;
    textBox.addEventListener("blur", this);
    textBox.addEventListener("keypress", this);
    rli.appendChild(textBox);

    let warningIcon = document.createXULElement("image");
    warningIcon.setAttribute("class", "configuredWarning typeIcon");
    warningIcon.setAttribute("src", "chrome://global/skin/icons/warning.svg");
    warningIcon.setAttribute("tooltiptext", this._strings.GetStringFromName("notConfiguredYet"));
    if (aAccount.configured) {
      warningIcon.hidden = true;
    }
    rli.appendChild(warningIcon);

    return rli;
  },

  makeButtonForProvider(provider) {
    let button = document.createXULElement("button");
    button.setAttribute("value", provider.type);
    button.setAttribute(
      "label", this._strings.formatStringFromName("addProvider", [provider.displayName])
    );
    button.setAttribute("oncommand", `gCloudFileTab.addCloudFileAccount("${provider.type}")`);
    button.style.listStyleImage = `url("${provider.iconURL}")`;
    return button;
  },

  makeListItemForProvider(provider) {
    let menuitem = document.createXULElement("menuitem");
    menuitem.classList.add("menuitem-iconic");
    menuitem.setAttribute("value", provider.type);
    menuitem.setAttribute("label", provider.displayName);
    menuitem.setAttribute("image", provider.iconURL);
    return menuitem;
  },

  // Sort the accounts by displayName.
  _sortDisplayNames(a, b) {
    let aName = a.displayName.toLowerCase();
    let bName = b.displayName.toLowerCase();
    return aName.localeCompare(bName);
  },

  rebuildView() {
    // Clear the list of entries.
    while (this._list.hasChildNodes())
      this._list.lastChild.remove();

    let accounts = cloudFileAccounts.accounts;
    accounts.sort(this._sortDisplayNames);

    for (let account of accounts) {
      let rli = this.makeRichListItemForAccount(account);
      this._list.appendChild(rli);
    }

    while (this._buttonContainer.hasChildNodes())
      this._buttonContainer.lastChild.remove();

    let providers = cloudFileAccounts.providers;
    providers.sort(this._sortDisplayNames);
    for (let provider of providers) {
      this._buttonContainer.appendChild(this.makeButtonForProvider(provider));
      this._listContainer.appendChild(this.makeListItemForProvider(provider));
    }
  },

  onSelectionChanged(aEvent) {
    if (!this._initialized || aEvent.target != this._list) {
      return;
    }

    // Get the selected item
    let selection = this._list.selectedItem;
    this._removeAccountButton.disabled = !selection;
    if (!selection) {
      this._settingsDeck.selectedPanel = this._defaultPanel;
      if (this._settings) {
        this._settings.remove();
      }
      return;
    }

    this._showAccountInfo(selection.value);
  },

  _showAccountInfo(aAccountKey) {
    let account = cloudFileAccounts.getAccount(aAccountKey);
    this._settingsDeck.selectedPanel = this._settingsPanelWrap;

    let url = account.managementURL + `?accountId=${account.accountKey}`;

    let iframe = document.createXULElement("iframe");
    iframe.setAttribute("flex", "1");
    // allows keeping dialog background color without hoops
    iframe.setAttribute("transparent", "true");

    let type = url.startsWith("chrome:") ? "chrome" : "content";
    iframe.setAttribute("type", type);
    iframe.setAttribute("src", url);

    // If we have a past iframe, we replace it. Else append
    // to the wrapper.
    if (this._settings) {
      this._settings.remove();
    }

    this._settingsPanelWrap.appendChild(iframe);
    this._settings = iframe;
  },

  onListOverflow() {
    if (this._buttonContainer.childElementCount > 1) {
      this._buttonContainer.hidden = true;
      this._addAccountButton.hidden = false;
    }
  },

  addCloudFileAccount(aType) {
    let account = cloudFileAccounts.createAccount(aType);
    if (!account)
      return;

    let rli = this.makeRichListItemForAccount(account);
    this._list.appendChild(rli);
    this._list.selectItem(rli);
    this._addAccountButton.removeAttribute("image");
    this._addAccountButton.setAttribute(
      "label", this._addAccountButton.getAttribute("defaultlabel")
    );
    this._removeAccountButton.disabled = false;
  },

  removeCloudFileAccount() {
    // Get the selected account key
    let selection = this._list.selectedItem;
    if (!selection)
      return;

    let accountKey = selection.value;
    let accountName = cloudFileAccounts.getDisplayName(accountKey);
    // Does the user really want to remove this account?
    let confirmMessage = this._strings
                             .formatStringFromName("dialog_removeAccount",
                                                   [accountName]);

    if (Services.prompt.confirm(null, "", confirmMessage)) {
      this._list.clearSelection();
      cloudFileAccounts.removeAccount(accountKey);
      let rli = this._list.querySelector("richlistitem[value='" + accountKey + "']");
      rli.remove();
      this._settingsDeck.selectedPanel = this._defaultPanel;
      if (this._settings) {
        this._settings.remove();
      }
    }
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "unload":
        this.destroy();
        break;
      case "click": {
        let label = aEvent.target;
        let item = label.parentNode;
        let textBox = item.querySelector("textbox");
        if (!item.selected) {
          return;
        }
        label.hidden = true;
        textBox.value = label.value;
        textBox.hidden = false;
        textBox.select();
        break;
      }
      case "blur": {
        let textBox = aEvent.target;
        let item = textBox.parentNode;
        let label = item.querySelector("label");
        cloudFileAccounts.setDisplayName(item.value, textBox.value);
        label.value = textBox.value;
        label.hidden = false;
        textBox.hidden = true;
        break;
      }
      case "keypress": {
        let textBox = aEvent.target;
        let item = textBox.parentNode;
        let label = item.querySelector("label");

        if (aEvent.key == "Enter") {
          cloudFileAccounts.setDisplayName(item.value, textBox.value);
          label.value = textBox.value;
          label.hidden = false;
          textBox.hidden = true;
          gCloudFileTab._list.focus();

          aEvent.preventDefault();
        } else if (aEvent.key == "Escape") {
          textBox.value = label.value;
          label.hidden = false;
          textBox.hidden = true;
          gCloudFileTab._list.focus();

          aEvent.preventDefault();
        }
      }
    }
  },

  readThreshold() {
    let pref = Preferences.get("mail.compose.big_attachments.threshold_kb");
    return pref.value / 1024;
  },

  writeThreshold() {
    let threshold = document.getElementById("cloudFileThreshold");
    let intValue = parseInt(threshold.value, 10);
    return isNaN(intValue) ? 0 : intValue * 1024;
  },

  updateThreshold() {
    document.getElementById("cloudFileThreshold").disabled =
      !Preferences.get("mail.compose.big_attachments.notify").value;
  },
};

Preferences.get("mail.compose.big_attachments.notify").on("change", gCloudFileTab.updateThreshold);

// -------------------
// Prefpane Controller

var gApplicationsPane = {

  // ----------------------------
  // Initialization & Destruction

  init() {
    // Initialize shortcuts to some commonly accessed elements & values.
  },

  // ---------------------------
  // Composed Model Construction
};
