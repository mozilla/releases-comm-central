/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Benedikt P. <leeraccount@yahoo.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// viewZoomOverlay.js uses this
function getBrowser() {
  return document.getElementById("browser");
}

var logWindow = {
  load: function mo_load() {
    let logs = window.arguments[0].logs;
    logs.sort(function(log1, log2) log2.time - log1.time);
    let displayname = window.arguments[1];
    if (displayname) {
      let bundle = document.getElementById("bundle_instantbird");
      document.title = bundle.getFormattedString("logs", [displayname]) +
        document.documentElement.getAttribute("titlemenuseparator") +
        document.documentElement.getAttribute("titlemodifier");
    }

    let listbox = document.getElementById("logList");
    logs.forEach(function (aLog) {
      let elt = document.createElement("listitem");
      elt.setAttribute("label", (new Date(aLog.time * 1000)));
      elt.log = aLog;
      listbox.appendChild(elt);
    });
    listbox.selectedIndex = 0;
    listbox.focus();

    let findbar = document.getElementById("findbar");
    // Prevent closing the findbar, go back to list instead
    findbar.close = function() { listbox.focus(); };
    findbar.open();

    let browser = getBrowser();
    browser.addEventListener("DOMContentLoaded", logWindow.contentLoaded, true);
  },

  onselect: function lw_onselect() {
    let browser = getBrowser();
    browser.documentCharsetInfo.forcedCharset =
      browser.mAtomService.getAtom("UTF-8");
    let path = document.getElementById("logList").selectedItem.log.path;
    let file = Components.classes["@mozilla.org/file/local;1"]
                         .createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(path);
    browser.loadURI(Services.io.newFileURI(file).spec);
  },

  contentLoaded: function lw_contentLoaded() {
    let doc = getBrowser().contentDocument;

    let link = doc.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = "data:text/css,pre{white-space: pre-wrap;word-wrap: break-word;}.ib-img-smile {vertical-align: text-bottom;}";
    doc.getElementsByTagName("head")[0].appendChild(link);

    if (!("smileTextNode" in window))
      Components.utils.import("resource:///modules/imSmileys.jsm");
    smileTextNode(doc.getElementsByTagName("pre")[0].firstChild);
  }
};

this.addEventListener("load", logWindow.load);
