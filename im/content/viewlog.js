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
  let deck = document.getElementById("browserDeck");
  let id = (parseInt(deck.selectedIndex, 10) ? "conv" : "text") + "-browser";
  let browser = document.getElementById(id);
  browser.selectedBrowser = browser; // for macgestures.js
  return browser;
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

    document.getElementById("text-browser")
            .addEventListener("DOMContentLoaded", logWindow.contentLoaded, true);
    document.getElementById("conv-browser").progressBar =
      document.getElementById("browserProgress");
  },

  pendingLoad: false,
  onselect: function lw_onselect() {
    let log = document.getElementById("logList").selectedItem.log;
    let deck = document.getElementById("browserDeck");
    let findbar = document.getElementById("findbar");
    let conv = log.getConversation();
    if (conv) {
      deck.selectedIndex = 1;
      let browser = document.getElementById("conv-browser");
      findbar.browser = browser;
      FullZoom.setSettingValue();
      if (this.pendingLoad) {
        browser._conv = conv;
        return;
      }
      browser.init(conv);
      this.pendingLoad = true;
      Services.obs.addObserver(this, "conversation-loaded", false);
      return;
    }

    deck.selectedIndex = 0;
    let browser = document.getElementById("text-browser");
    findbar.browser = browser;
    FullZoom.setSettingValue();
    browser.documentCharsetInfo.forcedCharset =
      browser.mAtomService.getAtom("UTF-8");
    let file = Components.classes["@mozilla.org/file/local;1"]
                         .createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(log.path);
    browser.loadURI(Services.io.newFileURI(file).spec);
  },

  _colorCache: {},
  // Duplicated code from conversation.xml :-(
  _computeColor: function(aName) {
    if (Object.prototype.hasOwnProperty.call(this._colorCache, aName))
      return this._colorCache[aName];

    // Compute the color based on the nick
    var nick = aName.match(/[a-zA-Z0-9]+/);
    nick = nick ? nick[0].toLowerCase() : nick = aName;
    var weight = 10;
    var res = 0;
    for (var i = 0; i < nick.length; ++i) {
      var char = nick.charCodeAt(i) - 47;
      if (char > 10)
        char -= 39;
      // now char contains a value between 1 and 36
      res += char * weight;
           weight *= 0.52; //arbitrary
    }
    return (this._colorCache[aName] = Math.round(res) % 360);
  },
  observe: function(aSubject, aTopic, aData) {
    let browser = document.getElementById("conv-browser");
    if (aTopic != "conversation-loaded" || aSubject != browser)
      return;
    for each (let msg in browser._conv.getMessages()) {
      if (!msg.system)
        msg.color = "color: hsl(" + this._computeColor(msg.who) + ", 100%, 40%);";
      browser.appendMessage(msg);
    }
    delete this.pendingLoad;
    Services.obs.removeObserver(this, "conversation-loaded");
  },

  contentLoaded: function lw_contentLoaded() {
    let doc = document.getElementById("text-browser").contentDocument;
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
