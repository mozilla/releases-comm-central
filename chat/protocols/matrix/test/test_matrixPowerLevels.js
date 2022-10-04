/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { MatrixPowerLevels } = ChromeUtils.importESModule(
  "resource:///modules/matrixPowerLevels.sys.mjs"
);
var { l10nHelper } = ChromeUtils.importESModule(
  "resource:///modules/imXPCOMUtils.sys.mjs"
);
var _ = l10nHelper("chrome://chat/locale/matrix.properties");

const TO_TEXT_FIXTURES = [
  {
    level: MatrixPowerLevels.user,
    defaultLevel: MatrixPowerLevels.user,
    result: _(
      "powerLevel.detailed",
      _("powerLevel.default"),
      MatrixPowerLevels.user
    ),
    name: "Default power level for default 0",
  },
  {
    level: MatrixPowerLevels.user,
    defaultLevel: 10,
    result: _(
      "powerLevel.detailed",
      _("powerLevel.restricted"),
      MatrixPowerLevels.user
    ),
    name: "Restricted power level",
  },
  {
    level: 10,
    defaultLevel: 10,
    result: _("powerLevel.detailed", _("powerLevel.default"), 10),
    name: "Default power level for default 10",
  },
  {
    level: MatrixPowerLevels.moderator,
    defaultLevel: MatrixPowerLevels.user,
    result: _(
      "powerLevel.detailed",
      _("powerLevel.moderator"),
      MatrixPowerLevels.moderator
    ),
    name: "Moderator",
  },
  {
    level: MatrixPowerLevels.admin,
    defaultLevel: MatrixPowerLevels.user,
    result: _(
      "powerLevel.detailed",
      _("powerLevel.admin"),
      MatrixPowerLevels.admin
    ),
    name: "Admin",
  },
  {
    level: 25,
    defaultLevel: MatrixPowerLevels.user,
    result: _("powerLevel.detailed", _("powerLevel.custom"), 25),
    name: "Custom power level 25",
  },
];
const GET_EVENT_LEVEL_FIXTURES = [
  {
    powerLevels: undefined,
    expected: 0,
  },
  {
    powerLevels: {},
    expected: 0,
  },
  {
    powerLevels: {
      events_default: 10,
    },
    expected: 10,
  },
  {
    powerLevels: {
      events_default: Infinity,
    },
    expected: 0,
  },
  {
    powerLevels: {
      events_default: "foo",
    },
    expected: 0,
  },
  {
    powerLevels: {
      events_default: 0,
      events: {},
    },
    expected: 0,
  },
  {
    powerLevels: {
      events_default: 0,
      events: {
        [MatrixSDK.EventType.RoomMessage]: 0,
      },
    },
    expected: 0,
  },
  {
    powerLevels: {
      events_default: 0,
      events: {
        [MatrixSDK.EventType.RoomMessage]: Infinity,
      },
    },
    expected: 0,
  },
  {
    powerLevels: {
      events_default: 0,
      events: {
        [MatrixSDK.EventType.RoomMessage]: "foo",
      },
    },
    expected: 0,
  },
  {
    powerLevels: {
      events_default: 0,
      events: {
        [MatrixSDK.EventType.RoomMessage]: 10,
      },
    },
    expected: 10,
  },
];

add_task(async function testToText() {
  for (const fixture of TO_TEXT_FIXTURES) {
    const result = MatrixPowerLevels.toText(
      fixture.level,
      fixture.defaultLevel
    );
    equal(result, fixture.result);
  }
});

add_task(async function testGetUserDefaultLevel() {
  equal(MatrixPowerLevels.getUserDefaultLevel(), 0);
  equal(MatrixPowerLevels.getUserDefaultLevel({}), 0);
  equal(
    MatrixPowerLevels.getUserDefaultLevel({
      users_default: 10,
    }),
    10
  );
  equal(
    MatrixPowerLevels.getUserDefaultLevel({
      users_default: Infinity,
    }),
    0
  );
  equal(
    MatrixPowerLevels.getUserDefaultLevel({
      users_default: "foo",
    }),
    0
  );
});

add_task(async function testGetEventDefaultLevel() {
  equal(MatrixPowerLevels.getEventDefaultLevel(), 0);
  equal(MatrixPowerLevels.getEventDefaultLevel({}), 0);
  equal(
    MatrixPowerLevels.getEventDefaultLevel({
      events_default: 10,
    }),
    10
  );
  equal(
    MatrixPowerLevels.getEventDefaultLevel({
      events_default: Infinity,
    }),
    0
  );
  equal(
    MatrixPowerLevels.getEventDefaultLevel({
      events_default: "foo",
    }),
    0
  );
});

add_task(async function testGetEventLevel() {
  for (const eventLevelTest of GET_EVENT_LEVEL_FIXTURES) {
    equal(
      MatrixPowerLevels.getEventLevel(
        eventLevelTest.powerLevels,
        MatrixSDK.EventType.RoomMessage
      ),
      eventLevelTest.expected
    );
  }
});
