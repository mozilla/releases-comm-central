/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

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

    // Used to show the dates in the log list in the locale of the application.
    let appLocaleCode = Services.prefs.getCharPref("general.useragent.locale");
    let dts = Cc["@mozilla.org/intl/scriptabledateformat;1"]
                .getService(Ci.nsIScriptableDateFormat);

    let listbox = document.getElementById("logList");
    logs.forEach(function (aLog) {
      let elt = document.createElement("listitem");
      let logDate = new Date(aLog.time * 1000);
      let localizedDateTimeString =
        dts.FormatDateTime(appLocaleCode, dts.dateFormatLong,
                           dts.timeFormatNoSeconds, logDate.getFullYear(),
                           logDate.getMonth() + 1, logDate.getDate(),
                           logDate.getHours(), logDate.getMinutes(), 0);
      elt.setAttribute("label", localizedDateTimeString);
      elt.log = aLog;
      listbox.appendChild(elt);
    });
    listbox.focus();
    // Hack: Only select the first log after a brief delay, or the first
    // listitem never appears selected on Windows and Linux.
    Services.tm.mainThread.dispatch(function() {
      listbox.selectedIndex = 0;
      // Prevent closing the findbar, go back to list instead.
      let findbar = document.getElementById("findbar");
      findbar.close = function() { listbox.focus(); };
      // Requires findbar.browser to be set, which is only the case after
      // a log has been selected.
      findbar.open();
    }, Ci.nsIEventTarget.DISPATCH_NORMAL);

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
      FullZoom.applyPrefValue();
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
    FullZoom.applyPrefValue();
    browser.docShell.forcedCharset =
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
    browser._autoScrollEnabled = false;
    for each (let msg in browser._conv.getMessages()) {
      if (!msg.system && browser._conv.isChat)
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
