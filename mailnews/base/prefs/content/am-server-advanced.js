/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

// pull stuff out of window.arguments
var gServerSettings = window.arguments[0];

var gFirstDeferredAccount;
// initialize the controls with the "gServerSettings" argument

var gControls;
function getControls()
{
  if (!gControls)
    gControls = document.getElementsByAttribute("amsa_persist", "true");
  return gControls;
}

function getLocalFoldersAccount()
{
  return MailServices.accounts
    .FindAccountForServer(MailServices.accounts.localFoldersServer);
}

function onLoad()
{
  var prettyName = gServerSettings.serverPrettyName;

  if (prettyName)
    document.getElementById("serverPrettyName").value = 
      document.getElementById("bundle_prefs")
              .getFormattedString("forAccount", [prettyName]);

  if (gServerSettings.serverType == "imap")
  {
    document.getElementById("pop3Panel").hidden = true;
  }
  else if (gServerSettings.serverType == "pop3")
  {
    document.getElementById("imapPanel").hidden = true;
    let radioGroup = document.getElementById("folderStorage");

    gFirstDeferredAccount = gServerSettings.deferredToAccount;
    let folderPopup = document.getElementById("deferredServerPopup");

    // The current account should not be shown in the folder picker
    // of the "other account" option.
    folderPopup._teardown();
    folderPopup.setAttribute("excludeServers",
                             gServerSettings.account.incomingServer.key);
    folderPopup._ensureInitialized();

    if (gFirstDeferredAccount.length)
    {
      // The current account is deferred.
      let account = MailServices.accounts.getAccount(gFirstDeferredAccount);
      radioGroup.value = "otherAccount";
      folderPopup.selectFolder(account.incomingServer.rootFolder);
    }
    else
    {
      // Current account is not deferred.
      radioGroup.value = "currentAccount";
      // If there are no suitable accounts to defer to, then the menulist is
      // disabled by the picker with an appropriate message.
      folderPopup.selectFolder();
      if (gServerSettings.account.incomingServer.isDeferredTo) {
        // Some other account already defers to this account
        // therefore this one can't be deferred further.
        radioGroup.disabled = true;
      }
    }

    let picker = document.getElementById("deferredServerFolderPicker");
    picker.disabled = radioGroup.selectedIndex != 1;
  }

  var controls = getControls();

  for (var i = 0; i < controls.length; i++)
  {
    var slot = controls[i].id;
    if (slot in gServerSettings)
    {
      if (controls[i].localName == "checkbox")
        controls[i].checked = gServerSettings[slot];
      else
        controls[i].value = gServerSettings[slot];
    }
  }
}

function onOk()
{
  // Handle account deferral settings for POP3 accounts.
  if (gServerSettings.serverType == "pop3")
  {
    var radioGroup = document.getElementById("folderStorage");
    var gPrefsBundle = document.getElementById("bundle_prefs");
    let picker = document.getElementById("deferredServerFolderPicker");

    // This account wasn't previously deferred, but is now deferred.
    if (radioGroup.value != "currentAccount" && !gFirstDeferredAccount.length)
    {
      // If the user hasn't selected a folder, keep the default.
      if (!picker.selectedItem)
        return true;

      var confirmDeferAccount =
        gPrefsBundle.getString("confirmDeferAccountWarning");

      var confirmTitle = gPrefsBundle.getString("confirmDeferAccountTitle");

      if (!Services.prompt.confirm(window, confirmTitle, confirmDeferAccount))
        return false;
    }
    switch (radioGroup.value)
    {
      case "currentAccount":
        gServerSettings['deferredToAccount'] = "";
        break;
      case "otherAccount":
        let server = picker.selectedItem._folder.server;
        let account = MailServices.accounts.FindAccountForServer(server);
        gServerSettings['deferredToAccount'] = account.key;
        break;
    }
  }

  // Save the controls back to the "gServerSettings" array.
  var controls = getControls();
  for (var i = 0; i < controls.length; i++)
  {
    var slot = controls[i].id;
    if (slot in gServerSettings)
    {
      if (controls[i].localName == "checkbox")
        gServerSettings[slot] = controls[i].checked;
      else
        gServerSettings[slot] = controls[i].value;
    }
  }

  return true;
}


// Set radio element choices and picker states
function updateInboxAccount(enablePicker)
{
  document.getElementById("deferredServerFolderPicker").disabled = !enablePicker;
  document.getElementById("deferGetNewMail").disabled = !enablePicker;
}
