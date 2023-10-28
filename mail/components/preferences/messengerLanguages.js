/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is exported by preferences.js but we can't import that in a subdialog.
const { getAvailableLocales } = window.top;

ChromeUtils.defineESModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  AddonRepository: "resource://gre/modules/addons/AddonRepository.sys.mjs",
});

/* This dialog provides an interface for managing what language the messenger is
 * displayed in.
 *
 * There is a list of "requested" locales and a list of "available" locales. The
 * requested locales must be installed and enabled. Available locales could be
 * installed and enabled, or fetched from the AMO language tools API.
 *
 * If a langpack is disabled, there is no way to determine what locale it is for and
 * it will only be listed as available if that locale is also available on AMO and
 * the user has opted to search for more languages.
 */

class OrderedListBox {
  constructor({ richlistbox, upButton, downButton, removeButton, onRemove }) {
    this.richlistbox = richlistbox;
    this.upButton = upButton;
    this.downButton = downButton;
    this.removeButton = removeButton;
    this.onRemove = onRemove;

    this.items = [];

    this.richlistbox.addEventListener("select", () => this.setButtonState());
    this.upButton.addEventListener("command", () => this.moveUp());
    this.downButton.addEventListener("command", () => this.moveDown());
    this.removeButton.addEventListener("command", () => this.removeItem());
  }

  get selectedItem() {
    return this.items[this.richlistbox.selectedIndex];
  }

  setButtonState() {
    const { upButton, downButton, removeButton } = this;
    const { selectedIndex, itemCount } = this.richlistbox;
    upButton.disabled = selectedIndex <= 0;
    downButton.disabled = selectedIndex == itemCount - 1;
    removeButton.disabled = itemCount <= 1 || !this.selectedItem.canRemove;
  }

  moveUp() {
    const { selectedIndex } = this.richlistbox;
    if (selectedIndex == 0) {
      return;
    }
    const { items } = this;
    const selectedItem = items[selectedIndex];
    const prevItem = items[selectedIndex - 1];
    items[selectedIndex - 1] = items[selectedIndex];
    items[selectedIndex] = prevItem;
    const prevEl = document.getElementById(prevItem.id);
    const selectedEl = document.getElementById(selectedItem.id);
    this.richlistbox.insertBefore(selectedEl, prevEl);
    this.richlistbox.ensureElementIsVisible(selectedEl);
    this.setButtonState();
  }

  moveDown() {
    const { selectedIndex } = this.richlistbox;
    if (selectedIndex == this.items.length - 1) {
      return;
    }
    const { items } = this;
    const selectedItem = items[selectedIndex];
    const nextItem = items[selectedIndex + 1];
    items[selectedIndex + 1] = items[selectedIndex];
    items[selectedIndex] = nextItem;
    const nextEl = document.getElementById(nextItem.id);
    const selectedEl = document.getElementById(selectedItem.id);
    this.richlistbox.insertBefore(nextEl, selectedEl);
    this.richlistbox.ensureElementIsVisible(selectedEl);
    this.setButtonState();
  }

  removeItem() {
    const { selectedIndex } = this.richlistbox;

    if (selectedIndex == -1) {
      return;
    }

    const [item] = this.items.splice(selectedIndex, 1);
    this.richlistbox.selectedItem.remove();
    this.richlistbox.selectedIndex = Math.min(
      selectedIndex,
      this.richlistbox.itemCount - 1
    );
    this.richlistbox.ensureElementIsVisible(this.richlistbox.selectedItem);
    this.onRemove(item);
  }

  setItems(items) {
    this.items = items;
    this.populate();
    this.setButtonState();
  }

  /**
   * Add an item to the top of the ordered list.
   *
   * @param {object} item The item to insert.
   */
  addItem(item) {
    this.items.unshift(item);
    this.richlistbox.insertBefore(
      this.createItem(item),
      this.richlistbox.firstElementChild
    );
    this.richlistbox.selectedIndex = 0;
    this.richlistbox.ensureElementIsVisible(this.richlistbox.selectedItem);
  }

  populate() {
    this.richlistbox.textContent = "";

    const frag = document.createDocumentFragment();
    for (const item of this.items) {
      frag.appendChild(this.createItem(item));
    }
    this.richlistbox.appendChild(frag);

    this.richlistbox.selectedIndex = 0;
    this.richlistbox.ensureElementIsVisible(this.richlistbox.selectedItem);
  }

  createItem({ id, label, value }) {
    const listitem = document.createXULElement("richlistitem");
    listitem.id = id;
    listitem.setAttribute("value", value);

    const labelEl = document.createXULElement("label");
    labelEl.textContent = label;
    listitem.appendChild(labelEl);

    return listitem;
  }
}

/**
 * The sorted select list of Locales available for the app.
 */
class SortedItemSelectList {
  constructor({ menulist, button, onSelect, onChange, compareFn }) {
    /** @type {XULElement} */
    this.menulist = menulist;

    /** @type {XULElement} */
    this.popup = menulist.menupopup;

    /** @type {XULElement} */
    this.button = button;

    /** @type {(a: LocaleDisplayInfo, b: LocaleDisplayInfo) => number} */
    this.compareFn = compareFn;

    /** @type {Array<LocaleDisplayInfo>} */
    this.items = [];

    menulist.addEventListener("command", () => {
      button.disabled = !menulist.selectedItem;
      if (menulist.selectedItem) {
        onChange(this.items[menulist.selectedIndex]);
      }
    });
    button.addEventListener("command", () => {
      if (!menulist.selectedItem) {
        return;
      }

      const [item] = this.items.splice(menulist.selectedIndex, 1);
      menulist.selectedItem.remove();
      menulist.setAttribute("label", menulist.getAttribute("placeholder"));
      button.disabled = true;
      menulist.disabled = menulist.itemCount == 0;
      menulist.selectedIndex = -1;

      onSelect(item);
    });
  }

  /**
   * @param {Array<LocaleDisplayInfo>} items
   */
  setItems(items) {
    this.items = items.sort(this.compareFn);
    this.populate();
  }

  populate() {
    const { button, items, menulist, popup } = this;
    popup.textContent = "";

    const frag = document.createDocumentFragment();
    for (const item of items) {
      frag.appendChild(this.createItem(item));
    }
    popup.appendChild(frag);

    menulist.setAttribute("label", menulist.getAttribute("placeholder"));
    menulist.disabled = menulist.itemCount == 0;
    menulist.selectedIndex = -1;
    button.disabled = true;
  }

  /**
   * Add an item to the list sorted by the label.
   *
   * @param {object} item The item to insert.
   */
  addItem(item) {
    const { compareFn, items, menulist, popup } = this;

    // Find the index of the item to insert before.
    const i = items.findIndex(el => compareFn(el, item) >= 0);
    items.splice(i, 0, item);
    popup.insertBefore(this.createItem(item), menulist.getItemAtIndex(i));
    menulist.disabled = menulist.itemCount == 0;
  }

  createItem({ label, value, className, disabled }) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", label);
    if (value) {
      item.value = value;
    }
    if (className) {
      item.classList.add(className);
    }
    if (disabled) {
      item.setAttribute("disabled", "true");
    }
    return item;
  }

  /**
   * Disable the inputs and set a data-l10n-id on the menulist. This can be
   * reverted with `enableWithMessageId()`.
   */
  disableWithMessageId(messageId) {
    this.menulist.setAttribute("data-l10n-id", messageId);
    this.menulist.setAttribute(
      "image",
      "chrome://global/skin/icons/loading.png"
    );
    this.menulist.disabled = true;
    this.button.disabled = true;
  }

  /**
   * Enable the inputs and set a data-l10n-id on the menulist. This can be
   * reverted with `disableWithMessageId()`.
   */
  enableWithMessageId(messageId) {
    this.menulist.setAttribute("data-l10n-id", messageId);
    this.menulist.removeAttribute("image");
    this.menulist.disabled = this.menulist.itemCount == 0;
    this.button.disabled = !this.menulist.selectedItem;
  }
}

/**
 * @typedef LocaleDisplayInfo
 * @type {object}
 * @property {string} id - A unique ID.
 * @property {string} label - The localized display name.
 * @property {string} value - The BCP 47 locale identifier or the word "search".
 * @property {boolean} canRemove - Locales that are part of the packaged locales cannot be
 *                             removed.
 * @property {boolean} installed - Whether or not the locale is installed.
 */

/**
 * @param {Array<string>} localeCodes - List of BCP 47 locale identifiers.
 * @returns {Array<LocaleDisplayInfo>}
 */
async function getLocaleDisplayInfo(localeCodes) {
  const availableLocales = new Set(await getAvailableLocales());
  const packagedLocales = new Set(Services.locale.packagedLocales);
  const localeNames = Services.intl.getLocaleDisplayNames(
    undefined,
    localeCodes,
    { preferNative: true }
  );
  return localeCodes.map((code, i) => {
    return {
      id: "locale-" + code,
      label: localeNames[i],
      value: code,
      canRemove: !packagedLocales.has(code),
      installed: availableLocales.has(code),
    };
  });
}

/**
 * @param {LocaleDisplayInfo} a
 * @param {LocaleDisplayInfo} b
 * @returns {number}
 */
function compareItems(a, b) {
  // Sort by installed.
  if (a.installed != b.installed) {
    return a.installed ? -1 : 1;

    // The search label is always last.
  } else if (a.value == "search") {
    return 1;
  } else if (b.value == "search") {
    return -1;

    // If both items are locales, sort by label.
  } else if (a.value && b.value) {
    return a.label.localeCompare(b.label);

    // One of them is a label, put it first.
  } else if (a.value) {
    return 1;
  }
  return -1;
}

var gMessengerLanguagesDialog = {
  /**
   * The publicly readable list of selected locales. It is only set when the dialog is
   * accepted, and can be retrieved elsewhere by directly reading the property
   * on gMessengerLanguagesDialog.
   *
   *   let { selected } = gMessengerLanguagesDialog;
   *
   * @type {null | Array<string>}
   */
  selected: null,

  /**
   * @type {SortedItemSelectList}
   */
  _availableLocalesUI: null,

  /**
   * @type {OrderedListBox}
   */
  _selectedLocalesUI: null,

  get downloadEnabled() {
    // Downloading langpacks isn't always supported, check the pref.
    return Services.prefs.getBoolPref("intl.multilingual.downloadEnabled");
  },

  async onLoad() {
    /**
     * @typedef {object} Options - Options passed in to configure the subdialog.
     * @property {Array<string>} [selectedLocalesForRestart] The optional list of
     *   previously selected locales for when a restart is required. This list is
     *   preserved between openings of the dialog.
     * @property {boolean} search Whether the user opened this from "Search for more
     *   languages" option.
     */

    /** @type {Options} */
    const { selectedLocalesForRestart, search } = window.arguments[0];

    // This is a list of available locales that the user selected. It's more
    // restricted than the Intl notion of `requested` as it only contains
    // locale codes for which we have matching locales available.
    // The first time this dialog is opened, populate with appLocalesAsBCP47.
    let selectedLocales =
      selectedLocalesForRestart || Services.locale.appLocalesAsBCP47;
    const selectedLocaleSet = new Set(selectedLocales);
    let available = await getAvailableLocales();
    const availableSet = new Set(available);

    // Filter selectedLocales since the user may select a locale when it is
    // available and then disable it.
    selectedLocales = selectedLocales.filter(locale =>
      availableSet.has(locale)
    );
    // Nothing in available should be in selectedSet.
    available = available.filter(locale => !selectedLocaleSet.has(locale));

    await this.initSelectedLocales(selectedLocales);
    await this.initAvailableLocales(available, search);

    this.initialized = true;

    // Now the component is initialized, it's safe to accept the results.
    document
      .getElementById("MessengerLanguagesDialog")
      .addEventListener("beforeaccept", () => {
        this.selected = this._selectedLocalesUI.items.map(item => item.value);
      });
  },

  /**
   * @param {string[]} selectedLocales - BCP 47 locale identifiers
   */
  async initSelectedLocales(selectedLocales) {
    this._selectedLocalesUI = new OrderedListBox({
      richlistbox: document.getElementById("selectedLocales"),
      upButton: document.getElementById("up"),
      downButton: document.getElementById("down"),
      removeButton: document.getElementById("remove"),
      onRemove: item => this.selectedLocaleRemoved(item),
    });
    this._selectedLocalesUI.setItems(
      await getLocaleDisplayInfo(selectedLocales)
    );
  },

  /**
   * @param {Set<string>} available - The set of available BCP 47 locale identifiers.
   * @param {boolean} search - Whether the user opened this from "Search for more
   *                           languages" option.
   */
  async initAvailableLocales(available, search) {
    this._availableLocalesUI = new SortedItemSelectList({
      menulist: document.getElementById("availableLocales"),
      button: document.getElementById("add"),
      compareFn: compareItems,
      onSelect: item => this.availableLanguageSelected(item),
      onChange: item => {
        this.hideError();
        if (item.value == "search") {
          this.loadLocalesFromAMO();
        }
      },
    });

    // Populate the list with the installed locales even if the user is
    // searching in case the download fails.
    await this.loadLocalesFromInstalled(available);

    // If the user opened this from the "Search for more languages" option,
    // search AMO for available locales.
    if (search) {
      return this.loadLocalesFromAMO();
    }

    return undefined;
  },

  async loadLocalesFromAMO() {
    if (!this.downloadEnabled) {
      return;
    }

    // Disable the dropdown while we hit the network.
    this._availableLocalesUI.disableWithMessageId(
      "messenger-languages-searching"
    );

    // Fetch the available langpacks from AMO.
    let availableLangpacks;
    try {
      availableLangpacks = await AddonRepository.getAvailableLangpacks();
    } catch (e) {
      this.showError();
      return;
    }

    // Store the available langpack info for later use.
    this.availableLangpacks = new Map();
    for (const { target_locale, url, hash } of availableLangpacks) {
      this.availableLangpacks.set(target_locale, { url, hash });
    }

    // Remove the installed locales from the available ones.
    const installedLocales = new Set(await getAvailableLocales());
    const notInstalledLocales = availableLangpacks
      .filter(({ target_locale }) => !installedLocales.has(target_locale))
      .map(lang => lang.target_locale);

    // Create the rows for the remote locales.
    const availableItems = await getLocaleDisplayInfo(notInstalledLocales);
    availableItems.push({
      label: await document.l10n.formatValue(
        "messenger-languages-available-label"
      ),
      className: "label-item",
      disabled: true,
      installed: false,
    });

    // Remove the search option and add the remote locales.
    let items = this._availableLocalesUI.items;
    items.pop();
    items = items.concat(availableItems);

    // Update the dropdown and enable it again.
    this._availableLocalesUI.setItems(items);
    this._availableLocalesUI.enableWithMessageId(
      "messenger-languages-select-language"
    );
  },

  /**
   * @param {Set<string>} available - The set of available (BCP 47) locales.
   */
  async loadLocalesFromInstalled(available) {
    let items;
    if (available.length > 0) {
      items = await getLocaleDisplayInfo(available);
      items.push(await this.createInstalledLabel());
    } else {
      items = [];
    }
    if (this.downloadEnabled) {
      items.push({
        label: await document.l10n.formatValue("messenger-languages-search"),
        value: "search",
      });
    }
    this._availableLocalesUI.setItems(items);
  },

  /**
   * @param {LocaleDisplayInfo} item
   */
  async availableLanguageSelected(item) {
    if ((await getAvailableLocales()).includes(item.value)) {
      await this.requestLocalLanguage(item);
    } else if (this.availableLangpacks.has(item.value)) {
      await this.requestRemoteLanguage(item);
    } else {
      this.showError();
    }
  },

  /**
   * @param {LocaleDisplayInfo} item
   */
  async requestLocalLanguage(item) {
    this._selectedLocalesUI.addItem(item);
    const selectedCount = this._selectedLocalesUI.items.length;
    const availableCount = (await getAvailableLocales()).length;
    if (selectedCount == availableCount) {
      // Remove the installed label, they're all installed.
      this._availableLocalesUI.items.shift();
      this._availableLocalesUI.setItems(this._availableLocalesUI.items);
    }

    // The label isn't always reset when the selected item is removed, so set it again.
    this._availableLocalesUI.enableWithMessageId(
      "messenger-languages-select-language"
    );
  },

  /**
   * @param {LocaleDisplayInfo} item
   */
  async requestRemoteLanguage(item) {
    this._availableLocalesUI.disableWithMessageId(
      "messenger-languages-downloading"
    );

    const { url, hash } = this.availableLangpacks.get(item.value);
    let addon;

    try {
      addon = await AddonManager.getInstallForURL(url, { hash });
      await addon.install();
    } catch (e) {
      this.showError();
      return;
    }

    // If the add-on was previously installed, it might be disabled still.
    if (addon.userDisabled) {
      await addon.enable();
    }

    item.installed = true;
    this._selectedLocalesUI.addItem(item);
    this._availableLocalesUI.enableWithMessageId(
      "messenger-languages-select-language"
    );
  },

  showError() {
    document.getElementById("warning-message").hidden = false;
    this._availableLocalesUI.enableWithMessageId(
      "messenger-languages-select-language"
    );

    // The height has likely changed, find our SubDialog and tell it to resize.
    requestAnimationFrame(() => {
      const dialogs = window.opener.gSubDialog._dialogs;
      const index = dialogs.findIndex(
        d => d._frame.contentDocument == document
      );
      if (index != -1) {
        dialogs[index].resizeDialog();
      }
    });
  },

  hideError() {
    document.getElementById("warning-message").hidden = true;
  },

  /**
   * @param {LocaleDisplayInfo} item
   */
  async selectedLocaleRemoved(item) {
    this._availableLocalesUI.addItem(item);

    // If the item we added is at the top of the list, it needs the label.
    if (this._availableLocalesUI.items[0] == item) {
      this._availableLocalesUI.addItem(await this.createInstalledLabel());
    }
  },

  async createInstalledLabel() {
    return {
      label: await document.l10n.formatValue(
        "messenger-languages-installed-label"
      ),
      className: "label-item",
      disabled: true,
      installed: true,
    };
  },
};
