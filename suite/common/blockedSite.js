/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Error url MUST be formatted like this:
//   about:blocked?e=error_code&u=url

// Note that this file uses document.documentURI to get
// the URL (with the format from above). This is because
// document.location.href gets the current URI off the docshell,
// which is the URL displayed in the location bar, i.e.
// the URI that the user attempted to load.

// initializing the page in this way, window.onload won't work here

initPage();

function getErrorCode()
{
  var url = document.documentURI;
  var error = url.indexOf("e=");
  var duffUrl = url.indexOf("&u=");
  return url.slice(error + 2, duffUrl);
}

function getURL()
{
  var url = document.documentURI;
  var match = url.match(/&u=([^&]+)&/);

  // match == null if not found; if so, return an empty string
  // instead of what would turn out to be portions of the URI
  if (!match)
    return "";

  url = decodeURIComponent(match[1]);

  // If this is a view-source page, then get then real URI of the page
  if (url.startsWith("view-source:"))
    url = url.slice(12);
  return url;
}

/**
 * Attempt to get the hostname via document.location.  Fail back
 * to getURL so that we always return something meaningful.
 */
function getHostString()
{
  try {
    return document.location.hostname;
  } catch (e) {
    return getURL();
  }
}

function initPage()
{
  // Handoff to the appropriate initializer, based on error code
  switch (getErrorCode()) {
    case "malwareBlocked":
      initPage_malware();
      break;
    case "phishingBlocked":
      initPage_phishing();
      break;
  }
}

/**
 * Initialize custom strings and functionality for blocked malware case
 */
function initPage_malware()
{
  // Remove phishing strings
  document.getElementById("errorTitleText_phishing").remove();
  document.getElementById("errorShortDescText_phishing").remove();
  document.getElementById("errorLongDescText_phishing").remove();

  // Set sitename
  document.getElementById("malware_sitename").textContent = getHostString();
  document.title = document.getElementById("errorTitleText_malware")
                           .textContent;
}

/**
 * Initialize custom strings and functionality for blocked phishing case
 */
function initPage_phishing()
{
  // Remove malware strings
  document.getElementById("errorTitleText_malware").remove();
  document.getElementById("errorShortDescText_malware").remove();
  document.getElementById("errorLongDescText_malware").remove();

  // Set sitename
  document.getElementById("phishing_sitename").textContent = getHostString();
  document.title = document.getElementById("errorTitleText_phishing")
                           .textContent;
}
