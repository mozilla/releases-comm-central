/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This is a modification of the JXON parsers found on the page
// <https://developer.mozilla.org/en-US/docs/JXON>

export var JXON = new (function () {
  const sValueProp = "value"; /* you can customize these values */
  const sAttributesProp = "attr";
  const sAttrPref = "@";
  const sElementListPrefix = "$";
  const sConflictSuffix = "_"; // used when there's a name conflict with special JXON properties
  const aCache = [];

  function parseText(sValue) {
    if (/^(?:true|false)$/i.test(sValue)) {
      return sValue.toLowerCase() === "true";
    }
    if (isFinite(sValue)) {
      return parseFloat(sValue);
    }
    return sValue;
  }

  function EmptyTree() {}
  EmptyTree.prototype = {
    toString() {
      return "null";
    },
    valueOf() {
      return null;
    },
  };

  function objectify(vValue) {
    if (vValue === null) {
      return new EmptyTree();
    } else if (vValue instanceof Object) {
      return vValue;
    }
    return new vValue.constructor(vValue); // What does this? copy?
  }

  function createObjTree(oParentNode, nVerb, bFreeze, bNesteAttr) {
    const nLevelStart = aCache.length;
    const bChildren = oParentNode.hasChildNodes();
    const bAttributes = oParentNode.attributes && oParentNode.attributes.length;
    const bHighVerb = Boolean(nVerb & 2);

    var sProp = 0;
    var vContent = 0;
    var nLength = 0;
    var sCollectedTxt = "";
    var vResult = bHighVerb
      ? {}
      : /* put here the default value for empty nodes: */ true;

    if (bChildren) {
      for (
        var oNode, nItem = 0;
        nItem < oParentNode.childNodes.length;
        nItem++
      ) {
        oNode = oParentNode.childNodes.item(nItem);
        if (oNode.nodeType === 4) {
          // CDATASection
          sCollectedTxt += oNode.nodeValue;
        } else if (oNode.nodeType === 3) {
          // Text
          sCollectedTxt += oNode.nodeValue;
        } else if (oNode.nodeType === 1) {
          // Element
          aCache.push(oNode);
        }
      }
    }

    const nLevelEnd = aCache.length;
    const vBuiltVal = parseText(sCollectedTxt);

    if (!bHighVerb && (bChildren || bAttributes)) {
      vResult = nVerb === 0 ? objectify(vBuiltVal) : {};
    }

    for (var nElId = nLevelStart; nElId < nLevelEnd; nElId++) {
      sProp = aCache[nElId].nodeName;
      if (sProp == sValueProp || sProp == sAttributesProp) {
        sProp = sProp + sConflictSuffix;
      }
      vContent = createObjTree(aCache[nElId], nVerb, bFreeze, bNesteAttr);
      if (!vResult.hasOwnProperty(sProp)) {
        vResult[sProp] = vContent;
        vResult[sElementListPrefix + sProp] = [];
      }
      vResult[sElementListPrefix + sProp].push(vContent);
      nLength++;
    }

    if (bAttributes) {
      const nAttrLen = oParentNode.attributes.length;
      const sAPrefix = bNesteAttr ? "" : sAttrPref;
      const oAttrParent = bNesteAttr ? {} : vResult;

      for (var oAttrib, nAttrib = 0; nAttrib < nAttrLen; nLength++, nAttrib++) {
        oAttrib = oParentNode.attributes.item(nAttrib);
        oAttrParent[sAPrefix + oAttrib.name] = parseText(oAttrib.value);
      }

      if (bNesteAttr) {
        if (bFreeze) {
          Object.freeze(oAttrParent);
        }
        vResult[sAttributesProp] = oAttrParent;
        nLength -= nAttrLen - 1;
      }
    }

    if (
      nVerb === 3 ||
      ((nVerb === 2 || (nVerb === 1 && nLength > 0)) && sCollectedTxt)
    ) {
      vResult[sValueProp] = vBuiltVal;
    } else if (!bHighVerb && nLength === 0 && sCollectedTxt) {
      vResult = vBuiltVal;
    }

    if (bFreeze && (bHighVerb || nLength > 0)) {
      Object.freeze(vResult);
    }

    aCache.length = nLevelStart;

    return vResult;
  }

  this.build = function (
    oXMLParent,
    nVerbosity /* optional */,
    bFreeze /* optional */,
    bNesteAttributes /* optional */
  ) {
    const _nVerb =
      typeof nVerbosity === "number"
        ? nVerbosity & 3
        : /* put here the default verbosity level: */ 1;
    return createObjTree(
      oXMLParent,
      _nVerb,
      bFreeze || false,
      bNesteAttributes !== undefined ? bNesteAttributes : _nVerb === 3
    );
  };
})();
