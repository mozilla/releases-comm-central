// This file needs to contain glue to rephrase the Mocha testsuite framework in
// a way that the xpcshell test suite can understand.

Components.utils.import("resource://gre/modules/osfile.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");
Components.utils.import("resource://testing-common/Assert.jsm");
var requireCache = new Map();

// Preload an assert module
var assert = new Assert();
assert.doesNotThrow = function (block, message) {
  message = (message ? ' ' + message : '.');
  try {
    block();
  } catch (e) {
    this.report(true, e, null, 'Got unwanted exception' + message);
  }
};
requireCache.set("assert", assert);

// Preload an fs module
var Cc = Components.classes, Ci = Components.interfaces;
var fs = {
  readFile: function (filename, options, callback) {
    if (callback === undefined) {
      callback = options;
      options = {};
    }

    // Convert according to encoding. For the moment, we don't support this
    // node.js feature in the shim since we don't need to.
    var translator = (contents => contents);
    if (options !== undefined && 'encoding' in options) {
      translator = function () {
        throw new Error("I can't do this!");
      };
    }

    Promise.resolve(filename)
           .then(do_get_file)
           .then(file => OS.File.read(file.path))
           .then(translator)
           .then(contents => callback(undefined, contents), callback);
  },
};
requireCache.set("fs", fs);
Services.scriptloader.loadSubScript("resource:///modules/jsmime/jsmime.js");
requireCache.set("jsmime", jsmime);

function require(path) {
  if (requireCache.has(path))
    return requireCache.get(path);

  if (path.startsWith("test/")) {
    let name = path.substring("test/".length);
    var file = "resource://testing-common/jsmime/" + name + ".js";
  } else {
    var file = "resource:///modules/jsmime/" + path + ".js";
  }

  var globalObject = {
    define: innerDefine.bind(this, path),
  };
  Services.scriptloader.loadSubScript(file, globalObject);
  return requireCache.get(path);
}

function innerDefine(moduleName, dfn) {
  if (typeof dfn !== "function")
    throw new Error("What is going on here?");
  function resolvingRequire(path) {
    if (path.startsWith("./"))
      path = path.substring(2);
    return require(path);
  }
  var result = dfn(resolvingRequire);
  requireCache.set(moduleName, result);
}

var define = innerDefine.bind(this, "xpcshell-test");

///////////////////////////
// Mocha TDD UI Bindings //
///////////////////////////

/**
 * A block of tests, from the suite class.
 */
function MochaSuite(name) {
  this.name = name;
  this.setup = [];
  this.tests = [];
  this.teardown = [];
  this.suites = [];
}

/// The real code for running a suite of tests, written as a generator.
MochaSuite.prototype._runSuite = function *() {
  do_print("Running suite " + this.name);
  for (let setup of this.setup) {
    yield runFunction(setup);
  }
  for (let test of this.tests) {
    do_print("Running test " + test.name);
    yield runFunction(test.test);
  }
  for (let suite of this.suites) {
    yield suite.runSuite();
  }
  for (let fn of this.teardown) {
    yield runFunction(fn);
  }
  do_print("Finished suite " + this.name);
};

/// The outer call to run a test suite, which returns a promise of completion.
MochaSuite.prototype.runSuite = function () {
  return Task.spawn(this._runSuite.bind(this));
};

/// Run the given function, returning a promise of when the test will complete.
function runFunction(fn) {
  let completed = new Promise(function (resolve, reject) {
    function onEnd(error) {
      if (error !== undefined)
        reject(error);
      else
        resolve();
    }
    // If the function is expecting an argument, that argument is the callback
    // above. If it's not, then it may be returning a promise.
    if (fn.length == 1) {
      fn(onEnd);
    } else {
      // Promise.resolve nicely handles both promises and not-promise values for
      // us.
      resolve(fn());
    }
  });
  return completed;
}

var currentSuite = new MochaSuite('');
function suite(name, tests) {
  name = name.toString();
  if (/[\x80-]/.exec(name))
    name = "<unprintable name>";
  let suiteParent = currentSuite;
  currentSuite = new MochaSuite(name);
  suiteParent.suites.push(currentSuite);
  tests();
  currentSuite = suiteParent;
}
function test(name, block) {
  name = name.toString();
  if (/[\x80-]/.exec(name))
    name = "<unprintable name>";
  currentSuite.tests.push({name: name, test: block});
}
function setup(block) {
  currentSetup.setup.push(block);
}
function teardown(block) {
  currentSetup.teardown.push(block);
}

/// The actual binding xpcshell needs to do its work.
function run_test() {
  add_task(() => currentSuite.runSuite());
  run_next_test();
}
