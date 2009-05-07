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

const Cc = Components.classes;
const Ci = Components.interfaces;

function getIter(aGetEnumFct, aIface)
{
  var enumerator = aGetEnumFct();
  while (enumerator.hasMoreElements()) {
    let item = enumerator.getNext();
    yield item.QueryInterface(aIface);
  }
}

__defineGetter__("gPrefService", function() {
  delete this.gPrefService;
  return this.gPrefService = Cc["@mozilla.org/preferences-service;1"].
                             getService(Ci.nsIPrefBranch2);
});

__defineGetter__("gExtProtoService", function() {
  delete this.gExtProtoService;
  return this.gExtProtoService =
    Cc["@mozilla.org/uriloader/external-protocol-service;1"].
    getService(Ci.nsIExternalProtocolService);
});

function getObserverService()
{
  return Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
}

function addObservers(aObserver, aTopics)
{
  var observerService = getObserverService();
  for (let i = 0; i < aTopics.length; ++i)
    observerService.addObserver(aObserver, aTopics[i], false);
}

function removeObservers(aObserver, aTopics)
{
  var observerService = getObserverService();
  for (let i = 0; i < aTopics.length; ++i)
    observerService.removeObserver(aObserver, aTopics[i]);
}

function makeURI(aURL, aOriginCharset, aBaseURI)
{
  var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Ci.nsIIOService);
  return ioService.newURI(aURL, aOriginCharset, aBaseURI);
}

function logMsg(aString)
{
  Components.classes["@mozilla.org/consoleservice;1"]
                     .getService(Ci.nsIConsoleService)
                     .logStringMessage(aString);
}
