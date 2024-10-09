/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Makes everything awesome if you are Andrew.  Some day it will make everything
 *  awesome if you are not awesome too.
 *
 * Right now the most meaningful thing to know is that if XPCOM failures happen
 *  (and get reported to the error console), this will induce a unit test
 *  failure.  You should think this is awesome no matter whether you are Andrew
 *  or not.
 */

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["Element", "Node"]);

var _mailnewsTestLogger;
var _xpcshellLogger;
var _testLoggerContexts = [];
var _testLoggerContextId = 0;
var _testLoggerActiveContext;

var _logHelperInterestedListeners = false;

/**
 * Let test code extend the list of allowed XPCOM errors.
 */
var logHelperAllowedErrors = ["NS_ERROR_FAILURE"];
var logHelperAllowedWarnings = [/Quirks Mode/];

/**
 * Let other test helping code decide whether to register for potentially
 *  expensive notifications based on whether anyone can even hear those
 *  results.
 */
function logHelperHasInterestedListeners() {
  return _logHelperInterestedListeners;
}

/**
 * Tunnel nsIScriptErrors that show up on the error console to ConsoleInstance.
 *  We could send everything but I think only script errors are likely of much
 *  concern. Also, this nicely avoids infinite recursions no matter what you do
 *  since what we publish is not going to end up as an nsIScriptError.
 *
 * This is based on my (asuth') exmmad extension.
 */
var _errorConsoleTunnel = {
  initialize() {
    Services.console.registerListener(this);

    // we need to unregister our listener at shutdown if we don't want explosions
    Services.obs.addObserver(this, "quit-application");
  },

  shutdown() {
    Services.console.unregisterListener(this);
    Services.obs.removeObserver(this, "quit-application");
  },

  observe(aMessage, aTopic) {
    if (aTopic == "quit-application") {
      this.shutdown();
      return;
    }

    try {
      if (
        aMessage instanceof Ci.nsIScriptError &&
        !aMessage.errorMessage.includes("Error console says")
      ) {
        // Unfortunately changes to mozilla-central are throwing lots
        // of console errors during testing, so disable (we hope temporarily)
        // failing on XPCOM console errors (see bug 1014350).
        // An XPCOM error aMessage looks like this:
        //   [JavaScript Error: "uncaught exception: 2147500037"]
        // Capture the number, and allow known XPCOM results.
        const matches = /JavaScript Error: "(\w+)/.exec(aMessage);
        let XPCOMresult = null;
        if (matches) {
          for (const result in Cr) {
            if (matches[1] == Cr[result]) {
              XPCOMresult = result;
              break;
            }
          }
          const message = XPCOMresult || aMessage;
          if (logHelperAllowedErrors.some(e => e == matches[1])) {
            if (XPCOMresult) {
              info("Ignoring XPCOM error: " + message);
            }
            return;
          }
          info("Found XPCOM error: " + message);
        }
        // Ignore warnings that match a white-listed pattern.
        if (
          /JavaScript Warning:/.test(aMessage) &&
          logHelperAllowedWarnings.some(w => w.test(aMessage))
        ) {
          return;
        }
        dump(`Error console says: ${aMessage}`);
      }
    } catch (ex) {
      // This is to avoid pathological error loops.  we definitely do not
      // want to propagate an error here.
    }
  },
};

// This defaults to undefined and is for use by test-folder-display-helpers
//  so that it can pre-initialize the value so that when we are evaluated in
//  its subscript loader we see a value of 'true'.
var _do_not_wrap_xpcshell;

/**
 * Initialize logging.  The idea is to:
 *
 * - Always create a dump appender on 'test'.
 * - Check if there's a desire to use a logsploder style network connection
 *    based on the presence of an appropriate file in 'tmp'.  This should be
 *    harmless in cases where there is not such a file.
 *
 * We will wrap the interesting xpcshell functions if we believe there is an
 *  endpoint that cares about these things (such as logsploder).
 */
function _init_log_helper() {
  // - dump on test
  _mailnewsTestLogger = console.createInstance({
    prefix: "test.test",
  });

  // - silent category for xpcshell stuff that already gets dump()ed
  _xpcshellLogger = console.createInstance({
    prefix: "xpcshell",
  });

  // Create a console listener reporting thinger in all cases.  Since XPCOM
  //  failures will show up via the error console, this allows our test to fail
  //  in more situations where we might otherwise silently be cool with bad
  //  things happening.
  _errorConsoleTunnel.initialize();

  if (_logHelperInterestedListeners) {
    if (!_do_not_wrap_xpcshell) {
      _wrap_xpcshell_functions();
    }

    // Send a message telling the listeners about the test file being run.
    _xpcshellLogger.info({
      _jsonMe: true,
      _isContext: true,
      _specialContext: "lifecycle",
      _id: "start",
      testFile: _TEST_FILE,
    });
  }
}
_init_log_helper();

/**
 * Mark the start of a test.  This creates nice console output as well as
 *  setting up logging contexts so that use of other helpers in here
 *  get associated with the context.
 *
 * This will likely only be used by the test driver framework, such as
 *  asyncTestUtils.js.  However, |mark_sub_test_start| is for user test code.
 */
function mark_test_start(aName, aParameter, aDepth) {
  if (aDepth == null) {
    aDepth = 0;
  }

  // clear out any existing contexts
  mark_test_end(aDepth);

  const term = aDepth == 0 ? "test" : "subtest";
  _testLoggerActiveContext = {
    type: term,
    name: aName,
    parameter: aParameter,
    _id: ++_testLoggerContextId,
  };
  if (_testLoggerContexts.length) {
    _testLoggerActiveContext._contextDepth = _testLoggerContexts.length;
    _testLoggerActiveContext._contextParentId =
      _testLoggerContexts[_testLoggerContexts.length - 1]._id;
  }
  _testLoggerContexts.push(_testLoggerActiveContext);

  _mailnewsTestLogger.info(
    _testLoggerActiveContext._id,
    "Starting " + term + ": " + aName + (aParameter ? ", " + aParameter : "")
  );
}

/**
 * Mark the end of a test started by |mark_test_start|.
 */
function mark_test_end(aPopTo) {
  if (aPopTo === undefined) {
    aPopTo = 0;
  }
  // clear out any existing contexts
  while (_testLoggerContexts.length > aPopTo) {
    const context = _testLoggerContexts.pop();
    _mailnewsTestLogger.info(
      context._id,
      "Finished " +
        context.type +
        ": " +
        context.name +
        (context.parameter ? ", " + context.parameter : "")
    );
  }
}

/**
 * For user test code and test support code to mark sub-regions of tests.
 *
 * @param {string} aName The name of the (sub) test.
 * @param {string} [aParameter=null] The parameter if the test is being parameterized.
 * @param {boolean} [aNest=false] Should this nest inside other sub-tests?
 *   If you omit orpass false, we will close out any existing sub-tests.
 *   If you pass true, we nest inside the previous test/sub-test and rely on
 *   you to call |mark_sub_test_end|.
 *   Sub tests can lost no longer than their parent.
 *   You should strongly consider using the aNest parameter if you are test
 *   support code.
 */
function mark_sub_test_start(aName, aParameter, aNest) {
  const depth = aNest ? _testLoggerContexts.length : 1;
  mark_test_start(aName, aParameter, depth);
}

/**
 * Mark the end of a sub-test.  Because sub-tests can't outlive their parents,
 *  there is no ambiguity about what sub-test we are closing out.
 */
function mark_sub_test_end() {
  if (_testLoggerContexts.length <= 1) {
    return;
  }
  mark_test_end(_testLoggerContexts.length - 1);
}

/**
 * Express that all tests were run to completion.  This helps the listener
 *  distinguish between successful termination and abort-style termination where
 *  the process just keeled over and on one told us.
 *
 * This also tells us to clean up.
 */
function mark_all_tests_run() {
  // make sure all tests get closed out
  mark_test_end();

  _xpcshellLogger.info("All finished");
}

function _explode_flags(aFlagWord, aFlagDefs) {
  const flagList = [];

  for (const flagName in aFlagDefs) {
    const flagVal = aFlagDefs[flagName];
    if (flagVal & aFlagWord) {
      flagList.push(flagName);
    }
  }

  return flagList;
}

var _registered_json_normalizers = [];

/**
 * Copy natives or objects, deferring to _normalize_for_json for objects.
 */
function __value_copy(aObj, aDepthAllowed) {
  if (aObj == null || typeof aObj != "object") {
    return aObj;
  }
  return _normalize_for_json(aObj, aDepthAllowed, true);
}

/**
 * Simple object copier to limit accidentally JSON-ing a ridiculously complex
 *  object graph or getting tripped up by prototypes.
 *
 * @param {object} aObj - Input object.
 * @param {integer} aDepthAllowed - How many times we are allowed to recursively
 *   call ourselves.
 */
function __simple_obj_copy(aObj, aDepthAllowed) {
  const oot = {};
  const nextDepth = aDepthAllowed - 1;
  for (const key in aObj) {
    // avoid triggering getters
    if (aObj.__lookupGetter__(key)) {
      oot[key] = "*getter*";
      continue;
    }
    const value = aObj[key];

    if (value == null) {
      oot[key] = null;
    } else if (typeof value != "object") {
      oot[key] = value;
    } else if (!aDepthAllowed) {
      // steal control flow if no more depth is allowed
      oot[key] = "truncated, string rep: " + value.toString();
    } else if (Array.isArray(value)) {
      // array?  (not directly counted, but we will terminate because the
      //  child copying occurs using nextDepth...)
      oot[key] = value.map(v => __value_copy(v, nextDepth));
    } else {
      // it's another object! woo!
      oot[key] = _normalize_for_json(value, nextDepth, true);
    }
  }

  // let's take advantage of the object's native toString now
  oot._stringRep = aObj.toString();

  return oot;
}

var _INTERESTING_MESSAGE_HEADER_PROPERTIES = {
  "gloda-id": 0,
  "gloda-dirty": 0,
  junkscore: "",
  junkscoreorigin: "",
  offlineMsgSize: 0,
};

/**
 * Given an object, attempt to normalize it into an interesting JSON
 *  representation.
 *
 * We transform generally interesting mail objects like:
 * - nsIMsgFolder
 * - nsIMsgDBHdr
 */
function _normalize_for_json(aObj, aDepthAllowed, aJsonMeNotNeeded) {
  if (aDepthAllowed === undefined) {
    aDepthAllowed = 2;
  }

  // if it's a simple type just return it direct
  if (typeof aObj != "object") {
    return aObj;
  } else if (aObj == null) {
    return aObj;
  }

  // recursively transform arrays outright
  if (Array.isArray(aObj)) {
    return aObj.map(v => __value_copy(v, aDepthAllowed - 1));
  }

  // === Mail Specific ===
  // (but common and few enough to not split out)
  if (aObj instanceof Ci.nsIMsgFolder) {
    return {
      type: "folder",
      name: aObj.prettyName,
      uri: aObj.URI,
      flags: _explode_flags(aObj.flags, Ci.nsMsgFolderFlags),
    };
  } else if (aObj instanceof Ci.nsIMsgDBHdr) {
    const properties = {};
    for (const name in _INTERESTING_MESSAGE_HEADER_PROPERTIES) {
      const propType = _INTERESTING_MESSAGE_HEADER_PROPERTIES[name];
      if (propType === 0) {
        properties[name] =
          aObj.getStringProperty(name) != ""
            ? aObj.getUint32Property(name)
            : null;
      } else {
        properties[name] = aObj.getStringProperty(name);
      }
    }
    return {
      type: "msgHdr",
      name: aObj.folder.URI + "#" + aObj.messageKey,
      subject: aObj.mime2DecodedSubject,
      from: aObj.mime2DecodedAuthor,
      to: aObj.mime2DecodedRecipients,
      messageKey: aObj.messageKey,
      messageId: aObj.messageId,
      flags: _explode_flags(aObj.flags, Ci.nsMsgMessageFlags),
      interestingProperties: properties,
    };
  } else if (Node.isInstance(aObj)) {
    // === Generic ===
    // DOM nodes, including elements
    let name = aObj.nodeName;
    const objAttrs = {};

    if (Element.isInstance(aObj)) {
      name += "#" + aObj.getAttribute("id");
    }

    if ("attributes" in aObj) {
      const nodeAttrs = aObj.attributes;
      for (let iAttr = 0; iAttr < nodeAttrs.length; iAttr++) {
        objAttrs[nodeAttrs[iAttr].name] = nodeAttrs[iAttr].value;
      }
    }

    let bounds = { left: null, top: null, width: null, height: null };
    if ("getBoundingClientRect" in aObj) {
      bounds = aObj.getBoundingClientRect();
    }

    return {
      type: "domNode",
      name,
      value: aObj.nodeValue,
      namespace: aObj.namespaceURI,
      boundingClientRect: bounds,
      attrs: objAttrs,
    };
  } else if (aObj instanceof Ci.nsIDOMWindow) {
    let winId, title;
    if (aObj.document && aObj.document.documentElement) {
      title = aObj.document.title;
      winId =
        aObj.document.documentElement.getAttribute("windowtype") ||
        aObj.document.documentElement.getAttribute("id") ||
        "unnamed";
    } else {
      winId = "n/a";
      title = "no document";
    }
    return {
      type: "domWindow",
      id: winId,
      title,
      location: "" + aObj.location,
      coords: { x: aObj.screenX, y: aObj.screenY },
      dims: { width: aObj.outerWidth, height: aObj.outerHeight },
    };
  } else if (aObj instanceof Error) {
    // Although straight JS exceptions should serialize pretty well, we can
    //  improve things by making "stack" more friendly.
    return {
      type: "error",
      message: aObj.message,
      fileName: aObj.fileName,
      lineNumber: aObj.lineNumber,
      name: aObj.name,
      stack: aObj.stack ? aObj.stack.split(/\n\r?/g) : null,
      _stringRep: aObj.message,
    };
  } else if (aObj instanceof Ci.nsIException) {
    return {
      type: "error",
      message: "nsIException: " + aObj.name,
      fileName: aObj.filename, // intentionally lower-case
      lineNumber: aObj.lineNumber,
      name: aObj.name,
      result: aObj.result,
      stack: null,
    };
  } else if (aObj instanceof Ci.nsIStackFrame) {
    return {
      type: "stackFrame",
      name: aObj.name,
      fileName: aObj.filename, // intentionally lower-case
      lineNumber: aObj.lineNumber,
    };
  } else if (aObj instanceof Ci.nsIScriptError) {
    return {
      type: "stackFrame",
      name: aObj.errorMessage,
      category: aObj.category,
      fileName: aObj.sourceName,
      lineNumber: aObj.lineNumber,
    };
  }

  for (const [checkType, handler] of _registered_json_normalizers) {
    if (aObj instanceof checkType) {
      return handler(aObj);
    }
  }

  // Do not fall into simple object walking if this is an XPCOM interface.
  // We might run across getters and that leads to nothing good.
  if (aObj instanceof Ci.nsISupports) {
    return {
      type: "XPCOM",
      name: aObj.toString(),
    };
  }

  const simple_obj = __simple_obj_copy(aObj, aDepthAllowed);
  if (!aJsonMeNotNeeded) {
    simple_obj._jsonMe = true;
  }
  return simple_obj;
}

function register_json_normalizer(aType, aHandler) {
  _registered_json_normalizers.push([aType, aHandler]);
}

/*
 * Wrap the xpcshell test functions that do interesting things.  The idea is
 *  that we clobber these only if we're going to value-add; that decision
 *  gets made up top in the initialization function.
 *
 * Since eq/neq fall-through to do_throw in the explosion case, we don't handle
 *  that since the scoping means that we're going to see the resulting
 *  do_throw.
 */

var _orig_do_throw;
var _orig_do_check_neq;
var _orig_do_check_eq;
// do_check_true is implemented in terms of do_check_eq
// do_check_false is implemented in terms of do_check_eq

function _CheckAction(aSuccess, aLeft, aRight, aStack) {
  this.type = "check";
  this.success = aSuccess;
  this.left = _normalize_for_json(aLeft);
  this.right = _normalize_for_json(aRight);
  this.stack = _normalize_for_json(aStack);
}
_CheckAction.prototype = {
  _jsonMe: true,
  // we don't need a toString because we should not go out to the console
};

/**
 * Representation of a failure from do_throw.
 */
function _Failure(aText, aStack) {
  this.type = "failure";
  this.text = aText;
  this.stack = _normalize_for_json(aStack);
}
_Failure.prototype = {
  _jsonMe: true,
};

function _wrapped_do_throw(text, stack) {
  if (!stack) {
    stack = Components.stack.caller;
  }

  // We need to use an info because otherwise explosion loggers can get angry
  //  and they may be indiscriminate about what they subscribe to.
  _xpcshellLogger.info(_testLoggerActiveContext, new _Failure(text, stack));

  return _orig_do_throw(text, stack);
}

function _wrap_xpcshell_functions() {
  _orig_do_throw = do_throw;
  do_throw = _wrapped_do_throw; // eslint-disable-line no-global-assign
}
