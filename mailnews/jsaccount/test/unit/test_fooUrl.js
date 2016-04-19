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
    // test of access to wrapped JS object
    Assert.equal(typeof url.jsDelegate._hidden, "undefined");
    Assert.equal(url.jsDelegate.wrappedJSObject._hidden, "IAmHidden");
  },
  function test_nsIURI() {
    let url = newURL().QueryInterface(Ci.nsIURI);

    // test attributes
    Assert.ok("spec" in url);
    url.spec = "https://test.invalid/folder?isFoo=true&someBar=theBar";
    Assert.equal(url.host, "test.invalid");

    // test non-attributes
    // url.resolve is overridden in nsMsgMailNewsUrl to only work if starts with "#"
    Assert.equal("https://test.invalid/folder?isFoo=true&someBar=theBar#modules",
                 url.resolve("#modules"));

    // Test JS override of method called virtually in C++.
    // nsMsgMailNewsUrl::CloneIgnoringRef calls Clone(). We overrode the JS to
    // capitalize the path.
    url.spec = "https://test.invalid/folder#modules";
    Assert.equal(url.clone().spec, "https://test.invalid/FOLDER#MODULES");
    Assert.equal(url.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

    // Demo of differences between the various versions of the object. The
    // standard XPCOM constructor returns the JS implementation, as was tested
    // above. Try the same tests using the JS delegate, which should give the
    // same (overridden) results (overridden for clone, C++ class
    // for cloneIgnoringRef.
    let jsDelegate = url.QueryInterface(Ci.msgIOverride).jsDelegate.wrappedJSObject;
    Assert.equal(jsDelegate.clone().spec, "https://test.invalid/FOLDER#MODULES");
    Assert.equal(jsDelegate.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

    // Not sure why you would want to do this, but you call also call the C++
    // object that does delegation, and get the same result. This is actually
    // what we expect C++ callers to see.
    let cppDelegator = jsDelegate.delegator.QueryInterface(Ci.nsIURI);
    Assert.equal(cppDelegator.clone().spec, "https://test.invalid/FOLDER#MODULES");
    Assert.equal(cppDelegator.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

    // The cppBase object will not have the overrides.
    let cppBase = url.QueryInterface(Ci.msgIOverride).cppBase.QueryInterface(Ci.nsIURI); 
    Assert.equal(cppBase.clone().spec, "https://test.invalid/folder#modules");

    // But then it gets tricky. We can call cloneIgnoringRef in the C++ base
    // but it will use the virtual clone which is overridden.
    Assert.equal(cppBase.cloneIgnoringRef().spec, "https://test.invalid/FOLDER");

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
