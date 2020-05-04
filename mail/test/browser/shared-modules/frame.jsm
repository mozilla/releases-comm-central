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
// Mikeal Rogers.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
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

const EXPORTED_SYMBOLS = ["events"];

function stateChangeBase(possibilities, restrictions, target, cmeta, v) {
  if (possibilities) {
    if (!possibilities.includes(v)) {
      // TODO Error value not in this.poss
      return;
    }
  }
  if (restrictions) {
    for (var i in restrictions) {
      var r = restrictions[i];
      if (!r(v)) {
        // TODO error value did not pass restriction
        return;
      }
    }
  }
  // Fire jsbridge notification, logging notification, listener notifications
  events[target] = v;
  events.fireEvent(cmeta, target);
}

var timers = [];

var events = {
  currentState: null,
  currentModule: null,
  currentTest: null,
  userShutdown: false,
  appQuit: false,
  listeners: {},
};
events.setState = function(v) {
  return stateChangeBase(
    [
      "dependencies",
      "setupModule",
      "teardownModule",
      "setupTest",
      "teardownTest",
      "test",
      "collection",
    ],
    null,
    "currentState",
    "setState",
    v
  );
};
events.toggleUserShutdown = function() {
  if (this.userShutdown) {
    this.fail({
      function: "frame.events.toggleUserShutdown",
      message: "Shutdown expected but none detected before timeout",
    });
  }
  this.userShutdown = !this.userShutdown;
};
events.isUserShutdown = function() {
  return this.userShutdown;
};
events.setTest = function(test, invokedFromIDE) {
  test.__passes__ = [];
  test.__fails__ = [];
  test.__invokedFromIDE__ = invokedFromIDE;
  events.currentTest = test;
  var obj = {
    filename: events.currentModule.__file__,
    name: test.__name__,
  };
  events.fireEvent("setTest", obj);
};
events.endTest = function(test) {
  test.status = "done";
  events.currentTest = null;
  var obj = {
    filename: events.currentModule.__file__,
    passed: test.__passes__.length,
    failed: test.__fails__.length,
    passes: test.__passes__,
    fails: test.__fails__,
    name: test.__name__,
  };
  if (test.skipped) {
    obj.skipped = true;
    obj.skipped_reason = test.skipped_reason;
  }
  if (test.meta) {
    obj.meta = test.meta;
  }
  events.fireEvent("endTest", obj);
};
events.setModule = function(v) {
  return stateChangeBase(
    null,
    [
      function(v) {
        return v.__file__ != undefined;
      },
    ],
    "currentModule",
    "setModule",
    v
  );
};
events.pass = function(obj) {
  if (events.currentTest) {
    events.currentTest.__passes__.push(obj);
  }
  for (var timer of timers) {
    timer.actions.push({
      currentTest:
        events.currentModule.__file__ + "::" + events.currentTest.__name__,
      obj,
      result: "pass",
    });
  }
  events.fireEvent("pass", obj);
};
events.fail = function(obj) {
  var error = obj.exception;
  if (error) {
    // Error objects aren't enumerable https://bugzilla.mozilla.org/show_bug.cgi?id=637207
    obj.exception = {
      name: error.name,
      message: error.message,
      lineNumber: error.lineNumber,
      fileName: error.fileName,
      stack: error.stack,
    };
  }
  // a low level event, such as a keystroke, fails
  if (events.currentTest) {
    events.currentTest.__fails__.push(obj);
  }
  for (var timer of timers) {
    timer.actions.push({
      currentTest:
        events.currentModule.__file__ + "::" + events.currentTest.__name__,
      obj,
      result: "fail",
    });
  }
  events.fireEvent("fail", obj);
};
events.skip = function(reason) {
  events.currentTest.skipped = true;
  events.currentTest.skipped_reason = reason;
  for (var timer of timers) {
    timer.actions.push({
      currentTest:
        events.currentModule.__file__ + "::" + events.currentTest.__name__,
      obj: reason,
      result: "skip",
    });
  }
  events.fireEvent("skip", reason);
};
events.fireEvent = function(name, obj) {
  if (this.listeners[name]) {
    for (var i in this.listeners[name]) {
      this.listeners[name][i](obj);
    }
  }
  for (var listener of this.globalListeners) {
    listener(name, obj);
  }
};
events.globalListeners = [];
events.addListener = function(name, listener) {
  if (this.listeners[name]) {
    this.listeners[name].push(listener);
  } else if (name == "") {
    this.globalListeners.push(listener);
  } else {
    this.listeners[name] = [listener];
  }
};
events.removeListener = function(listener) {
  for (var listenerIndex in this.listeners) {
    var e = this.listeners[listenerIndex];
    for (let i in e) {
      if (e[i] == listener) {
        this.listeners[listenerIndex] = e.splice(i, 1);
      }
    }
  }
  for (let i in this.globalListeners) {
    if (this.globalListeners[i] == listener) {
      this.globalListeners = this.globalListeners.splice(i, 1);
    }
  }
};
