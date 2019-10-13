// ***** BEGIN LICENSE BLOCK *****// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// Adam Christian.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Adam Christian <adam.christian@gmail.com>
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = [
  "Elem",
  "ID",
  "Link",
  "XPath",
  "Selector",
  "Name",
  "Anon",
  "AnonXPath",
  "Lookup",
  "_byID",
  "_byName",
  "_byAttrib",
  "_byAnonAttrib",
];

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var strings = ChromeUtils.import(
  "resource://testing-common/mozmill/strings.jsm"
);

var countQuotes = function(str) {
  var count = 0;
  var i = 0;
  while (i < str.length) {
    i = str.indexOf('"', i);
    if (i != -1) {
      count++;
      i++;
    } else {
      break;
    }
  }
  return count;
};
var smartSplit = function(str) {
  // Note: I would love it if someone good with regular expressions
  // could just replace this function with a good regex

  // Ensure we have an even number of quotes
  if (countQuotes(str) % 2 != 0) {
    throw new Error("Invalid Lookup Expression");
  }

  var repls = [];
  let i = 0;
  while (str.includes('"') && i <= str.length) {
    i = str.indexOf('"');
    let s = str.slice(i, str.indexOf('"', i + 1) + 1);
    str = str.replace(s, "%$^" + repls.length);
    repls.push(s);
  }

  var split = str.split("/");
  var rindex = 0;
  for (let i in split) {
    while (split[i].includes("%$^")) {
      let s = split[i];
      var si = rindex;
      split[i] = s.replace("%$^" + si, repls[si]);
      rindex++;
    }
  }
  return split;
};

var ElemBase = function() {
  this.isElement = true;
};
ElemBase.prototype.exists = function() {
  return !!this.getNode();
};
ElemBase.prototype.nodeSearch = function(doc, func, string) {
  var win = doc.defaultView;
  var e = null;
  var element = null;
  // inline function to recursively find the element in the DOM, cross frame.
  var search = function(win, func, string) {
    if (win == null) {
      return;
    }

    // do the lookup in the current window
    try {
      element = func.call(win, string);
    } catch (err) {}

    if (!element || element.length == 0) {
      var frames = win.frames;
      for (var i = 0; i < frames.length; i++) {
        search(frames[i], func, string);
      }
    } else {
      e = element;
    }
  };

  search(win, func, string);

  return e;
};

var Elem = function(node) {
  this.node = node;
  return this;
};
Elem.prototype = new utils.Copy(ElemBase.prototype);
Elem.prototype.getNode = function() {
  return this.node;
};
Elem.prototype.getInfo = function() {
  return "Elem instance.";
};

var Selector = function(_document, selector) {
  if (_document == undefined || selector == undefined) {
    throw new Error("Selector constructor did not receive enough arguments.");
  }
  this._view = _document.defaultView;
  this.selector = selector;
  return this;
};
Selector.prototype = new utils.Copy(ElemBase.prototype);
Selector.prototype.getInfo = function() {
  return "Selector: " + this.selector;
};
Selector.prototype.getNodeForDocument = function(s) {
  return this.document.querySelectorAll(s);
};
Selector.prototype.getNode = function(index) {
  var nodes = this.nodeSearch(
    this._view.document,
    this.getNodeForDocument,
    this.selector
  );
  return nodes ? nodes[index || 0] : null;
};

var ID = function(_document, nodeID) {
  if (_document == undefined || nodeID == undefined) {
    throw new Error("ID constructor did not receive enough arguments.");
  }
  this._view = _document.defaultView;
  this.nodeID = nodeID;
  return this;
};
ID.prototype = new utils.Copy(ElemBase.prototype);
ID.prototype.getInfo = function() {
  return "ID: " + this.nodeID;
};
ID.prototype.getNodeForDocument = function(s) {
  return this.document.getElementById(s);
};
ID.prototype.getNode = function() {
  return this.nodeSearch(
    this._view.document,
    this.getNodeForDocument,
    this.nodeID
  );
};

var Link = function(_document, linkName) {
  if (_document == undefined || linkName == undefined) {
    throw new Error("Link constructor did not receive enough arguments.");
  }
  this._view = _document.defaultView;
  this.linkName = linkName;
  return this;
};
Link.prototype = new utils.Copy(ElemBase.prototype);
Link.prototype.getInfo = function() {
  return "Link: " + this.linkName;
};
Link.prototype.getNodeForDocument = function(linkName) {
  // sometimes the windows won't have this function
  try {
    var links = this.document.getElementsByTagName("a");
  } catch (err) {
    // ADD LOG LINE mresults.write('Error: '+ err, 'lightred');
  }
  for (var i = 0; i < links.length; i++) {
    var el = links[i];
    if (el.innerHTML.includes(linkName)) {
      return el;
    }
  }
  return null;
};

Link.prototype.getNode = function() {
  return this.nodeSearch(
    this._view.document,
    this.getNodeForDocument,
    this.linkName
  );
};

var XPath = function(_document, expr) {
  if (_document == undefined || expr == undefined) {
    throw new Error("XPath constructor did not receive enough arguments.");
  }
  this._view = _document.defaultView;
  this.expr = expr;
  return this;
};
XPath.prototype = new utils.Copy(ElemBase.prototype);
XPath.prototype.getInfo = function() {
  return "XPath: " + this.expr;
};
XPath.prototype.getNodeForDocument = function(s) {
  var aNode = this.document;
  var aExpr = s;
  var xpe = null;

  if (this.document.defaultView == null) {
    xpe = new utils.getMethodInWindows("XPathEvaluator")();
  } else {
    xpe = new this.document.defaultView.XPathEvaluator();
  }
  var nsResolver = xpe.createNSResolver(
    aNode.ownerDocument == null
      ? aNode.documentElement
      : aNode.ownerDocument.documentElement
  );
  var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
  var found = [];
  var res = result.iterateNext();
  while (res) {
    found.push(res);
    res = result.iterateNext();
  }
  return found[0];
};

XPath.prototype.getNode = function() {
  return this.nodeSearch(
    this._view.document,
    this.getNodeForDocument,
    this.expr
  );
};

var Name = function(_document, nName) {
  if (_document == undefined || nName == undefined) {
    throw new Error("Name constructor did not receive enough arguments.");
  }
  this._view = _document.defaultView;
  this.nName = nName;
  return this;
};
Name.prototype = new utils.Copy(ElemBase.prototype);
Name.prototype.getInfo = function() {
  return "Name: " + this.nName;
};
Name.prototype.getNodeForDocument = function(s) {
  try {
    var els = this.document.getElementsByName(s);
    if (els.length > 0) {
      return els[0];
    }
  } catch (err) {}
  return null;
};

Name.prototype.getNode = function() {
  return this.nodeSearch(
    this._view.document,
    this.getNodeForDocument,
    this.nName
  );
};

function Lookup(_document, expression) {
  if (_document == undefined || expression == undefined) {
    throw new Error("Lookup constructor did not receive enough arguments.");
  }
  this._view = _document.defaultView;
  this.expression = expression;
}
Lookup.prototype = new utils.Copy(ElemBase.prototype);
var _returnResult = function(results) {
  if (results.length == 0) {
    return null;
  } else if (results.length == 1) {
    return results[0];
  }
  return results;
};
var _forChildren = function(element, name, value) {
  var results = [];
  var nodes = Array.from(element.children).filter(e => e);
  for (var i in nodes) {
    var n = nodes[i];
    if (n[name] == value) {
      results.push(n);
    }
  }
  return results;
};
var _forAnonChildren = function(_document, element, name, value) {
  var results = [];
  var nodes = Array.from(_document.getAnonymousNodes(element) || []).filter(
    e => e
  );
  for (var i in nodes) {
    var n = nodes[i];
    if (n[name] == value) {
      results.push(n);
    }
  }
  return results;
};
var _byID = function(_document, parent, value) {
  return _returnResult(_forChildren(parent, "id", value));
};
var _byName = function(_document, parent, value) {
  return _returnResult(_forChildren(parent, "tagName", value));
};
var _byAttrib = function(parent, attributes) {
  var results = [];

  var nodes = parent.children;
  for (var i in nodes) {
    var n = nodes[i];
    var requirementPass = 0;
    var requirementLength = 0;
    for (var a in attributes) {
      requirementLength++;
      try {
        if (
          n.getAttribute(a) == attributes[a] ||
          (a == "class" && n.classList.contains(attributes[a]))
        ) {
          requirementPass++;
        }
      } catch (err) {
        // Workaround any bugs in custom attribute crap in XUL elements
      }
    }
    if (requirementPass == requirementLength) {
      results.push(n);
    }
  }
  return _returnResult(results);
};
var _byAnonAttrib = function(_document, parent, attributes) {
  var results = [];

  if (Object.keys(attributes).length == 1) {
    for (var i in attributes) {
      var k = i;
      var v = attributes[i];
    }
    var result = _document.getAnonymousElementByAttribute(parent, k, v);
    if (result) {
      return result;
    }
  }
  var nodes = Array.from(_document.getAnonymousNodes(parent) || []).filter(
    n => n.getAttribute
  );
  function resultsForNodes(nodes) {
    for (var i in nodes) {
      var n = nodes[i];
      var requirementPass = 0;
      var requirementLength = 0;
      for (var a in attributes) {
        requirementLength++;
        if (n.getAttribute(a) == attributes[a]) {
          requirementPass++;
        }
      }
      if (requirementPass == requirementLength) {
        results.push(n);
      }
    }
  }
  resultsForNodes(nodes);
  if (results.length == 0) {
    resultsForNodes(
      Array.from(parent.children).filter(n => n != undefined && n.getAttribute)
    );
  }
  return _returnResult(results);
};
var _byIndex = function(_document, parent, i) {
  return parent.children[i];
};
var _anonByName = function(_document, parent, value) {
  return _returnResult(_forAnonChildren(_document, parent, "tagName", value));
};
var _anonByAttrib = function(_document, parent, value) {
  return _byAnonAttrib(_document, parent, value);
};
var _anonByIndex = function(_document, parent, i) {
  return _document.getAnonymousNodes(parent)[i];
};

Lookup.prototype.getInfo = function() {
  return "Lookup: " + this.expression;
};
Lookup.prototype.exists = function() {
  try {
    var e = this.getNode();
  } catch (ex) {
    return false;
  }
  if (e) {
    return true;
  }
  return false;
};
Lookup.prototype.getNode = function() {
  var expSplit = smartSplit(this.expression).filter(e => e != "");
  expSplit.unshift(this._view.document);
  var _document = this._view.document;
  var nCases = { id: _byID, name: _byName, attrib: _byAttrib, index: _byIndex };
  var aCases = {
    name: _anonByName,
    attrib: _anonByAttrib,
    index: _anonByIndex,
  };
  var reduceLookup = function(parent, exp) {
    // Handle custom elements shadow DOM
    if (exp == "shadow") {
      return parent.shadowRoot;
    }

    // Handle case where only index is provided
    var cases = nCases;

    // Handle ending index before any of the expression gets mangled
    if (exp.endsWith("]")) {
      var expIndex = JSON.parse(strings.vslice(exp, "[", "]"));
    }
    // Handle anon
    if (exp.startsWith("anon")) {
      exp = strings.vslice(exp, "(", ")");
      cases = aCases;
    }
    if (exp.startsWith("[")) {
      let obj;
      try {
        obj = JSON.parse(strings.vslice(exp, "[", "]"));
      } catch (err) {
        throw new Error(
          err +
            ". String to be parsed was || " +
            strings.vslice(exp, "[", "]") +
            " ||"
        );
      }
      var r = cases.index(_document, parent, obj);
      if (r == null) {
        throw new Error(
          'Expression "' +
            exp +
            '" returned null. Anonymous == ' +
            (cases == aCases)
        );
      }
      return r;
    }

    for (var c in cases) {
      if (exp.startsWith(c)) {
        let obj;
        try {
          obj = JSON.parse(strings.vslice(exp, "(", ")"));
        } catch (err) {
          throw new Error(
            err +
              ". String to be parsed was || " +
              strings.vslice(exp, "(", ")") +
              "  ||"
          );
        }
        var result = cases[c](_document, parent, obj);
      }
    }

    if (!result) {
      if (exp.startsWith("{")) {
        let obj;
        try {
          obj = JSON.parse(exp);
        } catch (err) {
          throw new Error(err + ". String to be parsed was || " + exp + " ||");
        }

        if (cases == aCases) {
          result = _anonByAttrib(_document, parent, obj);
        } else {
          result = _byAttrib(parent, obj);
        }
      }
      if (!result) {
        throw new Error(
          'Expression "' +
            exp +
            '" returned null. Anonymous == ' +
            (cases == aCases)
        );
      }
    }

    // Final return
    if (expIndex) {
      // TODO: Check length and raise error
      return result[expIndex];
    }
    // TODO: Check length and raise error
    return result;
  };
  return expSplit.reduce(reduceLookup);
};
