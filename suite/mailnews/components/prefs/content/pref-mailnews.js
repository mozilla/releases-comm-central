/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {ShellService} = ChromeUtils.import("resource:///modules/ShellService.jsm");

function Startup()
{
  startPageCheck();
  defaultClientSetup();
}

function startPageCheck()
{
  var checked = document.getElementById("mailnews.start_page.enabled").value;
  var urlElement = document.getElementById("mailnewsStartPageUrl");
  var prefLocked = document.getElementById("mailnews.start_page.url").locked;

  urlElement.disabled = !checked || prefLocked;
}

function setHomePageToDefaultPage()
{
  var startPagePref = document.getElementById("mailnews.start_page.url");

  startPagePref.value = startPagePref.defaultValue;
}

function defaultClientSetup()
{
  if (ShellService) try {
    ["Mail", "News", "Rss"].forEach(function(aType) {
      var button = document.getElementById("setDefault" + aType);
      try {
        button.disabled = ShellService.isDefaultClient(false, Ci.nsIShellService[aType.toUpperCase()]);
        document.getElementById("defaultMailPrefs").hidden = false;
      } catch (e) {
        button.hidden = true;
      }
    });
  } catch (e) {
  }
}

function onSetDefault(aButton, aType)
{
  ShellService.setDefaultClient(false, false, Ci.nsIShellService[aType]);
  ShellService.shouldBeDefaultClientFor |= Ci.nsIShellService[aType];

  aButton.disabled = true;
}

function onNewsChange(aChecked)
{
  let snews = document.getElementById("network.protocol-handler.external.snews");
  let nntp = document.getElementById("network.protocol-handler.external.nntp");

  if (!snews.locked)
    snews.value = aChecked;

  if (!nntp.locked)
    nntp.value = aChecked;
}
