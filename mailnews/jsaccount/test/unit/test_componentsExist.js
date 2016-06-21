/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that the components made available by JaAccount can be created with
// each supported interface.

let tests = [
  // JaUrl
              ["@mozilla.org/jacppurldelegator;1", "nsISupports"],
              ["@mozilla.org/jacppurldelegator;1", "nsIMsgMailNewsUrl"],
              ["@mozilla.org/jacppurldelegator;1", "nsIMsgMessageUrl"],
              ["@mozilla.org/jacppurldelegator;1", "nsIURL"],
              ["@mozilla.org/jacppurldelegator;1", "nsIURI"],
              ["@mozilla.org/jacppurldelegator;1", "msgIOverride"],
              ["@mozilla.org/jacppurldelegator;1", "nsIInterfaceRequestor"],

  // FooJaUrl
              ["@mozilla.org/jsaccount/testjafoourl;1", "nsISupports"],
              ["@mozilla.org/jsaccount/testjafoourl;1", "nsIMsgMailNewsUrl"],
              ["@mozilla.org/jsaccount/testjafoourl;1", "nsIMsgMessageUrl"],
              ["@mozilla.org/jsaccount/testjafoourl;1", "nsIURL"],
              ["@mozilla.org/jsaccount/testjafoourl;1", "nsIURI"],
              ["@mozilla.org/jsaccount/testjafoourl;1", "msgIOverride"],
              ["@mozilla.org/jsaccount/testjafoourl;1", "nsIInterfaceRequestor"],
  // JaAbDirectory
              ["@mozilla.org/jacppabdirectorydelegator;1", "nsISupports"],
              ["@mozilla.org/jacppabdirectorydelegator;1", "nsIAbDirectory"],
              ["@mozilla.org/jacppabdirectorydelegator;1", "nsIAbCollection"],
              ["@mozilla.org/jacppabdirectorydelegator;1", "nsIAbItem"],
              ["@mozilla.org/jacppabdirectorydelegator;1", "msgIOverride"],
              ["@mozilla.org/jacppabdirectorydelegator;1", "nsIInterfaceRequestor"],
            ];

function run_test()
{
  for (let [contractID, iface] of tests) {
    dump('trying to create component ' + contractID +
         ' with interface ' + iface + '\n');
    try {
      dump(Cc[contractID] + " " + Ci[iface] + '\n');
    }
    catch (e) {dump(e + '\n');}

    let comp = Cc[contractID].createInstance(Ci[iface]);
    Assert.ok(comp instanceof Ci[iface]);
  }

}
