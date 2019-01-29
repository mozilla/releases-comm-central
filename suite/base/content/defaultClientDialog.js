/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this dialog can only be opened if we have a shell service
const {ShellService} = ChromeUtils.import("resource:///modules/ShellService.jsm");
const nsIPrefBranch = Ci.nsIPrefBranch;

function onLoad()
{
  var defaultList = document.getElementById("defaultList");
  var appTypes = ShellService.shouldBeDefaultClientFor;
  /* Iterate through the list of possible default client types and check for
     each list item if we want to be the default for that type using the AND
     conjunction */
  for (var i = 0; i < defaultList.getRowCount(); i++) {
    var currentItem = defaultList.getItemAtIndex(i);
    try {
      if (ShellService.isDefaultClient(false, Ci.nsIShellService[currentItem.value])) {
        currentItem.checked = true;
        currentItem.disabled = true;
      }
      else if (Ci.nsIShellService[currentItem.value] & appTypes)
        currentItem.checked = true;
    } catch (e) {
      currentItem.hidden = true;
    }
  }
}

function onAccept()
{
  // for each checked item, if we aren't already the default, make us the default.
  var appTypes = 0;
  var appTypesCheck = 0;
  var defaultList = document.getElementById("defaultList");

  for (var i = 0; i < defaultList.getRowCount(); i++) {
    var currentItem = defaultList.getItemAtIndex(i);
    var currentAppType = Ci.nsIShellService[currentItem.value];

    if (currentItem.checked) {
      appTypesCheck |= currentAppType;

      if (!currentItem.disabled)
        appTypes |= currentAppType;
    }
  }

  if (appTypes)
    ShellService.setDefaultClient(false, true, appTypes);

  // Update the pref for which app types we should check if we are the default app
  ShellService.shouldBeDefaultClientFor = appTypesCheck;

  ShellService.shouldCheckDefaultClient = document.getElementById('checkOnStartup').checked;
}
