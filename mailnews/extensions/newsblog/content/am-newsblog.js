/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/FeedUtils.jsm");

var gServer, autotagEnable, autotagUsePrefix, autotagPrefix;

function onInit(aPageId, aServerId)
{
  var accountName = document.getElementById("server.prettyName");
  var title = document.getElementById("am-newsblog-title");
  var defaultTitle = title.getAttribute("defaultTitle");

  var titleValue;
  if (accountName.value)
    titleValue = defaultTitle + " - <" + accountName.value + ">";
  else
    titleValue = defaultTitle;

  title.setAttribute("title", titleValue);
  document.title = titleValue;

  onCheckItem("server.biffMinutes", ["server.doBiff"]);

  autotagEnable = document.getElementById("autotagEnable");
  autotagUsePrefix = document.getElementById("autotagUsePrefix");
  autotagPrefix = document.getElementById("autotagPrefix");

  let categoryPrefsAcct = FeedUtils.getOptionsAcct(gServer).category;
  autotagEnable.checked = categoryPrefsAcct.enabled;
  autotagUsePrefix.disabled = !autotagEnable.checked;
  autotagUsePrefix.checked = categoryPrefsAcct.prefixEnabled;
  autotagPrefix.disabled = autotagUsePrefix.disabled || !autotagUsePrefix.checked;
  autotagPrefix.value = categoryPrefsAcct.prefix;
}

function onPreInit(account, accountValues)
{
  gServer = account.incomingServer;
}

function setCategoryPrefs(aNode)
{
  let options =  FeedUtils.getOptionsAcct(gServer);
  switch (aNode.id) {
    case "autotagEnable":
      options.category.enabled = aNode.checked;
      autotagUsePrefix.disabled = !aNode.checked;
      autotagPrefix.disabled = !aNode.checked || !autotagUsePrefix.checked;
      break;
    case "autotagUsePrefix":
      options.category.prefixEnabled = aNode.checked;
      autotagPrefix.disabled = aNode.disabled || !aNode.checked;
      break;
    case "autotagPrefix":
      options.category.prefix = aNode.value;
      break;
  }

  FeedUtils.setOptionsAcct(gServer, options)
}
