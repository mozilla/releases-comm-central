-- Address book with remote content permissions for use in test_accountMigration.js.
PRAGMA user_version = 1;

CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER);
CREATE TABLE properties (card TEXT, name TEXT, value TEXT);
CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT);
CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card));

INSERT INTO cards (uid, localId) VALUES
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 1),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 2),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 3);

INSERT INTO properties (card, name, value) VALUES
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'PrimaryEmail', 'no@test.invalid'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'PhotoType', 'generic'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'LowercasePrimaryEmail', 'no@test.invalid'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'PopularityIndex', '0'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'PreferMailFormat', '0'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'LastModifiedDate', '0'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'PreferDisplayName', '1'),
  ('f36c4b94-fbab-4cd6-b175-bf8242e6e757', 'AllowRemoteContent', '0'),

  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'PrimaryEmail', 'yes@test.invalid'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'PhotoType', 'generic'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'LowercasePrimaryEmail', 'yes@test.invalid'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'PopularityIndex', '0'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'PreferMailFormat', '0'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'LastModifiedDate', '0'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'PreferDisplayName', '1'),
  ('7ecf5197-87cd-4633-8fcb-bf4ed8f6239e', 'AllowRemoteContent', '0'),

  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'LastModifiedDate', '1397383824'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'PrimaryEmail', 'yes@test.invalid'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'PhotoType', 'generic'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'SecondEmail', 'yes2@test.invalid'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'LowercasePrimaryEmail', 'yes@test.invalid'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'PopularityIndex', '0'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'PreferMailFormat', '0'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'PreferDisplayName', '1'),
  ('90a1de3d-0f5d-4352-b927-60ee8205ac8f', 'AllowRemoteContent', '1');
