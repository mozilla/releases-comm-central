/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
 var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

 ChromeUtils.defineESModuleGetters(this, {
   CalAlarm: "resource:///modules/CalAlarm.sys.mjs",
   CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
   CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
   CalTodo: "resource:///modules/CalTodo.sys.mjs",
   CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
 });

 function run_test() {
    // Time break up values
    weeks = 604800;
    days = 86400;
    hours = 3600;
    minutes = 60;
    seconds = 1;

    // Test weeks and hours
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 0 + days * 0 + hours * 170 + minutes * 0 + seconds * 0);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    let caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P7DT2H")
    delete alarm;
    delete caldate;

    // Test weeks and minutes
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 1 + days * 0 + hours * 0 + minutes * 1 + seconds * 0);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P7DT1M")
    delete alarm;
    delete caldate;

    // Test weeks and seconds
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 1 + days * 0 + hours * 0 + minutes * 0 + seconds * 30);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P7DT30S")
    delete alarm;
    delete caldate;

    // Test weeks, days, and hours
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 5 + days * 2 + hours * 1 + minutes * 0 + seconds * 0);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P37DT1H")
    delete alarm;
    delete caldate;

    // Test weeks, days, and minutes
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 5 + days * 2 + hours * 0 + minutes * 5 + seconds * 0);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P37DT5M")
    delete alarm;
    delete caldate;

    // Test weeks, days, and seconds
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 5 + days * 2 + hours * 0 + minutes * 0 + seconds * 20);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P37DT20S")
    delete alarm;
    delete caldate;

    // Test days
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 0 + days * 2 + hours * 0 + minutes * 0 + seconds * 0);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "P2D")
    delete alarm;
    delete caldate;

    // Test only time
    alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime();
    alarm.repeat = 1;
    alarm.repeatOffset = cal.createDuration();
    alarm.repeatOffset.inSeconds = (weeks * 0 + days * 0 + hours * 2 + minutes * 3 + seconds * 5);
    console.log(alarm.mDuration.innerObject)
    //console.log(date)
    caldate = new CalDateTime(alarm.mDuration.innerObject.clone())
    console.log(caldate.toString())
    equal(caldate.toString(), "PT2H3M5S")
    delete alarm;
    delete caldate;
  }