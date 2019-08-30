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

var EXPORTED_SYMBOLS = [
  "loadFile",
  "register_function",
  "Collector",
  "Runner",
  "events",
  "jsbridge",
  "runTestDirectory",
  "runTestFile",
  "log",
  "getThread",
  "timers",
  "persisted",
  "registerModule",
];

var { HttpServer } = ChromeUtils.import(
  "chrome://mozmill/content/stdlib/httpd.jsm"
);

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");
var utils = ChromeUtils.import("chrome://mozmill/content/modules/utils.jsm");
var securableModule = ChromeUtils.import(
  "chrome://mozmill/content/stdlib/securable-module.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();

var backstage = this;

var registeredFunctions = {};

var persisted = {};

var thread;

var arrayRemove = function(array, from, to) {
  var rest = array.slice((to || from) + 1 || array.length);
  array.length = from < 0 ? array.length + from : from;
  return array.push.apply(array, rest);
};

var mozmill = undefined;
var elementslib = undefined;
var modules = undefined;

var loadTestResources = function() {
  if (mozmill == undefined) {
    mozmill = ChromeUtils.import(
      "chrome://mozmill/content/modules/mozmill.jsm"
    );
  }
  if (elementslib == undefined) {
    elementslib = ChromeUtils.import(
      "chrome://mozmill/content/modules/elementslib.jsm"
    );
  }
};

var loadFile = function(path, collector) {
  var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  var uri = Services.io.newFileURI(file).spec;

  var module = new Cu.Sandbox(systemPrincipal, {
    wantGlobalProperties: ["ChromeUtils"],
  });
  module.registeredFunctions = registeredFunctions;
  module.collector = collector;
  loadTestResources();
  module.mozmill = mozmill;
  module.elementslib = elementslib;
  module.persisted = persisted;
  module.Cc = Cc;
  module.Ci = Ci;
  module.Cu = Cu;
  module.require = function(mod) {
    var loader = new securableModule.Loader({
      rootPaths: [Services.io.newFileURI(file.parent).spec],
      defaultPrincipal: "system",
      globals: { mozmill, elementslib, persisted, Cc, Ci, Cu },
    });
    if (modules != undefined) {
      loader.modules = modules;
    }
    var retval = loader.require(mod);
    modules = loader.modules;
    return retval;
  };

  if (collector != undefined) {
    collector.current_file = file;
    collector.current_path = path;
  }
  try {
    Services.scriptloader.loadSubScript(uri, module, "UTF-8");
  } catch (e) {
    events.fail({ exception: e });

    var obj = {
      filename: path,
      passed: 0,
      failed: 1,
      passes: [],
      fails: [
        {
          exception: {
            message: e.message,
            filename: e.filename,
            lineNumber: e.lineNumber,
          },
        },
      ],
      name: "<TOP_LEVEL>",
    };
    events.fireEvent("endTest", obj);
  }

  module.__file__ = path;
  module.__uri__ = uri;
  return module;
};

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
        this.listeners[listenerIndex] = arrayRemove(e, i);
      }
    }
  }
  for (let i in this.globalListeners) {
    if (this.globalListeners[i] == listener) {
      this.globalListeners = arrayRemove(this.globalListeners, i);
    }
  }
};

var log = function(obj) {
  events.fireEvent("log", obj);
};

var jsbridge;
try {
  jsbridge = ChromeUtils.import("chrome://jsbridge/content/modules/events.js");
} catch (err) {
  jsbridge = null;
  Services.console.logStringMessage("jsbridge not available.");
}

if (jsbridge) {
  events.addListener("", function(name, obj) {
    jsbridge.fireEvent("mozmill." + name, obj);
  });
}

function Collector() {
  this.test_modules_by_filename = {};
  this.test_modules_by_name = {};
  this.requirements_run = {};
  this.all_requirements = [];
  this.loaded_directories = [];
  this.testing = [];
  this.httpd_started = false;
  this.http_port = 43336;
  // var logging = ChromeUtils.import("chrome://mozmill/content/stdlib/logging.jsm");
  // this.logger = new logging.Logger('Collector');
}

Collector.prototype.getModule = function(name) {
  return this.test_modules_by_name[name];
};

Collector.prototype.getServer = function(port, basePath) {
  if (basePath) {
    var lp = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    lp.initWithPath(basePath);
  }

  var srv = new HttpServer();
  if (lp) {
    srv.registerDirectory("/", lp);
  }

  srv.registerContentType("sjs", "sjs");
  srv.identity.setPrimary("http", "localhost", port);
  srv._port = port;

  return srv;
};

Collector.prototype.startHttpd = function() {
  while (this.httpd == undefined) {
    try {
      var http_server = this.getServer(this.http_port);
      http_server.start(this.http_port);
      this.httpd = http_server;
    } catch (e) {
      // Failure most likely due to port conflict
      this.http_port++;
    }
  }
};

Collector.prototype.stopHttpd = function() {
  if (this.httpd) {
    this.httpd.stop(function() {}); // Callback needed to pause execution until the server has been properly shutdown
    this.httpd = null;
  }
};

Collector.prototype.addHttpResource = function(directory, ns) {
  if (!this.httpd) {
    this.startHttpd();
  }

  if (!ns) {
    ns = "/";
  } else {
    ns = "/" + ns + "/";
  }

  var lp = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  lp.initWithPath(os.abspath(directory, this.current_file));
  this.httpd.registerDirectory(ns, lp);

  return "http://localhost:" + this.http_port + ns;
};

Collector.prototype.initTestModule = function(filename) {
  var test_module = loadFile(filename, this);
  test_module.__tests__ = [];
  for (var i in test_module) {
    if (test_module[i] == null) {
      // do nothing
    } else if (typeof test_module[i] == "function") {
      if (i == "setupTest") {
        test_module[i].__name__ = i;
        test_module.__setupTest__ = test_module[i];
      } else if (i == "setupModule") {
        test_module[i].__name__ = i;
        test_module.__setupModule__ = test_module[i];
      } else if (i == "teardownTest") {
        test_module[i].__name__ = i;
        test_module.__teardownTest__ = test_module[i];
      } else if (i == "teardownModule") {
        test_module[i].__name__ = i;
        test_module.__teardownModule__ = test_module[i];
      } else if (i.startsWith("test")) {
        test_module[i].__name__ = i;
        test_module.__tests__.push(test_module[i]);
      }
    } else if (
      typeof test_module[i] == "object" &&
      test_module[i]._mozmillasynctest
    ) {
      test_module[i].__name__ = i;
      test_module.__tests__.push(test_module[i]);
    }
    if (i == "RELATIVE_ROOT") {
      test_module.__root_path__ = os.abspath(
        test_module[i],
        os.getFileForPath(filename)
      );
    }
    if (i == "MODULE_REQUIRES") {
      test_module.__requirements__ = test_module[i];
      this.all_requirements.push.apply(backstage, test_module[i]);
    }
    if (i == "MODULE_NAME") {
      test_module.__module_name__ = test_module[i];
      this.test_modules_by_name[test_module[i]] = test_module;
    }
  }

  if (
    test_module.MODULE_REQUIRES != undefined &&
    test_module.RELATIVE_ROOT == undefined
  ) {
    for (var t of test_module.__tests__) {
      t.__force_skip__ =
        "RELATIVE ROOT is not defined and test requires another module.";
    }
  }

  test_module.collector = this;
  test_module.status = "loaded";
  this.test_modules_by_filename[filename] = test_module;

  return test_module;
};

Collector.prototype.initTestDirectory = function(directory) {
  var r = this;
  function recursiveModuleLoader(dfile) {
    r.loaded_directories.push(directory);
    var dfiles = os.listDirectory(dfile);
    for (var i in dfiles) {
      var f = dfiles[i];
      if (
        f.isDirectory() &&
        !f.leafName.startsWith(".") &&
        f.leafName.startsWith("test") &&
        !r.loaded_directories.includes(f.path)
      ) {
        recursiveModuleLoader(os.getFileForPath(f.path));
      } else if (
        f.leafName.startsWith("test") &&
        f.leafName.endsWith(".js") &&
        !(f.path in r.test_modules_by_filename)
      ) {
        r.initTestModule(f.path);
      }
      r.testing.push(f.path);
    }
  }
  recursiveModuleLoader(os.getFileForPath(directory));
};

// Observer which gets notified when the application quits
function AppQuitObserver() {
  this.register();
}
AppQuitObserver.prototype = {
  observe(subject, topic, data) {
    events.appQuit = true;
  },
  register() {
    Services.obs.addObserver(this, "quit-application");
  },
  unregister() {
    Services.obs.removeObserver(this, "quit-application");
  },
};

function Runner(collector, invokedFromIDE) {
  this.collector = collector;
  this.invokedFromIDE = invokedFromIDE;
  events.fireEvent("startRunner", true);
  // var logging = ChromeUtils.import("chrome://mozmill/content/stdlib/logging.jsm");
  // this.logger = new logging.Logger('Runner');
  var m = ChromeUtils.import("chrome://mozmill/content/modules/mozmill.jsm");
  this.platform = m.platform;
}
Runner.prototype.runTestDirectory = function(directory) {
  this.collector.initTestDirectory(directory);

  for (var i in this.collector.test_modules_by_filename) {
    var test = this.collector.test_modules_by_filename[i];
    if (test.status != "done") {
      this.runTestModule(test);
    }
  }
};
Runner.prototype.runTestFile = function(filename) {
  // if ( !arrays.inArray(this.test_modules_by_filename, directory) ) {
  //   this.collector.initTestModule(directory);
  // }
  this.collector.initTestModule(filename);
  this.runTestModule(this.collector.test_modules_by_filename[filename]);
};
Runner.prototype.end = function() {
  try {
    events.fireEvent("persist", persisted);
  } catch (e) {
    events.fireEvent("error", "persist serialization failed.");
  }
  this.collector.stopHttpd();
  events.fireEvent("endRunner", true);
};

Runner.prototype.wrapper = function(func, arg) {
  thread = Services.tm.currentThread;

  if (func.EXCLUDED_PLATFORMS != undefined) {
    if (func.EXCLUDED_PLATFORMS.includes(this.platform)) {
      events.skip("Platform exclusion");
      return;
    }
  }
  if (func.__force_skip__ != undefined) {
    events.skip(func.__force_skip__);
    return;
  }
  try {
    if (arg) {
      func(arg);
    } else if (func._mozmillasynctest) {
      func.run();
    } else {
      func();
    }
    // If a shutdown was expected but the application hasn't quit, throw a failure
    if (events.isUserShutdown()) {
      utils.sleep(500); // Prevents race condition between mozrunner hard process kill and normal FFx shutdown
      if (!events.appQuit) {
        events.fail({
          function: "Runner.wrapper",
          message: "Shutdown expected but none detected before end of test",
        });
      }
    }
  } catch (e) {
    if (func._mozmillasynctest) {
      func = {
        filename: events.currentModule.__file__,
        name: func.__name__,
      };
    }
    // Allow the exception if a user shutdown was expected
    if (!events.isUserShutdown()) {
      events.fail({ exception: e, test: func });
      Cu.reportError(e);
    }
  }
};

Runner.prototype._runTestModule = function(module) {
  if (
    module.__requirements__ != undefined &&
    module.__force_skip__ == undefined
  ) {
    for (var req of module.__requirements__) {
      module[req] = this.collector.getModule(req);
    }
  }

  var attrs = [];
  for (let i in module) {
    attrs.push(i);
  }

  events.setModule(module);
  var observer = new AppQuitObserver();
  var setupModulePassed, setupTestPassed;

  module.__status__ = "running";
  if (module.__setupModule__) {
    events.setState("setupModule");
    events.setTest(module.__setupModule__);
    this.wrapper(module.__setupModule__, module);
    setupModulePassed =
      events.currentTest.__fails__.length == 0 && !events.currentTest.skipped;
    events.endTest(module.__setupModule__);
  } else {
    setupModulePassed = true;
  }
  if (setupModulePassed) {
    for (let i in module.__tests__) {
      events.appQuit = false;
      let test = module.__tests__[i];

      // TODO: introduce per-test timeout:
      // https://bugzilla.mozilla.org/show_bug.cgi?id=574871

      if (module.__setupTest__) {
        events.setState("setupTest");
        events.setTest(module.__setupTest__);
        this.wrapper(module.__setupTest__, test);
        setupTestPassed =
          events.currentTest.__fails__.length == 0 &&
          !events.currentTest.skipped;
        events.endTest(module.__setupTest__);
      } else {
        setupTestPassed = true;
      }
      events.setState("test");
      events.setTest(test, this.invokedFromIDE);
      if (setupTestPassed) {
        this.wrapper(test);
      } else {
        events.skip("setupTest failed.");
      }
      if (module.__teardownTest__) {
        events.setState("teardownTest");
        events.setTest(module.__teardownTest__);
        this.wrapper(module.__teardownTest__, test);
        events.endTest(module.__teardownTest__);
      }
      events.endTest(test);
    }
  } else {
    for (let test of module.__tests__) {
      events.setTest(test);
      events.skip("setupModule failed.");
      events.endTest(test);
    }
  }
  if (module.__teardownModule__) {
    events.setState("teardownModule");
    events.setTest(module.__teardownModule__);
    this.wrapper(module.__teardownModule__, module);
    events.endTest(module.__teardownModule__);
  }

  observer.unregister();

  module.__status__ = "done";
};

Runner.prototype.runTestModule = function(module) {
  if (
    module.__requirements__ != undefined &&
    module.__force_skip__ == undefined
  ) {
    if (!this.collector.loaded_directories.includes(module.__root_path__)) {
      if (module.__root_path__ != undefined) {
        this.collector.initTestDirectory(module.__root_path__);
      }
    }
  }
  this._runTestModule(module);
};

var runTestDirectory = function(dir, invokedFromIDE) {
  var runner = new Runner(new Collector(), invokedFromIDE);
  runner.runTestDirectory(dir);
  runner.end();
  return true;
};
var runTestFile = function(filename, invokedFromIDE) {
  var runner = new Runner(new Collector(), invokedFromIDE);
  runner.runTestFile(filename);
  runner.end();
  return true;
};

var getThread = function() {
  return thread;
};

function registerModule(name, path) {
  let protocolHandler = Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler);

  let modulesFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  modulesFile.initWithPath(path);
  protocolHandler.setSubstitution(name, Services.io.newFileURI(modulesFile));
}
