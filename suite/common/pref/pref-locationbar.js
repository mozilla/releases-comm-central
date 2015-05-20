/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{
  // On systems that has the file view component, autoFill and showPopup will
  // return results from local browsing "history", even if autocomplete.enabled
  // is turned off, so we'll need to remove the dependent look in the ui.

  if ("@mozilla.org/autocomplete/search;1?name=file" in Components.classes)
  {
    // We indent the checkboxes with the class attribute set to "indent", so
    // just remove the attribute.
    document.getElementById("autoFill").removeAttribute("class");
    document.getElementById("showPopup").removeAttribute("class");
  }

  updateDependent();
}

function updateDependent()
{
  var matchHistoryPref = document.getElementById("browser.urlbar.suggest.history");
  EnableElementById("matchOnlyTyped", matchHistoryPref.value);

  var matchBookmarkPref = document.getElementById("browser.urlbar.suggest.bookmark");
  var autoCompleteEnabled = matchHistoryPref.value || matchBookmarkPref.value;
  EnableElementById("matchBehavior", autoCompleteEnabled);

  // If autoFill has a class attribute, we don't have the file view component.
  // We then need to update autoFill and showPopup.
  if (document.getElementById("autoFill").hasAttribute("class"))
  {
    EnableElementById("autoFill", autoCompleteEnabled);
    EnableElementById("showPopup", autoCompleteEnabled);
  }

  // We need to update autocomplete.enabled as the backend still respects it.
  document.getElementById("browser.urlbar.autocomplete.enabled").value =
    autoCompleteEnabled;
}
