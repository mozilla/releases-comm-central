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
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

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
  QueryInterface: function(aIID) {
    if (Ci.nsISimpleEnumerator.equals(aIID) ||
        Ci.nsISupports.equals(aIID))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};

function UsernameSplit(aBase, aDefaultValue)
{
  this.base = aBase;
  this.defaultValue = aDefaultValue;
}
UsernameSplit.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.nsIClassInfo) ||
        aIid.equals(Components.interfaces.purpleIUsernameSplit))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  getInterfaces: function(countRef) {
    var interfaces = [Ci.nsIClassInfo, Ci.nsISupports, Ci.purpleIUsernameSplit];
    countRef.value = interfaces.length;
    return interfaces;
  },
  getHelperForLanguage: function(language) null,
  contractID: null,
  classDescription: "Username Split object",
  classID: null,
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  get reverse() this.base.reverse,
  get separator() this.base.separator,
  get label() this.base.label
}

function facebookProtocol() { }

facebookProtocol.prototype = {
  get id() "prpl-facebook",
  get name() "Facebook Chat",
  get iconBaseURI() "chrome://prpl-facebook/skin/",

  // NS_ERROR_XPC_JSOBJECT_HAS_NO_FUNCTION_NAMED errors are too noisy
  getOptions: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  getUsernameSplit: function() {
    var splits = Components.classes["@instantbird.org/purple/core;1"]
                           .getService(Ci.purpleICoreService)
                           .getProtocolById("prpl-jabber").getUsernameSplit();
    let newSplits = [];
    while (splits.hasMoreElements()) {
      let split = splits.getNext();
      if (split.defaultValue != "gmail.com")
        newSplits.push(split);
      else
        newSplits.push(new UsernameSplit(split, "chat.facebook.com"));
    }
    return new nsSimpleEnumerator(newSplits);
  },
  accountExists: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get uniqueChatName() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get chatHasTopic() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get noPassword() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get newMailNotification() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get imagesInIM() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get passwordOptional() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get usePointSize() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get registerNoScreenName() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  get slashCommandsNative() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },

  classDescription: "Facebook Chat Override Protocol",
  classID: Components.ID("{61bc3528-df53-4481-a61a-74c3a2e8c9fd}"),
  contractID: "@instantbird.org/purple/facebook;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.purpleIProtocol]),
  _xpcom_categories: [{category: "purple-override-protocol"}],
  _xpcom_factory: {
    createInstance: function(outer, iid) {
      if (outer != null)
        throw Cr.NS_ERROR_NO_AGGREGATION;

      var override = new facebookProtocol();
      var pcs = Components.classes["@instantbird.org/purple/core;1"]
                          .getService(Ci.purpleICoreService);
      var base = pcs.getProtocolById("prpl-jabber");
      var proto = Components.classes["@instantbird.org/purple/overrideprotocol;1"]
                            .createInstance(Ci.purpleIOverrideProtocol);
      proto.init(base, override);
      return proto.QueryInterface(Ci.purpleIProtocol);
    }
  }
};

function NSGetModule(aCompMgr, aFileSpec) {
  return XPCOMUtils.generateModule([facebookProtocol]);
}
