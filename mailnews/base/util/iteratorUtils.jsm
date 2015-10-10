/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains helper methods for dealing with XPCOM iterators (arrays
 * and enumerators) in JS-friendly ways.
 */

this.EXPORTED_SYMBOLS = ["fixIterator", "toXPCOMArray", "toArray"];

Components.utils.import("resource://gre/modules/Deprecated.jsm");

var Ci = Components.interfaces;

var JS_HAS_SYMBOLS = typeof Symbol === "function";
var ITERATOR_SYMBOL = JS_HAS_SYMBOLS ? Symbol.iterator : "@@iterator";

/**
 * This function will take a number of objects and convert them to an array.
 *
 * Currently, we support the following objects:
 *   Anything you can for (let x of aObj) on
 *                (e.g. toArray(fixIterator(enum))[4],
 *                 also a NodeList from element.childNodes)
 *
 * @param aObj        The object to convert
 */
function toArray(aObj) {
  if (ITERATOR_SYMBOL in aObj) {
    return Array.from(aObj);
  }

  // We got something unexpected, notify the caller loudly.
  throw new Error("An unsupported object sent to toArray: " +
                  (("toString" in aObj) ? aObj.toString() : aObj));
}

/**
 * Given a JS array, JS iterator, or one of a variety of XPCOM collections or
 * iterators, return a JS iterator suitable for use in a for...of expression.
 *
 * Currently, we support the following types of XPCOM iterators:
 *   nsIArray
 *   nsISupportsArray
 *   nsISimpleEnumerator
 *
 * This intentionally does not support nsIEnumerator as it is obsolete and
 * no longer used in the base code.
 *
 * Note that old-style JS iterators are explicitly not supported in this
 * method, as they are going away. For a limited time, the resulting iterator
 * can be used in a for...in loop, but this is a legacy compatibility shim that
 * will not work forever. See bug 1098412.
 *
 *   @param aEnum  the enumerator to convert
 *   @param aIface (optional) an interface to QI each object to prior to
 *                 returning
 *
 *   @note This returns an object that can be used in 'for...of' loops.
 *         Do not use 'for each...in'. 'for...in' may be used, but only as a
 *         legacy feature.
 *         This does *not* return an Array object. To create such an array, use
 *         let array = toArray(fixIterator(xpcomEnumerator));
 */
function fixIterator(aEnum, aIface) {
  // Minor internal details: to support both for (let x of fixIterator()) and
  // for (let x in fixIterator()), we need to add in a __iterator__ kludge
  // property. __iterator__ is to go away in bug 1098412; we could theoretically
  // make it work beyond that by using Proxies, but that's far to go for
  // something we want to get rid of anyways.
  // Note that the new-style iterator uses Symbol.iterator to work, and anything
  // that has Symbol.iterator works with for-of.
  function makeDualIterator(newStyle) {
    newStyle.__iterator__ = function() {
      for (let item of newStyle)
        yield item;
    };
    return newStyle;
  }

  // If the input is an array or something that sports Symbol.iterator, then
  // the original input is sufficient to directly return. However, if we want
  // to support the aIface parameter, we need to do a lazy version of Array.map.
  if (Array.isArray(aEnum) || ITERATOR_SYMBOL in aEnum) {
    if (!aIface) {
      return makeDualIterator(aEnum);
    } else {
      return makeDualIterator((function*() {
        for (let o of aEnum)
          yield o.QueryInterface(aIface);
      })());
    }
  }

  let face = aIface || Ci.nsISupports;
  // Figure out which kind of array object we have.
  // First try nsIArray (covers nsIMutableArray too).
  if (aEnum instanceof Ci.nsIArray) {
    return makeDualIterator((function*() {
      let count = aEnum.length;
      for (let i = 0; i < count; i++)
        yield aEnum.queryElementAt(i, face);
    })());
  }

  // Try an nsISupportsArray.
  // This object is deprecated, but we need to keep supporting it
  // while anything in the base code (including mozilla-central) produces it.
  if (aEnum instanceof Ci.nsISupportsArray) {
    return makeDualIterator((function*() {
      let count = aEnum.Count();
      for (let i = 0; i < count; i++)
        yield aEnum.QueryElementAt(i, face);
    })());
  }

  // How about nsISimpleEnumerator? This one is nice and simple.
  if (aEnum instanceof Ci.nsISimpleEnumerator) {
    return makeDualIterator((function*() {
      while (aEnum.hasMoreElements())
        yield aEnum.getNext().QueryInterface(face);
    })());
  }

  // We got something unexpected, notify the caller loudly.
  throw new Error("An unsupported object sent to fixIterator: " +
                  (("toString" in aEnum) ? aEnum.toString() : aEnum));
}

/**
 * This function takes an Array object and returns an XPCOM array
 * of the desired type. It will *not* work if you extend Array.prototype.
 *
 * @param aArray      the array (anything fixIterator supports) to convert to an XPCOM array
 * @param aInterface  the type of XPCOM array to convert
 *
 * @note The returned array is *not* dynamically updated.  Changes made to the
 *       JS array after a call to this function will not be reflected in the
 *       XPCOM array.
 */
function toXPCOMArray(aArray, aInterface) {
  if (aInterface.equals(Ci.nsISupportsArray)) {
    Deprecated.warning("nsISupportsArray object is deprecated, avoid creating new ones.",
                       "https://developer.mozilla.org/en-US/docs/XPCOM_array_guide");
    let supportsArray = Components.classes["@mozilla.org/supports-array;1"]
                                  .createInstance(Ci.nsISupportsArray);
    for (let item of fixIterator(aArray)) {
      supportsArray.AppendElement(item);
    }
    return supportsArray;
  }

  if (aInterface.equals(Ci.nsIMutableArray)) {
    let mutableArray = Components.classes["@mozilla.org/array;1"]
                                 .createInstance(Ci.nsIMutableArray);
    for (let item of fixIterator(aArray)) {
      mutableArray.appendElement(item, false);
    }
    return mutableArray;
  }

  // We got something unexpected, notify the caller loudly.
  throw new Error("An unsupported interface requested from toXPCOMArray: " +
                  aInterface);
}
