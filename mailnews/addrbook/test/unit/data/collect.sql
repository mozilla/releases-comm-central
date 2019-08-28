-- Collection address book for use in test_collection_2.js.
PRAGMA user_version = 1;

CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER);
CREATE TABLE properties (card TEXT, name TEXT, value TEXT);
CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT);
CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card));

INSERT INTO cards (uid, localId) VALUES
  ('28fd662c-1662-4b02-8950-12dd131a1116', 1);

INSERT INTO properties (card, name, value) VALUES
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'DisplayName', 'Other Book'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'LastName', 'Book'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'PrimaryEmail', 'other@book.invalid'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'FirstName', 'Other'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'LowercasePrimaryEmail', 'other@book.invalid'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'LastModifiedDate', '0'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'AllowRemoteContent', '0'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'PopularityIndex', '0'),
  ('28fd662c-1662-4b02-8950-12dd131a1116', 'PreferMailFormat', '0');
