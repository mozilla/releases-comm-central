-- Data for test_bug1790339.js. There's two events here, one saved with folded ICAL strings
-- (as libical would do) and one with unfolded ICAL strings (as ical.js does).
--
-- This file contains significant white-space and is deliberately saved with Windows line-endings.

CREATE TABLE cal_calendar_schema_version (version INTEGER);
CREATE TABLE cal_attendees (
  item_id TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  cal_id TEXT,
  icalString TEXT);
CREATE TABLE cal_recurrence (item_id TEXT, cal_id TEXT, icalString TEXT);
CREATE TABLE cal_properties (
  item_id TEXT,
  key TEXT,
  value BLOB,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  cal_id TEXT);
CREATE TABLE cal_events (
  cal_id TEXT,
  id TEXT,
  time_created INTEGER,
  last_modified INTEGER,
  title TEXT,
  priority INTEGER,
  privacy TEXT,
  ical_status TEXT,
  flags INTEGER,
  event_start INTEGER,
  event_end INTEGER,
  event_stamp INTEGER,
  event_start_tz TEXT,
  event_end_tz TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  alarm_last_ack INTEGER,
  offline_journal INTEGER);
CREATE TABLE cal_todos (
  cal_id TEXT,
  id TEXT,
  time_created INTEGER,
  last_modified INTEGER,
  title TEXT,
  priority INTEGER,
  privacy TEXT,
  ical_status TEXT,
  flags INTEGER,
  todo_entry INTEGER,
  todo_due INTEGER,
  todo_completed INTEGER,
  todo_complete INTEGER,
  todo_entry_tz TEXT,
  todo_due_tz TEXT,
  todo_completed_tz TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  alarm_last_ack INTEGER,
  todo_stamp INTEGER,
  offline_journal INTEGER);
CREATE TABLE cal_tz_version (version TEXT);
CREATE TABLE cal_metadata (cal_id TEXT, item_id TEXT, value BLOB);
CREATE TABLE cal_alarms (
  cal_id TEXT,
  item_id TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  icalString TEXT);
CREATE TABLE cal_relations (
  cal_id TEXT,
  item_id TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  icalString TEXT);
CREATE TABLE cal_attachments (
  item_id TEXT,
  cal_id TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  icalString TEXT);
CREATE TABLE cal_parameters (
  cal_id TEXT,
  item_id TEXT,
  recurrence_id INTEGER,
  recurrence_id_tz TEXT,
  key1 TEXT,
  key2 TEXT,
  value BLOB);

INSERT INTO cal_calendar_schema_version VALUES (23);

INSERT INTO cal_events (
  cal_id,
  id,
  time_created,
  last_modified,
  title,
  flags,
  event_start,
  event_end,
  event_stamp,
  event_start_tz,
  event_end_tz
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-111111111111',
  1663028606000000,
  1663030277000000,
  'test',
  86,
  1663032600000000,
  1663037100000000,
  1663030277000000,
  'Pacific/Auckland',
  'Pacific/Auckland'
),  (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-222222222222',
  1663028606000000,
  1663030277000000,
  'test',
  86,
  1663032600000000,
  1663037100000000,
  1663030277000000,
  'Pacific/Auckland',
  'Pacific/Auckland'
);

INSERT INTO cal_attachments (cal_id, item_id, icalString) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-111111111111',
  'ATTACH:https://ftp.mozilla.org/pub/thunderbird/nightly/latest-comm-central
 /thunderbird-106.0a1.en-US.linux-x86_64.tar.bz2'
), (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-222222222222',
  'ATTACH:https://ftp.mozilla.org/pub/thunderbird/nightly/latest-comm-central/thunderbird-106.0a1.en-US.linux-x86_64.tar.bz2'
);

INSERT INTO cal_attendees (cal_id, item_id, icalString) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-111111111111',
  'ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;CN=Test Person:mailto:
 test@example.com'
), (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-222222222222',
  'ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;CN=Test Person:mailto:test@example.com'
);

INSERT INTO cal_recurrence (cal_id, item_id, icalString) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-111111111111',
  'RRULE:FREQ=WEEKLY;UNTIL=20220913T013000Z;INTERVAL=22;BYDAY=MO,TU,WE,TH,FR,
 SA,SU'
), (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-222222222222',
  'RRULE:FREQ=WEEKLY;UNTIL=20220913T013000Z;INTERVAL=22;BYDAY=MO,TU,WE,TH,FR,SA,SU'
);

INSERT INTO cal_relations (cal_id, item_id, icalString) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-111111111111',
  'RELATED-TO;RELTYPE=SIBLING:19960401-080045-4000F192713@
 example.com'
), (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-222222222222',
  'RELATED-TO;RELTYPE=SIBLING:19960401-080045-4000F192713@example.com'
);

INSERT INTO cal_alarms (cal_id, item_id, icalString) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-111111111111',
  'BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT5M
DESCRIPTION:Make sure you don''t miss this very very important event. It''s
  essential that you don''t forget.
END:VALARM
'
), (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-222222222222',
  'BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT5M
DESCRIPTION:Make sure you don''t miss this very very important event. It''s essential that you don''t forget.
END:VALARM
'
);
