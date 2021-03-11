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

var EXPORTED_SYMBOLS = ["Elem", "ID"];

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
