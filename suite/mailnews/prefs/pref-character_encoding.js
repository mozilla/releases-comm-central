/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The contents of this file will be loaded into the scope of the object
// <prefpane id="character_encoding_pane">!

var updatingPref = false;

function Startup ()
{
  PrefChanged(document.getElementById('mailnews.view_default_charset'));
  PrefChanged(document.getElementById('mailnews.send_default_charset'));
}

function PrefChanged(aPref)
{
  if (updatingPref)
    return;

  var id = aPref.id.substr(9, 4) + "DefaultCharsetList";
  var menulist = document.getElementById(id);
  if (!aPref.hasUserValue)
    menulist.selectedIndex = 0;
  else {
    var bundle = document.getElementById("charsetBundle");
    menulist.value = bundle.getString(aPref.value.toLowerCase());
  }
}

function UpdatePref(aMenulist)
{
  updatingPref = true;
  var id = "mailnews." + aMenulist.id.substr(0, 4) + "_default_charset";
  var pref = document.getElementById(id);
  if (aMenulist.selectedIndex)
    pref.value = aMenulist.value;
  else
    pref.value = undefined; // reset to default
  updatingPref = false;
}
