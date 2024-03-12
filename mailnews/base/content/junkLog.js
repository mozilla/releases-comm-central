/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);

var gLogView;
var gLogFile;

window.addEventListener("DOMContentLoaded", onLoad);

function onLoad() {
  gLogView = document.getElementById("logView");
  gLogView.browsingContext.allowJavascript = false; // for security, disable JS

  gLogView.addEventListener("load", () => {
    addStyling();
  });

  gLogFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  gLogFile.append("junklog.html");
  if (gLogFile.exists()) {
    MailE10SUtils.loadURI(gLogView, Services.io.newFileURI(gLogFile).spec);
  } else {
    addStyling(); // set style for initial about:blank
  }
}

function clearLog() {
  if (gLogFile.exists()) {
    gLogFile.remove(false);
    gLogView.setAttribute("src", "about:blank"); // we don't have a log file to show
  }
}

function addStyling() {
  const style = gLogView.contentDocument.createElement("style");
  gLogView.contentDocument.head.appendChild(style);
  style.sheet.insertRule(
    `@media (prefers-color-scheme: dark) {
       :root { scrollbar-color: rgba(249, 249, 250, .4) rgba(20, 20, 25, .3);}
       body { color: #f9f9fa; }
     }`
  );
}
