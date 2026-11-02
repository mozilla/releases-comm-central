/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { MailNotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/MailNotificationManager.sys.mjs"
);
const { SystemTrayBadgeManager } = ChromeUtils.importESModule(
  "resource:///modules/SystemTrayBadgeManager.sys.mjs"
);
const { WinUnreadBadge } = ChromeUtils.importESModule(
  "resource:///modules/WinUnreadBadge.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(async function test_updatesUnreadCount() {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("mail.biff.show_badge")
  );

  const trayUpdate = sandbox.spy();
  const taskbarUpdate = sandbox
    .stub(WinUnreadBadge, "updateUnreadCount")
    .resolves();
  sandbox.stub(SystemTrayBadgeManager, "getBadge").returns(null);

  const manager = Object.create(MailNotificationManager);
  Object.defineProperty(manager, "_osIntegration", {
    value: { updateUnreadCount: trayUpdate },
  });
  manager._logger = console.createInstance({ prefix: "test.notification" });

  const l10n = new Localization(["messenger/messenger.ftl"], true);
  for (const showBadge of [true, false]) {
    Services.prefs.setBoolPref("mail.biff.show_badge", showBadge);
    for (const [mailCount, chatCount] of [
      [3, 2],
      [0, 0],
    ]) {
      sandbox.resetHistory();
      manager._unreadMailCount = mailCount;
      manager._unreadChatCount = chatCount;
      const count = mailCount + chatCount;
      const tooltip = await l10n.formatValue("unread-messages-os-tooltip", {
        count,
      });

      await manager._updateUnreadCount();

      Assert.equal(
        trayUpdate.callCount,
        1,
        "The system tray should receive each unread count update"
      );
      Assert.deepEqual(
        trayUpdate.firstCall.args,
        [count, tooltip, null],
        "The system tray should receive the full count even with the taskbar badge disabled"
      );
      if (AppConstants.platform == "win") {
        Assert.equal(
          taskbarUpdate.callCount,
          1,
          "The Windows taskbar should also receive each unread count update"
        );
        Assert.deepEqual(
          taskbarUpdate.firstCall.args,
          [count, tooltip, null],
          "The Windows taskbar should receive the unread count and tooltip"
        );
      } else {
        Assert.ok(
          taskbarUpdate.notCalled,
          "The Windows taskbar should only be updated on Windows"
        );
      }
    }
  }
});
