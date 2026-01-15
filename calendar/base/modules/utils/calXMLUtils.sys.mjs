/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper functions for parsing and serializing XML.
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.xml namespace.

export var xml = {
  /**
   * Evaluate an XPath query for the given node. Be careful with
   *
   * @param {Node|Document} aNode - The context node to search from.
   * @param {string} aExpr - The XPath expression to search for.
   * @param {Node} [aResolver] The namespace resolver to use for the expression
   * @param {integer} [aType] - Force a result type, must be an XPathResult constant.
   * @returns {*} The result, the return value may be:
   *   - null, if there are no results
   *   - a number, string or boolean value
   *   - an array of strings or DOM elements
   */
  evalXPath(aNode, aExpr, aResolver, aType) {
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
   * but its possible that there will be more than one.
   *
   * @param {Node|Document} aNode - The context node to search from.
   * @param {string} aExpr - The XPath expression to search for.
   * @param {Node} [aResolver] The namespace resolver to use for the expression
   * @param {integer} [aType] - Force a result type, must be an XPathResult constant.
   * @returns {*} The result, the return value may be:
   *   - null, if there are no results
   *   - a number, string or boolean value
   *   - an array of strings or DOM elements
   */
  evalXPathFirst(aNode, aExpr, aResolver, aType) {
    const result = xml.evalXPath(aNode, aExpr, aResolver, aType);

    if (Array.isArray(result)) {
      return result[0];
    }
    return result;
  },

  /**
   * Parse the given string into a DOM tree.
   *
   * @param {string} str - The string to parse.
   * @returns {Document} The parsed DOM Document.
   */
  parseString(str) {
    const parser = new DOMParser();
    parser.forceEnableXULXBL();
    return parser.parseFromString(str, "application/xml");
  },

  /**
   * Serialize the DOM tree into a string.
   *
   * @param {Document} doc - The DOM document to serialize.
   * @returns {string} The DOM document as a string.
   */
  serializeDOM(doc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  },

  /**
   * Escape a string for use in XML
   *
   * @param {string} str - The string to escape
   * @param {boolean} isAttribute - If true, " and ' are also escaped
   * @returns {string} The escaped string.
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
