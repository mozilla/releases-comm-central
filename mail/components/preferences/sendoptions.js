/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");

var gSendOptionsDialog = {
  mPrefsBundle: null,
  mHTMLListBox: null,
  mPlainTextListBox: null,

  init: function ()
  {
    this.mPrefsBundle = document.getElementById('bundlePreferences');
    this.mHTMLListBox = document.getElementById('html_domains');
    this.mPlainTextListBox = document.getElementById('plaintext_domains');

    var htmlDomainPrefString = document.getElementById('mailnews.html_domains').value;
    this.loadDomains(document.getElementById('mailnews.html_domains').value,
                     this.mHTMLListBox);
    this.loadDomains(document.getElementById('mailnews.plaintext_domains').value,
                     this.mPlainTextListBox);
  },

  saveDomainPref: function(aHTML)
  {
    var listbox = aHTML ? this.mHTMLListBox : this.mPlainTextListBox;
    var num_domains = 0;
    var pref_string = "";

    for (var item = listbox.firstChild; item != null; item = item.nextSibling)
    {
      var domainid = item.firstChild.getAttribute("value");
      if (domainid.length > 1)
      {
        num_domains++;

        // Separate >1 domains by commas.
        if (num_domains > 1)
          pref_string = pref_string + "," + domainid;
        else
          pref_string = domainid;
      }
    }

    return pref_string;
  },

  loadDomains: function (aPrefString, aListBox)
  {
    var arrayOfPrefs = aPrefString.split(',');
    if (arrayOfPrefs)
      for (var i = 0; i < arrayOfPrefs.length; i++)
      {
        var str = arrayOfPrefs[i].replace(/ /g,"");
        if (str)
          this.addItemToDomainList(aListBox, str);
      }
  },

  removeDomains: function(aHTML)
  {
    let listbox = aHTML ? this.mHTMLListBox : this.mPlainTextListBox;

    let selectedCount = listbox.selectedItems.length;
    for (let i = selectedCount - 1; i >= 0; i--)
      listbox.selectedItems[i].remove();

    document.getElementById('SendOptionsDialogPane').userChangedValue(listbox);
  },

  addDomain: function (aHTML)
  {
    var listbox = aHTML ? this.mHTMLListBox : this.mPlainTextListBox;

    var domainName;
    var result = {value:null};
    if (Services.prompt.prompt(window, this.mPrefsBundle.getString(listbox.id + 'AddDomainTitle'),
                               this.mPrefsBundle.getString(listbox.id + 'AddDomain'), result, null, {value:0}))
      domainName = result.value.replace(/ /g,"");

    if (domainName && !this.domainAlreadyPresent(domainName))
    {
      this.addItemToDomainList(listbox, domainName);
      document.getElementById('SendOptionsDialogPane').userChangedValue(listbox);
    }

  },

  domainAlreadyPresent: function(aDomainName)
  {
    let matchingDomains = this.mHTMLListBox.querySelectorAll('[value="' + aDomainName + '"]');

    if (!matchingDomains.length)
      matchingDomains = this.mPlainTextListBox.querySelectorAll('[value="' + aDomainName + '"]');

    if (matchingDomains.length)
    {
      Services.prompt.alert(window, this.mPrefsBundle.getString('domainNameErrorTitle'),
                            this.mPrefsBundle.getFormattedString("domainDuplicationError", [aDomainName]));
    }

    return matchingDomains.length;
  },

  addItemToDomainList: function (aListBox, aDomainTitle)
  {
    let label = document.createElement("label");
    label.setAttribute("value", aDomainTitle);
    let item = document.createElement("richlistitem");
    item.appendChild(label);
    aListBox.appendChild(item);
  }
};
