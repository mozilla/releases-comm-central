/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */

var { InlineSpellChecker } = ChromeUtils.importESModule(
  "resource://gre/modules/InlineSpellChecker.sys.mjs"
);

// CloudFile account tools used by gCloudFile.
var { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);
var { E10SUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/E10SUtils.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);

Preferences.addAll([
  { id: "mail.forward_message_mode", type: "int" },
  { id: "mail.forward_add_extension", type: "bool" },
  { id: "mail.SpellCheckBeforeSend", type: "bool" },
  { id: "mail.spellcheck.inline", type: "bool" },
  { id: "mail.warn_on_send_accel_key", type: "bool" },
  { id: "mail.compose.autosave", type: "bool" },
  { id: "mail.compose.autosaveinterval", type: "int" },
  { id: "mail.enable_autocomplete", type: "bool" },
  { id: "ldap_2.autoComplete.useDirectory", type: "bool" },
  { id: "ldap_2.autoComplete.directoryServer", type: "string" },
  { id: "pref.ldap.disable_button.edit_directories", type: "bool" },
  { id: "mail.collect_email_address_outgoing", type: "bool" },
  { id: "mail.collect_addressbook", type: "string" },
  { id: "spellchecker.dictionary", type: "unichar" },
  { id: "msgcompose.default_colors", type: "bool" },
  { id: "msgcompose.font_face", type: "string" },
  { id: "msgcompose.font_size", type: "string" },
  { id: "msgcompose.text_color", type: "string" },
  { id: "msgcompose.background_color", type: "string" },
  { id: "mail.compose.attachment_reminder", type: "bool" },
  { id: "mail.compose.default_to_paragraph", type: "bool" },
  { id: "mail.compose.big_attachments.notify", type: "bool" },
  { id: "mail.compose.big_attachments.threshold_kb", type: "int" },
  { id: "mail.default_send_format", type: "int" },
  { id: "mail.compose.add_link_preview", type: "bool" },
]);

var gComposePane = {
  mSpellChecker: null,

  init() {
    this.enableAutocomplete();

    this.initLanguages();

    this.populateFonts();

    this.updateAutosave();

    this.updateUseReaderDefaults();

    this.updateAttachmentCheck();

    this.updateEmailCollection();

    this.initAbDefaultStartupDir();

    this.setButtonColors();

    // If BigFiles is disabled, hide the "Outgoing" tab, and the tab
    // selectors, and bail out.
    if (!Services.prefs.getBoolPref("mail.cloud_files.enabled")) {
      // Hide the tab selector
      const cloudFileBox = document.getElementById("cloudFileBox");
      cloudFileBox.hidden = true;
      return;
    }

    gCloudFile.init();
  },

  attachmentReminderOptionsDialog() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/attachmentReminder.xhtml",
      { features: "resizable=no" }
    );
  },

  updateAutosave() {
    gComposePane.enableElement(
      document.getElementById("autoSaveInterval"),
      Preferences.get("mail.compose.autosave").value
    );
  },

  updateUseReaderDefaults() {
    const useReaderDefaultsChecked = Preferences.get(
      "msgcompose.default_colors"
    ).value;
    gComposePane.enableElement(
      document.getElementById("textColorLabel"),
      !useReaderDefaultsChecked
    );
    gComposePane.enableElement(
      document.getElementById("backgroundColorLabel"),
      !useReaderDefaultsChecked
    );
    gComposePane.enableElement(
      document.getElementById("textColorButton"),
      !useReaderDefaultsChecked
    );
    gComposePane.enableElement(
      document.getElementById("backgroundColorButton"),
      !useReaderDefaultsChecked
    );
  },

  updateAttachmentCheck() {
    gComposePane.enableElement(
      document.getElementById("attachment_reminder_button"),
      Preferences.get("mail.compose.attachment_reminder").value
    );
  },

  updateEmailCollection() {
    gComposePane.enableElement(
      document.getElementById("localDirectoriesList"),
      Preferences.get("mail.collect_email_address_outgoing").value
    );
  },

  enableElement(aElement, aEnable) {
    const pref = aElement.getAttribute("preference");
    const prefIsLocked = pref ? Preferences.get(pref).locked : false;
    aElement.disabled = !aEnable || prefIsLocked;
  },

  enableAutocomplete() {
    const acLDAPPref = Preferences.get(
      "ldap_2.autoComplete.useDirectory"
    ).value;
    gComposePane.enableElement(
      document.getElementById("directoriesList"),
      acLDAPPref
    );
    gComposePane.enableElement(
      document.getElementById("editButton"),
      acLDAPPref
    );
  },

  editDirectories() {
    gSubDialog.open(
      "chrome://messenger/content/addressbook/pref-editdirectories.xhtml"
    );
  },

  initAbDefaultStartupDir() {
    if (!this.startupDirListener.inited) {
      this.startupDirListener.load();
    }

    const dirList = document.getElementById("defaultStartupDirList");
    if (Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
      // Some directory is the default.
      const startupURI = Services.prefs.getCharPref(
        "mail.addr_book.view.startupURI"
      );
      dirList.value = startupURI;
    } else {
      // Choose item meaning there is no default startup directory any more.
      dirList.value = "";
    }
  },

  setButtonColors() {
    document.getElementById("textColorButton").value = Preferences.get(
      "msgcompose.text_color"
    ).value;
    document.getElementById("backgroundColorButton").value = Preferences.get(
      "msgcompose.background_color"
    ).value;
  },

  setDefaultStartupDir(aDirURI) {
    if (aDirURI) {
      // Some AB directory was selected. Set prefs to make this directory
      // the default view when starting up the main AB.
      Services.prefs.setCharPref("mail.addr_book.view.startupURI", aDirURI);
      Services.prefs.setBoolPref(
        "mail.addr_book.view.startupURIisDefault",
        true
      );
    } else {
      // Set pref that there's no default startup view directory any more.
      Services.prefs.setBoolPref(
        "mail.addr_book.view.startupURIisDefault",
        false
      );
    }
  },

  async initLanguages() {
    const languageList = document.getElementById("dictionaryList");
    this.mSpellChecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(
      Ci.mozISpellCheckingEngine
    );

    // Get the list of dictionaries from the spellchecker.

    const dictList = this.mSpellChecker.getDictionaryList();

    // HACK: calling sortDictionaryList may fail the first time due to
    // synchronous loading of the .ftl files. If we load the files and wait
    // for a known value asynchronously, no such failure will happen.
    await new Localization([
      "toolkit/intl/languageNames.ftl",
      "toolkit/intl/regionNames.ftl",
    ]).formatValue("language-name-en");
    const sortedList = new InlineSpellChecker().sortDictionaryList(dictList);
    const activeDictionaries = Services.prefs
      .getCharPref("spellchecker.dictionary")
      .split(",");
    const template = document.getElementById("dictionaryListItem");
    languageList.replaceChildren(
      ...sortedList.map(({ displayName, localeCode }) => {
        const item = template.content.cloneNode(true).firstElementChild;
        item.querySelector(".checkbox-label").textContent = displayName;
        const input = item.querySelector("input");
        input.setAttribute("value", localeCode);
        input.addEventListener("change", event => {
          const language = event.target.value;
          let dicts = Services.prefs
            .getCharPref("spellchecker.dictionary")
            .split(",")
            .filter(Boolean);
          if (!event.target.checked) {
            dicts = dicts.filter(item => item != language);
          } else {
            dicts.push(language);
          }
          Services.prefs.setCharPref(
            "spellchecker.dictionary",
            dicts.join(",")
          );
        });
        input.checked = activeDictionaries.includes(localeCode);
        return item;
      })
    );
  },

  populateFonts() {
    var fontsList = document.getElementById("FontSelect");
    try {
      var enumerator = Cc["@mozilla.org/gfx/fontenumerator;1"].getService(
        Ci.nsIFontEnumerator
      );
      var localFonts = enumerator.EnumerateAllFonts();
      for (let i = 0; i < localFonts.length; ++i) {
        // Remove Linux system generic fonts that collide with CSS generic fonts.
        if (
          localFonts[i] != "" &&
          localFonts[i] != "serif" &&
          localFonts[i] != "sans-serif" &&
          localFonts[i] != "monospace"
        ) {
          fontsList.appendItem(localFonts[i], localFonts[i]);
        }
      }
    } catch (e) {}
    // Choose the item after the list is completely generated.
    var preference = Preferences.get(fontsList.getAttribute("preference"));
    fontsList.value = preference.value;
  },

  restoreHTMLDefaults() {
    // reset throws an exception if the pref value is already the default so
    // work around that with some try/catch exception handling
    try {
      Preferences.get("msgcompose.font_face").reset();
    } catch (ex) {}

    try {
      Preferences.get("msgcompose.font_size").reset();
    } catch (ex) {}

    try {
      Preferences.get("msgcompose.text_color").reset();
    } catch (ex) {}

    try {
      Preferences.get("msgcompose.background_color").reset();
    } catch (ex) {}

    try {
      Preferences.get("msgcompose.default_colors").reset();
    } catch (ex) {}

    this.updateUseReaderDefaults();
    this.setButtonColors();
  },

  startupDirListener: {
    inited: false,
    domain: "mail.addr_book.view.startupURI",
    observe(subject, topic) {
      if (topic != "nsPref:changed") {
        return;
      }

      // If the default startup directory prefs have changed,
      // reinitialize the default startup dir picker to show the new value.
      gComposePane.initAbDefaultStartupDir();
    },
    load() {
      // Observe changes of our prefs.
      Services.prefs.addObserver(this.domain, this);
      // Unload the pref observer when preferences window is closed.
      window.addEventListener("unload", () => this.unload(), true);
      this.inited = true;
    },

    unload() {
      Services.prefs.removeObserver(
        gComposePane.startupDirListener.domain,
        gComposePane.startupDirListener
      );
    },
  },
};

var gCloudFile = {
  _initialized: false,
  _list: null,
  _buttonContainer: null,
  _listContainer: null,
  _settings: null,
  _tabpanel: null,
  _settingsPanelWrap: null,
  _defaultPanel: null,

  get _strings() {
    return Services.strings.createBundle(
      "chrome://messenger/locale/preferences/applications.properties"
    );
  },

  init() {
    this._list = document.getElementById("cloudFileView");
    this._buttonContainer = document.getElementById(
      "addCloudFileAccountButtons"
    );
    this._addAccountButton = document.getElementById("addCloudFileAccount");
    this._listContainer = document.getElementById(
      "addCloudFileAccountListItems"
    );
    this._removeAccountButton = document.getElementById(
      "removeCloudFileAccount"
    );
    this._defaultPanel = document.getElementById("cloudFileDefaultPanel");
    this._settingsPanelWrap = document.getElementById(
      "cloudFileSettingsWrapper"
    );

    this.updateThreshold();
    this.rebuildView();

    window.addEventListener("unload", this, { capture: false, once: true });

    this._onAccountConfigured = this._onAccountConfigured.bind(this);
    this._onProviderRegistered = this._onProviderRegistered.bind(this);
    this._onProviderUnregistered = this._onProviderUnregistered.bind(this);
    cloudFileAccounts.on("accountConfigured", this._onAccountConfigured);
    cloudFileAccounts.on("providerRegistered", this._onProviderRegistered);
    cloudFileAccounts.on("providerUnregistered", this._onProviderUnregistered);

    const element = document.getElementById("cloudFileThreshold");
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
    for (const item of this._list.children) {
      if (item.value == account.accountKey) {
        item.querySelector(".configuredWarning").hidden = account.configured;
      }
    }
  },

  _onProviderRegistered(event, provider) {
    const accounts = cloudFileAccounts.getAccountsForType(provider.type);
    accounts.sort(this._sortDisplayNames);

    // Always add newly-enabled accounts to the end of the list, this makes
    // it clearer to users what's happening.
    for (const account of accounts) {
      const item = this.makeRichListItemForAccount(account);
      this._list.appendChild(item);
    }

    this._buttonContainer.appendChild(this.makeButtonForProvider(provider));
    this._listContainer.appendChild(this.makeListItemForProvider(provider));
  },

  _onProviderUnregistered(event, type) {
    for (const item of [...this._list.children]) {
      // If the provider is unregistered, getAccount returns null.
      if (!cloudFileAccounts.getAccount(item.value)) {
        if (item.hasAttribute("selected")) {
          this._defaultPanel.hidden = false;
          this._settingsPanelWrap.hidden = true;
          if (this._settings) {
            this._settings.remove();
          }
          this._removeAccountButton.disabled = true;
        }
        item.remove();
      }
    }

    for (const button of this._buttonContainer.children) {
      if (button.getAttribute("value") == type) {
        button.remove();
      }
    }

    for (const item of this._listContainer.children) {
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
    const rli = document.createXULElement("richlistitem");
    rli.setAttribute("align", "center");
    rli.classList.add("cloudfileAccount", "input-container");
    rli.setAttribute("value", aAccount.accountKey);

    const icon = document.createElement("img");
    icon.classList.add("typeIcon");
    if (aAccount.iconURL) {
      icon.setAttribute("src", aAccount.iconURL);
    }
    icon.setAttribute("alt", "");
    rli.appendChild(icon);

    const label = document.createXULElement("label");
    label.setAttribute("crop", "end");
    label.setAttribute("flex", "1");
    label.setAttribute(
      "value",
      cloudFileAccounts.getDisplayName(aAccount.accountKey)
    );
    label.addEventListener("click", this, true);
    rli.appendChild(label);

    const input = document.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("hidden", "hidden");
    input.addEventListener("blur", this);
    input.addEventListener("keypress", this);
    rli.appendChild(input);

    const warningIcon = document.createElement("img");
    warningIcon.setAttribute("class", "configuredWarning typeIcon");
    warningIcon.setAttribute("src", "chrome://global/skin/icons/warning.svg");
    // "title" provides the accessible name, not "alt".
    warningIcon.setAttribute(
      "title",
      this._strings.GetStringFromName("notConfiguredYet")
    );
    if (aAccount.configured) {
      warningIcon.hidden = true;
    }
    rli.appendChild(warningIcon);

    return rli;
  },

  makeButtonForProvider(provider) {
    const button = document.createXULElement("button");
    button.setAttribute("value", provider.type);
    button.setAttribute(
      "label",
      this._strings.formatStringFromName("addProvider", [provider.displayName])
    );
    button.setAttribute(
      "oncommand",
      `gCloudFile.addCloudFileAccount("${provider.type}")`
    );
    button.style.listStyleImage = `url("${provider.iconURL}")`;
    return button;
  },

  makeListItemForProvider(provider) {
    const menuitem = document.createXULElement("menuitem");
    menuitem.classList.add("menuitem-iconic");
    menuitem.setAttribute("value", provider.type);
    menuitem.setAttribute("label", provider.displayName);
    menuitem.setAttribute("image", provider.iconURL);
    return menuitem;
  },

  // Sort the accounts by displayName.
  _sortDisplayNames(a, b) {
    const aName = a.displayName.toLowerCase();
    const bName = b.displayName.toLowerCase();
    return aName.localeCompare(bName);
  },

  rebuildView() {
    // Clear the list of entries.
    while (this._list.hasChildNodes()) {
      this._list.lastChild.remove();
    }

    const accounts = cloudFileAccounts.accounts;
    accounts.sort(this._sortDisplayNames);

    for (const account of accounts) {
      const rli = this.makeRichListItemForAccount(account);
      this._list.appendChild(rli);
    }

    while (this._buttonContainer.hasChildNodes()) {
      this._buttonContainer.lastChild.remove();
    }

    const providers = cloudFileAccounts.providers;
    providers.sort(this._sortDisplayNames);
    for (const provider of providers) {
      this._buttonContainer.appendChild(this.makeButtonForProvider(provider));
      this._listContainer.appendChild(this.makeListItemForProvider(provider));
    }
  },

  onSelectionChanged(aEvent) {
    if (!this._initialized || aEvent.target != this._list) {
      return;
    }

    // Get the selected item
    const selection = this._list.selectedItem;
    this._removeAccountButton.disabled = !selection;
    if (!selection) {
      this._defaultPanel.hidden = false;
      this._settingsPanelWrap.hidden = true;
      if (this._settings) {
        this._settings.remove();
      }
      return;
    }

    this._showAccountInfo(selection.value);
  },

  _showAccountInfo(aAccountKey) {
    const account = cloudFileAccounts.getAccount(aAccountKey);
    this._defaultPanel.hidden = true;
    this._settingsPanelWrap.hidden = false;

    const url = account.managementURL + `?accountId=${account.accountKey}`;

    const browser = document.createXULElement("browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("remote", "true");
    browser.setAttribute("remoteType", E10SUtils.EXTENSION_REMOTE_TYPE);
    browser.setAttribute("forcemessagemanager", "true");
    if (account.extension) {
      browser.setAttribute(
        "initialBrowsingContextGroupId",
        account.extension.policy.browsingContextGroupId
      );
    }
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("messagemanagergroup", "webext-browsers");
    browser.setAttribute("autocompletepopup", "PopupAutoComplete");
    browser.setAttribute("selectmenulist", "ContentSelectDropdown");

    browser.setAttribute("flex", "1");
    // Allows keeping dialog background color without hoops.
    browser.setAttribute("transparent", "true");

    // If we have a past browser, we replace it. Else append to the wrapper.
    if (this._settings) {
      this._settings.remove();
    }

    this._settingsPanelWrap.appendChild(browser);
    this._settings = browser;

    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
    browser.messageManager.loadFrameScript(
      "chrome://extensions/content/ext-browser-content.js",
      false,
      true
    );

    const options = {};
    if (account.browserStyle) {
      options.stylesheets = ["chrome://browser/content/extension.css"];
    }
    browser.messageManager.sendAsyncMessage("Extension:InitBrowser", options);

    browser.fixupAndLoadURIString(url, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  },

  onListOverflow() {
    if (this._buttonContainer.childElementCount > 1) {
      this._buttonContainer.hidden = true;
      this._addAccountButton.hidden = false;
    }
  },

  addCloudFileAccount(aType) {
    const account = cloudFileAccounts.createAccount(aType);
    if (!account) {
      return;
    }

    const rli = this.makeRichListItemForAccount(account);
    this._list.appendChild(rli);
    this._list.selectItem(rli);
    this._addAccountButton.removeAttribute("image");
    this._addAccountButton.setAttribute(
      "label",
      this._addAccountButton.getAttribute("defaultlabel")
    );
    this._removeAccountButton.disabled = false;
  },

  removeCloudFileAccount() {
    // Get the selected account key
    const selection = this._list.selectedItem;
    if (!selection) {
      return;
    }

    const accountKey = selection.value;
    const accountName = cloudFileAccounts.getDisplayName(accountKey);
    // Does the user really want to remove this account?
    const confirmMessage = this._strings.formatStringFromName(
      "dialog_removeAccount",
      [accountName]
    );

    if (Services.prompt.confirm(null, "", confirmMessage)) {
      this._list.clearSelection();
      cloudFileAccounts.removeAccount(accountKey);
      const rli = this._list.querySelector(
        "richlistitem[value='" + accountKey + "']"
      );
      rli.remove();
      this._defaultPanel.hidden = false;
      this._settingsPanelWrap.hidden = true;
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
        const label = aEvent.target;
        const item = label.parentNode;
        const input = item.querySelector("input");
        if (!item.selected) {
          return;
        }
        label.hidden = true;
        input.value = label.value;
        input.removeAttribute("hidden");
        input.focus();
        break;
      }
      case "blur": {
        const input = aEvent.target;
        const item = input.parentNode;
        const label = item.querySelector("label");
        cloudFileAccounts.setDisplayName(item.value, input.value);
        label.value = input.value;
        label.hidden = false;
        input.setAttribute("hidden", "hidden");
        break;
      }
      case "keypress": {
        const input = aEvent.target;
        const item = input.parentNode;
        const label = item.querySelector("label");

        if (aEvent.key == "Enter") {
          cloudFileAccounts.setDisplayName(item.value, input.value);
          label.value = input.value;
          label.hidden = false;
          input.setAttribute("hidden", "hidden");
          gCloudFile._list.focus();

          aEvent.preventDefault();
        } else if (aEvent.key == "Escape") {
          input.value = label.value;
          label.hidden = false;
          input.setAttribute("hidden", "hidden");
          gCloudFile._list.focus();

          aEvent.preventDefault();
        }
      }
    }
  },

  readThreshold() {
    const pref = Preferences.get("mail.compose.big_attachments.threshold_kb");
    return pref.value / 1024;
  },

  writeThreshold() {
    const threshold = document.getElementById("cloudFileThreshold");
    const intValue = parseInt(threshold.value, 10);
    return isNaN(intValue) ? 0 : intValue * 1024;
  },

  updateThreshold() {
    document.getElementById("cloudFileThreshold").disabled = !Preferences.get(
      "mail.compose.big_attachments.notify"
    ).value;
  },
};

Preferences.get("mail.compose.autosave").on(
  "change",
  gComposePane.updateAutosave
);
Preferences.get("mail.compose.attachment_reminder").on(
  "change",
  gComposePane.updateAttachmentCheck
);
Preferences.get("msgcompose.default_colors").on(
  "change",
  gComposePane.updateUseReaderDefaults
);
Preferences.get("ldap_2.autoComplete.useDirectory").on(
  "change",
  gComposePane.enableAutocomplete
);
Preferences.get("mail.collect_email_address_outgoing").on(
  "change",
  gComposePane.updateEmailCollection
);
Preferences.get("mail.compose.big_attachments.notify").on(
  "change",
  gCloudFile.updateThreshold
);
