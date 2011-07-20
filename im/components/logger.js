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
 * 2010.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

#filter substitution
#ifdef XP_WIN
#define LINE_BREAK \r\n
#else
#define LINE_BREAK \n
#endif

Components.utils.import("resource:///modules/hiddenWindow.jsm");
Components.utils.import("resource:///modules/imXPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

XPCOMUtils.defineLazyServiceGetter(this, "obs",
                                   "@mozilla.org/observer-service;1",
                                   "nsIObserverService");
XPCOMUtils.defineLazyServiceGetter(this, "prefs",
                                   "@mozilla.org/preferences-service;1",
                                   "nsIPrefBranch");
XPCOMUtils.defineLazyGetter(this, "logDir", function() {
  let file = Components.classes["@mozilla.org/file/directory_service;1"]
                       .getService(Components.interfaces.nsIProperties)
                       .get("ProfD", Components.interfaces.nsIFile);
  file.append("logs");
  return file;
});

function getLogFolderForAccount(aAccount, aCreate)
{
  let file = logDir.clone();
  function createIfNotExists(aFile) {
    if (aCreate && !aFile.exists())
      aFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
  }
  createIfNotExists(file);
  file.append(aAccount.protocol.normalizedName);
  createIfNotExists(file);
  file.append(aAccount.normalizedName);
  createIfNotExists(file);
  return file;
}

function getNewLogFileName()
{
  let date = new Date();
  let dateTime = date.toLocaleFormat("%Y-%m-%d.%H%M%S");
  let offset = date.getTimezoneOffset();
  if (offset < 0) {
    dateTime += "+";
    offset *= -1;
  }
  else
    dateTime += "-";
  let minutes = offset % 60;
  offset = (offset - minutes) / 60;
  function twoDigits(aNumber)
    aNumber == 0 ? "00" : aNumber < 10 ? "0" + aNumber : aNumber;
  return dateTime + twoDigits(offset) + twoDigits(minutes) + ".txt";
}

/* Conversation logs stuff */
function ConversationLog(aConversation)
{
  this._conv = aConversation;
}
ConversationLog.prototype = {
  _log: null,
  _init: function cl_init() {
    let file = getLogFolderForAccount(this._conv.account, true);
    file.append(this._conv.normalizedName);
    if (!file.exists())
      file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
    file.append(getNewLogFileName());
    let os = Cc["@mozilla.org/network/file-output-stream;1"].
             createInstance(Ci.nsIFileOutputStream);
    const PR_WRITE_ONLY   = 0x02;
    const PR_CREATE_FILE  = 0x08;
    const PR_APPEND       = 0x10;
    os.init(file, PR_WRITE_ONLY | PR_CREATE_FILE | PR_APPEND, 0666, 0);
    // just to be really sure everything is in UTF8
    let converter = Cc["@mozilla.org/intl/converter-output-stream;1"].
                    createInstance(Ci.nsIConverterOutputStream);
    converter.init(os, "UTF-8", 0, 0);
    this._log = converter;
    this._log.writeString(this._getHeader());
  },
  _getHeader: function cl_getHeader()
  {
    let account = this._conv.account;
    return "Conversation with " + this._conv.name +
           " at " + (new Date).toLocaleString() +
           " on " + account.name +
           " (" + account.protocol.normalizedName + ")@LINE_BREAK@";
  },
  _serialize: function cl_serialize(aString) {
    // TODO cleanup once bug 102699 is fixed
    let doc = getHiddenHTMLWindow().document;
    let div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    div.innerHTML = aString.replace(/\r?\n/g, "<br/>").replace(/<br>/gi, "<br/>");
    const type = "text/plain";
    let encoder =
      Components.classes["@mozilla.org/layout/documentEncoder;1?type=" + type]
                .createInstance(Components.interfaces.nsIDocumentEncoder);
    encoder.init(doc, type, 0);
    encoder.setContainerNode(div);
    encoder.setNodeFixup({fixupNode: function(aNode, aSerializeKids) {
      if (aNode.localName == "a" && aNode.hasAttribute("href")) {
        let url = aNode.getAttribute("href");
        let content = aNode.textContent;
        if (url != content)
          aNode.textContent = content + " (" + url + ")";
      }
      return null;
    }});
    return encoder.encodeToString();
  },
  logMessage: function cl_logMessage(aMessage) {
    if (!this._log)
      this._init();
    let date = new Date(aMessage.time * 1000);
    let line = "(" + date.toLocaleTimeString() + ") ";
    let msg = this._serialize(aMessage.originalMessage);
    if (aMessage.system)
      line += msg;
    else {
      let sender = aMessage.alias || aMessage.who;
      if (aMessage.autoResponse)
        line += sender + " <AUTO-REPLY>: " + msg;
      else {
        if (/^\/me /.test(msg))
          line += "***" + sender + " " + msg.replace(/^\/me /, "");
        else
          line += sender + ": " + msg;
      }
    }
    this._log.writeString(line + "@LINE_BREAK@");
  },

  close: function cl_close() {
    if (this._log) {
      this._log.close();
      this._log = null;
    }
  }
};

const dummyConversationLog = {
  logMessage: function() {},
  close: function() {}
};

var gConversationLogs = { };
function getLogForConversation(aConversation)
{
  let id = aConversation.id;
  if (!(id in gConversationLogs)) {
    let prefName =
      "purple.logging.log_" + (aConversation.isChat ? "chats" : "ims");
    if (prefs.getBoolPref(prefName))
      gConversationLogs[id] = new ConversationLog(aConversation);
    else
      gConversationLogs[id] = dummyConversationLog;
  }
  return gConversationLogs[id];
}

function closeLogForConversation(aConversation)
{
  let id = aConversation.id;
  if (!(id in gConversationLogs))
    return;
  gConversationLogs[id].close();
  delete gConversationLogs[id];
}

/* System logs stuff */
function SystemLog(aAccount)
{
  this._init(aAccount);
  this._log.writeString("System log for account " + aAccount.name +
                        " (" + aAccount.protocol.normalizedName +
                        ") connected at " +
                        (new Date()).toLocaleFormat("%c") + "@LINE_BREAK@");
}
SystemLog.prototype = {
  _log: null,
  _init: function sl_init(aAccount) {
    let file = getLogFolderForAccount(aAccount, true);
    file.append(".system");
    if (!file.exists())
      file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
    file.append(getNewLogFileName());
    let os = Cc["@mozilla.org/network/file-output-stream;1"].
             createInstance(Ci.nsIFileOutputStream);
    const PR_WRITE_ONLY   = 0x02;
    const PR_CREATE_FILE  = 0x08;
    const PR_APPEND       = 0x10;
    os.init(file, PR_WRITE_ONLY | PR_CREATE_FILE | PR_APPEND, 0666, 0);
    // just to be really sure everything is in UTF8
    let converter = Cc["@mozilla.org/intl/converter-output-stream;1"].
                    createInstance(Ci.nsIConverterOutputStream);
    converter.init(os, "UTF-8", 0, 0);
    this._log = converter;
  },
  logEvent: function sl_logEvent(aString) {
    if (!this._log)
      this._init();

    let date = (new Date()).toLocaleFormat("%x %X");
    this._log.writeString("---- " + aString + " @ " + date + " ----@LINE_BREAK@");
  },

  close: function sl_close() {
    if (this._log) {
      this._log.close();
      this._log = null;
    }
  }
};

const dummySystemLog = {
  logEvent: function(aString) {},
  close: function() {}
};

var gSystemLogs = { };
function getLogForAccount(aAccount, aCreate)
{
  let id = aAccount.id;
  if (aCreate) {
    if (id in gSystemLogs)
      gSystemLogs[id].close();
    if (!prefs.getBoolPref("purple.logging.log_system"))
      return dummySystemLog;
    return (gSystemLogs[id] = new SystemLog(aAccount));
  }

  return (id in gSystemLogs) && gSystemLogs[id] || dummySystemLog;
}

function closeLogForAccount(aAccount)
{
  let id = aAccount.id;
  if (!(id in gSystemLogs))
    return;
  gSystemLogs[id].close();
  delete gSystemLogs[id];
}

/* Generic log enumeration stuff */
function Log(aFile)
{
  this.path = aFile.path;
  this.time = this._dateFromName(aFile.leafName).valueOf() / 1000;
}
Log.prototype = {
  __proto__: ClassInfo("ibILog", "Log object"),
  _dateFromName: function log_dateFromName(aName) {
    const regexp = /([0-9]{4})-([0-9]{2})-([0-9]{2}).([0-9]{2})([0-9]{2})([0-9]{2})([+-])([0-9]{2})([0-9]{2}).*\.txt/;
    let r = aName.match(regexp);
    let date = new Date(r[1], r[2] - 1, r[3], r[4], r[5], r[6]);
    let offset = r[7] * 60 + r[8];
    if (r[6] == -1)
      offset *= -1;
    return date; // ignore the timezone offset for now (FIXME)
  }
};

function LogEnumerator(aEntries)
{
  this._entries = aEntries;
}
LogEnumerator.prototype = {
  _entries: [],
  hasMoreElements: function() {
    while (this._entries.length > 0 && !this._entries[0].hasMoreElements())
      this._entries.shift();
    return this._entries.length > 0;
  },
  getNext: function()
    new Log(this._entries[0].getNext().QueryInterface(Ci.nsIFile)),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};

function Logger() { }
Logger.prototype = {
  _enumerateLogs: function logger__enumerateLogs(aAccount, aNormalizedName) {
    let file = getLogFolderForAccount(aAccount);
    file.append(aNormalizedName);
    if (!file.exists())
      return EmptyEnumerator;

    return new LogEnumerator([file.directoryEntries]);
  },
  getLogsForContact: function logger_getLogsForContact(aContact) {
    let entries = [];
    aContact.getBuddies().forEach(function (aBuddy) {
      aBuddy.getAccountBuddies().forEach(function (aAccountBuddy) {
        let file = getLogFolderForAccount(aAccountBuddy.account);
        file.append(aAccountBuddy.normalizedName);
        if (file.exists())
          entries.push(file.directoryEntries);
      });
    });
    return new LogEnumerator(entries);
  },
  getLogsForBuddy: function logger_getLogsForBuddy(aBuddy) {
    let entries = [];
    aBuddy.getAccountBuddies().forEach(function (aAccountBuddy) {
      let file = getLogFolderForAccount(aAccountBuddy.account);
      file.append(aAccountBuddy.normalizedName);
      if (file.exists())
        entries.push(file.directoryEntries);
    });
    return new LogEnumerator(entries);
  },
  getLogsForAccountBuddy: function logger_getLogsForAccountBuddy(aAccountBuddy)
    this._enumerateLogs(aAccountBuddy.account, aAccountBuddy.normalizedName),
  getLogsForConversation: function logger_getLogsForConversation(aConversation)
    this._enumerateLogs(aConversation.account, aConversation.normalizedName),
  getSystemLogsForAccount: function logger_getSystemLogsForAccount(aAccount)
    this._enumerateLogs(aAccount, ".system"),

  observe: function logger_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
    case "profile-after-change":
      obs.addObserver(this, "final-ui-startup", false);
      break;
    case "final-ui-startup":
      obs.removeObserver(this, "final-ui-startup");
      ["new-conversation", "new-text",
       "conversation-closed", "conversation-left-chat",
       "account-connected", "account-disconnected",
       "account-buddy-status-changed"].forEach(function(aEvent) {
        obs.addObserver(this, aEvent, false);
      }, this);
      break;
    case "new-text":
      if (!aSubject.noLog) {
        let log = getLogForConversation(aSubject.conversation);
        log.logMessage(aSubject);
      }
      break;
    case "new-conversation":
      //XXX should we create the log file here?
      break;
    case "conversation-closed":
    case "conversation-left-chat":
      closeLogForConversation(aSubject);
      break;
    case "account-connected":
      getLogForAccount(aSubject, true).logEvent("+++ " + aSubject.name +
                                                " signed on");
      break;
    case "account-disconnected":
      getLogForAccount(aSubject).logEvent("+++ " + aSubject.name +
                                          " signed off");
      closeLogForAccount(aSubject);
      break;
    case "account-buddy-status-changed":
      let status;
      if (!aSubject.online)
        status = "Offline";
      else if (aSubject.mobile)
        status = "Mobile";
      else if (aSubject.idle)
        status = "Idle";
      else if (aSubject.available)
        status = "Available";
      else
        status = "Unavailable";

      let statusText = aSubject.statusText;
      if (statusText)
        status += " (\"" + statusText + "\")";

      let nameText = aSubject.displayName + " (" + aSubject.userName + ")";
      getLogForAccount(aSubject.account).logEvent(nameText + " is now " + status);
      break;
    default:
      throw "Unexpected notification " + aTopic;
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.ibILogger]),
  classDescription: "Logger",
  classID: Components.ID("{fb0dc220-2c7a-4216-9f19-6b8f3480eae9}"),
  contractID: "@instantbird.org/logger;1"
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([Logger]);
