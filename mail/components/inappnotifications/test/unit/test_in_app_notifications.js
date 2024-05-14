/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { InAppNotifications } = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
);

add_setup(async () => {
  do_get_profile();
  await InAppNotifications.init();
});

add_task(function test_initializedData() {
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [],
    "Should initialize notifications with an empty array"
  );
});

add_task(function test_updateNotifications() {
  const mockData = [
    {
      id: "foo",
      title: "lorem ipsum",
    },
    {
      id: "bar",
      title: "dolor sit amet",
    },
  ];
  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    mockData,
    "Should save data to notifications"
  );
  Assert.ok(
    Number.isInteger(InAppNotifications._jsonFile.data.lastUpdate),
    "Last update should be an integer"
  );
  Assert.lessOrEqual(
    InAppNotifications._jsonFile.data.lastUpdate,
    Date.now(),
    "Last update should be a timestamp in the past"
  );

  InAppNotifications.updateNotifications([]);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [],
    "Should have cleared notifications"
  );
});

add_task(function test_markAsInteractedWith() {
  const mockData = [
    {
      id: "foo",
      title: "lorem ipsum",
    },
    {
      id: "bar",
      title: "dolor sit amet",
    },
  ];
  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    mockData,
    "Should have all notifications"
  );
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith,
    [],
    "Should start without any notifications having been interacted with"
  );

  InAppNotifications.markAsInteractedWith("foo");

  InAppNotifications.updateNotifications(mockData);
  Assert.deepEqual(
    InAppNotifications.getNotifications(),
    [mockData[1]],
    "Should only have uninteracted notifications"
  );

  InAppNotifications.markAsInteractedWith("foo");
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith,
    ["foo"],
    "Should only store the ID once"
  );

  InAppNotifications.updateNotifications([]);
  Assert.deepEqual(
    InAppNotifications._jsonFile.data.interactedWith,
    [],
    "Should clear interaction store when there are no notifications"
  );
});
