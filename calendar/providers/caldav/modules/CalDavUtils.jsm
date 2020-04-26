/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * Various utility functions for the caldav provider
 */

/* exported CalDavXmlns, CalDavTagsToXmlns, CalDavNsUnresolver, CalDavNsResolver, CalDavXPath,
 *          CalDavXPathFirst */
const EXPORTED_SYMBOLS = [
  "CalDavXmlns",
  "CalDavTagsToXmlns",
  "CalDavNsUnresolver",
  "CalDavNsResolver",
  "CalDavXPath",
  "CalDavXPathFirst",
];

/**
 * Creates an xmlns string with the requested namespace prefixes
 *
 * @param {...String} aRequested        The requested namespace prefixes
 * @return {String}                     An xmlns string that can be inserted into xml documents
 */
function CalDavXmlns(...aRequested) {
  let namespaces = [];
  for (let namespace of aRequested) {
    let nsUri = CalDavNsResolver(namespace);
    if (namespace) {
      namespaces.push(`xmlns:${namespace}='${nsUri}'`);
    }
  }

  return namespaces.join(" ");
}

/**
 * Helper function to gather namespaces from QNames or namespace prefixes, plus a few extra for the
 * remaining request.
 *
 * @param {...String} aTags     Either QNames, or just namespace prefixes to be resolved.
 * @return {String}             The complete namespace string
 */
function CalDavTagsToXmlns(...aTags) {
  let namespaces = new Set(aTags.map(tag => tag.split(":")[0]));
  return CalDavXmlns(...namespaces.values());
}

/**
 * Resolve the namespace URI to one of the prefixes used in our codebase
 *
 * @param {String} aNamespace       The namespace URI to resolve
 * @return {?String}                The namespace prefix we use
 */
function CalDavNsUnresolver(aNamespace) {
  const prefixes = {
    "http://apple.com/ns/ical/": "A",
    "DAV:": "D",
    "urn:ietf:params:xml:ns:caldav": "C",
    "http://calendarserver.org/ns/": "CS",
  };
  return prefixes[aNamespace] || null;
}

/**
 * Resolve the namespace URI from one of the prefixes used in our codebase
 *
 * @param {String} aPrefix          The namespace prefix we use
 * @return {?String}                The namespace URI for the prefix
 */
function CalDavNsResolver(aPrefix) {
  /* eslint-disable id-length */
  const namespaces = {
    A: "http://apple.com/ns/ical/",
    D: "DAV:",
    C: "urn:ietf:params:xml:ns:caldav",
    CS: "http://calendarserver.org/ns/",
  };
  /* eslint-enable id-length */

  return namespaces[aPrefix] || null;
}

/**
 * Run an xpath expression on the given node, using the caldav namespace resolver
 *
 * @param {Element} aNode           The context node to search from
 * @param {String} aExpr            The XPath expression to search for
 * @param {?XPathResult} aType      (optional) Force a result type, must be an XPathResult constant
 * @return {Element[]}              Array of found elements
 */
function CalDavXPath(aNode, aExpr, aType) {
  return cal.xml.evalXPath(aNode, aExpr, CalDavNsResolver, aType);
}

/**
 * Run an xpath expression on the given node, using the caldav namespace resolver. Returns the first
 * result.
 *
 * @param {Element} aNode           The context node to search from
 * @param {String} aExpr            The XPath expression to search for
 * @param {?XPathResult} aType      (optional) Force a result type, must be an XPathResult constant
 * @return {?Element}               The found element, or null.
 */
function CalDavXPathFirst(aNode, aExpr, aType) {
  return cal.xml.evalXPathFirst(aNode, aExpr, CalDavNsResolver, aType);
}
