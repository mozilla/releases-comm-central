/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{
  enableAutocomplete();
}

function onEditDirectories()
{
  window.openDialog("chrome://messenger/content/addressbook/pref-editdirectories.xul",
                    "editDirectories", "chrome,modal=yes,resizable=no", null);
}

function enableAutocomplete()
{
  var acLDAPValue = document.getElementById("ldap_2.autoComplete.useDirectory")
                            .value;

  EnableElementById("directoriesList", acLDAPValue, false);
  EnableElementById("editButton", acLDAPValue, false);
}
