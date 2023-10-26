/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["AbLDAPAttributeMap", "AbLDAPAttributeMapService"];

function AbLDAPAttributeMap() {
  this.mPropertyMap = {};
  this.mAttrMap = {};
}

AbLDAPAttributeMap.prototype = {
  getAttributeList(aProperty) {
    if (!(aProperty in this.mPropertyMap)) {
      return null;
    }

    // return the joined list
    return this.mPropertyMap[aProperty].join(",");
  },

  getAttributes(aProperty) {
    // fail if no entry for this
    if (!(aProperty in this.mPropertyMap)) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
    return this.mPropertyMap[aProperty];
  },

  getFirstAttribute(aProperty) {
    // fail if no entry for this
    if (!(aProperty in this.mPropertyMap)) {
      return null;
    }

    return this.mPropertyMap[aProperty][0]?.replace(/\[(\d+)\]$/, "");
  },

  setAttributeList(aProperty, aAttributeList, aAllowInconsistencies) {
    var attrs = aAttributeList.split(",");

    // check to make sure this call won't allow multiple mappings to be
    // created, if requested
    if (!aAllowInconsistencies) {
      for (var attr of attrs) {
        if (attr in this.mAttrMap && this.mAttrMap[attr] != aProperty) {
          throw Components.Exception("", Cr.NS_ERROR_FAILURE);
        }
      }
    }

    // delete any attr mappings created by the existing property map entry
    if (aProperty in this.mPropertyMap) {
      for (attr of this.mPropertyMap[aProperty]) {
        delete this.mAttrMap[attr];
      }
    }

    // add these attrs to the attrmap
    for (attr of attrs) {
      this.mAttrMap[attr] = aProperty;
    }

    // add them to the property map
    this.mPropertyMap[aProperty] = attrs;
  },

  getProperty(aAttribute) {
    if (!(aAttribute in this.mAttrMap)) {
      return null;
    }

    return this.mAttrMap[aAttribute];
  },

  getAllCardAttributes() {
    var attrs = [];
    for (const attrArray of Object.entries(this.mPropertyMap)) {
      for (let attrName of attrArray) {
        attrName = attrName.toString().replace(/\[(\d+)\]$/, "");
        if (attrs.includes(attrName)) {
          continue;
        }
        attrs.push(attrName);
      }
    }

    if (!attrs.length) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    return attrs.join(",");
  },

  getAllCardProperties() {
    var props = [];
    for (var prop in this.mPropertyMap) {
      props.push(prop);
    }
    return props;
  },

  setFromPrefs(aPrefBranchName) {
    // get the right pref branch
    const branch = Services.prefs.getBranch(aPrefBranchName + ".");

    // get the list of children
    var children = branch.getChildList("");

    // do the actual sets
    for (var child of children) {
      this.setAttributeList(child, branch.getCharPref(child), true);
    }

    // ensure that everything is kosher
    this.checkState();
  },

  setCardPropertiesFromLDAPMessage(aMessage, aCard) {
    var cardValueWasSet = false;

    var msgAttrs = aMessage.getAttributes();

    // downcase the array for comparison
    function toLower(a) {
      return a.toLowerCase();
    }
    msgAttrs = msgAttrs.map(toLower);

    // deal with each addressbook property
    for (var prop in this.mPropertyMap) {
      // go through the list of possible attrs in precedence order
      for (var attr of this.mPropertyMap[prop]) {
        attr = attr.toLowerCase();
        // allow an index in attr
        let valueIndex = 0;
        const valueIndexMatch = /^(.+)\[(\d+)\]$/.exec(attr);
        if (valueIndexMatch !== null) {
          attr = valueIndexMatch[1];
          valueIndex = parseInt(valueIndexMatch[2]);
        }

        // find the first attr that exists in this message
        if (msgAttrs.includes(attr)) {
          try {
            var values = aMessage.getValues(attr);
            // strip out the optional label from the labeledURI
            if (attr == "labeleduri" && values[valueIndex]) {
              var index = values[valueIndex].indexOf(" ");
              if (index != -1) {
                values[valueIndex] = values[valueIndex].substring(0, index);
              }
            }
            aCard.setProperty(prop, values[valueIndex]);

            cardValueWasSet = true;
            break;
          } catch (ex) {
            // ignore any errors getting message values or setting card values
          }
        }
      }
    }

    if (!cardValueWasSet) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
  },

  checkState() {
    var attrsSeen = [];

    for (var prop in this.mPropertyMap) {
      const attrArray = this.mPropertyMap[prop];
      for (var attr of attrArray) {
        // multiple attributes that mapped to the empty string are permitted
        if (!attr.length) {
          continue;
        }

        // if we've seen this before, there's a problem
        if (attrsSeen.includes(attr)) {
          throw Components.Exception("", Cr.NS_ERROR_FAILURE);
        }

        // remember that we've seen it now
        attrsSeen.push(attr);
      }
    }
  },

  QueryInterface: ChromeUtils.generateQI(["nsIAbLDAPAttributeMap"]),
};

function AbLDAPAttributeMapService() {}

AbLDAPAttributeMapService.prototype = {
  mAttrMaps: {},

  getMapForPrefBranch(aPrefBranchName) {
    // if we've already got this map, return it
    if (aPrefBranchName in this.mAttrMaps) {
      return this.mAttrMaps[aPrefBranchName];
    }

    // otherwise, try and create it
    var attrMap = new AbLDAPAttributeMap();
    attrMap.setFromPrefs("ldap_2.servers.default.attrmap");
    attrMap.setFromPrefs(aPrefBranchName + ".attrmap");

    // cache
    this.mAttrMaps[aPrefBranchName] = attrMap;

    // and return
    return attrMap;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIAbLDAPAttributeMapService"]),
};
