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

var EXPORTED_SYMBOLS = ["Elem", "ID", "Lookup"];

var vslice = function(str, svalue, evalue) {
  var sindex = str.indexOf(svalue);
  var eindex = str.lastIndexOf(evalue);
  return str.slice(sindex + 1, eindex);
};

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

class ElemBase {
  isElement = true;

  exists() {
    return !!this.getNode();
  }
  nodeSearch(doc, func, string) {
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
  }
}

class Elem extends ElemBase {
  constructor(node) {
    super();
    this.node = node;
  }

  getNode() {
    return this.node;
  }
  getInfo() {
    return "Elem instance.";
  }
}

class ID extends ElemBase {
  constructor(_document, nodeID) {
    super();
    if (_document == undefined || nodeID == undefined) {
      throw new Error("ID constructor did not receive enough arguments.");
    }
    this._view = _document.defaultView;
    this.nodeID = nodeID;
  }
  getInfo() {
    return "ID: " + this.nodeID;
  }
  getNodeForDocument(s) {
    return this.document.getElementById(s);
  }
  getNode() {
    return this.nodeSearch(
      this._view.document,
      this.getNodeForDocument,
      this.nodeID
    );
  }
}

class Lookup extends ElemBase {
  constructor(_document, expression) {
    super();
    if (_document == undefined || expression == undefined) {
      throw new Error("Lookup constructor did not receive enough arguments.");
    }
    this._view = _document.defaultView;
    this.expression = expression;
  }
  _returnResult(results) {
    if (results.length == 0) {
      return null;
    } else if (results.length == 1) {
      return results[0];
    }
    return results;
  }
  _forChildren(element, name, value) {
    var results = [];
    var nodes = Array.from(element.children).filter(e => e);
    for (var i in nodes) {
      var n = nodes[i];
      if (n[name] == value) {
        results.push(n);
      }
    }
    return results;
  }

  _byID(_document, parent, value) {
    return this._returnResult(this._forChildren(parent, "id", value));
  }
  _byName(_document, parent, value) {
    return this._returnResult(this._forChildren(parent, "tagName", value));
  }
  _byAttrib(parent, attributes) {
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
    return this._returnResult(results);
  }

  _byIndex(_document, parent, i) {
    return parent.children[i];
  }

  getInfo() {
    return "Lookup: " + this.expression;
  }
  exists() {
    try {
      var e = this.getNode();
    } catch (ex) {
      return false;
    }
    if (e) {
      return true;
    }
    return false;
  }
  getNode() {
    var expSplit = smartSplit(this.expression).filter(e => e != "");
    expSplit.unshift(this._view.document);
    var _document = this._view.document;
    var nCases = {
      id: this._byID.bind(this),
      name: this._byName.bind(this),
      attrib: this._byAttrib.bind(this),
      index: this._byIndex.bind(this),
    };
    var reduceLookup = (parent, exp) => {
      // Handle custom elements shadow DOM
      if (exp == "shadow") {
        return parent.shadowRoot;
      }

      // Handle case where only index is provided
      var cases = nCases;

      // Handle ending index before any of the expression gets mangled
      if (exp.endsWith("]")) {
        var expIndex = JSON.parse(vslice(exp, "[", "]"));
      }
      if (exp.startsWith("[")) {
        let obj;
        try {
          obj = JSON.parse(vslice(exp, "[", "]"));
        } catch (err) {
          throw new Error(
            err +
              ". String to be parsed was || " +
              vslice(exp, "[", "]") +
              " ||"
          );
        }
        var r = cases.index(_document, parent, obj);
        if (r == null) {
          throw new Error('Expression "' + exp + '" returned null.');
        }
        return r;
      }

      for (var c in cases) {
        if (exp.startsWith(c)) {
          let obj;
          try {
            obj = JSON.parse(vslice(exp, "(", ")"));
          } catch (err) {
            throw new Error(
              err +
                ". String to be parsed was || " +
                vslice(exp, "(", ")") +
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
            throw new Error(
              err + ". String to be parsed was || " + exp + " ||"
            );
          }

          result = this._byAttrib(parent, obj);
        }
        if (!result) {
          throw new Error('Expression "' + exp + '" returned null.');
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
  }
}
