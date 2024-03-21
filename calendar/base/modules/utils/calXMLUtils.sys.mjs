/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper functions for parsing and serializing XML
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.xml namespace.

export var xml = {
  /**
   * Evaluate an XPath query for the given node. Be careful with the return value
   * here, as it may be:
   *
   * - null, if there are no results
   * - a number, string or boolean value
   * - an array of strings or DOM elements
   *
   * @param {Node|Document} aNode     The context node to search from
   * @param aExpr     The XPath expression to search for
   * @param aResolver (optional) The namespace resolver to use for the expression
   * @param aType     (optional) Force a result type, must be an XPathResult constant
   * @returns The result, see above for details.
   */
  evalXPath(aNode, aExpr, aResolver, aType) {
    /** @type Document */
    const doc = aNode.ownerDocument ? aNode.ownerDocument : aNode;
    const resolver = aResolver || doc.createNSResolver(doc.documentElement);
    const resultType = aType || XPathResult.ANY_TYPE;

    const result = doc.evaluate(aExpr, aNode, resolver, resultType, null);
    let returnResult, next;
    switch (result.resultType) {
      case XPathResult.NUMBER_TYPE:
        returnResult = result.numberValue;
        break;
      case XPathResult.STRING_TYPE:
        returnResult = result.stringValue;
        break;
      case XPathResult.BOOLEAN_TYPE:
        returnResult = result.booleanValue;
        break;
      case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
      case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
        returnResult = [];
        while ((next = result.iterateNext())) {
          if (next.nodeType == next.TEXT_NODE || next.nodeType == next.CDATA_SECTION_NODE) {
            returnResult.push(next.wholeText);
          } else if (ChromeUtils.getClassName(next) === "Attr") {
            returnResult.push(next.value);
          } else {
            returnResult.push(next);
          }
        }
        break;
      case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
      case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
        returnResult = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          next = result.snapshotItem(i);
          if (next.nodeType == next.TEXT_NODE || next.nodeType == next.CDATA_SECTION_NODE) {
            returnResult.push(next.wholeText);
          } else if (ChromeUtils.getClassName(next) === "Attr") {
            returnResult.push(next.value);
          } else {
            returnResult.push(next);
          }
        }
        break;
      case XPathResult.ANY_UNORDERED_NODE_TYPE:
      case XPathResult.FIRST_ORDERED_NODE_TYPE:
        returnResult = result.singleNodeValue;
        break;
      default:
        returnResult = null;
        break;
    }

    if (Array.isArray(returnResult) && returnResult.length == 0) {
      returnResult = null;
    }

    return returnResult;
  },

  /**
   * Convenience function to evaluate an XPath expression and return null or the
   * first result. Helpful if you just expect one value in a text() expression,
   * but its possible that there will be more than one. The result may be:
   *
   * - null, if there are no results
   * - A string, number, boolean or DOM Element value
   *
   * @param aNode     The context node to search from
   * @param aExpr     The XPath expression to search for
   * @param aResolver (optional) The namespace resolver to use for the expression
   * @param aType     (optional) Force a result type, must be an XPathResult constant
   * @returns The result, see above for details.
   */
  evalXPathFirst(aNode, aExpr, aResolver, aType) {
    const result = xml.evalXPath(aNode, aExpr, aResolver, aType);

    if (Array.isArray(result)) {
      return result[0];
    }
    return result;
  },

  /**
   * Parse the given string into a DOM tree
   *
   * @param str       The string to parse
   * @returns The parsed DOM Document
   */
  parseString(str) {
    const parser = new DOMParser();
    parser.forceEnableXULXBL();
    return parser.parseFromString(str, "application/xml");
  },

  /**
   * Read an XML file synchronously. This method should be avoided, consider
   * rewriting the caller to be asynchronous.
   *
   * @param uri       The URI to read.
   * @returns The DOM Document resulting from the file.
   */
  parseFile(uri) {
    const req = new XMLHttpRequest();
    req.open("GET", uri, false);
    req.overrideMimeType("text/xml");
    req.send(null);
    return req.responseXML;
  },

  /**
   * Serialize the DOM tree into a string.
   *
   * @param doc       The DOM document to serialize
   * @returns The DOM document as a string.
   */
  serializeDOM(doc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  },

  /**
   * Escape a string for use in XML
   *
   * @param str           The string to escape
   * @param isAttribute   If true, " and ' are also escaped
   * @returns The escaped string
   */
  escapeString(str, isAttribute) {
    return str.replace(/[&<>'"]/g, chr => {
      switch (chr) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return isAttribute ? "&quot;" : chr;
        case "'":
          return isAttribute ? "&apos;" : chr;
        default:
          return chr;
      }
    });
  },
};
