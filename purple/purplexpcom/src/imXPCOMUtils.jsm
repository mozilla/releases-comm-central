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
 *   Patrick Cloke <clokep@gmail.com>
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

var EXPORTED_SYMBOLS = [
  "XPCOMUtils",
  "setTimeout",
  "clearTimeout",
  "executeSoon",
  "nsSimpleEnumerator",
  "EmptyEnumerator",
  "ClassInfo",
  "l10nHelper",
  "initLogModule"
];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

const PURPLE_DEBUG_MISC = 1; // Very verbose (= 'DEBUG')
const PURPLE_DEBUG_INFO = 2; // Verbose (= 'LOG')
const PURPLE_DEBUG_WARNING = 3;
const PURPLE_DEBUG_ERROR = 4;

function scriptError(aModule, aLevel, aMessage) {
  // Only continue if we want to see this level of logging.
  let logLevel = Services.prefs.getIntPref("purple.debug.loglevel");
  if (logLevel > aLevel)
    return;

  // Log a debug statement.
  if (aLevel == PURPLE_DEBUG_INFO && logLevel == PURPLE_DEBUG_INFO) {
    Services.console.logStringMessage(aMessage);
    return;
  }

  let flag = Ci.nsIScriptError.warningFlag;
  if (aLevel >= PURPLE_DEBUG_ERROR)
    flag = Ci.nsIScriptError.errorFlag;

  let scriptError =
    Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
  let caller = Components.stack.caller;
  let sourceLine = aModule || caller.sourceLine;
  if (caller.name) {
    if (sourceLine)
      sourceLine += ": ";
    sourceLine += caller.name;
  }
  scriptError.init(aMessage, caller.filename, sourceLine, caller.lineNumber,
                   null, flag, "component javascript");
  Services.console.logMessage(scriptError);
}
function initLogModule(aModule)
{
  this.DEBUG = scriptError.bind(this, aModule, PURPLE_DEBUG_MISC);
  this.LOG   = scriptError.bind(this, aModule, PURPLE_DEBUG_INFO);
  this.WARN  = scriptError.bind(this, aModule, PURPLE_DEBUG_WARNING);
  this.ERROR = scriptError.bind(this, aModule, PURPLE_DEBUG_ERROR);
}

function setTimeout(aFunction, aDelay)
{
  var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  var args = Array.prototype.slice.call(arguments, 2);
  // A reference to the timer should be kept to ensure it won't be
  // GC'ed before firing the callback.
  var callback = {
    _timer: timer,
    notify: function (aTimer) { aFunction.apply(null, args); delete this._timer; }
  };
  timer.initWithCallback(callback, aDelay, Ci.nsITimer.TYPE_ONE_SHOT);
  return timer;
}
function clearTimeout(aTimer)
{
  aTimer.cancel();
}

function executeSoon(aFunction)
{
  Services.tm.mainThread.dispatch(aFunction, Services.tm.DISPATCH_NORMAL);
}

/* Common nsIClassInfo and QueryInterface implementation
 * shared by all generic objects implemented in this file. */
function ClassInfo(aInterfaces, aDescription)
{
  if (!(this instanceof ClassInfo))
    return new ClassInfo(aInterfaces, aDescription);

  if (!Array.isArray(aInterfaces))
    aInterfaces = [aInterfaces];
  this._interfaces =
    aInterfaces.map(function (i) typeof i == "string" ? Ci[i] : i);

  this.classDescription = aDescription || "JS Proto Object";
}
ClassInfo.prototype = {
  QueryInterface: function ClassInfo_QueryInterface(iid) {
    if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIClassInfo) ||
        this._interfaces.some(function(i) i.equals(iid)))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },
  getInterfaces: function(countRef) {
    var interfaces =
      [Ci.nsIClassInfo, Ci.nsISupports].concat(this._interfaces);
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  contractID: null,
  classID: null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: 0
};

function l10nHelper(aChromeURL)
{
  let bundle = Services.strings.createBundle(aChromeURL);
  return function (aStringId) {
    if (arguments.length == 1)
      return bundle.GetStringFromName(aStringId);
    return bundle.formatStringFromName(aStringId,
                                       Array.prototype.slice.call(arguments, 1),
                                       arguments.length - 1);
  };
}

/**
 * Constructs an nsISimpleEnumerator for the given array of items.
 * Copied from netwerk/test/httpserver/httpd.js
 *
 * @param items : Array
 *   the items, which must all implement nsISupports
 */
function nsSimpleEnumerator(items)
{
  this._items = items;
  this._nextIndex = 0;
}
nsSimpleEnumerator.prototype = {
  hasMoreElements: function() this._nextIndex < this._items.length,
  getNext: function() {
    if (!this.hasMoreElements())
      throw Cr.NS_ERROR_NOT_AVAILABLE;

    return this._items[this._nextIndex++];
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};

const EmptyEnumerator = {
  hasMoreElements: function() false,
  getNext: function() { throw Cr.NS_ERROR_NOT_AVAILABLE; },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};
