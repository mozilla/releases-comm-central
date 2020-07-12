/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// This file is the component definition for a demo base implementation of a
// javascript msgFolder.

var { ComponentUtils } = ChromeUtils.import(
  "resource://gre/modules/ComponentUtils.jsm"
);
const { JSAccountUtils } = ChromeUtils.import(
  "resource:///modules/jsaccount/JSAccountUtils.jsm"
);
var { JaBaseMsgFolderProperties, JaBaseMsgFolder } = ChromeUtils.import(
  "resource://testing-common/mailnews/testJaBaseMsgFolder.jsm"
);

// Constructor
function JaBaseMsgFolderConstructor() {}

// Constructor prototype (not instance prototype).
JaBaseMsgFolderConstructor.prototype = {
  classID: JaBaseMsgFolderProperties.classID,
  _xpcom_factory: JSAccountUtils.jaFactory(
    JaBaseMsgFolderProperties,
    JaBaseMsgFolder
  ),
};

this.NSGetFactory = ComponentUtils.generateNSGetFactory([
  JaBaseMsgFolderConstructor,
]);
