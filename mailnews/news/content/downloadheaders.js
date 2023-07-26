/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var markreadElement = null;
var numberElement = null;

var nntpServer = null;
var args = null;

document.addEventListener("dialogaccept", OkButtonCallback);
document.addEventListener("dialogcancel", CancelButtonCallback);

function OnLoad() {
  let newsBundle = document.getElementById("bundle_news");

  if ("arguments" in window && window.arguments[0]) {
    args = window.arguments[0].QueryInterface(Ci.nsINewsDownloadDialogArgs);
    /* by default, act like the user hit cancel */
    args.hitOK = false;
    /* by default, act like the user did not select download all */
    args.downloadAll = false;

    nntpServer = MailServices.accounts
      .getIncomingServer(args.serverKey)
      .QueryInterface(Ci.nsINntpIncomingServer);

    document.title = newsBundle.getString("downloadHeadersTitlePrefix");

    let infotext = newsBundle.getFormattedString("downloadHeadersInfoText", [
      args.articleCount,
    ]);
    setText("info", infotext);
    let okButtonText = newsBundle.getString("okButtonText");
    let okbutton = document.querySelector("dialog").getButton("accept");
    okbutton.setAttribute("label", okButtonText);
    okbutton.focus();
    setText("newsgroupLabel", args.groupName);
  }

  numberElement = document.getElementById("number");
  numberElement.value = nntpServer.maxArticles;

  markreadElement = document.getElementById("markread");
  markreadElement.checked = nntpServer.markOldRead;

  setupDownloadUI(true);

  return true;
}

function setText(id, value) {
  let element = document.getElementById(id);
  if (!element) {
    return;
  }

  while (element.lastChild) {
    element.lastChild.remove();
  }
  let textNode = document.createTextNode(value);
  element.appendChild(textNode);
}

function OkButtonCallback() {
  nntpServer.maxArticles = numberElement.value;
  nntpServer.markOldRead = markreadElement.checked;

  let radio = document.getElementById("all");
  if (radio) {
    args.downloadAll = radio.selected;
  }

  args.hitOK = true;
}

function CancelButtonCallback() {
  args.hitOK = false;
}

function setupDownloadUI(enable) {
  let checkbox = document.getElementById("markread");
  let numberFld = document.getElementById("number");

  checkbox.disabled = !enable;
  numberFld.disabled = !enable;
  numberFld.select();
}
