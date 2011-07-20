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

const {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

function UsernameSplit(aBase, aDefaultValue)
{
  this.base = aBase;
  this.defaultValue = aDefaultValue;
}
UsernameSplit.prototype = {
  __proto__: ClassInfo("purpleIUsernameSplit", "username split object"),

  get reverse() this.base.reverse,
  get separator() this.base.separator,
  get label() this.base.label
}

function facebookProtocol() { }
facebookProtocol.prototype = {
  __proto__: ForwardProtocolPrototype,
  get normalizedName() "facebook",
  get name() "Facebook Chat",
  get iconBaseURI() "chrome://prpl-facebook/skin/",
  get baseId() "prpl-jabber",

  getAccount: function(aKey, aName) {
    let account = ForwardProtocolPrototype.getAccount.call(this, aKey, aName);
    account.__defineGetter__("canJoinChat", function() false);
    account.setString("connection_security", "opportunistic_tls");
    return account;
  },
  getOptions: function() EmptyEnumerator,
  getUsernameSplit: function() {
    var splits = this.base.getUsernameSplit();
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

  classID: Components.ID("{61bc3528-df53-4481-a61a-74c3a2e8c9fd}")
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([facebookProtocol]);
