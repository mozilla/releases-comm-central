/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gFilterList;
var gLogFilters;
var gLogView;

function onLoad()
{
  gFilterList = window.arguments[0].filterList;

  gLogFilters = document.getElementById("logFilters");
  gLogFilters.checked = gFilterList.loggingEnabled;

  gLogView = document.getElementById("logView");

  // for security, disable JS
  gLogView.docShell.allowJavascript = false;

  gLogView.setAttribute("src", gFilterList.logURL);
}

function toggleLogFilters()
{
  gFilterList.loggingEnabled =  gLogFilters.checked;
}

function clearLog()
{
  gFilterList.clearLog();

  // reload the newly truncated file
  gLogView.reload();
}

