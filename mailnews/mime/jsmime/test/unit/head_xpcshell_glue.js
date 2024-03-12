// This file needs to contain glue to rephrase the Mocha testsuite framework in
// a way that the xpcshell test suite can understand.

var { Assert } = ChromeUtils.importESModule(
  "resource://testing-common/Assert.sys.mjs"
);
var requireCache = new Map();

// Preload an assert module
var assert = new Assert();
assert.doesNotThrow = function (block, message) {
  message = message ? " " + message : ".";
  try {
    block();
  } catch (e) {
    this.report(true, e, null, "Got unwanted exception" + message);
  }
};
requireCache.set("assert", assert);

// Preload an fs module
var fs = {
  readFile(filename, options, callback) {
    if (callback === undefined) {
      callback = options;
      options = {};
    }

    // Convert according to encoding. For the moment, we don't support this
    // node.js feature in the shim since we don't need to.
    var translator = contents => contents;
    if (options !== undefined && "encoding" in options) {
      translator = function () {
        throw new Error("I can't do this!");
      };
    }

    Promise.resolve(filename)
      .then(do_get_file)
      .then(file => IOUtils.read(file.path))
      .then(translator)
      .then(contents => callback(undefined, contents), callback);
  },
};
requireCache.set("fs", fs);
var { jsmime } = ChromeUtils.importESModule(
  "resource:///modules/jsmime.sys.mjs"
);
requireCache.set("jsmime", jsmime);

function require(path) {
  if (requireCache.has(path)) {
    return requireCache.get(path);
  }

  let file;
  if (path.startsWith("test/")) {
    const name = path.substring("test/".length);
    file = "resource://testing-common/jsmime/" + name + ".js";
  } else {
    file = "resource:///modules/jsmime/" + path + ".js";
  }

  var globalObject = {
    define: innerDefine.bind(this, path),
  };
  Services.scriptloader.loadSubScript(file, globalObject);
  return requireCache.get(path);
}

function innerDefine(moduleName, dfn) {
  if (typeof dfn !== "function") {
    throw new Error("What is going on here?");
  }
  function resolvingRequire(path) {
    if (path.startsWith("./")) {
      path = path.substring(2);
    }
    return require(path);
  }
  var result = dfn(resolvingRequire);
  requireCache.set(moduleName, result);
}

var define = innerDefine.bind(this, "xpcshell-test");

// Mocha TDD UI Bindings
// ---------------------

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

// The real code for running a suite of tests, written as async function.
MochaSuite.prototype._runSuite = async function () {
  info("Running suite " + this.name);
  for (const setup_ of this.setup) {
    await runFunction(setup_);
  }
  for (const test_ of this.tests) {
    info("Running test " + test_.name);
    await runFunction(test_.test);
  }
  for (const suite_ of this.suites) {
    await suite_.runSuite();
  }
  for (const fn of this.teardown) {
    await runFunction(fn);
  }
  info("Finished suite " + this.name);
};

// The outer call to run a test suite, which returns a promise of completion.
MochaSuite.prototype.runSuite = function () {
  return this._runSuite();
};

// Run the given function, returning a promise of when the test will complete.
function runFunction(fn) {
  const completed = new Promise(function (resolve, reject) {
    function onEnd(error) {
      if (error !== undefined) {
        reject(error);
      } else {
        resolve();
      }
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

var currentSuite = new MochaSuite("");
function suite(name, tests) {
  name = name.toString();
  if (/[\x80-]/.exec(name)) {
    name = "<unprintable name>";
  }
  const suiteParent = currentSuite;
  currentSuite = new MochaSuite(name);
  suiteParent.suites.push(currentSuite);
  tests();
  currentSuite = suiteParent;
}
function test(name, block) {
  name = name.toString();
  if (/[\x80-]/.exec(name)) {
    name = "<unprintable name>";
  }
  currentSuite.tests.push({ name, test: block });
}
function setup(block) {
  currentSuite.setup.push(block);
}
function teardown(block) {
  currentSuite.teardown.push(block);
}

// The actual binding xpcshell needs to do its work.
function run_test() {
  add_task(() => currentSuite.runSuite());
  run_next_test();
}
