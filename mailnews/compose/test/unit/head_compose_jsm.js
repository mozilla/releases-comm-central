/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Set mailnews.send.jsmodule to true, so that test suite will be run against
 * MessageSend.jsm.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
Services.prefs.setBoolPref("mailnews.send.jsmodule", true);

// Trigger the loading of MessageSend.jsm.
Cc["@mozilla.org/messengercompose/send-module-loader;1"].getService();
