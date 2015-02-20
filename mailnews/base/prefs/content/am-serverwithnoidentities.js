/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gServer;

function onInit(aPageId, aServerId) {

  // UI for account store type
  let storeTypeElement = document.getElementById("server.storeTypeMenulist");
  // set the menuitem to match the account
  let currentStoreID = document.getElementById("server.storeContractID")
                               .getAttribute("value");
  let targetItem = storeTypeElement.getElementsByAttribute("value", currentStoreID);
  storeTypeElement.selectedItem = targetItem[0];
  // disable store type change if store has already been used
  storeTypeElement.setAttribute("disabled",
    gServer.getBoolValue("canChangeStoreType") ? "false" : "true");
}

function onPreInit(account, accountValues) {
  gServer = account.incomingServer;
}

function onSave()
{
  let storeContractID = document.getElementById("server.storeTypeMenulist")
                                .selectedItem
                                .value;
  document.getElementById("server.storeContractID")
          .setAttribute("value", storeContractID);
}

