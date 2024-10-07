/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var kAllowedURLs = aValue => /^(https?|ftp|mailto|magnet):/.test(aValue);
var kAllowedMozClasses = aClassName =>
  aClassName == "moz-txt-underscore" ||
  aClassName == "moz-txt-tag" ||
  aClassName == "ib-person";
var kAllowedAnchorClasses = aClassName => aClassName == "ib-person";

/* Tags whose content should be fully removed, and reported in the Error Console. */
var kForbiddenTags = {
  script: true,
  style: true,
};

/**
 * In strict mode, remove all formatting. Keep only links and line breaks.
 *
 * @type {CleanRules}
 */
var kStrictMode = {
  attrs: {},

  tags: {
    a: {
      title: true,
      href: kAllowedURLs,
      class: kAllowedAnchorClasses,
    },
    br: true,
    p: true,
  },

  styles: {},
};

/**
 * Standard mode allows basic formattings (bold, italic, underlined).
 *
 * @type {CleanRules}
 */
var kStandardMode = {
  attrs: {
    style: true,
  },

  tags: {
    div: true,
    a: {
      title: true,
      href: kAllowedURLs,
      class: kAllowedAnchorClasses,
    },
    em: true,
    strong: true,
    b: true,
    i: true,
    u: true,
    s: true,
    span: {
      class: kAllowedMozClasses,
    },
    br: true,
    code: true,
    ul: true,
    li: true,
    ol: {
      start: true,
    },
    cite: true,
    blockquote: true,
    p: true,
    del: true,
    strike: true,
    ins: true,
    sub: true,
    sup: true,
    pre: true,
    table: true,
    thead: true,
    tbody: true,
    tr: true,
    th: true,
    td: true,
    caption: true,
    details: true,
    summary: true,
  },

  styles: {
    "font-style": true,
    "font-weight": true,
    "text-decoration-line": true,
  },
};

/**
 * Permissive mode allows just about anything that isn't going to mess up the chat window.
 * In comparison to normal mode this primarily means elements that can vary font sizes and
 * colors.
 *
 * @type {CleanRules}
 */
var kPermissiveMode = {
  attrs: {
    style: true,
  },

  tags: {
    div: true,
    a: {
      title: true,
      href: kAllowedURLs,
      class: kAllowedAnchorClasses,
    },
    font: {
      face: true,
      color: true,
      size: true,
    },
    em: true,
    strong: true,
    b: true,
    i: true,
    u: true,
    s: true,
    span: {
      class: kAllowedMozClasses,
    },
    br: true,
    hr: true,
    code: true,
    ul: true,
    li: true,
    ol: {
      start: true,
    },
    cite: true,
    blockquote: true,
    p: true,
    del: true,
    strike: true,
    ins: true,
    sub: true,
    sup: true,
    pre: true,
    table: true,
    thead: true,
    tbody: true,
    tr: true,
    th: true,
    td: true,
    caption: true,
    details: true,
    summary: true,
    h1: true,
    h2: true,
    h3: true,
    h4: true,
    h5: true,
    h6: true,
  },

  // FIXME: should be possible to use functions to filter values
  styles: {
    color: true,
    font: true,
    "font-family": true,
    "font-size": true,
    "font-style": true,
    "font-weight": true,
    "text-decoration-color": true,
    "text-decoration-style": true,
    "text-decoration-line": true,
  },
};

var kModePref = "messenger.options.filterMode";
var kModes = [kStrictMode, kStandardMode, kPermissiveMode];

var gGlobalRuleset = null;

function initGlobalRuleset() {
  gGlobalRuleset = newRuleset();

  Services.prefs.addObserver(kModePref, styleObserver);
}

var styleObserver = {
  observe(aObject, aTopic, aMsg) {
    if (aTopic != "nsPref:changed" || aMsg != kModePref) {
      throw new Error("bad notification");
    }

    if (!gGlobalRuleset) {
      throw new Error("gGlobalRuleset not initialized");
    }

    setBaseRuleset(getModePref(), gGlobalRuleset);
  },
};

function getModePref() {
  let baseNum = Services.prefs.getIntPref(kModePref);
  if (baseNum < 0 || baseNum > 2) {
    baseNum = 1;
  }

  return kModes[baseNum];
}

function setBaseRuleset(aBase, aResult) {
  for (const property in aBase) {
    aResult[property] = Object.create(aBase[property], aResult[property]);
  }
}

function newRuleset(aBase) {
  const result = {
    tags: {},
    attrs: {},
    styles: {},
  };
  setBaseRuleset(aBase || getModePref(), result);
  return result;
}

export function createDerivedRuleset() {
  if (!gGlobalRuleset) {
    initGlobalRuleset();
  }
  return newRuleset(gGlobalRuleset);
}

export function addGlobalAllowedTag(aTag, aAttrs = true) {
  gGlobalRuleset.tags[aTag] = aAttrs;
}

export function removeGlobalAllowedTag(aTag) {
  delete gGlobalRuleset.tags[aTag];
}

export function addGlobalAllowedAttribute(aAttr, aRule = true) {
  gGlobalRuleset.attrs[aAttr] = aRule;
}

export function removeGlobalAllowedAttribute(aAttr) {
  delete gGlobalRuleset.attrs[aAttr];
}

export function addGlobalAllowedStyleRule(aStyle, aRule = true) {
  gGlobalRuleset.styles[aStyle] = aRule;
}

export function removeGlobalAllowedStyleRule(aStyle) {
  delete gGlobalRuleset.styles[aStyle];
}

/**
 * A dynamic rule which decides if an attribute is allowed based on the
 * attribute's value.
 *
 * @callback  ValueRule
 * @param {string} value - The attribute value.
 * @returns {bool} - True if the attribute should be allowed.
 *
 * @example
 *
 *    aValue => aValue == 'about:blank'
 */

/**
 * An object whose properties are the allowed attributes.
 *
 * The value of the property should be true to unconditionally accept the
 * attribute, or a function which accepts the value of the attribute and
 * returns a boolean of whether the attribute should be accepted or not.
 *
 * @typedef Ruleset
 * @type {Record<string, (boolean | ValueRule)>}}
 */

/**
 * A set of rules for which tags, attributes, and styles should be allowed when
 * rendering HTML.
 *
 * See kStrictMode, kStandardMode, kPermissiveMode for examples of Rulesets.
 *
 * @typedef CleanRules
 * @type {object}
 * @property {Ruleset} attrs - An object whose properties are the allowed
 *   attributes for any tag.
 * @property {Record<string, (boolean|Ruleset)>} tags - An object whose
 *   properties are the allowed tags.
 *    The value can point to a {@link Ruleset} for that tag which augments the
 *    ones provided by attrs. If either of the {@link Ruleset}s from attrs or
 *    tags allows an attribute, then it is accepted.
 * @property {Record<string, boolean>} styles - An object whose properties are
 *   the allowed CSS style rules.
 *   The value of each property is unused.
 *
 *    FIXME: make styles accept functions to filter the CSS values like Ruleset.
 *
 * @example
 *
 *    {
 *        attrs: { 'style': true },
 *        tags: {
 *            a: { 'href': true },
 *        },
 *        styles: {
 *            'font-size': true
 *        }
 *    }
 */

/**
 * A function to modify text nodes.
 *
 * @callback TextModifier
 * @param {Node} node - The text node to modify.
 * @returns {int} The number of nodes added.
 *
 *    -1 if the current textnode was deleted
 *    0 if the node count is unchanged
 *    positive value if nodes were added.
 *
 *    For instance, adding an <img> tag for a smiley adds 2 nodes:
 *    the img tag
 *    the new text node after the img tag.
 */

/**
 * Removes nodes, attributes and styles that are not allowed according to the
 * given rules.
 *
 * @param {Node} aNode
 *    A DOM node to inspect recursively against the rules.
 * @param {CleanRules} aRules
 *    The rules for what tags, attributes, and styles are allowed.
 * @param {TextModifier[]} aTextModifiers
 *    A list of functions to modify text content.
 */
function cleanupNode(aNode, aRules, aTextModifiers) {
  // Iterate each node and apply rules for what content is allowed. This has two
  // modes: one for element nodes and one for text nodes.
  for (let i = 0; i < aNode.childNodes.length; ++i) {
    const node = aNode.childNodes[i];
    if (
      node.nodeType == node.ELEMENT_NODE &&
      node.namespaceURI == "http://www.w3.org/1999/xhtml"
    ) {
      // If the node is an element, check if the node is an allowed tag.
      const nodeName = node.localName;
      if (!(nodeName in aRules.tags)) {
        // If the node is not allowed, either remove it completely (if
        // it is forbidden) or replace it with its children.
        if (nodeName in kForbiddenTags) {
          console.error(
            "removing a " + nodeName + " tag from a message before display"
          );
        } else {
          while (node.hasChildNodes()) {
            aNode.insertBefore(node.firstChild, node);
          }
        }
        aNode.removeChild(node);
        // We want to process again the node at the index i which is
        // now the first child of the node we removed
        --i;
        continue;
      }

      // This node is being kept, cleanup each child node.
      cleanupNode(node, aRules, aTextModifiers);

      // Cleanup the attributes of this node.
      const attrs = node.attributes;
      const acceptFunction = function (aAttrRules, aAttr) {
        // An attribute is always accepted if its rule is true, or conditionally
        // accepted if its rule is a function that evaluates to true.
        // If its rule does not exist, it is removed.
        const localName = aAttr.localName;
        const rule = localName in aAttrRules && aAttrRules[localName];
        return (
          rule === true || (typeof rule == "function" && rule(aAttr.value))
        );
      };
      for (let j = 0; j < attrs.length; ++j) {
        const attr = attrs[j];
        // If either the attribute is accepted for all tags or for this specific
        // tag then it is allowed.
        if (
          !(
            acceptFunction(aRules.attrs, attr) ||
            (typeof aRules.tags[nodeName] == "object" &&
              acceptFunction(aRules.tags[nodeName], attr))
          )
        ) {
          node.removeAttribute(attr.name);
          --j;
        }
      }

      // Cleanup the style attribute.
      const styles = node.style;
      for (let j = 0; j < styles.length; ++j) {
        if (!(styles[j] in aRules.styles)) {
          styles.removeProperty(styles[j]);
          --j;
        }
      }

      // If the style attribute is now empty or if it contained unsupported or
      // unparsable CSS it should be dropped completely.
      if (!styles.length) {
        node.removeAttribute("style");
      }

      // Sort the style attributes for easier checking/comparing later.
      if (node.hasAttribute("style")) {
        let trailingSemi = false;
        let styleAttrs = node.getAttribute("style").trim();
        if (styleAttrs.endsWith(";")) {
          styleAttrs = styleAttrs.slice(0, -1);
          trailingSemi = true;
        }
        styleAttrs = styleAttrs.split(";").map(a => a.trim());
        styleAttrs.sort();
        node.setAttribute(
          "style",
          styleAttrs.join("; ") + (trailingSemi ? ";" : "")
        );
      }
    } else {
      // We are on a text node, we need to apply the functions
      // provided in the aTextModifiers array.

      // Each of these function should return the number of nodes added:
      //  * -1 if the current textnode was deleted
      //  * 0 if the node count is unchanged
      //  * positive value if nodes were added.
      //     For instance, adding an <img> tag for a smiley adds 2 nodes:
      //      - the img tag
      //      - the new text node after the img tag.

      // This is the number of nodes we need to process. If new nodes
      // are created, the next text modifier functions have more nodes
      // to process.
      let textNodeCount = 1;
      for (const modifier of aTextModifiers) {
        for (let n = 0; n < textNodeCount; ++n) {
          const textNode = aNode.childNodes[i + n];

          // If we are processing nodes created by one of the previous
          // text modifier function, some of the nodes are likely not
          // text node, skip them.
          if (
            textNode.nodeType != textNode.TEXT_NODE &&
            textNode.nodeType != textNode.CDATA_SECTION_NODE
          ) {
            continue;
          }

          const result = modifier(textNode);
          textNodeCount += result;
          n += result;
        }
      }

      // newly created nodes should not be filtered, be sure we skip them!
      i += textNodeCount - 1;
    }
  }
}

export function cleanupImMarkup(aText, aRuleset, aTextModifiers = []) {
  if (!gGlobalRuleset) {
    initGlobalRuleset();
  }

  const parser = new DOMParser();
  // Wrap the text to be parsed in a <span> to avoid losing leading whitespace.
  const doc = parser.parseFromString(
    "<!DOCTYPE html><html><body><span>" + aText + "</span></body></html>",
    "text/html"
  );
  const span = doc.querySelector("span");
  cleanupNode(span, aRuleset || gGlobalRuleset, aTextModifiers);
  return span.innerHTML;
}
