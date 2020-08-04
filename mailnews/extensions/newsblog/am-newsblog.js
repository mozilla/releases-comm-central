/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

var gAccount,
  gUpdateEnabled,
  gUpdateValue,
  gBiffUnits,
  gAutotagEnable,
  gAutotagUsePrefix,
  gAutotagPrefix;

function onInit(aPageId, aServerId) {
  var accountName = document.getElementById("server.prettyName");
  var title = document.querySelector("#am-newsblog-title .dialogheader-title");
  var defaultTitle = title.getAttribute("defaultTitle");

  var titleValue;
  if (accountName.value) {
    titleValue = defaultTitle + " - <" + accountName.value + ">";
  } else {
    titleValue = defaultTitle;
  }

  title.setAttribute("value", titleValue);
  document.title = titleValue;

  let optionsAcct = FeedUtils.getOptionsAcct(gAccount.incomingServer);
  document.getElementById("doBiff").checked = optionsAcct.doBiff;

  gUpdateEnabled = document.getElementById("updateEnabled");
  gUpdateValue = document.getElementById("updateValue");
  gBiffUnits = document.getElementById("biffUnits");
  gAutotagEnable = document.getElementById("autotagEnable");
  gAutotagUsePrefix = document.getElementById("autotagUsePrefix");
  gAutotagPrefix = document.getElementById("autotagPrefix");

  gUpdateEnabled.checked = optionsAcct.updates.enabled;
  gBiffUnits.value = optionsAcct.updates.updateUnits;
  let minutes =
    optionsAcct.updates.updateUnits == FeedUtils.kBiffUnitsMinutes
      ? optionsAcct.updates.updateMinutes
      : optionsAcct.updates.updateMinutes / (24 * 60);
  gUpdateValue.value = Number(minutes);
  onCheckItem("updateValue", ["updateEnabled"]);
  onCheckItem("biffMinutes", ["updateEnabled"]);
  onCheckItem("biffDays", ["updateEnabled"]);

  gAutotagEnable.checked = optionsAcct.category.enabled;
  gAutotagUsePrefix.disabled = !gAutotagEnable.checked;
  gAutotagUsePrefix.checked = optionsAcct.category.prefixEnabled;
  gAutotagPrefix.disabled =
    gAutotagUsePrefix.disabled || !gAutotagUsePrefix.checked;
  gAutotagPrefix.value = optionsAcct.category.prefix;
}

function onPreInit(account, accountValues) {
  gAccount = account;
}

function setPrefs(aNode) {
  let optionsAcct = FeedUtils.getOptionsAcct(gAccount.incomingServer);
  switch (aNode.id) {
    case "doBiff":
      FeedUtils.pauseFeedFolderUpdates(
        gAccount.incomingServer.rootFolder,
        !aNode.checked,
        true
      );
      break;
    case "updateEnabled":
    case "updateValue":
    case "biffUnits":
      optionsAcct.updates.enabled = gUpdateEnabled.checked;
      onCheckItem("updateValue", ["updateEnabled"]);
      onCheckItem("biffMinutes", ["updateEnabled"]);
      onCheckItem("biffDays", ["updateEnabled"]);
      let minutes =
        gBiffUnits.value == FeedUtils.kBiffUnitsMinutes
          ? gUpdateValue.value
          : gUpdateValue.value * 24 * 60;
      optionsAcct.updates.updateMinutes = Number(minutes);
      optionsAcct.updates.updateUnits = gBiffUnits.value;
      break;
    case "autotagEnable":
      optionsAcct.category.enabled = aNode.checked;
      gAutotagUsePrefix.disabled = !aNode.checked;
      gAutotagPrefix.disabled = !aNode.checked || !gAutotagUsePrefix.checked;
      break;
    case "autotagUsePrefix":
      optionsAcct.category.prefixEnabled = aNode.checked;
      gAutotagPrefix.disabled = aNode.disabled || !aNode.checked;
      break;
    case "autotagPrefix":
      optionsAcct.category.prefix = aNode.value;
      break;
  }

  FeedUtils.setOptionsAcct(gAccount.incomingServer, optionsAcct);
}
