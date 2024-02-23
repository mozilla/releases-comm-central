/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.sys.mjs",
  CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

function run_tests() {
  test_initial_creation();

  test_display_alarm();
  test_email_alarm();
  test_audio_alarm();
  test_custom_alarm();
  test_repeat();
  test_xprop();

  test_dates();

  test_clone();
  test_immutable();
  test_serialize();
  test_strings();
}

function run_test() {
  do_calendar_startup(run_tests);
}

function test_initial_creation() {
  dump("Testing initial creation...");
  const alarm = new CalAlarm();

  let passed;
  try {
    // eslint-disable-next-line no-unused-expressions
    alarm.icalString;
    passed = false;
  } catch (e) {
    passed = true;
  }
  if (!passed) {
    do_throw("Fresh calIAlarm should not produce a valid icalString");
  }
  dump("Done\n");
}

function test_display_alarm() {
  dump("Testing DISPLAY alarms...");
  const alarm = new CalAlarm();
  // Set ACTION to DISPLAY, make sure this was not rejected
  alarm.action = "DISPLAY";
  equal(alarm.action, "DISPLAY");

  // Set a Description, REQUIRED for ACTION:DISPLAY
  alarm.description = "test";
  equal(alarm.description, "test");

  // SUMMARY is not valid for ACTION:DISPLAY
  alarm.summary = "test";
  equal(alarm.summary, null);

  // No attendees allowed
  const attendee = new CalAttendee();
  attendee.id = "mailto:horst";

  throws(() => {
    // DISPLAY alarm should not be able to save attendees
    alarm.addAttendee(attendee);
  }, /Alarm type AUDIO\/DISPLAY may not have attendees/);

  throws(() => {
    // DISPLAY alarm should not be able to save attachment
    alarm.addAttachment(new CalAttachment());
  }, /Alarm type DISPLAY may not have attachments/);

  dump("Done\n");
}

function test_email_alarm() {
  dump("Testing EMAIL alarms...");
  const alarm = new CalAlarm();
  // Set ACTION to DISPLAY, make sure this was not rejected
  alarm.action = "EMAIL";
  equal(alarm.action, "EMAIL");

  // Set a Description, REQUIRED for ACTION:EMAIL
  alarm.description = "description";
  equal(alarm.description, "description");

  // Set a Summary, REQUIRED for ACTION:EMAIL
  alarm.summary = "summary";
  equal(alarm.summary, "summary");

  // Set an offset of some sort
  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration();

  // Check for at least one attendee
  const attendee1 = new CalAttendee();
  attendee1.id = "mailto:horst";
  const attendee2 = new CalAttendee();
  attendee2.id = "mailto:gustav";

  equal(alarm.getAttendees().length, 0);
  alarm.addAttendee(attendee1);
  equal(alarm.getAttendees().length, 1);
  alarm.addAttendee(attendee2);
  equal(alarm.getAttendees().length, 2);
  alarm.addAttendee(attendee1);
  const addedAttendees = alarm.getAttendees();
  equal(addedAttendees.length, 2);
  equal(addedAttendees[0].wrappedJSObject, attendee2);
  equal(addedAttendees[1].wrappedJSObject, attendee1);

  ok(!!alarm.icalComponent.serializeToICS().match(/mailto:horst/));
  ok(!!alarm.icalComponent.serializeToICS().match(/mailto:gustav/));

  alarm.deleteAttendee(attendee1);
  equal(alarm.getAttendees().length, 1);

  alarm.clearAttendees();
  equal(alarm.getAttendees().length, 0);

  // Make sure attendees are correctly folded/imported
  alarm.icalString = dedent`
        BEGIN:VALARM
        ACTION:EMAIL
        TRIGGER;VALUE=DURATION:-PT5M
        ATTENDEE:mailto:test@example.com
        ATTENDEE:mailto:test@example.com
        ATTENDEE:mailto:test2@example.com
        END:VALARM
    `;
  equal(alarm.icalString.match(/ATTENDEE:mailto:test@example.com/g).length, 1);
  equal(alarm.icalString.match(/ATTENDEE:mailto:test2@example.com/g).length, 1);

  // TODO test attachments
  dump("Done\n");
}

function test_audio_alarm() {
  dump("Testing AUDIO alarms...");
  const alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
  alarm.alarmDate = cal.createDateTime();
  // Set ACTION to AUDIO, make sure this was not rejected
  alarm.action = "AUDIO";
  equal(alarm.action, "AUDIO");

  // No Description for ACTION:AUDIO
  alarm.description = "description";
  equal(alarm.description, null);

  // No Summary, for ACTION:AUDIO
  alarm.summary = "summary";
  equal(alarm.summary, null);

  // No attendees allowed
  const attendee = new CalAttendee();
  attendee.id = "mailto:horst";

  try {
    alarm.addAttendee(attendee);
    do_throw("AUDIO alarm should not be able to save attendees");
  } catch (e) {
    // TODO looks like this test is disabled. Why?
  }

  // Test attachments
  const sound = new CalAttachment();
  sound.uri = Services.io.newURI("file:///sound.wav");
  const sound2 = new CalAttachment();
  sound2.uri = Services.io.newURI("file:///sound2.wav");

  // Adding an attachment should work
  alarm.addAttachment(sound);
  let addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 1);
  equal(addedAttachments[0].wrappedJSObject, sound);
  ok(alarm.icalString.includes("ATTACH:file:///sound.wav"));

  // Adding twice shouldn't change anything
  alarm.addAttachment(sound);
  addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 1);
  equal(addedAttachments[0].wrappedJSObject, sound);

  try {
    alarm.addAttachment(sound2);
    do_throw("Adding a second attachment should fail for type AUDIO");
  } catch (e) {
    // TODO looks like this test is disabled. Why?
  }

  // Deleting should work
  alarm.deleteAttachment(sound);
  addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 0);

  // As well as clearing
  alarm.addAttachment(sound);
  alarm.clearAttachments();
  addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 0);

  // AUDIO alarms should only be allowing one attachment, and folding any with the same value
  alarm.icalString = dedent`
        BEGIN:VALARM
        ACTION:AUDIO
        TRIGGER;VALUE=DURATION:-PT5M
        ATTACH:Basso
        UID:28F8007B-FE56-442E-917C-1F4E48DD406A
        X-APPLE-DEFAULT-ALARM:TRUE
        ATTACH:Basso
        END:VALARM
    `;
  equal(alarm.icalString.match(/ATTACH:Basso/g).length, 1);

  dump("Done\n");
}

function test_custom_alarm() {
  dump("Testing X-SMS (custom) alarms...");
  const alarm = new CalAlarm();
  // Set ACTION to a custom value, make sure this was not rejected
  alarm.action = "X-SMS";
  equal(alarm.action, "X-SMS");

  // There is no restriction on DESCRIPTION for custom alarms
  alarm.description = "description";
  equal(alarm.description, "description");

  // There is no restriction on SUMMARY for custom alarms
  alarm.summary = "summary";
  equal(alarm.summary, "summary");

  // Test for attendees
  const attendee1 = new CalAttendee();
  attendee1.id = "mailto:horst";
  const attendee2 = new CalAttendee();
  attendee2.id = "mailto:gustav";

  equal(alarm.getAttendees().length, 0);
  alarm.addAttendee(attendee1);
  equal(alarm.getAttendees().length, 1);
  alarm.addAttendee(attendee2);
  equal(alarm.getAttendees().length, 2);
  alarm.addAttendee(attendee1);
  equal(alarm.getAttendees().length, 2);

  alarm.deleteAttendee(attendee1);
  equal(alarm.getAttendees().length, 1);

  alarm.clearAttendees();
  equal(alarm.getAttendees().length, 0);

  // Test for attachments
  const attach1 = new CalAttachment();
  attach1.uri = Services.io.newURI("file:///example.txt");
  const attach2 = new CalAttachment();
  attach2.uri = Services.io.newURI("file:///example2.txt");

  alarm.addAttachment(attach1);
  alarm.addAttachment(attach2);

  let addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 2);
  equal(addedAttachments[0].wrappedJSObject, attach1);
  equal(addedAttachments[1].wrappedJSObject, attach2);

  alarm.deleteAttachment(attach1);
  addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 1);

  alarm.clearAttachments();
  addedAttachments = alarm.getAttachments();
  equal(addedAttachments.length, 0);
}

// Check if any combination of REPEAT and DURATION work as expected.
function test_repeat() {
  dump("Testing REPEAT and DURATION properties...");
  let alarm = new CalAlarm();

  // Check initial value
  equal(alarm.repeat, 0);
  equal(alarm.repeatOffset, null);
  equal(alarm.repeatDate, null);

  // Should not be able to get REPEAT when DURATION is not set
  alarm.repeat = 1;
  equal(alarm.repeat, 0);

  // Both REPEAT and DURATION should be accessible, when the two are set.
  alarm.repeatOffset = cal.createDuration();
  notEqual(alarm.repeatOffset, null);
  notEqual(alarm.repeat, 0);

  // Should not be able to get DURATION when REPEAT is not set
  alarm.repeat = null;
  equal(alarm.repeatOffset, null);

  // Should be able to unset alarm DURATION attribute. (REPEAT already tested above)
  try {
    alarm.repeatOffset = null;
  } catch (e) {
    do_throw("Could not set repeatOffset attribute to null" + e);
  }

  // Check unset value
  equal(alarm.repeat, 0);
  equal(alarm.repeatOffset, null);

  // Check repeatDate
  alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
  alarm.alarmDate = cal.createDateTime();
  alarm.repeat = 1;
  alarm.repeatOffset = cal.createDuration();
  alarm.repeatOffset.inSeconds = 3600;

  const date = alarm.alarmDate.clone();
  date.second += 3600;
  equal(alarm.repeatDate.icalString, date.icalString);

  dump("Done\n");
}

function test_xprop() {
  dump("Testing X-Props...");
  const alarm = new CalAlarm();
  alarm.setProperty("X-PROP", "X-VALUE");
  ok(alarm.hasProperty("X-PROP"));
  equal(alarm.getProperty("X-PROP"), "X-VALUE");
  alarm.deleteProperty("X-PROP");
  ok(!alarm.hasProperty("X-PROP"));
  equal(alarm.getProperty("X-PROP"), null);

  // also check X-MOZ-LASTACK prop
  const date = cal.createDateTime();
  alarm.setProperty("X-MOZ-LASTACK", date.icalString);
  alarm.action = "DISPLAY";
  alarm.description = "test";
  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration("-PT5M");
  ok(alarm.icalComponent.serializeToICS().includes(date.icalString));

  alarm.deleteProperty("X-MOZ-LASTACK");
  ok(!alarm.icalComponent.serializeToICS().includes(date.icalString));
  dump("Done\n");
}

function test_dates() {
  dump("Testing alarm dates...");
  let passed;
  // Initial value
  const alarm = new CalAlarm();
  equal(alarm.alarmDate, null);
  equal(alarm.offset, null);

  // Set an offset and check it
  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  const offset = cal.createDuration("-PT5M");
  alarm.offset = offset;
  equal(alarm.alarmDate, null);
  equal(alarm.offset, offset);
  try {
    alarm.alarmDate = cal.createDateTime();
    passed = false;
  } catch (e) {
    passed = true;
  }
  if (!passed) {
    do_throw("Setting alarmDate when alarm is relative should not succeed");
  }

  // Set an absolute time and check it
  alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
  const alarmDate = createDate(2007, 0, 1, true, 2, 0, 0);
  alarm.alarmDate = alarmDate;
  equal(alarm.alarmDate.icalString, alarmDate.icalString);
  equal(alarm.offset, null);
  try {
    alarm.offset = cal.createDuration();
    passed = false;
  } catch (e) {
    passed = true;
  }
  if (!passed) {
    do_throw("Setting offset when alarm is absolute should not succeed");
  }

  dump("Done\n");
}

var propMap = {
  related: Ci.calIAlarm.ALARM_RELATED_START,
  repeat: 1,
  action: "X-TEST",
  description: "description",
  summary: "summary",
  offset: cal.createDuration("PT4M"),
  repeatOffset: cal.createDuration("PT1M"),
};
var clonePropMap = {
  related: Ci.calIAlarm.ALARM_RELATED_END,
  repeat: 2,
  action: "X-CHANGED",
  description: "description-changed",
  summary: "summary-changed",
  offset: cal.createDuration("PT5M"),
  repeatOffset: cal.createDuration("PT2M"),
};

function test_immutable() {
  dump("Testing immutable alarms...");
  const alarm = new CalAlarm();
  // Set up each attribute
  for (const prop in propMap) {
    alarm[prop] = propMap[prop];
  }

  // Set up some extra props
  alarm.setProperty("X-FOO", "X-VAL");
  alarm.setProperty("X-DATEPROP", cal.createDateTime());
  alarm.addAttendee(new CalAttendee());

  // Initial checks
  ok(alarm.isMutable);
  alarm.makeImmutable();
  ok(!alarm.isMutable);
  alarm.makeImmutable();
  ok(!alarm.isMutable);

  // Check each attribute
  for (const prop in propMap) {
    try {
      alarm[prop] = propMap[prop];
    } catch (e) {
      equal(e.result, Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
      continue;
    }
    do_throw("Attribute " + prop + " was writable while item was immutable");
  }

  // Functions
  throws(() => {
    alarm.setProperty("X-FOO", "changed");
  }, /Can not modify immutable data container/);

  throws(() => {
    alarm.deleteProperty("X-FOO");
  }, /Can not modify immutable data container/);

  ok(!alarm.getProperty("X-DATEPROP").isMutable);

  dump("Done\n");
}

function test_clone() {
  dump("Testing cloning alarms...");
  const alarm = new CalAlarm();
  // Set up each attribute
  for (const prop in propMap) {
    alarm[prop] = propMap[prop];
  }

  // Set up some extra props
  alarm.setProperty("X-FOO", "X-VAL");
  alarm.setProperty("X-DATEPROP", cal.createDateTime());
  alarm.addAttendee(new CalAttendee());

  // Make a copy
  let newAlarm = alarm.clone();
  newAlarm.makeImmutable();
  newAlarm = newAlarm.clone();
  ok(newAlarm.isMutable);

  // Check if item is still the same
  // TODO This is not quite optimal, maybe someone can find a better way to do
  // the comparisons.
  for (const prop in propMap) {
    if (prop == "item") {
      equal(alarm.item.icalString, newAlarm.item.icalString);
    } else {
      try {
        alarm[prop].QueryInterface(Ci.nsISupports);
        equal(alarm[prop].icalString, newAlarm[prop].icalString);
      } catch {
        equal(alarm[prop], newAlarm[prop]);
      }
    }
  }

  // Check if changes on the cloned object do not affect the original object.
  for (const prop in clonePropMap) {
    newAlarm[prop] = clonePropMap[prop];
    dump("Checking " + prop + "...");
    notEqual(alarm[prop], newAlarm[prop]);
    dump("OK!\n");
    break;
  }

  // Check x props
  alarm.setProperty("X-FOO", "BAR");
  equal(alarm.getProperty("X-FOO"), "BAR");
  const date = alarm.getProperty("X-DATEPROP");
  equal(date.isMutable, true);

  // Test xprop params
  alarm.icalString =
    "BEGIN:VALARM\n" +
    "ACTION:DISPLAY\n" +
    "TRIGGER:-PT15M\n" +
    "X-FOO;X-PARAM=PARAMVAL:BAR\n" +
    "DESCRIPTION:TEST\n" +
    "END:VALARM";

  newAlarm = alarm.clone();
  equal(alarm.icalString, newAlarm.icalString);

  dump("Done\n");
}

function test_serialize() {
  // most checks done by other tests, these don't fit into categories
  const alarm = new CalAlarm();

  throws(
    () => {
      alarm.icalComponent = cal.icsService.createIcalComponent("BARF");
    },
    /0x80070057/,
    "Invalid Argument"
  );

  function addProp(name, value) {
    const prop = cal.icsService.createIcalProperty(name);
    prop.value = value;
    comp.addProperty(prop);
  }
  function addActionDisplay() {
    addProp("ACTION", "DISPLAY");
  }
  function addActionEmail() {
    addProp("ACTION", "EMAIL");
  }
  function addTrigger() {
    addProp("TRIGGER", "-PT15M");
  }
  function addDescr() {
    addProp("DESCRIPTION", "TEST");
  }
  function addDuration() {
    addProp("DURATION", "-PT15M");
  }
  function addRepeat() {
    addProp("REPEAT", "1");
  }
  function addAttendee() {
    addProp("ATTENDEE", "mailto:horst");
  }
  function addAttachment() {
    addProp("ATTACH", "data:yeah");
  }

  // All is there, should not throw
  let comp = cal.icsService.createIcalComponent("VALARM");
  addActionDisplay();
  addTrigger();
  addDescr();
  addDuration();
  addRepeat();
  alarm.icalComponent = comp;
  alarm.toString();

  // Attachments and attendees
  comp = cal.icsService.createIcalComponent("VALARM");
  addActionEmail();
  addTrigger();
  addDescr();
  addAttendee();
  addAttachment();
  alarm.icalComponent = comp;
  alarm.toString();

  // Missing action
  throws(
    () => {
      comp = cal.icsService.createIcalComponent("VALARM");
      addTrigger();
      addDescr();
      alarm.icalComponent = comp;
    },
    /Illegal value/,
    "Invalid Argument"
  );

  // Missing trigger
  throws(
    () => {
      comp = cal.icsService.createIcalComponent("VALARM");
      addActionDisplay();
      addDescr();
      alarm.icalComponent = comp;
    },
    /Illegal value/,
    "Invalid Argument"
  );

  // Missing duration with repeat
  throws(
    () => {
      comp = cal.icsService.createIcalComponent("VALARM");
      addActionDisplay();
      addTrigger();
      addDescr();
      addRepeat();
      alarm.icalComponent = comp;
    },
    /Illegal value/,
    "Invalid Argument"
  );

  // Missing repeat with duration
  throws(
    () => {
      comp = cal.icsService.createIcalComponent("VALARM");
      addActionDisplay();
      addTrigger();
      addDescr();
      addDuration();
      alarm.icalComponent = comp;
    },
    /Illegal value/,
    "Invalid Argument"
  );
}

function test_strings() {
  // Serializing the string shouldn't throw, but we don't really care about
  // the string itself.
  const alarm = new CalAlarm();
  alarm.action = "DISPLAY";
  alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
  alarm.alarmDate = cal.createDateTime();
  alarm.toString();

  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration();
  alarm.toString();
  alarm.toString(new CalTodo());

  alarm.related = Ci.calIAlarm.ALARM_RELATED_END;
  alarm.offset = cal.createDuration();
  alarm.toString();
  alarm.toString(new CalTodo());

  alarm.offset = cal.createDuration("P1D");
  alarm.toString();

  alarm.offset = cal.createDuration("PT1H");
  alarm.toString();

  alarm.offset = cal.createDuration("-PT1H");
  alarm.toString();
}
