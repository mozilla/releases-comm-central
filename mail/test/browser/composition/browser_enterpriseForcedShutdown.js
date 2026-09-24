/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ForcedQuitHandler } = ChromeUtils.importESModule(
  "resource://gre/modules/enterprise/ForcedQuitHandler.sys.mjs"
);
const { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
const { get_special_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

let gDraftFolder;

add_setup(async function () {
  gDraftFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

add_task(async function test_forced_shutdown_flushes_compose_windows() {
  const initialDraftKeys = new Set(
    Array.from(gDraftFolder.messages, message => message.messageKey)
  );
  const subject = "Enterprise forced shutdown draft";

  const modifiedCompose = await open_compose_new_mail(window);
  const unmodifiedCompose = await open_compose_new_mail(window);

  registerCleanupFunction(async () => {
    for (const composeWindow of [modifiedCompose, unmodifiedCompose]) {
      if (!composeWindow.closed) {
        await close_compose_window(composeWindow);
      }
    }
  });

  modifiedCompose.document.getElementById("msgSubject").focus();
  EventUtils.sendString(subject, modifiedCompose);

  modifiedCompose.document.getElementById("messageEditor").focus();
  EventUtils.sendString(
    "Content preserved during forced shutdown.",
    modifiedCompose
  );

  const hook = ForcedQuitHandler._appForcedQuitHook();

  Assert.equal(
    typeof hook,
    "function",
    "The Thunderbird forced-quit hook should be registered"
  );

  await hook(Ci.nsIAppStartup.eForceQuit);

  Assert.ok(
    !modifiedCompose.closed,
    "Preparing for forced shutdown does not close the modified compose window"
  );
  Assert.ok(
    !unmodifiedCompose.closed,
    "Preparing for forced shutdown does not close the unmodified compose window"
  );

  for (const [kind, composeWindow] of [
    ["modified", modifiedCompose],
    ["unmodified", unmodifiedCompose],
  ]) {
    Assert.equal(
      composeWindow.document.documentElement.dataset.enterpriseForcedShutdown,
      "true",
      `The ${kind} compose window is prepared for the forced quit`
    );

    Assert.ok(
      composeWindow.ComposeCanClose(),
      `The ${kind} compose window does not block the forced quit`
    );

    Assert.ok(
      !(
        "enterpriseForcedShutdown" in
        composeWindow.document.documentElement.dataset
      ),
      `The ${kind} compose window consumed its forced-close marker`
    );
  }

  await TestUtils.waitForCondition(
    () => gDraftFolder.getTotalMessages(false) == initialDraftKeys.size + 1,
    "Waiting for the forced-shutdown draft to be created"
  );

  const newDrafts = Array.from(gDraftFolder.messages).filter(
    message => !initialDraftKeys.has(message.messageKey)
  );

  Assert.equal(
    newDrafts.length,
    1,
    "Only the modified compose window created a draft"
  );
  Assert.equal(
    newDrafts[0]?.subject,
    subject,
    "The forced-shutdown draft has the expected subject"
  );

  await close_compose_window(modifiedCompose);
  await close_compose_window(unmodifiedCompose);
});
