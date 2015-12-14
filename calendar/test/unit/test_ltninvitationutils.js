/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calXMLUtils.jsm");
Components.utils.import("resource://calendar/modules/ltnInvitationUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Preferences.jsm");

function run_test() {
    do_test_pending();
    //do_get_profile();
    cal.getTimezoneService().startup({onResult: function() {
        do_test_finished();
        run_next_test();
    }});
}

// tests for ltnInvitationUtils.jsm

function getIcs() {
    // we use an unfolded ics blueprint here to make replacing of properties easier
    return [
        "BEGIN:VCALENDAR",
        "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN",
        "VERSION:2.0",
        "METHOD:REQUEST",
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Berlin",
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "TZNAME:CEST",
        "DTSTART:19700329T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0100",
        "TZNAME:CET",
        "DTSTART:19701025T030000",
        "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "CREATED:20150909T180909Z",
        "LAST-MODIFIED:20150909T181048Z",
        "DTSTAMP:20150909T181048Z",
        "UID:cb189fdc-ed47-4db6-a8d7-31a08802249d",
        "SUMMARY:Test Event",
        "ORGANIZER;RSVP=TRUE;CN=Organizer;PARTSTAT=ACCEPTED;ROLE=CHAIR:mailto:organizer@example.net",
        "ATTENDEE;RSVP=TRUE;CN=Attendee;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:attende" +
        "e@example.net",
        "DTSTART;TZID=Europe/Berlin:20150909T210000",
        "DTEND;TZID=Europe/Berlin:20150909T220000",
        "TRANSP:OPAQUE",
        "LOCATION:Room 1",
        "DESCRIPTION:Let us get together",
        "END:VEVENT",
        "END:VCALENDAR"].join("\r\n");
}

add_task(function* getItipHeader_test() {
    let data = [{
        input: {
            method: "METHOD:REQUEST\r\n",
            attendee: null},
        expected: "Organizer has invited you to Test Event"
    }, {
        input: {
            method: "METHOD:CANCEL\r\n",
            attendee: null},
        expected: "Organizer has canceled this event: « Test Event »"
    }, {
        input: {
            method: "METHOD:REPLY\r\n",
            attendee: "ATTENDEE;RSVP=TRUE;CN=Attendee1;PARTSTAT=ACCEPTED;" +
                      "ROLE=REQ-PARTICIPANT:mailto:attendee1@example.net"},
        expected: "Attendee1 <attendee1@example.net> has accepted your event invitation."
    }, {
        input: {
            method: "METHOD:REPLY\r\n",
            attendee: "ATTENDEE;RSVP=TRUE;CN=Attendee1;PARTSTAT=TENTATIVE;" +
                      "ROLE=REQ-PARTICIPANT:mailto:attendee1@example.net"},
        expected: "Attendee1 <attendee1@example.net> has accepted your event invitation."
    }, {
        input: {
            method: "METHOD:REPLY\r\n",
            attendee: "ATTENDEE;RSVP=TRUE;CN=Attendee1;PARTSTAT=DECLINED;" +
                      "ROLE=REQ-PARTICIPANT:mailto:attendee1@example.net"},
        expected: "Attendee1 <attendee1@example.net> has declined your event invitation."
    }, {
        input: {
            method: "METHOD:REPLY\r\n",
            attendee: ["ATTENDEE;RSVP=TRUE;CN=Attendee1;PARTSTAT=ACCEPTED;" +
                       "ROLE=REQ-PARTICIPANT:mailto:attendee1@example.net",
                       "ATTENDEE;RSVP=TRUE;CN=Attendee2;PARTSTAT=DECLINED;" +
                       "ROLE=REQ-PARTICIPANT:mailto:attendee2@example.net"].join("\r\n")},
        expected: "Attendee1 <attendee1@example.net> has accepted your event invitation."
    }, {
        input: {
            method: "METHOD:UNSUPPORTED\r\n",
            attendee: null},
        expected: "Event Invitation"
    }, {
        input: {
            method: "",
            attendee: ""},
        expected: "Event Invitation"
    }];
    let i = 0;
    for (let test of data) {
        i++;
        let itipItem = Components.classes["@mozilla.org/calendar/itip-item;1"]
                                 .createInstance(Components.interfaces.calIItipItem);
        let item = getIcs();
        if (test.input.method || test.input.method == "") {
            item = item.replace(/METHOD:REQUEST\r\n/, test.input.method);
        }
        if (test.input.attendee || test.input.attendee == "") {
            item = item.replace(/(ATTENDEE.+(?:\r\n))/, test.input.attendee + "\r\n");
        }
        itipItem.init(item);
        equal(ltn.invitation.getItipHeader(itipItem), test.expected,
              "(test #" + i + ")");
    }
});

add_task(function* createInvitationOverlay_test() {
    let data = [{
        input: {
            description: "DESCRIPTION:Go to https://www.example.net if you can.\r\n"},
        expected: {
            node: "imipHtml-description-content",
            value: "Go to <a xmlns=\"http://www.w3.org/1999/xhtml\" class=\"moz-txt-link-freetext" +
                   "\" href=\"https://www.example.net\">https://www.example.net</a> if you can."}
    }, {
        input: {
            description: "DESCRIPTION:Go to www.example.net if you can.\r\n"},
        expected: {
            node: "imipHtml-description-content",
            value: "Go to <a xmlns=\"http://www.w3.org/1999/xhtml\" class=\"moz-txt-link-abbrevia" +
                   "ted\" href=\"http://www.example.net\">www.example.net</a> if you can."}
    }, {
        input: {
            description: "DESCRIPTION:Or write to mailto:faq@example.net instead.\r\n"},
        expected: {
            node: "imipHtml-description-content",
            value: "Or write to <a xmlns=\"http://www.w3.org/1999/xhtml\" class=\"moz-txt-link-fr" +
                   "eetext\" href=\"mailto:faq@example.net\">mailto:faq@example.net</a> instead."}
    }, {
        input: {
            description: "DESCRIPTION:Or write to faq@example.net instead.\r\n"},
        expected: {
            node: "imipHtml-description-content",
            value: "Or write to <a xmlns=\"http://www.w3.org/1999/xhtml\" class=\"moz-txt-link-ab" +
                   "breviated\" href=\"mailto:faq@example.net\">faq@example.net</a> instead."}
    }, {
        input: {
            description: "DESCRIPTION:It's up to you ;-)\r\n"},
        expected: {
            node: "imipHtml-description-content",
            value: "It's up to you <span xmlns=\"http://www.w3.org/1999/xhtml\" class=\"moz-smile" +
                   "y-s3\" title=\";-)\"><span>;-)</span></span>"}
    }, {
        input: {
            attendee: "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=OPT-PARTICIPANT;CUTYPE=INDIV" +
                      "IDUAL;CN=\"Attendee 1\":mailto:attendee1@example.net\r\n" +

                      "ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED;ROLE=NON-PARTICIPANT;CUTYPE=GROUP:mai" +
                      "lto:attendee2@example.net\r\n" +

                      "ATTENDEE;RSVP=TRUE;PARTSTAT=TENTATIVE;ROLE=REQ-PARTICIPANT;CUTYPE=RESOURCE" +
                      ":mailto:attendee3@example.net\r\n" +

                      "ATTENDEE;RSVP=TRUE;PARTSTAT=DECLINED;ROLE=OPT-PARTICIPANT;DELEGATED-FROM=" +
                      "\"mailto:attendee5@example.net\";CUTYPE=ROOM:mailto:attendee4@example." +
                      "net\r\n" +

                      "ATTENDEE;RSVP=TRUE;PARTSTAT=DELEGATED;ROLE=OPT-PARTICIPANT;DELEGATED-TO=\"" +
                      "mailto:attendee4@example.net\";CUTYPE=UNKNOWN:mailto:attendee5@example.net" +
                      "\r\n" +

                      "ATTENDEE;RSVP=TRUE:mailto:attendee6@example.net\r\n" +

                      "ATTENDEE:mailto:attendee7@example.net\r\n"},
        expected: {
            node: "attendee-table",
            value: "<tr xmlns=\"http://www.w3.org/1999/xhtml\" hidden=\"true\" id=\"attendee-temp" +
                   "late\"><td><p class=\"itip-icon\"/></td><td class=\"attendee-name\"/></tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"Attendee 1 &lt;attendee1@e" +
                   "xample.net&gt; is an optional participant and still needs to decide whether t" +
                   "o attend.\"><td><p class=\"itip-icon\" role=\"OPT-PARTICIPANT\" usertype=\"IN" +
                   "DIVIDUAL\" partstat=\"NEEDS-ACTION\"/></td><td class=\"attendee-name\">Attend" +
                   "ee 1 &lt;attendee1@example.net&gt;</td></tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"Group attendee2@example.ne" +
                   "t is a non participant and has confirmed to attend.\"><td><p class=\"itip-ico" +
                   "n\" role=\"NON-PARTICIPANT\" usertype=\"GROUP\" partstat=\"ACCEPTED\"/></td><" +
                   "td class=\"attendee-name\">attendee2@example.net</td></tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"Resource attendee3@example" +
                   ".net is a required participant and has tentatively confirmed to attend.\"><td" +
                   "><p class=\"itip-icon\" role=\"REQ-PARTICIPANT\" usertype=\"RESOURCE\" partst" +
                   "at=\"TENTATIVE\"/></td><td class=\"attendee-name\">attendee3@example.net</td>" +
                   "</tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"Room attendee4@example.net" +
                   " is an optional participant and has confirmed to not attend.\"><td><p class=" +
                   "\"itip-icon\" role=\"OPT-PARTICIPANT\" usertype=\"ROOM\" partstat=\"DECLINED" +
                   "\"/></td><td class=\"attendee-name\">attendee4@example.net (delegated from at" +
                   "tendee5@example.net)</td></tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"attendee5@example.net is a" +
                   "n optional participant and has delegated the attendance to attendee4@example." +
                   "net.\"><td><p class=\"itip-icon\" role=\"OPT-PARTICIPANT\" usertype=\"UNKNOWN" +
                   "\" partstat=\"DELEGATED\"/></td><td class=\"attendee-name\">attendee5@example" +
                   ".net</td></tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"attendee6@example.net is a" +
                   " required participant and still needs to decide whether to attend.\"><td><p c" +
                   "lass=\"itip-icon\" role=\"REQ-PARTICIPANT\" usertype=\"INDIVIDUAL\" partstat=" +
                   "\"NEEDS-ACTION\"/></td><td class=\"attendee-name\">attendee6@example.net</td>" +
                   "</tr>" +

                   "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"attendee7@example.net is a" +
                   " required participant and still needs to decide whether to attend.\"><td><p c" +
                   "lass=\"itip-icon\" role=\"REQ-PARTICIPANT\" usertype=\"INDIVIDUAL\" partstat=" +
                   "\"NEEDS-ACTION\"/></td><td class=\"attendee-name\">attendee7@example.net</td>" +
                   "</tr>"}
    }, {
        input: {
            organizer: "ORGANIZER;PARTSTAT=ACCEPTED;ROLE=CHAIR;CUTYPE=\"INDIVIDUAL\";CN=\"The Org" +
                       "anizer\":mailto:organizer@example.net\r\n"},
        expected: {
            node: "organizer-table",
            value: "<tr xmlns=\"http://www.w3.org/1999/xhtml\" title=\"The Organizer &lt;organize" +
                   "r@example.net&gt; chairs the event and has confirmed to attend.\"><td><p clas" +
                   "s=\"itip-icon\" role=\"CHAIR\" usertype=\"INDIVIDUAL\" partstat=\"ACCEPTED\"" +
                   "/></td><td class=\"attendee-name\">The Organizer &lt;organizer@example.net&gt" +
                   ";</td></tr>"}
    }];
    let i = 0;
    for (let test of data) {
        i++;
        let item = getIcs();
        for (let attribute of Object.keys(test.input)) {
            switch (attribute) {
                case "description":
                    item = item.replace(/DESCRIPTION:[^\r]+\r\n/, test.input.description);
                    break;
                case "attendee":
                    item = item.replace(/ATTENDEE;[^\r]+\r\n/, test.input.attendee);
                    break;
                case "organizer":
                    item = item.replace(/ORGANIZER;[^\r]+\r\n/, test.input.organizer);
                    break;
            }
        }
        let itipItem = Components.classes["@mozilla.org/calendar/itip-item;1"]
                                 .createInstance(Components.interfaces.calIItipItem);
        itipItem.init(item);
        let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                               .createInstance(Components.interfaces.calIIcsParser);
        parser.parseString(item);
        let dom = ltn.invitation.createInvitationOverlay(parser.getItems({})[0], itipItem);
        let observed = dom.getElementById(test.expected.node).innerHTML;
        // we remove line-breaks and leading white spaces here so we can keep expected test results
        // above more comprehensive
        if (test.expected.node.endsWith("-table")) {
            observed = observed.replace(/(?:\n|\r\n|\r)[ ]{2,}/g, "");
        }
        equal(observed, test.expected.value, "(test #" + i + ")");
    }
});

add_task(function* compareInvitationOverlay_test() {
    // eventually it would make sense to set local timezone to Europe/Berlin to avoid test
    // failures when executing in a different timezone
    function getDom(aInput) {
        let item = getIcs();
        let props = ["attendee", "organizer", "dtstart", "dtend", "summary", "location"];
        for (let prop of props) {
            let copyItem = item;
            if (Object.keys(aInput).includes(prop)) {
                let regex = prop.toUpperCase() +
                            (["summary", "location"].includes(prop) ? ":" : ";") +
                            "[^\r]+\r\n";
                item = item.replace(new RegExp(regex), aInput[prop]);
            }
        }
        let itipItem = Components.classes["@mozilla.org/calendar/itip-item;1"]
                                 .createInstance(Components.interfaces.calIItipItem);
        itipItem.init(item);
        let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                               .createInstance(Components.interfaces.calIIcsParser);
        parser.parseString(item);
        let dom = ltn.invitation.createInvitationOverlay(parser.getItems({})[0], itipItem);
        return cal.xml.serializeDOM(dom);
    }
    let data = [{
        input: {
            previous: {
                location: "LOCATION:This place\r\n"},
            current: {
                location: "LOCATION:Another location\r\n"},
            ignore: ""},
        expected: {
            node: "imipHtml-location-content",
            value: "<span xmlns=\"\" class=\"added\">Another location</span><br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">This place</span>"}
    }, {
        input: {
            previous: {
                summary: "SUMMARY:My invitation\r\n"},
            current: {
                summary: "SUMMARY:My new invitation\r\n"},
            ignore: ""},
        expected: {
            node: "imipHtml-summary-content",
            value: "<span xmlns=\"\" class=\"added\">My new invitation</span><br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">My invitation</span>"}
    }, {
        input: {
            previous: {
                dtstart: "DTSTART;TZID=Europe/Berlin:20150909T130000\r\n",
                dtend: "DTEND;TZID=Europe/Berlin:20150909T140000\r\n"},
            current: {
                dtstart: "DTSTART;TZID=Europe/Berlin:20150909T140000\r\n",
                dtend: "DTEND;TZID=Europe/Berlin:20150909T150000\r\n"},
            ignore: ""},
        expected: {
            // time format is platform dependent, so we use alternative result sets here
            // the first three are to meet configurations running for automated tests, the
            // following are some flavours that may occur - if you get a failure for this test,
            // add your pattern here
            node: "imipHtml-when-content",
            some: ["<span xmlns=\"\" class=\"added\">Wed 9 Sep 2015 02:00 PM – 03:00 PM</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wed 9 Sep 2015 01:00 PM – 02:00 PM</span>",

                   "<span xmlns=\"\" class=\"added\">Wed 9 Sep 2015 2:00 PM – 3:00 PM</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wed 9 Sep 2015 1:00 PM – 2:00 PM</span>",

                   "<span xmlns=\"\" class=\"added\">Wednesday, September 09, 2015 2:00 PM – 3:00 PM</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wednesday, September 09, 2015 1:00 PM – 2:00 PM</span>",

                   // do not change the patterns above unless there are related test failures when
                   // running autometed tests
                   "<span xmlns=\"\" class=\"added\">Wed 09 Sep 2015 2:00 PM – 3:00 PM</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wed 09 Sep 2015 1:00 PM – 2:00 PM</span>",

                   "<span xmlns=\"\" class=\"added\">Wednesday, 09 September, 2015 2:00 PM – 3:00 PM</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wednesday, 09 September, 2015 1:00 PM – 2:00 PM</span>",

                   "<span xmlns=\"\" class=\"added\">Wed 9 Sep 2015 14:00 – 15:00</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wed 9 Sep 2015 13:00 – 14:00</span>",

                   "<span xmlns=\"\" class=\"added\">Wed 09 Sep 2015 14:00 – 15:00</span>" +
                   "<br xmlns=\"\"/>" +
                   "<span xmlns=\"\" class=\"removed\">Wed 09 Sep 2015 13:00 – 14:00</span>"]}
    }, {
        input: {
            previous: {
                organizer: "ORGANIZER:mailto:organizer1@example.net\r\n"},
            current: {
                organizer: "ORGANIZER:mailto:organizer2@example.net\r\n"},
            ignore: ""},
        expected: {
            node: "organizer-table",
            each: ["<span xmlns=\"\" class=\"added\">organizer2@example.net</span>",
                   "<span xmlns=\"\" class=\"removed\">organizer1@example.net</span>"]}
    }, {
        input: {
            previous: {
                attendee: "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;PARTSTAT=NEEDS-ACTION:" +
                          "mailto:attendee1@example.net\r\n" +
                          "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;PARTSTAT=NEEDS-ACTION:" +
                          "mailto:attendee2@example.net\r\n" +
                          "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;PARTSTAT=NEEDS-ACTION:" +
                          "mailto:attendee3@example.net\r\n"},
            current: {
                attendee: "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED:mail" +
                          "to:attendee2@example.net\r\n" +
                          "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;PARTSTAT=NEEDS-ACTION:" +
                          "mailto:attendee3@example.net\r\n" +
                          "ATTENDEE;RSVP=TRUE;CUTYPE=INDIVIDUAL;PARTSTAT=NEEDS-ACTION:" +
                          "mailto:attendee4@example.net\r\n"},
            ignore: ""},
        expected: {
            node: "attendee-table",
            each: ["<span xmlns=\"\" class=\"modified\">attendee2@example.net</span>",
                   "attendee3@example.net",
                   "<span xmlns=\"\" class=\"added\">attendee4@example.net</span>",
                   "<span xmlns=\"\" class=\"removed\">attendee1@example.net</span>"]}
    }];
    // we make sure that the Europe/Berlin timezone and long datetime format is set
    let dateformat = Preferences.get("calendar.date.format", 0);
    let tzlocal = Preferences.get("calendar.timezone.local", "Europe/Berlin");
    Preferences.set("calendar.date.format", 0);
    Preferences.set("calendar.timezone.local", "Europe/Berlin");
    let i = 0;
    for (let test of data) {
        i++;
        let dom1 = getDom(test.input.previous);
        let dom2 = getDom(test.input.current);
        let result = ltn.invitation.compareInvitationOverlay(dom1, dom2, test.input.ignore);
        let dom = cal.xml.parseString(result);
        if (test.expected.node.startsWith("imipHtml")) {
            if ("value" in test.expected && test.expected.value) {
                equal(dom.getElementById(test.expected.node).innerHTML, test.expected.value,
                      "(test #" + i + "): " + test.expected.node);
            } else if ("some" in test.expected && test.expected.some) {
                ok(test.expected.some.includes(dom.getElementById(test.expected.node).innerHTML),
                   "(test #" + i + "): " + test.expected.node);
            }
        } else {
            // this is for testing of an attendee or organizer
            let nodes = dom.getElementById(test.expected.node).getElementsByClassName("attendee-name");
            let j = 0;
            for (let node of nodes) {
                if (node.parentNode.id != "attendee-template") {
                    j++;
                    equal(node.innerHTML, test.expected.each[j - 1],
                          "(test #" + i + "): " +
                          test.expected.node + "(entry #" + j + ")");
                }
            }
            equal(test.expected.each.length, j,
                  "(test #" + i + "): completeness check " + test.expected.node);
        }
    }
    // let's reset setting
    Preferences.set("calendar.date.format", dateformat);
    Preferences.set("calendar.timezone.local", tzlocal);
});

add_task(function* getHeaderSection_test() {
    let data = [{
        input: {
            toList: "recipient@example.net",
            subject: "Invitation: test subject",
            identity: {
                fullName: "Invitation sender",
                email: "sender@example.net",
                replyTo: "no-reply@example.net",
                organization: "Example Net",
                cc: "cc@example.net",
                bcc: "bcc@example.net"}},
        expected: "MIME-version: 1.0\r\n" +
                  "Return-path: no-reply@example.net\r\n" +
                  "From: Invitation sender <sender@example.net>\r\n" +
                  "Organization: Example Net\r\n" +
                  "To: recipient@example.net\r\n" +
                  "Subject: Invitation: test subject\r\n" +
                  "Cc: cc@example.net\r\n" +
                  "Bcc: bcc@example.net\r\n"
    /* TODO: re-enable test case when Bug 1212075 lands
    }, {
        input: {
            toList: "rec1@example.net, Recipient 2 <rec2@example.net>, \"Rec, 3\" <rec3@example.net>",
            subject: "Invitation: test subject",
            identity: {
                fullName: "\"invitation, sender\"",
                email: "sender@example.net",
                replyTo: "no-reply@example.net",
                organization: "Example Net",
                cc: "cc1@example.net, Cc 2 <cc2@example.net>, \"Cc, 3\" <cc3@example.net>",
                bcc: "bcc1@example.net, BCc 2 <bcc2@example.net>, \"Bcc, 3\" <bcc3@example.net>"}},
        expected: "MIME-version: 1.0\r\n" +
                  "Return-path: no-reply@example.net\r\n" +
                  "From: \"invitation, sender\" <sender@example.net>\r\n" +
                  "Organization: Example Net\r\n" +
                  "To: rec1@example.net, Recipient 2 <rec2@example.net>,\r\n \"Rec, 3\" <rec3@example.net>\r\n" +
                  "Subject: Invitation: test subject\r\n" +
                  "Cc: cc1@example.net, Cc 2 <cc2@example.net>, \"Cc, 3\" <cc3@example.net>\r\n" +
                  "Bcc: bcc1@example.net, BCc 2 <bcc2@example.net>, \"Bcc, 3\"\r\n <bcc3@example.net>\r\n"
    */
    }, {
        input: {
            toList: "recipient@example.net",
            subject: "Invitation: test subject",
            identity: {
                email: "sender@example.net"}},
        expected: "MIME-version: 1.0\r\n" +
                  "From: sender@example.net\r\n" +
                  "To: recipient@example.net\r\n" +
                  "Subject: Invitation: test subject\r\n"
    }, {
        input: {
            toList: "Max Müller <mueller@example.net>",
            subject: "Invitation: Diacritis check (üäé)",
            identity: {
                fullName: "René",
                email: "sender@example.net",
                replyTo: "Max & René <no-reply@example.net>",
                organization: "Max & René",
                cc: "René <cc@example.net>",
                bcc: "René <bcc@example.net>"}},
        expected: "MIME-version: 1.0\r\n" +
                  "Return-path: =?UTF-8?Q?Max_&_Ren=c3=a9?= <no-reply@example.net>\r\n" +
                  "From: =?UTF-8?B?UmVuw6k=?= <sender@example.net>\r\n" +
                  "Organization: =?UTF-8?Q?Max_&_Ren=c3=a9?=\r\n" +
                  "To: =?UTF-8?Q?Max_M=c3=bcller?= <mueller@example.net>\r\n" +
                  "Subject: =?UTF-8?Q?Invitation:_Diacritis_check_=28=c3=bc=c3=a4?=\r\n =?UTF-8?B" +
                  "?w6kp?=\r\n" +
                  "Cc: =?UTF-8?B?UmVuw6k=?= <cc@example.net>\r\n" +
                  "Bcc: =?UTF-8?B?UmVuw6k=?= <bcc@example.net>\r\n"
    }];
    let i = 0;
    for (let test of data) {
        i++;
        let identity = MailServices.accounts.createIdentity();
        for (let attribute of Object.keys(test.input.identity)) {
            identity.email = test.input.identity.email || null;
            identity.fullName = test.input.identity.fullName || null;
            identity.replyTo = test.input.identity.replyTo || null;
            identity.organization = test.input.identity.organization || null;
            identity.doCc = test.input.identity.doCc || (test.input.identity.cc);
            identity.doCcList = test.input.identity.cc || null;
            identity.doBcc = test.input.identity.doBcc || (test.input.identity.bcc);
            identity.doBccList = test.input.identity.bcc || null;
        }
        let composeUtils = Components.classes["@mozilla.org/messengercompose/computils;1"]
                                     .createInstance(Components.interfaces.nsIMsgCompUtils);
        let messageId = composeUtils.msgGenerateMessageId(identity);

        let header = ltn.invitation.getHeaderSection(messageId, identity,
                                                     test.input.toList, test.input.subject);
        // we test Date and Message-ID headers separately to avoid false positives
        ok(!!header.match(/Date\:.+(?:\n|\r\n|\r)/),
           "(test #" + i + "): date");
        ok(!!header.match(/Message-ID\:.+(?:\n|\r\n|\r)/),
           "(test #" + i + "): message-id");
        equal(header.replace(/Date\:.+(?:\n|\r\n|\r)/, "")
                    .replace(/Message-ID\:.+(?:\n|\r\n|\r)/, ""),
              test.expected.replace(/Date\:.+(?:\n|\r\n|\r)/, "")
                           .replace(/Message-ID\:.+(?:\n|\r\n|\r)/, ""),
              "(test #" + i + "): all headers");
    }
});

add_task(function* convertFromUnicode_test() {
    let data = [{
        input: {
            charset: "UTF-8",
            text: "müller"},
        expected: "mÃ¼ller"
    }, {
        input: {
            charset: "UTF-8",
            text:"muller"},
        expected: "muller"
    }, {
        input: {
            charset: "UTF-8",
            text:"müller\nmüller"},
        expected: "mÃ¼ller\nmÃ¼ller"
    }, {
        input: {
            charset: "UTF-8",
            text:"müller\r\nmüller"},
        expected: "mÃ¼ller\r\nmÃ¼ller"
    }];
    let i = 0;
    for (let test of data) {
        i++;
        equal(ltn.invitation.convertFromUnicode(test.input.charset, test.input.text), test.expected,
              "(test #" + i + ")");
    }
});

add_task(function* encodeUTF8_test() {
    let data = [{
        input: "müller",
        expected: "mÃ¼ller"
    }, {
        input: "muller",
        expected: "muller"
    }, {
        input: "müller\nmüller",
        expected: "mÃ¼ller\r\nmÃ¼ller"
    }, {
        input: "müller\r\nmüller",
        expected: "mÃ¼ller\r\nmÃ¼ller"
    }, {
        input: "",
        expected: ""
    }];
    let i = 0;
    for (let test of data) {
        i++;
        equal(ltn.invitation.encodeUTF8(test.input), test.expected,
              "(test #" + i + ")");
    }
});

add_task(function* encodeMimeHeader_test() {
    let data = [{
        input: {
            header: "Max Müller <m.mueller@example.net>",
            isEmail: true},
        expected: "=?UTF-8?Q?Max_M=c3=bcller?= <m.mueller@example.net>"
    }, {
        input: {
            header: "Max Mueller <m.mueller@example.net>",
            isEmail: true},
        expected: "Max Mueller <m.mueller@example.net>"
    }, {
        input: {
            header: "Müller & Müller",
            isEmail: false},
        expected: "=?UTF-8?B?TcO8bGxlciAmIE3DvGxsZXI=?="
    }];

    let i = 0;
    for (let test of data) {
        i++;
        equal(ltn.invitation.encodeMimeHeader(test.input.header, test.input.isEmail), test.expected,
              "(test #" + i + ")");
    }
});

add_task(function* getRfc5322FormattedDate_test() {
    let data = {
        input: [{
            dt: null,
            dtz: "America/New_York"
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49 +0100",
            dtz: "America/New_York"
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49 GMT+0100",
            dtz: "America/New_York"
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49 GMT",
            dtz: "America/New_York"
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49",
            dtz: "America/New_York"
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49",
            dtz: null
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49",
            dtz: "UTC"
        }, {
            dt: "Sat, 24 Jan 2015 09:24:49",
            dtz: "floating"
        }],
        expected: /^\w{3}, \d{2} \w{3} \d{4} \d{2}\:\d{2}\:\d{2} [+-]\d{4}$/
    };

    let i = 0;
    let dtz = Preferences.get("calendar.timezone.local", null);
    for (let test of data.input) {
        i++;
        if (test.dtz) {
            Preferences.set("calendar.timezone.local", test.dtz);
        } else {
            Preferences.reset("calendar.timezone.local");
        }
        let dt = test.dt ? new Date(test.dt) : null;
        let r = new RegExp(data.expected);
        ok(r.test(ltn.invitation.getRfc5322FormattedDate(dt)), "(test #" + i + ")");
    }
    Preferences.set("calendar.timezone.local", dtz);
});
