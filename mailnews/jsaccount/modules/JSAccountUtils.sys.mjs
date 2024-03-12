/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file implements helper methods to make the transition of base mailnews
 * objects from JS to C++ easier, and also to allow creating specialized
 * versions of those accounts using only JS XPCOM implementations.
 *
 * In C++ land, the XPCOM component is a generic C++ class that does nothing
 * but delegate any calls to interfaces known in C++ to either the generic
 * C++ implementation (such as nsMsgIncomingServer.cpp) or a JavaScript
 * implementation of those methods. Those delegations could be used for either
 * method-by-method replacement of the generic C++ methods with JavaScript
 * versions, or for specialization of the generic class using JavaScript to
 * implement a particular class type. We use a C++ class as the main XPCOM
 * version for two related reasons: First, we do not want to go through a
 * C++->js->C++ XPCOM transition just to execute a C++ method. Second, C++
 * inheritance is different from JS inheritance, and sometimes the C++ code
 * will ignore the XPCOM parts of the JS, and just execute using C++
 * inheritance.
 *
 * In JavaScript land, the implementation currently uses the XPCOM object for
 * JavaScript calls, with the last object in the prototype chain defaulting
 * to calling using the CPP object, specified in an instance-specific
 * this.cppBase object.
 *
 * Examples of use can be found in the test files for jsaccount stuff.
 */

export var JSAccountUtils = {};

// Logging usage: set mailnews.jsaccount.loglevel to the word "Debug" to
// increase logging level.
var log = console.createInstance({
  prefix: "mail.jsaccount",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.jsaccount.loglevel",
});

/**
 *
 *  Generic factory to create XPCOM components under JsAccount.
 *
 *  @param aProperties   This a a const JS object that describes the specific
 *                       details of a particular JsAccount XPCOM object:
 *     {
 *       baseContractID: string contractID used to create the base generic C++
 *                       object. This object must implement the interfaces in
 *                       baseInterfaces, plus msgIOverride.
 *
 *       baseInterfaces: JS array of interfaces implemented by the base, generic
 *                       C++ object.
 *
 *       extraInterfaces: JS array of additional interfaces implemented by the
 *                        component (accessed using getInterface())
 *
 *       contractID:     string contract ID for the JS object that will be
 *                       created by the factory.
 *
 *       classID:        Components.ID(CID) for the JS object that will be
 *                       created by the factory, where CID is a string uuid.
 *      }
 *
 *   @param aJsDelegateConstructor: a JS constructor class, called using new,
 *                                  that will create the JS object to which
 *                                  XPCOM methods calls will be delegated.
 */

JSAccountUtils.jaFactory = function (aProperties, aJsDelegateConstructor) {
  const factory = {};
  factory.QueryInterface = ChromeUtils.generateQI([Ci.nsIFactory]);

  factory.createInstance = function (iid) {
    // C++ delegator class.
    const delegator = Cc[aProperties.baseContractID].createInstance(
      Ci.msgIOverride
    );

    // Make sure the delegator JS wrapper knows its interfaces.
    aProperties.baseInterfaces.forEach(iface => delegator instanceof iface);

    // JavaScript overrides of base class functions.
    const jsDelegate = new aJsDelegateConstructor(
      delegator,
      aProperties.baseInterfaces
    );
    delegator.jsDelegate = jsDelegate;

    // Get the delegate list for this current class. Use OwnProperty in case it
    // inherits from another JsAccount class.

    let delegateList = null;
    if (Object.getPrototypeOf(jsDelegate).hasOwnProperty("delegateList")) {
      delegateList = Object.getPrototypeOf(jsDelegate).delegateList;
    }
    if (delegateList instanceof Ci.msgIDelegateList) {
      delegator.methodsToDelegate = delegateList;
    } else {
      // Lazily create and populate the list of methods to delegate.
      log.info(
        "creating delegate list for contractID " + aProperties.contractID
      );
      const delegateList = delegator.methodsToDelegate;
      Object.keys(delegator).forEach(name => {
        log.debug("delegator has key " + name);
      });

      // jsMethods contains the methods that may be targets of the C++ delegation to JS.
      const jsMethods = Object.getPrototypeOf(jsDelegate);
      for (const name in jsMethods) {
        log.debug("processing jsDelegate method: " + name);
        if (name[0] == "_") {
          // don't bother with methods explicitly marked as internal.
          log.debug("skipping " + name);
          continue;
        }
        // Other methods to skip.
        if (
          [
            "QueryInterface", // nsISupports
            "methodsToDelegate",
            "jsDelegate",
            "cppBase", // msgIOverride
            "delegateList",
            "wrappedJSObject", // non-XPCOM methods to skip
          ].includes(name)
        ) {
          log.debug("skipping " + name);
          continue;
        }

        const jsDescriptor = getPropertyDescriptor(jsMethods, name);
        if (!jsDescriptor) {
          log.debug("no jsDescriptor for " + name);
          continue;
        }
        const cppDescriptor = Object.getOwnPropertyDescriptor(delegator, name);
        if (!cppDescriptor) {
          log.debug("no cppDescriptor found for " + name);
          // It is OK for jsMethods to have methods that are not used in override of C++.
          continue;
        }

        const upperCaseName = name[0].toUpperCase() + name.substr(1);
        if ("value" in jsDescriptor) {
          log.info("delegating " + upperCaseName);
          delegateList.add(upperCaseName);
        } else {
          if (jsDescriptor.set) {
            log.info("delegating Set" + upperCaseName);
            delegateList.add("Set" + upperCaseName);
          }
          if (jsDescriptor.get) {
            log.info("delegating Get" + upperCaseName);
            delegateList.add("Get" + upperCaseName);
          }
        }
      }

      // Save the delegate list for reuse, statically for all instances.
      Object.getPrototypeOf(jsDelegate).delegateList = delegateList;
    }

    for (const iface of aProperties.baseInterfaces) {
      if (iid.equals(iface)) {
        log.debug("Successfully returning delegator " + delegator);
        return delegator;
      }
    }
    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  };

  return factory;
};

/**
 * Create a JS object that contains calls to each of the methods in a CPP
 * base class, that will reference the cpp object defined on a particular
 * instance of the object. This is intended to be the last item in the
 * prototype chain for a JsAccount implementation.
 *
 * @param aProperties see definition in jsFactory above
 *
 * @returns a JS object suitable as the prototype of a JsAccount implementation.
 */
JSAccountUtils.makeCppDelegator = function (aProperties) {
  log.info("Making cppDelegator for contractID " + aProperties.contractID);
  const cppDelegator = {};
  const cppDummy = Cc[aProperties.baseContractID].createInstance(
    Ci.nsISupports
  );
  // Add methods from all interfaces.
  for (const iface of aProperties.baseInterfaces) {
    cppDummy instanceof Ci[iface];
  }

  for (const method in cppDummy) {
    // skip nsISupports and msgIOverride methods
    if (
      [
        "QueryInterface",
        "methodsToDelegate",
        "jsDelegate",
        "cppBase",
        "getInterface",
      ].includes(method)
    ) {
      log.debug("Skipping " + method);
      continue;
    }
    log.debug("Processing " + method);
    const descriptor = Object.getOwnPropertyDescriptor(cppDummy, method);
    const property = { enumerable: true };
    // We must use Immediately Invoked Function Expressions to pass method, otherwise it is
    // a closure containing just the last value it was set to.
    if ("value" in descriptor) {
      log.debug("Adding value for " + method);
      property.value = (function (aMethod) {
        return function (...args) {
          return Reflect.apply(this.cppBase[aMethod], undefined, args);
        };
      })(method);
    }
    if (descriptor.set) {
      log.debug("Adding setter for " + method);
      property.set = (function (aMethod) {
        return function (aVal) {
          this.cppBase[aMethod] = aVal;
        };
      })(method);
    }
    if (descriptor.get) {
      log.debug("Adding getter for " + method);
      property.get = (function (aMethod) {
        return function () {
          return this.cppBase[aMethod];
        };
      })(method);
    }
    Object.defineProperty(cppDelegator, method, property);
  }
  return cppDelegator;
};

// Utility functions.

// Iterate over an object and its prototypes to get a property descriptor.
function getPropertyDescriptor(obj, name) {
  let descriptor = null;

  // Eventually we will hit an object that will delegate JS calls to a CPP
  // object, which are not JS overrides of CPP methods. Locate this item, and
  // skip, because it will not have _JsPrototypeToDelegate defined.
  while (obj && "_JsPrototypeToDelegate" in obj) {
    descriptor = Object.getOwnPropertyDescriptor(obj, name);
    if (descriptor) {
      break;
    }
    obj = Object.getPrototypeOf(obj);
  }
  return descriptor;
}
