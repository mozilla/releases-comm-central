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

var EXPORTED_SYMBOLS = [
  "smileImMarkup", // used to add smile:// img tags into IM markup.
  "smileTextNode", // used to add smile:// img tags to the content of a textnode
  "smileString", // used to add smile:// img tags into a string without parsing it as HTML. Be sure the string doesn't contain HTML tags.
  "getSmileRealURI", // used to retrive the chrome URI for a smile:// URI
  "getSmileyList" // used to display a list of smileys in the UI
];

const emoticonsThemePref = "messenger.options.emoticonsTheme";
const themeFile = "theme.js";

var gTheme = null;

var gPrefObserver = {
  init: function po_init() {
    Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch2)
              .addObserver(emoticonsThemePref, gPrefObserver, false);
    // We want to add this observer only once, make this method a no-op
    gPrefObserver.init = function() {};
  },

  observe: function so_observe(aObject, aTopic, aMsg) {
    if (aTopic != "nsPref:changed" || aMsg != emoticonsThemePref)
      throw "bad notification";

    gTheme = null;
  }
};

function getSmileRealURI(aSmile)
{
  let theme = getTheme();
  aSmile = Components.classes["@mozilla.org/intl/texttosuburi;1"]
                     .getService(Components.interfaces.nsITextToSubURI)
                     .unEscapeURIForUI("UTF-8", aSmile);
  if (aSmile in theme.iconsHash)
    return theme.baseUri + theme.iconsHash[aSmile].filename;

  throw "Invalid smile!";
}

function getSmileyList(aTheme) {
  if (!aTheme)
    aTheme = getTheme();

  if (!aTheme.json)
    return null;

  let addAbsoluteUrls = function(aSmiley) {
    return {filename: aSmiley.filename,
            src: aTheme.baseUri + aSmiley.filename,
            texts: aSmiley.texts};
  };
  return aTheme.json.smileys.map(addAbsoluteUrls);
}

function getTheme()
{
  if (gTheme)
    return gTheme;

  gPrefObserver.init();

  gTheme = {
    name: "default",
    iconsHash: null,
    json: null,
    regExp: null
  };

  gTheme.name =
    Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch)
              .getCharPref(emoticonsThemePref);
  if (gTheme.name == "none")
    return gTheme;

  if (gTheme.name == "default")
    gTheme.baseUri = "chrome://instantbird/skin/smileys/";
  else
    gTheme.baseUri = "chrome://" + gTheme.name + "/skin/";
  let ios = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService);
  try {
    let channel = ios.newChannel(gTheme.baseUri + themeFile, null, null);
    let stream = channel.open();
    let json = Components.classes["@mozilla.org/dom/json;1"]
                         .createInstance(Components.interfaces.nsIJSON);
    gTheme.json = json.decodeFromStream(stream, stream.available());
    stream.close();
    gTheme.iconsHash = {};
    for each (smile in gTheme.json.smileys) {
      for each (text in smile.texts)
        gTheme.iconsHash[text] = smile;
    }
  } catch(e) {
    Components.utils.reportError(e);
  }
  return gTheme;
}

function getRegexp()
{
  let theme = getTheme();
  if (theme.regExp) {
    theme.regExp.lastIndex = 0;
    return theme.regExp;
  }

  // return null if smileys are disabled
  if (!theme.iconsHash)
    return null;

  let emoticonList = [];
  for (let emoticon in theme.iconsHash)
    emoticonList.push(emoticon);

  let exp = /([\][)(\\|?^$*+])/g;
  emoticonList = emoticonList.sort()
                             .reverse()
                             .map(function(x) x.replace(exp, "\\$1"));

  theme.regExp = new RegExp('(' + emoticonList.join('|') + ')', 'g');
  return theme.regExp;
}

// unused. May be useful later to process a string instead of an HTML node
function smileString(aString)
{
  const smileFormat = '<img class="ib-img-smile" src="smile://$1" alt="$1" title="$1"/>';

  let exp = getRegexp();
  return exp ? aString.replace(exp, smileFormat) : aString;
}

function smileTextNode(aNode)
{
  let result = 0;
  let exp = getRegexp();
  if (!exp)
    return result;

  let match;
  while ((match = exp(aNode.data))) {
    let smileNode = aNode.splitText(match.index);
    aNode = smileNode.splitText(exp.lastIndex - match.index);
    // at this point, smileNode is a text node with only the text
    // of the smiley and aNode is a text node with the text after
    // the smiley. The text in aNode hasn't been processed yet.
    let smile = smileNode.data;
    let elt = aNode.ownerDocument.createElement("img");
    elt.setAttribute("src", "smile://" + smile);
    elt.setAttribute("title", smile);
    elt.setAttribute("alt", smile);
    elt.setAttribute("class", "ib-img-smile");
    smileNode.parentNode.replaceChild(elt, smileNode);
    result += 2;
    exp.lastIndex = 0;
  }
  return result;
}

function smileNode(aNode)
{
  for (var i = 0; i < aNode.childNodes.length; ++i) {
    let node = aNode.childNodes[i];
    if (node instanceof Components.interfaces.nsIDOMHTMLElement) {
      // we are on a tag, recurse to process its children
      smileNode(node);
    } else if (node instanceof Components.interfaces.nsIDOMText) {
      // we are on a text node, process it
      smileTextNode(node);
    }
  }
}

function smileImMarkup(aDocument, aText)
{
  if (!aDocument)
    throw "providing an HTML document is required";

  // return early if smileys are disabled
  if (!getTheme().iconsHash)
    return aText;

  var div = aDocument.createElement("div");
  div.innerHTML = aText;
  smileNode(div);
  return div.innerHTML;
}
