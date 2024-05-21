PRAGMA user_version = 1;

CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER);
CREATE TABLE properties (card TEXT, name TEXT, value TEXT);
CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT);
CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card));

INSERT INTO cards (uid, localId) VALUES
  ('f6f1fd47-8599-45a7-9638-30e7582f6150', 1);

INSERT INTO properties (card, name, value) VALUES
  ('f6f1fd47-8599-45a7-9638-30e7582f6150', 'LastName', 'one'),
  ('f6f1fd47-8599-45a7-9638-30e7582f6150', 'DisplayName', 'contact number one'),
  ('f6f1fd47-8599-45a7-9638-30e7582f6150', 'FirstName', 'contact'),
  ('f6f1fd47-8599-45a7-9638-30e7582f6150', 'PrimaryEmail', 'contact1@invalid');

INSERT INTO lists (uid, localId, name, nickName, description) VALUES
  ('5be7793a-1edc-4ca2-ba73-3089b02a79c3', 1, 'list', 'nick name', 'a list of cards');

INSERT INTO list_cards (list, card) VALUES
  ('5be7793a-1edc-4ca2-ba73-3089b02a79c3', 'f6f1fd47-8599-45a7-9638-30e7582f6150');
