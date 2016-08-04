/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests of override functionality using a demo "foo" type url.

Cu.import("resource://gre/modules/jsaccount/JaBaseUrl.jsm");

var extraInterfaces = [
                       Ci.msgIFooUrl,
                      ];

function newURL() {
  return Cc["@mozilla.org/jsaccount/testjafoourl;1"]
           .createInstance(Ci.nsISupports);
}

var tests = [
  function testExists() {
    // test the existence of components and their interfaces.
    let url = newURL();
    for (let iface of JaBaseUrlProperties.baseInterfaces) {
      Assert.ok(url instanceof iface);
      let urlQI = url.QueryInterface(iface);
      Assert.ok(urlQI);
    }
    for (let iface of extraInterfaces) {
      let fooUrl = url.getInterface(iface);
      Assert.ok(fooUrl instanceof iface);
      Assert.ok(fooUrl.QueryInterface(iface));
    }
  },
  function test_msgIOverride() {
    let url = newURL().QueryInterface(Ci.msgIOverride);

    // test of access to wrapped JS object.

    // Access the ._hidden attribute using the XPCOM interface,
    // where it is not defined.
    Assert.equal(typeof url.jsDelegate._hidden, "undefined");

    // Get the JS object, where _hidden IS defined.
    Assert.equal(url.jsDelegate.wrappedJSObject._hidden, "IAmHidden");
  },
  function test_nsIURI() {
    let url = newURL().QueryInterface(Ci.nsIURI);
    url instanceof Ci.nsIMsgMailNewsUrl; // so we see cloneInternal

    // test methods that mostly use the baseURL in nsMsgMailNewsUrl
    Assert.ok("spec" in url);
    url.spec = "https://test.invalid/folder?isFoo=true&someBar=theBar";
    Assert.equal(url.host, "test.invalid");

    // test another method from nsMsgMailNewsUrl.
    // url.resolve is overridden in nsMsgMailNewsUrl to only work if starts with "#"
    Assert.equal("https://test.invalid/folder?isFoo=true&someBar=theBar#modules",
                 url.resolve("#modules"));

    // Test JS override of method called virtually in C++.
    // We overrode cloneInteral in JS to capitalize the path.
    url.spec = "https://test.invalid/folder#modules";
    Assert.equal(url.cloneInternal(Ci.nsIMsgMailNewsUrl.HONOR_REF, null).spec,
                 "https://test.invalid/FOLDER#MODULES");

    // But then it gets tricky.
    // This is not overridden, so you are calling JaBaseCppUrl::CloneIgnoringRef
    // which inherits from nsMsgMailNewsUrl::CloneIgnoringRef(). So why is the path
    // capitalized? Because nsMsgMailNewsUrl::CloneIgnoringRef calls the virtual
    // method CloneInternal(), which IS overridden to give the capitalized value,
    // showing polymorphic behavior.
    Assert.equal(url.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

    // Demo of differences between the various versions of the object. The
    // standard XPCOM constructor returns the JS implementation, as was tested
    // above. Try the same tests using the wrapped JS delegate, which should give
    // the same (overridden) results (overridden for cloneInternal, C++ class
    // for cloneIgnoringRef with polymorphic override).
    let jsDelegate = url.QueryInterface(Ci.msgIOverride).jsDelegate.wrappedJSObject;
    Assert.equal(jsDelegate.cloneInternal(Ci.nsIMsgMailNewsUrl.HONOR_REF, null).spec,
                                          "https://test.invalid/FOLDER#MODULES");
    Assert.equal(jsDelegate.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

    // The cppBase object will not have the overrides. cppBase is from
    // JaCppUrlDelegator::GetCppBase which returns an instance of the Super()
    // object. This instance will always call the C++ objects and never the
    // JS objects.
    let cppBase = url.QueryInterface(Ci.msgIOverride).cppBase.QueryInterface(Ci.nsIURI);
    cppBase instanceof Ci.nsIMsgMailNewsUrl; // so it sees cloneInternal

    // nsMsgMailNewsUrl::CloneInternal does gives the normal, lower-case spec.
    Assert.equal(cppBase.cloneInternal(Ci.nsIMsgMailNewsUrl.HONOR_REF, null).spec,
                 "https://test.invalid/folder#modules");

    // But again, when calling a C++ class we get the polymorphic behavior.
    Assert.equal(cppBase.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

    // Not sure why you would want to do this, but you could also call the C++
    // object that does delegation, and get the same result. That is, call
    // JaCppUrlDelegator:: classes using the forwarding macros to either a JS
    // class or a C++ class. This is actually what we expect C++ callers to see,
    // so this matches what we see above.
    let cppDelegator = jsDelegate.delegator.QueryInterface(Ci.nsIURI);

    Assert.equal(cppDelegator.cloneInternal(Ci.nsIMsgMailNewsUrl.HONOR_REF, null).spec,
                                            "https://test.invalid/FOLDER#MODULES");
    Assert.equal(cppDelegator.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");
  },
  function test_nsIURL() {
    let url = newURL().QueryInterface(Ci.nsIURL);
    Assert.ok("filePath" in url);
    url.spec = "https://test.invalid/folder?isFoo=true&someBar=theBar";
    Assert.equal(url.query, "isFoo=true&someBar=theBar");
    // Note that I tried here to test getCommonSpec, but that does not work
    // because nsStandardURL.cpp makes an assumption that the URL is directly
    // an nsStandardURL.cpp.
  },
  function test_nsIMsgMailNewsUrl() {
    let url = newURL().QueryInterface(Ci.nsIMsgMailNewsUrl);
    Assert.ok("msgWindow" in url);
    url.maxProgress = 23;
    Assert.equal(url.maxProgress, 23);
  },
  function test_nsIMsgMessageUrl() {
    let url = newURL().QueryInterface(Ci.nsIMsgMessageUrl);
    Assert.ok("originalSpec" in url);
    let appDir = Services.dirsvc.get("GreD", Components.interfaces.nsIFile);
    Assert.ok(appDir.path);
    // test attributes
    url.messageFile = appDir;
    Assert.equal(url.messageFile.path, appDir.path);
  },
  function test_msgIFooUrl() {
    let url = newURL().QueryInterface(Ci.nsIInterfaceRequestor);
    let fooUrl = url.getInterface(Ci.msgIFooUrl);
    Assert.ok(fooUrl instanceof Ci.msgIFooUrl);

    fooUrl.itemId = "theItemId";
    Assert.equal(fooUrl.itemId, "theItemId");

    url.QueryInterface(Ci.nsIURI).spec = "https://foo.invalid/bar/";
    Assert.ok(!fooUrl.isAttachment);
    url.QueryInterface(Ci.nsIURI).spec = "https://foo.invalid/bar?part=1.4&dummy=stuff";
    Assert.ok(fooUrl.isAttachment);

    let msgMailNewsUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
    Assert.ok(!msgMailNewsUrl.IsUrlType(Ci.nsIMsgMailNewsUrl.eMove));
    fooUrl.setUrlType(Ci.nsIMsgMailNewsUrl.eMove);
    Assert.ok(msgMailNewsUrl.IsUrlType(Ci.nsIMsgMailNewsUrl.eMove));

  },
];

function run_test()
{
  for (var test of tests)
    test();
}
