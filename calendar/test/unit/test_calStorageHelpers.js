const { newDateTime } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calStorageHelpers.sys.mjs"
);

add_task(async function testNewDateTimeWithIcalTimezoneDef() {
  // Define a timezone that is unlikely to match anything in common use
  const icalTimezoneDef = `BEGIN:VTIMEZONE
TZID:Totally_Made_Up_Standard_Time
BEGIN:STANDARD
DTSTART:19671029T020000
TZOFFSETFROM:-0427
TZOFFSETTO:-0527
END:STANDARD
END:VTIMEZONE`;

  // 6 October, 2022 at 17:23:08 UTC
  const dateTime = newDateTime(1665076988000000, icalTimezoneDef);

  Assert.equal(dateTime.year, 2022, "year should be 2022");
  Assert.equal(dateTime.month, 9, "zero-based month should be October");
  Assert.equal(dateTime.day, 6, "day should be the 6th");
  Assert.equal(dateTime.hour, 11, "hour should be 11 AM");
  Assert.equal(dateTime.minute, 56, "minute should be 56");
  Assert.equal(dateTime.second, 8, "second should be 8");
});
