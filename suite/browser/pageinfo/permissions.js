/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0. */

const { SitePermissions } = ChromeUtils.import("resource:///modules/SitePermissions.jsm");
const { BrowserUtils } = ChromeUtils.import("resource://gre/modules/BrowserUtils.jsm"");

var gPermURI;
var gPermPrincipal;

// Array of permissionIDs sorted alphabetically by label.
var gPermissions = SitePermissions.listPermissions().sort((a, b) => {
  let firstLabel = SitePermissions.getPermissionLabel(a);
  let secondLabel = SitePermissions.getPermissionLabel(b);
  return firstLabel.localeCompare(secondLabel);
});

var permissionObserver = {
  observe: function (aSubject, aTopic, aData)
  {
    if (aTopic == "perm-changed") {
      var permission = aSubject.QueryInterface(Ci.nsIPermission);
      if (permission.matches(gPermPrincipal, true) &&
          gPermissions.includes(permission.type)) {
        initRow(permission.type);
      }
    }
  }
};

function initPermission()
{
  onUnloadRegistry.push(onUnloadPermission);
  onResetRegistry.push(onUnloadPermission);
}

function onLoadPermission()
{
  gPermURI = BrowserUtils.makeURIFromCPOW(gDocument.documentURIObject);
  if (!SitePermissions.isSupportedURI(gPermURI))
    return;
  gPermPrincipal = gDocument.nodePrincipal;
  if (!gPermPrincipal.isSystemPrincipal) {
    var hostText = document.getElementById("hostText");
    hostText.value = gPermPrincipal.origin;
    Services.obs.addObserver(permissionObserver, "perm-changed");
  }
  for (var i of gPermissions)
    initRow(i);
}

function onUnloadPermission()
{
  if (!gPermPrincipal.isSystemPrincipal) {
    Services.obs.removeObserver(permissionObserver, "perm-changed");
  }
}

function initRow(aPartId)
{
  createRow(aPartId);

  var checkbox = document.getElementById(aPartId + "Def");
  var command  = document.getElementById("cmd_" + aPartId + "Toggle");
  if (gPermPrincipal.isSystemPrincipal) {
    checkbox.checked = false;
    checkbox.setAttribute("disabled", "true");
    command.setAttribute("disabled", "true");
    document.getElementById(aPartId + "RadioGroup").selectedItem = null;
    return;
  }
  checkbox.removeAttribute("disabled");
  var {state} = SitePermissions.get(gPermURI, aPartId);

  if (state != SitePermissions.UNKNOWN) {
    checkbox.checked = false;
    command.removeAttribute("disabled");
  }
  else {
    checkbox.checked = true;
    command.setAttribute("disabled", "true");
    state = SitePermissions.getDefault(aPartId);
  }
  setRadioState(aPartId, state);
}

function createRow(aPartId) {
  let rowId = "perm-" + aPartId + "-row";
  if (document.getElementById(rowId))
    return;

  let commandId = "cmd_" + aPartId + "Toggle";
  let labelId = "perm-" + aPartId + "-label";
  let radiogroupId = aPartId + "RadioGroup";

  let command = document.createElement("command");
  command.setAttribute("id", commandId);
  command.setAttribute("oncommand", "onRadioClick('" + aPartId + "');");
  document.getElementById("pageInfoCommandSet").appendChild(command);

  let row = document.createElement("richlistitem");
  row.setAttribute("id", rowId);
  row.setAttribute("class", "permission");
  row.setAttribute("orient", "vertical");

  let label = document.createElement("label");
  label.setAttribute("id", labelId);
  label.setAttribute("control", radiogroupId);
  label.setAttribute("value", SitePermissions.getPermissionLabel(aPartId));
  label.setAttribute("class", "permissionLabel");
  row.appendChild(label);

  let controls = document.createElement("hbox");
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-labelledby", labelId);

  let checkbox = document.createElement("checkbox");
  checkbox.setAttribute("id", aPartId + "Def");
  checkbox.setAttribute("oncommand", "onCheckboxClick('" + aPartId + "');");
  checkbox.setAttribute("label", gBundle.getString("permissions.useDefault"));
  controls.appendChild(checkbox);

  let spacer = document.createElement("spacer");
  spacer.setAttribute("flex", "1");
  controls.appendChild(spacer);

  let radiogroup = document.createElement("radiogroup");
  radiogroup.setAttribute("id", radiogroupId);
  radiogroup.setAttribute("orient", "horizontal");
  for (let state of SitePermissions.getAvailableStates(aPartId)) {
    let radio = document.createElement("radio");
    radio.setAttribute("id", aPartId + "#" + state);
    radio.setAttribute("label",
                       SitePermissions.getMultichoiceStateLabel(state));
    radio.setAttribute("command", commandId);
    radiogroup.appendChild(radio);
  }
  controls.appendChild(radiogroup);

  row.appendChild(controls);

  document.getElementById("permList").appendChild(row);
}

function onCheckboxClick(aPartId)
{
  var command  = document.getElementById("cmd_" + aPartId + "Toggle");
  var checkbox = document.getElementById(aPartId + "Def");
  if (checkbox.checked) {
    SitePermissions.remove(gPermURI, aPartId);
    command.setAttribute("disabled", "true");
    var perm = SitePermissions.getDefault(aPartId);
    setRadioState(aPartId, perm);
  }
  else {
    onRadioClick(aPartId);
    command.removeAttribute("disabled");
  }
}

function onRadioClick(aPartId)
{
  var radioGroup = document.getElementById(aPartId + "RadioGroup");
  var id = radioGroup.selectedItem.id;
  var permission = parseInt(id.split("#")[1]);
  SitePermissions.set(gPermURI, aPartId, permission);
}

function setRadioState(aPartId, aValue)
{
  var radio = document.getElementById(aPartId + "#" + aValue);
  if (radio) {
    radio.radioGroup.selectedItem = radio;
  }
}
