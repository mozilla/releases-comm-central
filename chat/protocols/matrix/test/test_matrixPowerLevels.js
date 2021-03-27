/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { MatrixPowerLevels } = ChromeUtils.import(
  "resource:///modules/matrixPowerLevels.jsm"
);
var { l10nHelper } = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var _ = l10nHelper("chrome://chat/locale/matrix.properties");

function run_test() {
  add_test(testToText);
  run_next_test();
}

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

function testToText() {
  for (const fixture of TO_TEXT_FIXTURES) {
    const result = MatrixPowerLevels.toText(
      fixture.level,
      fixture.defaultLevel
    );
    equal(result, fixture.result);
  }

  run_next_test();
}
