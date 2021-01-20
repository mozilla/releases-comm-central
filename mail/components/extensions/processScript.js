/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Inject the |messenger| object as an alias to |browser| in all known contexts.
// This script is injected into all processes.

// This is a bit fragile since it uses monkeypatching. If a test fails, the best
// way to debug is to search for Schemas.exportLazyGetter where it does the
// injections, add |messenger| alias to those files until the test passes again,
// and then find out why the monkeypatching is not catching it.

const { ExtensionContent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionContent.jsm"
);
const { ExtensionPageChild } = ChromeUtils.import(
  "resource://gre/modules/ExtensionPageChild.jsm"
);
const { ExtensionUtils } = ChromeUtils.import(
  "resource://gre/modules/ExtensionUtils.jsm"
);
const { Schemas } = ChromeUtils.import("resource://gre/modules/Schemas.jsm");

let getContext = ExtensionContent.getContext;
let initExtensionContext = ExtensionContent.initExtensionContext;
let initPageChildExtensionContext = ExtensionPageChild.initExtensionContext;

// This patches constructor of ContentScriptContextChild adding the object to
// the sandbox.
ExtensionContent.getContext = function(extension, window) {
  let context = getContext.apply(ExtensionContent, arguments);
  if (!("messenger" in context.sandbox)) {
    Schemas.exportLazyGetter(
      context.sandbox,
      "messenger",
      () => context.chromeObj
    );
  }
  return context;
};

// This patches extension content within unprivileged pages, so an iframe on a
// web page that points to a moz-extension:// page exposed via
// web_accessible_content.
ExtensionContent.initExtensionContext = function(extension, window) {
  let context = extension.getContext(window);
  Schemas.exportLazyGetter(window, "messenger", () => context.chromeObj);

  return initExtensionContext.apply(ExtensionContent, arguments);
};

// This patches privileged pages such as the background script.
ExtensionPageChild.initExtensionContext = function(extension, window) {
  let retval = initPageChildExtensionContext.apply(
    ExtensionPageChild,
    arguments
  );

  let windowId = ExtensionUtils.getInnerWindowID(window);
  let context = ExtensionPageChild.extensionContexts.get(windowId);

  Schemas.exportLazyGetter(window, "messenger", () => {
    let messengerObj = Cu.createObjectIn(window);
    context.childManager.inject(messengerObj);
    return messengerObj;
  });

  return retval;
};
