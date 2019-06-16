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
  * Check whether this warning page should be overridable or whether
  * the "ignore warning" button should be hidden.
  */
 function getOverride()
 {
   var url = document.documentURI;
   return /&o=1&/.test(url);
 }

/**
 * Attempt to get the hostname via document.location. Fail back
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

function deleteElement(element) {
  var el = document.getElementById(element);
  if (el)
    el.remove();
}

function initPage()
{
  // Handoff to the appropriate initializer, based on error code
  var error = "";
  switch (getErrorCode()) {
    case "malwareBlocked":
      error = "malware";
      break;
    case "deceptiveBlocked":
      error = "phishing";
      break;
    case "unwantedBlocked":
      error = "unwanted";
      break;
    case "harmfulBlocked":
      error = "harmful";
      break;
    default:
      return;
  }

  if (error != "malware") {
    deleteElement("errorTitleText_malware");
    deleteElement("errorShortDescText_malware");
    deleteElement("errorLongDescText_malware");
  }

  if (error != "phishing") {
    deleteElement("errorTitleText_phishing");
    deleteElement("errorShortDescText_phishing");
    deleteElement("errorLongDescText_phishing");
  }

  if (error != "unwanted") {
    deleteElement("errorTitleText_unwanted");
    deleteElement("errorShortDescText_unwanted");
    deleteElement("errorLongDescText_unwanted");
  }

  if (error != "harmful") {
    deleteElement("errorTitleText_harmful");
    deleteElement("errorShortDescText_harmful");
    deleteElement("errorLongDescText_harmful");
  }

  // Set sitename
  document.getElementById(error + "_sitename").textContent = getHostString();
  document.title = document.getElementById("errorTitleText_" + error)
                           .innerHTML;

  if (!getOverride())
    deleteElement("ignoreWarningButton");
}

