/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
  One of the goals of JsAccount is to be able to incrementally extend a base
  implementation, possibly adding a new interface. This code demonstrates
  a mailnews URL extended for a hypthetical account type "foo".
**/

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;
var CE = Components.Exception;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/jsaccount/JSAccountUtils.jsm");
Cu.import("resource://gre/modules/jsaccount/JaBaseUrl.jsm");

const ATTACHMENT_QUERY = "part=1.";

var FooUrlProperties = {
  // Extend the base properties.
  __proto__: JaBaseUrlProperties,

  contractID: "@mozilla.org/jsaccount/testjafoourl;1",
  classID: Components.ID("{73F98539-A59F-4F6F-9A72-D83A08646C23}"),

// Add an additional interface only needed by this custom class.
  extraInterfaces: [ Ci.msgIFooUrl ],
}

// Constructor
function FooUrlConstructor() {
}

// Constructor prototype (not instance prototype).
FooUrlConstructor.prototype = {
  classID: FooUrlProperties.classID,
  _xpcom_factory: JSAccountUtils.jaFactory(FooUrlProperties, FooUrl),
}

// Main class.
function FooUrl(aDelegator, aBaseInterfaces) {

  // Superclass constructor
  JaBaseUrl.call(this, aDelegator, aBaseInterfaces);

  // I'm not sure why I have to call this again, as it is called in the
  // base constructor, but without it this method will not find the
  // interfaces beyond nsISupports.
  aBaseInterfaces.forEach(iface => this.cppBase instanceof iface);

  // instance variables
  this._urlType = -1; // unknown;
  this._itemId = null;
  this._hidden = "IAmHidden";
}

// Extend the base class methods.
FooUrl.prototype = {

    // Typical boilerplate to include in all implementations.

  // Extended the JS URL object.
  __proto__: JaBaseUrl.prototype,

  // Delegate these methods to CPP.
  _JsPrototypeToDelegate: true,

    // InterfaceRequestor override, needed if extraInterfaces.

  getInterface: function(iid) {
    for (let iface of FooUrlProperties.extraInterfaces) {
      if (iid.equals(iface))
        return this;
    }
    return this.delegator.QueryInterface(iid);
  },

    // nsIMsgMailNewsUrl overrides

  // Override cloneInternal() to always make the pathname capitalized. This is useful
  // to test that a method called from C++, but overridden in JS, gets the JS
  // method, since nsMsgMailNewsUrl::CloneIgnoringRef calls CloneInternal().
  cloneInternal: function(aRefHandle, aRef)
  {
    let uriClone = this.cppBase.cloneInternal(aRefHandle, aRef);
    uriClone.path = uriClone.path.toUpperCase();
    return uriClone;
  },

  // Override to allow setting from a JS variable.
  IsUrlType(aType) { return aType == this._urlType;},

    // msgIFooUrl implementation

  // Foo id for item.
  // attribute AString itemId;
  get itemId() { return this._itemId;},
  set itemId(aVal) {this._itemId = aVal;},

  // Does this url refer to an attachment?
  //readonly attribute boolean isAttachment;
  get isAttachment() {
    // We look to see if the URL has an attachment query
    let query = this.QueryInterface(Ci.nsIURL).query;
    return (query && query.indexOf(ATTACHMENT_QUERY) != -1);
  },

  /// urlType (copy, move, display) from nsIMsgMailNewsUrl
  //void setUrlType(in unsigned long aType);
  setUrlType: function(aType) { this._urlType = aType;},

}

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FooUrlConstructor]);
