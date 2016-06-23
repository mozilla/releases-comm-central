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
              // (probably a url bug) ["@mozilla.org/jacppurldelegator;1", "nsISupportsWeakReference"],

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
              ["@mozilla.org/jacppabdirectorydelegator;1", "nsISupportsWeakReference"],
  // JaCompose
              ["@mozilla.org/jacppcomposedelegator;1", "nsISupports"],
              ["@mozilla.org/jacppcomposedelegator;1", "nsIMsgCompose"],
              ["@mozilla.org/jacppcomposedelegator;1", "nsIMsgSendListener"],
              ["@mozilla.org/jacppcomposedelegator;1", "msgIOverride"],
              ["@mozilla.org/jacppcomposedelegator;1", "nsIInterfaceRequestor"],
              ["@mozilla.org/jacppcomposedelegator;1", "nsISupportsWeakReference"],
  // JaIncomingServer
              ["@mozilla.org/jacppincomingserverdelegator;1", "nsISupports"],
              ["@mozilla.org/jacppincomingserverdelegator;1", "nsIMsgIncomingServer"],
              ["@mozilla.org/jacppincomingserverdelegator;1", "msgIOverride"],
              ["@mozilla.org/jacppincomingserverdelegator;1", "nsIInterfaceRequestor"],
              ["@mozilla.org/jacppincomingserverdelegator;1", "nsISupportsWeakReference"],
  // JaMsgFolder
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsISupports"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIMsgFolder"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIRDFResource"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIRDFNode"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIDBChangeListener"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIUrlListener"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIJunkMailClassificationListener"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsIMsgTraitClassificationListener"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "msgIOverride"],
              ["@mozilla.org/jacppmsgfolderdelegator;1", "nsISupportsWeakReference"],
  // TestJaIncomingServer
              ["@mozilla.org/messenger/server;1?type=testja", "nsISupports"],
              ["@mozilla.org/messenger/server;1?type=testja", "nsIMsgIncomingServer"],
              ["@mozilla.org/messenger/server;1?type=testja", "msgIOverride"],
              ["@mozilla.org/messenger/server;1?type=testja", "nsISupportsWeakReference"],
  // TestJaMsgProtocolInfo
              ["@mozilla.org/messenger/protocol/info;1?type=testja", "nsISupports"],
              ["@mozilla.org/messenger/protocol/info;1?type=testja", "nsIMsgProtocolInfo"],
  // JaSend
              ["@mozilla.org/jacppsenddelegator;1", "nsISupports"],
              ["@mozilla.org/jacppsenddelegator;1", "nsIMsgSend"],
              ["@mozilla.org/jacppsenddelegator;1", "nsIMsgOperationListener"],
              ["@mozilla.org/jacppsenddelegator;1", "msgIOverride"],
              ["@mozilla.org/jacppsenddelegator;1", "nsISupportsWeakReference"],
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
