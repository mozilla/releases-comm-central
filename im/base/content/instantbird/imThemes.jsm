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
  "getCurrentTheme",
  "getHTMLForMessage",
  "appendHTMLtoNode",
  "initHTMLDocument"
];

const messagesStylePref = "messenger.options.messagesStyle";

var gCurrentTheme = null;

function getChromeFile(aURI)
{
  let ios = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService);
  try {
    let channel = ios.newChannel(aURI, null, null);
    let stream = channel.open();
    let sstream = Components.classes["@mozilla.org/scriptableinputstream;1"]
                            .createInstance(Components.interfaces.nsIScriptableInputStream);
    sstream.init(stream);
    let text = sstream.read(sstream.available());
    sstream.close();
    return text;
  } catch (e) {
    if (e.result != Components.results.NS_ERROR_FILE_NOT_FOUND)
      dump("Getting " + aURI + ": " + e + "\n");
    return null;
  }
}

function HTMLTheme(aBaseURI)
{
  let files = {
    footer: "Footer.html",
    header: "Header.html",
    status: "Status.html",
    incomingContent: "Incoming/Content.html",
    incomingContext: "Incoming/Context.html",
    incomingNextContent: "Incoming/NextContent.html",
    incomingNextContext: "Incoming/NextContext.html",
    outgoingContent: "Outgoing/Content.html",
    outgoingContext: "Outgoing/Context.html",
    outgoingNextContent: "Outgoing/NextContent.html",
    outgoingNextContext: "Outgoing/NextContext.html"
  };

  for (let id in files) {
    let html = getChromeFile(aBaseURI + files[id]);
    if (html)
      this[id] = html; 
  }

  // We set the prototype this way to workaround the 
  // 'setting a property that has only a getter' error.
  this.__proto__ = HTMLTheme_prototype;
}

HTMLTheme_prototype = {
  get footer() "",
  get header() "",
  get status() this.incomingContent,
  get incomingContent() function() {
    throw "Incoming/Content.html is a required file";
  },
  get incomingNextContent() this.incomingContent,
  get outgoingContent() this.incomingContent,
  get outgoingNextContent() this.incomingNextContent,
  get incomingContext() this.incomingContent,
  get incomingNextContext() this.incomingNextContent,
  get outgoingContext() this.hasOwnProperty("outgoingContent") ? this.outgoingContent : this.incomingContext,
  get outgoingNextContext() this.hasOwnProperty("outgoingNextContent") ? this.outgoingNextContent : this.incomingNextContext
};

function plistToJSON(aElt)
{
  switch (aElt.localName) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'string':
    case 'data':
      return aElt.textContent;
    case 'real':
      return parseFloat(aElt.textContent);
    case 'integer':
      return parseInt(aElt.textContent, 10);

    case 'dict':
      let res = {};
      let nodes = aElt.childNodes;
      for (let i = 0; i < nodes.length; ++i) {
        if (nodes[i].nodeName == 'key') {
          let key = nodes[i].textContent;
          ++i
          while (!(nodes[i] instanceof Components.interfaces.nsIDOMElement))
            ++i;
          res[key] = plistToJSON(nodes[i]);
        }
      }
      return res;

    case 'array':
      let array = [];
      nodes = aElt.childNodes;
      for (let i = 0; i < nodes.length; ++i) {
        if (nodes[i] instanceof Components.interfaces.nsIDOMElement)
          array.push(plistToJSON(nodes[i]));
      }
      return array;

    default:
      throw "Unknown tag in plist file";
  }
}

function getInfoPlistContent(aBaseURI)
{
  let ios = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService);
  try {
    let channel = ios.newChannel(aBaseURI + "Info.plist", null, null);
    let stream = channel.open();
    let parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                           .createInstance(Components.interfaces.nsIDOMParser);
    let doc = parser.parseFromStream(stream, null, stream.available(), "text/xml");
    if (doc.documentElement.localName != "plist")
      throw "Invalid Info.plist file";
    let node = doc.documentElement.firstChild;
    while (node && !(node instanceof Components.interfaces.nsIDOMElement))
      node = node.nextSibling;
    if (!node || node.localName != "dict")
      throw "Empty or invalid Info.plist file";
    return plistToJSON(node); 
  } catch(e) {
    Components.utils.reportError(e);
    return null;
  }
}

function getChromeBaseURI(aThemeName)
{
  if (aThemeName == "default")
    return "chrome://instantbird/skin/messages/";
  return "chrome://" + aThemeName + "/skin/";
}

function getCurrentTheme()
{
  let name =
    Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch)
              .getCharPref(messagesStylePref);
  if (gCurrentTheme && gCurrentTheme.name == name)
    return gCurrentTheme;

  let baseURI = getChromeBaseURI(name);
  gCurrentTheme = {
    name: name,
    baseURI: baseURI,
    metadata: getInfoPlistContent(baseURI),
    html: new HTMLTheme(baseURI)
  };

  return gCurrentTheme;
}

const headerFooterReplacements = {
  chatName: function(aConv) "",
  sourceName: function(aConv) "",
  destinationName: function(aConv) "",
  incomingIconPath: function(aConv) "Incoming/buddy_icon.png",
  outgoingIconPath: function(aConv) "Outgoing/buddy_icon.png",
  timeOpened: function(aConv, aFormat) "Nan"
};

const statusMessageReplacements = {
  message: function(aMsg) "<span class=\"ib-msg-txt\">" + aMsg.message + "</span>",
  time: function(aMsg, aFormat) aMsg.time,
  shortTime: function(aMsg, aFormat) "FIXME",
  messageClasses: function(aMsg) {
    let msgClass = [];
    if (/^(<[^>]+>)*\/me /.test(aMsg.originalMessage))
      msgClass.push("action");

    if (!aMsg.system) {
      msgClass.push("message");
      if (aMsg.incoming)
        msgClass.push("incoming");
      else
        if (aMsg.outgoing)
          msgClass.push("outgoing");

      if (aMsg.autoResponse)
        msgClass.push("autoreply");
    }
    else
      msgClass.push("event");

    if (aMsg.containsNick)
       msgClass.push("nick");

    return msgClass.join(" ");
  }
};

const messageReplacements = {
  userIconPath: function (aMsg) (aMsg.incoming ? "Incoming" : "Outgoing") + "/buddy_icon.png",
  senderScreenName: function(aMsg) "FIXME",
  sender: function(aMsg) aMsg.alias || aMsg.who,
  senderColor: function(aMsg) "%senderColor%", // let conversation.xml handle that for now
  senderStatusIcon: function(aMsg) "FIXME",
  messageDirection: function(aMsg) "ltr",
  senderDisplayName: function(aMsg) "FIXME",
  service: function(aMsg) "AIMSN",
  textbackgroundcolor: function(aMsg, aFormat) "FIXME",
  __proto__: statusMessageReplacements
};

const statusReplacements = {
  status: function(aMsg) "FIXME",
  __proto__: statusMessageReplacements
};

const replacementRegExp = /%([^{}%]*)(\{(.*)\})?%/g;

function replaceKeywordsInHTML(aHTML, aReplacements, aReplacementArg)
{
  replacementRegExp.lastIndex = 0;
  let previousIndex = 0;
  let result = "";
  let match;
  while (match = replacementRegExp(aHTML)) {
    let content = "";
    if (match[1] in aReplacements)
      content = aReplacements[match[1]](aReplacementArg, match[2]);
    else
      Components.utils.reportError("Unknown replacement string %" + 
                                   match[1] + "% in message styles.");
    result += aHTML.substring(previousIndex, match.index) + content;
    previousIndex = replacementRegExp.lastIndex;
  }

  return result + aHTML.slice(previousIndex);
}

function getHTMLForMessage(aMsg, aTheme)
{
  let html, replacements;
  if (aMsg.system) {
    html = aTheme.html.status;
    replacements = statusReplacements;
  }
  else {
    html = aMsg.incoming ? aTheme.html.incomingContent
                         : aTheme.html.outgoingContent
    replacements = messageReplacements;
  }

  return replaceKeywordsInHTML(html, replacements, aMsg);
}

function appendHTMLtoNode(aHTML, aNode)
{
  let range = aNode.ownerDocument.createRange();
  range.selectNode(aNode);
  let documentFragment = range.createContextualFragment(aHTML);
  let result = documentFragment.firstChild;
  aNode.appendChild(documentFragment);
  return result;
}

function createCSSLinkElt(aDoc, aHref)
{
  let elt = aDoc.createElement("link");
  elt.type = "text/css";
  elt.rel = "stylesheet";
  elt.href = aHref;
  return elt;
}

function initHTMLDocument(aConv, aTheme, aDoc)
{
  // First, fix the baseURI of the HTML document
  // Unfortunately, the baseURI setter is not scriptable
  let uri = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService)
                      .newURI(aTheme.baseURI, null, null);
  aConv.setBaseURI(aDoc, uri);

  // add the main CSS file of the theme
  let head = aDoc.getElementsByTagName("head")[0];
  let variant = "default"; // FIXME: get the right CSS variant from a pref
  if (aTheme.metadata.MessageViewVersion >= 3 || variant == "default")
    head.appendChild(createCSSLinkElt(aDoc, "main.css"));

  if (variant == "default" && "DefaultVariant" in aTheme.metadata) {
    let defaultVariant = "Variants/" + aTheme.metadata.DefaultVariant + ".css";
    head.appendChild(createCSSLinkElt(aDoc, defaultVariant));
  }

  // We insert the whole content of body: header, chat div, footer
  let body = aDoc.getElementsByTagName("body")[0];
  let html = replaceKeywordsInHTML(aTheme.html.header,
                                   headerFooterReplacements, aConv);
  appendHTMLtoNode(html, body);
  let chat = aDoc.createElement("div");
  chat.id = "Chat";
  body.appendChild(chat);
  html = replaceKeywordsInHTML(aTheme.html.footer,
                               headerFooterReplacements, aConv);
  appendHTMLtoNode(html, body);
}
