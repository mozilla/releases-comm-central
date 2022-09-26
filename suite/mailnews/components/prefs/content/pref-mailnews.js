/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{
  startPageCheck();
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
