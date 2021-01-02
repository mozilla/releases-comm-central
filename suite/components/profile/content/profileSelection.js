/* -*- Mode: C; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gProfileBundle;
var gBrandBundle;
var gProfileService;
var gProfileManagerMode = "selection";
var gDialogParams = window.arguments[0]
                          .QueryInterface(Ci.nsIDialogParamBlock);

function StartUp()
{
  gProfileBundle = document.getElementById("bundle_profile");
  gBrandBundle = document.getElementById("bundle_brand");
  if (gDialogParams.objects) {
    document.documentElement.getButton("accept").setAttribute("label",
      document.documentElement.getAttribute("buttonlabelstart"));
    document.documentElement.getButton("cancel").setAttribute("label",
      document.documentElement.getAttribute("buttonlabelexit"));
    document.getElementById('intro').textContent =
      document.getElementById('intro').getAttribute("start");
    document.getElementById('offlineState').hidden = false;
    gDialogParams.SetInt(0, 0);
  }

  gProfileService = Cc["@mozilla.org/toolkit/profile-service;1"]
                      .getService(Ci.nsIToolkitProfileService);
  var profileEnum = gProfileService.profiles;
  var selectedProfile = null;
  try {
    selectedProfile = gProfileService.selectedProfile;
  }
  catch (ex) {
  }
  while (profileEnum.hasMoreElements()) {
    AddItem(profileEnum.getNext().QueryInterface(Ci.nsIToolkitProfile),
            selectedProfile);
  }

  var autoSelect = document.getElementById("autoSelect");
  if (Services.prefs.getBoolPref("profile.manage_only_at_launch"))
    autoSelect.hidden = true;
  else
    autoSelect.checked = gProfileService.startWithLastProfile;

  DoEnabling();
}

// function : <profileSelection.js>::AddItem();
// purpose  : utility function for adding items to a tree.
function AddItem(aProfile, aProfileToSelect)
{
  var tree = document.getElementById("profiles");
  var treeitem = document.createElement("treeitem");
  var treerow = document.createElement("treerow");
  var treecell = document.createElement("treecell");
  var treetip = document.getElementById("treetip");
  var profileDir = gProfileService.getProfileByName(aProfile.name).rootDir;

  treecell.setAttribute("label", aProfile.name);
  treerow.appendChild(treecell);
  treeitem.appendChild(treerow);
  treeitem.setAttribute("tooltip", profileDir.path);
  treetip.setAttribute("value", profileDir.path);
  tree.lastChild.appendChild(treeitem);
  treeitem.profile = aProfile;
  if (aProfile == aProfileToSelect) {
    var profileIndex = tree.view.getIndexOfItem(treeitem);
    tree.view.selection.select(profileIndex);
    tree.treeBoxObject.ensureRowIsVisible(profileIndex);
  }
}

// function : <profileSelection.js>::AcceptDialog();
// purpose  : sets the current profile to the selected profile (user choice: "Start Mozilla")
function AcceptDialog()
{
  var autoSelect = document.getElementById("autoSelect");
  if (!autoSelect.hidden) {
    gProfileService.startWithLastProfile = autoSelect.checked;
    gProfileService.flush();
  }

  var profileTree = document.getElementById("profiles");
  var selected = profileTree.view.getItemAtIndex(profileTree.currentIndex);

  if (!gDialogParams.objects) {
    var profD = Services.dirsvc.get("ProfD", Ci.nsIFile);
    var profLD = Services.dirsvc.get("ProfLD", Ci.nsIFile);

    if (selected.profile.rootDir.equals(profD) &&
        selected.profile.localDir.equals(profLD))
      return true;
  }

  try {
    var profileLock = selected.profile.lock({});
    gProfileService.selectedProfile = selected.profile;
    gProfileService.defaultProfile = selected.profile;
    gProfileService.flush();
    if (gDialogParams.objects) {
      gDialogParams.objects.insertElementAt(profileLock, 0);
      gProfileService.startOffline = document.getElementById("offlineState").checked;
      gDialogParams.SetInt(0, 1);
      gDialogParams.SetString(0, selected.profile.name);
      return true;
    }
    profileLock.unlock();
  } catch (e) {
    var brandName = gBrandBundle.getString("brandShortName");
    var message = gProfileBundle.getFormattedString("dirLocked",
                                                    [brandName, selected.profile.name]);
    Services.prompt.alert(window, null, message);
    return false;
  }

  // Although switching profile works by performing a restart internally,
  // the user is quitting the old profile, so make it look like a quit.
  var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"]
                     .createInstance(Ci.nsISupportsPRBool);
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");

  if (cancelQuit.data) {
    return false;
  }

  try {
    var env = Cc["@mozilla.org/process/environment;1"]
                .getService(Ci.nsIEnvironment);
    env.set("XRE_PROFILE_NAME", selected.profile.name);
    env.set("XRE_PROFILE_PATH", selected.profile.rootDir.path);
    env.set("XRE_PROFILE_LOCAL_PATH", selected.profile.localDir.path);
    var app = Services.startup;
    app.quit(app.eAttemptQuit | app.eRestart);
    return true;
  }
  catch (e) {
    env.set("XRE_PROFILE_NAME", "");
    env.set("XRE_PROFILE_PATH", "");
    env.set("XRE_PROFILE_LOCAL_PATH", "");
    return false;
  }
}

// invoke the createProfile Wizard
function CreateProfileWizard()
{
  window.openDialog('chrome://mozapps/content/profile/createProfileWizard.xul',
                    '', 'centerscreen,chrome,modal,titlebar');
}

// update the display to show the additional profile
function CreateProfile(aProfile)
{
  gProfileService.flush();
  AddItem(aProfile, aProfile);
}

// rename the selected profile
function RenameProfile()
{
  var profileTree = document.getElementById("profiles");
  var selected = profileTree.view.getItemAtIndex(profileTree.currentIndex);
  var profileName = selected.profile.name;
  var newName = {value: profileName};
  var dialogTitle = gProfileBundle.getString("renameProfileTitle");
  var msg = gProfileBundle.getFormattedString("renameProfilePrompt", [profileName]);
  var ps = Services.prompt;
  if (ps.prompt(window, dialogTitle, msg, newName, null, {value: 0}) &&
      newName.value != profileName) {
    if (!/\S/.test(newName.value)) {
      ps.alert(window, gProfileBundle.getString("profileNameInvalidTitle"),
               gProfileBundle.getString("profileNameEmpty"));
      return false;
    }

    if (/([\\*:?<>|\/\"])/.test(newName.value)) {
      ps.alert(window, gProfileBundle.getString("profileNameInvalidTitle"),
               gProfileBundle.getFormattedString("invalidChar", [RegExp.$1]));
      return false;
    }

    try {
      gProfileService.getProfileByName(newName.value);
      ps.alert(window, gProfileBundle.getString("profileExistsTitle"),
               gProfileBundle.getString("profileExists"));
      return false;
    }
    catch (e) {
    }

    selected.profile.name = newName.value;
    gProfileService.flush();
    selected.firstChild.firstChild.setAttribute("label", newName.value);
  }
}

function ConfirmDelete()
{
  var profileTree = document.getElementById("profiles");
  var selected = profileTree.view.getItemAtIndex(profileTree.currentIndex);
  if (!selected.profile.rootDir.exists()) {
    DeleteProfile(false);
    return;
  }

  try {
    var profileLock = selected.profile.lock({});
    var dialogTitle = gProfileBundle.getString("deleteTitle");
    var dialogText;

    var path = selected.profile.rootDir.path;
    dialogText = gProfileBundle.getFormattedString("deleteProfile", [path]);
    var ps = Services.prompt;
    var buttonPressed = ps.confirmEx(window, dialogTitle, dialogText,
        (ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_0) +
        (ps.BUTTON_TITLE_CANCEL * ps.BUTTON_POS_1) +
        (ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_2),
        gProfileBundle.getString("dontDeleteFiles"), null,
        gProfileBundle.getString("deleteFiles"), null, {value: 0});
    profileLock.unlock();
    if (buttonPressed != 1)
      DeleteProfile(buttonPressed == 2);
  } catch (e) {
    var dialogTitle = gProfileBundle.getString("deleteTitle");
    var brandName = gBrandBundle.getString("brandShortName");
    var dialogText = gProfileBundle.getFormattedString("deleteLocked",
                                                       [brandName, selected.profile.name]);
    ps.alert(window, dialogTitle, dialogText);
  }
}

// Delete the profile, with the delete flag set as per instruction above.
function DeleteProfile(aDeleteFiles)
{
  var profileTree = document.getElementById("profiles");
  var selected = profileTree.view.getItemAtIndex(profileTree.currentIndex);
  var previous = profileTree.currentIndex && profileTree.currentIndex - 1;

  try {
    selected.profile.remove(aDeleteFiles);
    gProfileService.flush();
    selected.remove();

    if (profileTree.view.rowCount != 0) {
      profileTree.view.selection.select(previous);
      profileTree.treeBoxObject.ensureRowIsVisible(previous);
    }

    // set the button state
    DoEnabling();
  }
  catch (ex) {
    dump("Exception during profile deletion.\n");
  }
}

function SwitchProfileManagerMode()
{
  var captionLine;
  var prattleIndex;

  if (gProfileManagerMode == "selection") {
    prattleIndex = 1;
    captionLine = gProfileBundle.getString("manageTitle");

    document.getElementById("profiles").focus();

    // hide the manage profiles button...
    document.documentElement.getButton("extra2").hidden = true;
    gProfileManagerMode = "manager";
  }
  else {
    prattleIndex = 0;
    captionLine = gProfileBundle.getString("selectTitle");
    gProfileManagerMode = "selection";
  }

  // swap deck
  document.getElementById("prattle").selectedIndex = prattleIndex;

  // change the title of the profile manager/selection window.
  document.getElementById("header").setAttribute("description", captionLine);
  document.title = captionLine;
}

// do button enabling based on tree selection
function DoEnabling()
{
  var acceptButton = document.documentElement.getButton("accept");
  var deleteButton = document.getElementById("deleteButton");
  var renameButton = document.getElementById("renameButton");

  var disabled = document.getElementById("profiles").view.selection.count == 0;
  acceptButton.disabled = disabled;
  deleteButton.disabled = disabled;
  renameButton.disabled = disabled;
}

// handle key event on tree
function HandleKeyEvent(aEvent)
{
  if (gProfileManagerMode != "manager")
    return;

  switch (aEvent.keyCode)
  {
    case KeyEvent.DOM_VK_BACK_SPACE:
    case KeyEvent.DOM_VK_DELETE:
      if (!document.getElementById("deleteButton").disabled)
        ConfirmDelete();
      break;
    case KeyEvent.DOM_VK_F2:
      if (!document.getElementById("renameButton").disabled)
        RenameProfile();
  }
}

function HandleClickEvent(aEvent)
{
  if (aEvent.button == 0 && aEvent.target.parentNode.view.selection.count != 0 && AcceptDialog()) {
    window.close();
    return true;
  }

  return false;
}

function HandleToolTipEvent(aEvent)
{
  var treeTip = document.getElementById("treetip");
  var tree = document.getElementById("profiles");

  var cell = tree.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY);
  if (cell.row < 0)
    aEvent.preventDefault();
  else
    treeTip.label = tree.view.getItemAtIndex(cell.row).tooltip;
}
