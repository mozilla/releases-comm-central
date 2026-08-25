/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const gMIMEService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);

const gHandlerService = Cc[
  "@mozilla.org/uriloader/handler-service;1"
].getService(Ci.nsIHandlerService);

// This seems odd, but for test purposes, this just has to be a file that we know exists,
// and by using this file, we don't have to worry about different platforms.
const exeFile = Services.dirsvc.get("XREExeF", Ci.nsIFile);

add_task(async function test_disable_builtin_pdf() {
  await setupPolicyEngineWithJson({
    policies: {
      DisableBuiltinPDFViewer: true,
    },
  });

  const handlerInfo = gMIMEService.getFromTypeAndExtension(
    "application/pdf",
    ""
  );
  is(handlerInfo.preferredAction, handlerInfo.useSystemDefault);
  is(handlerInfo.alwaysAskBeforeHandling, false);
});

add_task(async function test_enable_builtin_pdf() {
  await setupPolicyEngineWithJson({
    policies: {
      DisableBuiltinPDFViewer: false,
    },
  });

  const handlerInfo = gMIMEService.getFromTypeAndExtension(
    "application/pdf",
    ""
  );
  is(handlerInfo.preferredAction, handlerInfo.handleInternally);
  is(handlerInfo.alwaysAskBeforeHandling, false);
});

add_task(async function test_disable_builtin_pdf_false_preserves_user_choice() {
  EnterprisePolicyTesting.resetRunOnceState();

  await setupPolicyEngineWithJson({
    policies: {
      DisableBuiltinPDFViewer: false,
    },
  });

  let handlerInfo = gMIMEService.getFromTypeAndExtension("application/pdf", "");
  is(handlerInfo.preferredAction, handlerInfo.handleInternally);

  handlerInfo.preferredAction = handlerInfo.useSystemDefault;
  gHandlerService.store(handlerInfo);

  // Re-applying the same policy (e.g. next startup) must not override the
  // user's handler choice.
  await setupPolicyEngineWithJson({
    policies: {
      DisableBuiltinPDFViewer: false,
    },
  });

  handlerInfo = gMIMEService.getFromTypeAndExtension("application/pdf", "");
  is(handlerInfo.preferredAction, handlerInfo.useSystemDefault);

  gHandlerService.remove(handlerInfo);
  EnterprisePolicyTesting.resetRunOnceState();
});

add_task(async function test_handler_unchanged() {
  await setupPolicyEngineWithJson({
    policies: {
      DisableBuiltinPDFViewer: true,
      Handlers: {
        mimeTypes: {
          "application/pdf": {
            action: "useHelperApp",
            ask: true,
            handlers: [
              {
                name: "Launch",
                path: exeFile.path,
              },
            ],
          },
        },
      },
    },
  });

  const handlerInfo = gMIMEService.getFromTypeAndExtension(
    "application/pdf",
    ""
  );
  is(handlerInfo.preferredAction, handlerInfo.useHelperApp);
  is(handlerInfo.alwaysAskBeforeHandling, true);
  is(handlerInfo.preferredApplicationHandler.name, "Launch");
  is(handlerInfo.preferredApplicationHandler.executable.path, exeFile.path);

  gHandlerService.remove(handlerInfo);
});
