/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gLightningUAold;

function Startup()
{
  CheckPipelining();
  CheckPipeliningProxy();
  CheckLightningUA();
}

function CheckPipelining()
{
  var prefHTTPVersion = document.getElementById("network.http.version");

  var enabled = prefHTTPVersion.value == "1.1";
  EnableElementById("enablePipelining", enabled, false);
}

function CheckPipeliningProxy()
{
  var prefHTTPVersion = document.getElementById("network.http.proxy.version");

  var enabled = prefHTTPVersion.value == "1.1";
  EnableElementById("enablePipeliningProxy", enabled, false);
}

// Lightning adds a UA token if calendar.useragent.extra is not empty.
// Checkbox is visible if Lightning is installed and enabled.
// Checkbox is checked if the pref contains any non-whitespace character.
function CheckLightningUA()
{
  var prefLightningUA = document.getElementById("calendar.useragent.extra");
  var boxLightningUA  = document.getElementById("uaLightningShow");

  if (prefLightningUA.defaultValue)
  {
    boxLightningUA.hidden = false;
    boxLightningUA.checked = prefLightningUA.value.trim() != "";
    boxLightningUA.disabled = prefLightningUA.locked;
    gLightningUAold = prefLightningUA.hasUserValue ? prefLightningUA.value : null;
  }
}

// If the checkbox is checked, use previous user-set or default value.
// If the checkbox is not checked, set the pref to an empty string.
function OnLightningChanged(aChecked)
{
  var prefLightningUA = document.getElementById("calendar.useragent.extra");

  if (aChecked && !gLightningUAold)
    prefLightningUA.reset();
  else
    prefLightningUA.value = (aChecked && gLightningUAold) || "";
}
