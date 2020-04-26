/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Helper functions for parsing and serializing XML
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.xml namespace.

const EXPORTED_SYMBOLS = ["calxml"]; /* exported calxml */

var calxml = {
  /**
   * Evaluate an XPath query for the given node. Be careful with the return value
   * here, as it may be:
   *
   * - null, if there are no results
   * - a number, string or boolean value
   * - an array of strings or DOM elements
   *
   * @param aNode     The context node to search from
   * @param aExpr     The XPath expression to search for
   * @param aResolver (optional) The namespace resolver to use for the expression
   * @param aType     (optional) Force a result type, must be an XPathResult constant
   * @return          The result, see above for details.
   */
  evalXPath(aNode, aExpr, aResolver, aType) {
    const XPR = {
      // XPathResultType
      ANY_TYPE: 0,
      NUMBER_TYPE: 1,
      STRING_TYPE: 2,
      BOOLEAN_TYPE: 3,
      UNORDERED_NODE_ITERATOR_TYPE: 4,
      ORDERED_NODE_ITERATOR_TYPE: 5,
      UNORDERED_NODE_SNAPSHOT_TYPE: 6,
      ORDERED_NODE_SNAPSHOT_TYPE: 7,
      ANY_UNORDERED_NODE_TYPE: 8,
      FIRST_ORDERED_NODE_TYPE: 9,
    };
    let doc = aNode.ownerDocument ? aNode.ownerDocument : aNode;
    let resolver = aResolver || doc.createNSResolver(doc.documentElement);
    let resultType = aType || XPR.ANY_TYPE;

    let result = doc.evaluate(aExpr, aNode, resolver, resultType, null);
    let returnResult, next;
    switch (result.resultType) {
      case XPR.NUMBER_TYPE:
        returnResult = result.numberValue;
        break;
      case XPR.STRING_TYPE:
        returnResult = result.stringValue;
        break;
      case XPR.BOOLEAN_TYPE:
        returnResult = result.booleanValue;
        break;
      case XPR.UNORDERED_NODE_ITERATOR_TYPE:
      case XPR.ORDERED_NODE_ITERATOR_TYPE:
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
      case XPR.UNORDERED_NODE_SNAPSHOT_TYPE:
      case XPR.ORDERED_NODE_SNAPSHOT_TYPE:
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
      case XPR.ANY_UNORDERED_NODE_TYPE:
      case XPR.FIRST_ORDERED_NODE_TYPE:
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
   * @return          The result, see above for details.
   */
  evalXPathFirst(aNode, aExpr, aResolver, aType) {
    let result = calxml.evalXPath(aNode, aExpr, aResolver, aType);

    if (Array.isArray(result)) {
      return result[0];
    }
    return result;
  },

  /**
   * Parse the given string into a DOM tree
   *
   * @param str       The string to parse
   * @return          The parsed DOM Document
   */
  parseString(str) {
    let parser = new DOMParser();
    parser.forceEnableXULXBL();
    return parser.parseFromString(str, "application/xml");
  },

  /**
   * Read an XML file synchronously. This method should be avoided, consider
   * rewriting the caller to be asynchronous.
   *
   * @param uri       The URI to read.
   * @return          The DOM Document resulting from the file.
   */
  parseFile(uri) {
    let req = new XMLHttpRequest();
    req.open("GET", uri, false);
    req.overrideMimeType("text/xml");
    req.send(null);
    return req.responseXML;
  },

  /**
   * Serialize the DOM tree into a string.
   *
   * @param doc       The DOM document to serialize
   * @return          The DOM document as a string.
   */
  serializeDOM(doc) {
    let serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  },

  /**
   * Escape a string for use in XML
   *
   * @param str           The string to escape
   * @param isAttribute   If true, " and ' are also escaped
   * @return              The escaped string
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
