/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

// viewZoomOverlay.js and macgestures.js use this.
function getBrowser() {
  let deck = document.getElementById("browserDeck");
  let id = (parseInt(deck.selectedIndex, 10) ? "conv" : "text") + "-browser";
  let browser = document.getElementById(id);
  browser.selectedBrowser = browser; // for macgestures.js
  return browser;
}

var logWindow = {
  load: function lw_load() {
    let displayname = window.arguments[1];
    if (displayname) {
      let bundle = document.getElementById("bundle_instantbird");
      document.title = bundle.getFormattedString("logs", [displayname]) +
        document.documentElement.getAttribute("titlemenuseparator") +
        document.documentElement.getAttribute("titlemodifier");
    }

    // Prevent closing the findbar, go back to logTree instead.
    let findbar = document.getElementById("findbar");
    let logTree = document.getElementById("logTree");
    findbar.close = () => logTree.focus();
    // Ensure the findbar has something to look at.
    let browser = document.getElementById("text-browser");
    findbar.browser = browser;
    findbar.open(); // Requires findbar.browser to be set

    document.getElementById("text-browser")
            .addEventListener("DOMContentLoaded", logWindow.contentLoaded, true);
    document.getElementById("conv-browser").progressBar =
      document.getElementById("browserProgress");

    logTree.focus();
    let treeView = logWindow._treeView =
                   new chatLogTreeView(logTree, window.arguments[0].logs);
    // Select the first line.
    let selectIndex = 0;
    if (treeView.isContainer(selectIndex)) {
      // If the first line is a group, open it and select the
      // next line instead.
      treeView.toggleOpenState(selectIndex++);
    }
    logTree.view.selection.select(selectIndex);

    // If the log viewer window already existed, it may be hidden, so bring
    // the window to the front.
    window.focus();
  },

  pendingLoad: false,
  onselect: function lw_onselect() {
    let selection = this._treeView.selection;
    let currentIndex = selection.currentIndex;
    // The current (focused) row may not be actually selected...
    if (!selection.isSelected(currentIndex))
      return;

    let log = this._treeView._rowMap[currentIndex].log;
    if (!log)
      return;
    if (this._displayedLog && this._displayedLog == log.path)
      return;
    this._displayedLog = log.path;

    let deck = document.getElementById("browserDeck");
    let findbar = document.getElementById("findbar");
    if (log.format == "json") {
      log.getConversation().then((aConv) => {
        if (!aConv) {
          // Empty or completely broken json log file.
          deck.selectedIndex = 2;
          // Ensure the findbar looks at an empty file.
          let browser = document.getElementById("text-browser");
          findbar.browser = browser;
          browser.loadURI("about:blank");
          return;
        }
        deck.selectedIndex = 1;
        let browser = document.getElementById("conv-browser");
        findbar.browser = browser;
        FullZoom.applyPrefValue();
        if (this.pendingLoad) {
          browser._conv = aConv;
          return;
        }
        browser.init(aConv);
        this.pendingLoad = true;
        Services.obs.addObserver(this, "conversation-loaded", false);
      });
    }
    else {
      // Legacy text log.
      deck.selectedIndex = 0;
      let browser = document.getElementById("text-browser");
      findbar.browser = browser;
      FullZoom.applyPrefValue();
      browser.docShell.forcedCharset =
        browser.mAtomService.getAtom("UTF-8");
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      file.initWithPath(log.path);
      browser.loadURI(Services.io.newFileURI(file).spec);
    }
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
    browser.contentDocument.getElementById("ibcontent").classList.add("log");

    let count = {};
    let messages = browser._conv.getMessagesEnumerator(count);
    browser.getPendingMessagesCount = () => count.value;
    browser.getNextPendingMessage = function() {
      if (!messages.hasMoreElements()) {
        delete browser.getNextPendingMessage;
        return null;
      }

      let msg = messages.getNext();
      if (!msg.system && browser._conv.isChat)
        msg.color = "color: hsl(" + logWindow._computeColor(msg.who) + ", 100%, 40%);";
      return {msg: msg, context: false, firstUnread: false};
    };
    browser.delayedDisplayPendingMessages();
    delete this.pendingLoad;
    Services.obs.removeObserver(this, "conversation-loaded");
  },

  contentLoaded: function lw_contentLoaded() {
    let browser = document.getElementById("text-browser");
    if (browser.currentURI.spec == "about:blank")
      return;
    let doc = browser.contentDocument;
    let link = doc.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = "data:text/css,pre{white-space: pre-wrap;word-wrap: break-word;}.ib-img-smile {vertical-align: text-bottom;}";
    doc.getElementsByTagName("head")[0].appendChild(link);

    let elt = doc.getElementsByTagName("pre")[0].firstChild;
    if (!elt) {
      // Text log file is empty.
      document.getElementById("browserDeck").selectedIndex = 2;
      return;
    }
    if (!("smileTextNode" in window))
      Cu.import("resource:///modules/imSmileys.jsm");
    smileTextNode(elt);
  }
};

function chatLogTreeGroupItem(aTitle, aLogItems) {
  this._title = aTitle;
  this._children = aLogItems;
  for (let child of this._children)
    child._parent = this;
  this._open = false;
}
chatLogTreeGroupItem.prototype = {
  getText: function() { return this._title; },
  get id() { return this._title; },
  get open() { return this._open; },
  get level() { return 0; },
  get _parent() { return null; },
  get children() { return this._children; },
  getProperties: () => ""
};

function chatLogTreeLogItem(aLog, aText, aLevel) {
  this.log = aLog;
  this._text = aText;
  this._level = aLevel;
}
chatLogTreeLogItem.prototype = {
  getText: function() { return this._text; },
  get id() { return this.log.title; },
  get open() { return false; },
  get level() { return this._level; },
  get children() { return []; },
  getProperties: () => ""
};

function chatLogTreeView(aTree, aLogs) {
  this._tree = aTree;
  this._logs = aLogs;
  this._tree.view = this;
  this._rebuild();
}
chatLogTreeView.prototype = {
  __proto__: new PROTO_TREE_VIEW(),

  _rebuild: function cLTV__rebuild() {
    // Some date helpers...
    const kDayInMsecs = 24 * 60 * 60 * 1000;
    const kWeekInMsecs = 7 * kDayInMsecs;
    const kTwoWeeksInMsecs = 2 * kWeekInMsecs;

    // Drop the old rowMap.
    if (this._tree)
      this._tree.rowCountChanged(0, -this._rowMap.length);
    this._rowMap = [];

    // Used to show the dates in the log list in the locale of the application.
    let chatBundle = document.getElementById("bundle_instantbird");
    let dateFormatBundle = document.getElementById("bundle_dateformat");
    let placesBundle = document.getElementById("bundle_places");
    let dts = Cc["@mozilla.org/intl/scriptabledateformat;1"].getService(Ci.nsIScriptableDateFormat);
    let formatDate = function(aDate) {
      return dts.FormatDate("", dts.dateFormatShort, aDate.getFullYear(),
                            aDate.getMonth() + 1, aDate.getDate());
    };
    let formatDateTime = function(aDate) {
      return dts.FormatDateTime("", dts.dateFormatShort,
                                dts.timeFormatNoSeconds, aDate.getFullYear(),
                                aDate.getMonth() + 1, aDate.getDate(),
                                aDate.getHours(), aDate.getMinutes(), 0);
    };
    let formatMonthYear = function(aDate) {
      let month = formatMonth(aDate);
      return placesBundle.getFormattedString("finduri-MonthYear",
                                             [month, aDate.getFullYear()]);
    };
    let formatMonth = aDate =>
      dateFormatBundle.getString("month." + (aDate.getMonth() + 1) + ".name");
    let formatWeekday = aDate =>
      dateFormatBundle.getString("day." + (aDate.getDay() + 1) + ".name");

    let nowDate = new Date();
    let todayDate = new Date(nowDate.getFullYear(), nowDate.getMonth(),
                             nowDate.getDate());

    // The keys used in the 'firstgroups' object should match string ids.
    // The order is the reverse of that in which they will appear
    // in the logTree.
    let firstgroups = {
      previousWeek: [],
      currentWeek: [],
      yesterday: [],
      today: []
    };

    // today and yesterday are treated differently, because for JSON logs they
    // represent individual logs, and are not "groups".
    let today = null, yesterday = null;

    // Build a chatLogTreeLogItem for each log, and put it in the right group.
    let groups = {};
    for (let log of getIter(this._logs)) {
      let logDate = new Date(log.time * 1000);
      // Calculate elapsed time between the log and 00:00:00 today.
      let timeFromToday = todayDate - logDate;
      let isJSON = log.format == "json";
      let title = (isJSON ? formatDate : formatDateTime)(logDate);
      let group;
      if (timeFromToday <= 0) {
        if (isJSON) {
          today = new chatLogTreeLogItem(log, chatBundle.getString("log.today"), 0);
          continue;
        }
        group = firstgroups.today;
      }
      else if (timeFromToday <= kDayInMsecs) {
        if (isJSON) {
          yesterday = new chatLogTreeLogItem(log, chatBundle.getString("log.yesterday"), 0);
          continue;
        }
        group = firstgroups.yesterday;
      }
      // Note that the 7 days of the current week include today.
      else if (timeFromToday <= kWeekInMsecs - kDayInMsecs) {
        group = firstgroups.currentWeek;
        if (isJSON)
          title = formatWeekday(logDate);
      }
      else if (timeFromToday <= kTwoWeeksInMsecs - kDayInMsecs)
        group = firstgroups.previousWeek;
      else {
        logDate.setHours(0);
        logDate.setMinutes(0);
        logDate.setSeconds(0);
        logDate.setDate(1);
        let groupID = logDate.toISOString();
        if (!(groupID in groups)) {
          let groupname;
          if (logDate.getFullYear() == nowDate.getFullYear()) {
            if (logDate.getMonth() == nowDate.getMonth())
              groupname = placesBundle.getString("finduri-AgeInMonths-is-0");
            else
              groupname = formatMonth(logDate);
          }
          else
            groupname = formatMonthYear(logDate);
          groups[groupID] = {
            entries: [],
            name: groupname
          };
        }
        group = groups[groupID].entries;
      }
      group.push(new chatLogTreeLogItem(log, title, 1));
    }

    let groupIDs = Object.keys(groups).sort().reverse();

    // Add firstgroups to groups and groupIDs.
    for (let groupID in firstgroups) {
      let group = firstgroups[groupID];
      if (!group.length)
        continue;
      groupIDs.unshift(groupID);
      groups[groupID] = {
        entries: firstgroups[groupID],
        name: chatBundle.getString("log." + groupID)
      };
    }

    // Build tree.
    if (today)
      this._rowMap.push(today);
    if (yesterday)
      this._rowMap.push(yesterday);
    groupIDs.forEach(function (aGroupID) {
      let group = groups[aGroupID];
      group.entries.sort((l1, l2) => l2.log.time - l1.log.time);
      this._rowMap.push(new chatLogTreeGroupItem(group.name, group.entries));
    }, this);

    // Finally, notify the tree.
    if (this._tree)
      this._tree.rowCountChanged(0, this._rowMap.length);
  }
};

this.addEventListener("load", logWindow.load);
