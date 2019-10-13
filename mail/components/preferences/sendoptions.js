/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

Preferences.addAll([
  { id: "mailnews.sendformat.auto_downgrade", type: "bool" },
  { id: "mail.default_html_action", type: "int" },
  { id: "mailnews.html_domains", type: "string" },
  { id: "mailnews.plaintext_domains", type: "string" },
]);

var gSendOptionsDialog = {
  mPrefsBundle: null,
  mHTMLListBox: null,
  mPlainTextListBox: null,

  init() {
    this.mPrefsBundle = document.getElementById("bundlePreferences");
    this.mHTMLListBox = document.getElementById("html_domains");
    this.mPlainTextListBox = document.getElementById("plaintext_domains");

    this.loadDomains(
      Preferences.get("mailnews.html_domains").value,
      this.mHTMLListBox
    );
    this.loadDomains(
      Preferences.get("mailnews.plaintext_domains").value,
      this.mPlainTextListBox
    );

    Preferences.addSyncToPrefListener(
      document.getElementById("html_domains"),
      () => this.saveDomainPref(true)
    );
    Preferences.addSyncToPrefListener(
      document.getElementById("plaintext_domains"),
      () => this.saveDomainPref(false)
    );
  },

  saveDomainPref(aHTML) {
    var listbox = aHTML ? this.mHTMLListBox : this.mPlainTextListBox;
    var num_domains = 0;
    var pref_string = "";

    for (
      let item = listbox.firstElementChild;
      item != null;
      item = item.nextElementSibling
    ) {
      var domainid = item.firstElementChild.getAttribute("value");
      if (domainid.length > 1) {
        num_domains++;

        // Separate >1 domains by commas.
        if (num_domains > 1) {
          pref_string = pref_string + "," + domainid;
        } else {
          pref_string = domainid;
        }
      }
    }

    return pref_string;
  },

  loadDomains(aPrefString, aListBox) {
    for (let str of aPrefString.split(",")) {
      str = str.replace(/ /g, "");
      if (str) {
        this.addItemToDomainList(aListBox, str);
      }
    }
  },

  removeDomains(aHTML) {
    let listbox = aHTML ? this.mHTMLListBox : this.mPlainTextListBox;

    let selectedCount = listbox.selectedItems.length;
    for (let i = selectedCount - 1; i >= 0; i--) {
      listbox.selectedItems[i].remove();
    }

    Preferences.userChangedValue(listbox);
  },

  addDomain(aHTML) {
    var listbox = aHTML ? this.mHTMLListBox : this.mPlainTextListBox;

    var domainName;
    var result = { value: null };
    if (
      Services.prompt.prompt(
        window,
        this.mPrefsBundle.getString(listbox.id + "AddDomainTitle"),
        this.mPrefsBundle.getString(listbox.id + "AddDomain"),
        result,
        null,
        { value: 0 }
      )
    ) {
      domainName = result.value.replace(/ /g, "");
    }

    if (domainName && !this.domainAlreadyPresent(domainName)) {
      this.addItemToDomainList(listbox, domainName);
      Preferences.userChangedValue(listbox);
    }
  },

  domainAlreadyPresent(aDomainName) {
    let matchingDomains = this.mHTMLListBox.querySelectorAll(
      '[value="' + aDomainName + '"]'
    );

    if (!matchingDomains.length) {
      matchingDomains = this.mPlainTextListBox.querySelectorAll(
        '[value="' + aDomainName + '"]'
      );
    }

    if (matchingDomains.length) {
      Services.prompt.alert(
        window,
        this.mPrefsBundle.getString("domainNameErrorTitle"),
        this.mPrefsBundle.getFormattedString("domainDuplicationError", [
          aDomainName,
        ])
      );
    }

    return matchingDomains.length;
  },

  addItemToDomainList(aListBox, aDomainTitle) {
    let label = document.createXULElement("label");
    label.setAttribute("value", aDomainTitle);
    let item = document.createXULElement("richlistitem");
    item.appendChild(label);
    aListBox.appendChild(item);
  },
};
