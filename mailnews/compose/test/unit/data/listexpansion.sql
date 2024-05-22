-- Address book with nested mailing lists for use in test_expandMailingLists.js.
PRAGMA user_version = 1;

CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER);
CREATE TABLE properties (card TEXT, name TEXT, value TEXT);
CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT);
CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card));

INSERT INTO cards (uid, localId) VALUES
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 1), -- homer
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 2), -- marge
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 3), -- bart
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 4), -- lisa
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 5), -- maggie
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', 6), --simpson
  ('18204ef9-e4e3-4cd5-9981-604c69bbb9ee', 7), --marge
  ('ad305609-3535-4d51-8c96-cd82d93aed46', 8), --family
  ('4808121d-ebad-4564-864d-8f1149aa053b', 9), --kids
  ('4926ff7a-e929-475a-8aa8-2baac994390c', 10), --parents
  ('84fa4513-9b60-4379-ade7-1e4b48d67c84', 11), --older-kids
  ('8e88b9a4-2500-48e0-bcea-b1fa4eab6b72', 12), --bad-kids
  ('34e60324-4fb6-4f10-ab1b-333b07680228', 13); --bad-younger-kids

INSERT INTO properties (card, name, value) VALUES
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'PrimaryEmail', 'homer@example.com'),
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'PhotoType', 'generic'),
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'LowercasePrimaryEmail', 'homer@example.com'),
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'DisplayName', 'Simpson'),
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'LastModifiedDate', '1473722922'),
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'PopularityIndex', '0'),
  ('813155c6-924d-4751-95d0-70d8e64f16bc', 'PreferMailFormat', '0'),

  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'DisplayName', 'Marge'),
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'PrimaryEmail', 'marge@example.com'),
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'PhotoType', 'generic'),
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'LowercasePrimaryEmail', 'marge@example.com'),
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'LastModifiedDate', '1473723020'),
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'PopularityIndex', '0'),
  ('b2cc8395-d959-45e4-9516-17457adb16fa', 'PreferMailFormat', '0'),

  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'PhotoType', 'generic'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'PopularityIndex', '0'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'PreferMailFormat', '0'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'DisplayName', 'Bart'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'PrimaryEmail', 'bart@foobar.invalid'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'LowercasePrimaryEmail', 'bart@foobar.invalid'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'SecondEmail', 'bart@example.com'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'LowercaseSecondEmail', 'bart@example.com'),
  ('979f194e-49f2-4bbb-b364-598cdc6a7d11', 'LastModifiedDate', '1473716192'),

  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'PrimaryEmail', 'lisa@example.com'),
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'PhotoType', 'generic'),
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'LowercasePrimaryEmail', 'lisa@example.com'),
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'DisplayName', 'lisa@example.com'),
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'PopularityIndex', '0'),
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'PreferMailFormat', '0'),
  ('4dd13a79-b70c-4b43-bdba-bacd4e977c1b', 'LastModifiedDate', '0'),

  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'DisplayName', 'Maggie'),
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'LastModifiedDate', '1473723047'),
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'PrimaryEmail', 'maggie@example.com'),
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'PhotoType', 'generic'),
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'LowercasePrimaryEmail', 'maggie@example.com'),
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'PopularityIndex', '0'),
  ('c96402d7-1c7b-4242-a35c-b92c8ec9dfa2', 'PreferMailFormat', '0'),

  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', 'DisplayName', 'simpson'),
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', 'PrimaryEmail', 'simpson'),
  ('18204ef9-e4e3-4cd5-9981-604c69bbb9ee', 'DisplayName', 'marge'),
  ('18204ef9-e4e3-4cd5-9981-604c69bbb9ee', 'PrimaryEmail', 'marge'),
  ('ad305609-3535-4d51-8c96-cd82d93aed46', 'DisplayName', 'family'),
  ('ad305609-3535-4d51-8c96-cd82d93aed46', 'PrimaryEmail', 'family'),
  ('4808121d-ebad-4564-864d-8f1149aa053b', 'DisplayName', 'kids'),
  ('4808121d-ebad-4564-864d-8f1149aa053b', 'PrimaryEmail', 'kids'),
  ('4926ff7a-e929-475a-8aa8-2baac994390c', 'DisplayName', 'parents'),
  ('4926ff7a-e929-475a-8aa8-2baac994390c', 'PrimaryEmail', 'parents'),
  ('84fa4513-9b60-4379-ade7-1e4b48d67c84', 'PrimaryEmail', 'older-kids'),
  ('84fa4513-9b60-4379-ade7-1e4b48d67c84', 'DisplayName', 'older-kids'),
  ('8e88b9a4-2500-48e0-bcea-b1fa4eab6b72', 'DisplayName', 'bad-kids'),
  ('8e88b9a4-2500-48e0-bcea-b1fa4eab6b72', 'PrimaryEmail', 'bad-kids'),
  ('34e60324-4fb6-4f10-ab1b-333b07680228', 'DisplayName', 'bad-younger-kids'),
  ('34e60324-4fb6-4f10-ab1b-333b07680228', 'PrimaryEmail', 'bad-younger-kids');

INSERT INTO lists (uid, localId, name, nickName, description) VALUES
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', 1, 'simpson', '', ''),
  ('18204ef9-e4e3-4cd5-9981-604c69bbb9ee', 2, 'marge', '', 'marges own list'),
  ('ad305609-3535-4d51-8c96-cd82d93aed46', 3, 'family', '', ''),
  ('4808121d-ebad-4564-864d-8f1149aa053b', 4, 'kids', '', ''),
  ('4926ff7a-e929-475a-8aa8-2baac994390c', 5, 'parents', '', ''),
  ('84fa4513-9b60-4379-ade7-1e4b48d67c84', 6, 'older-kids', '', ''),
  ('8e88b9a4-2500-48e0-bcea-b1fa4eab6b72', 7, 'bad-kids', '', ''),
  ('34e60324-4fb6-4f10-ab1b-333b07680228', 8, 'bad-younger-kids', '', '');

INSERT INTO list_cards (list, card) VALUES
  -- simpson
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', '813155c6-924d-4751-95d0-70d8e64f16bc'), -- homer
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', 'b2cc8395-d959-45e4-9516-17457adb16fa'), -- marge
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', '979f194e-49f2-4bbb-b364-598cdc6a7d11'), -- bart
  ('5ec12f1d-7ee9-403c-a617-48596dacbc18', '4dd13a79-b70c-4b43-bdba-bacd4e977c1b'), -- lisa
  -- marge
  ('18204ef9-e4e3-4cd5-9981-604c69bbb9ee', '813155c6-924d-4751-95d0-70d8e64f16bc'), -- homer
  ('18204ef9-e4e3-4cd5-9981-604c69bbb9ee', 'b2cc8395-d959-45e4-9516-17457adb16fa'), -- marge
  -- family
  ('ad305609-3535-4d51-8c96-cd82d93aed46', '4926ff7a-e929-475a-8aa8-2baac994390c'), -- parents
  ('ad305609-3535-4d51-8c96-cd82d93aed46', '4808121d-ebad-4564-864d-8f1149aa053b'), -- kids
  -- parents
  ('4926ff7a-e929-475a-8aa8-2baac994390c', '813155c6-924d-4751-95d0-70d8e64f16bc'), -- homer
  ('4926ff7a-e929-475a-8aa8-2baac994390c', 'b2cc8395-d959-45e4-9516-17457adb16fa'), -- marge
  ('4926ff7a-e929-475a-8aa8-2baac994390c', '4926ff7a-e929-475a-8aa8-2baac994390c'), -- parents
  -- kids
  ('4808121d-ebad-4564-864d-8f1149aa053b', '84fa4513-9b60-4379-ade7-1e4b48d67c84'), -- older-kids
  ('4808121d-ebad-4564-864d-8f1149aa053b', 'c96402d7-1c7b-4242-a35c-b92c8ec9dfa2'), -- maggie
  -- older-kids
  ('84fa4513-9b60-4379-ade7-1e4b48d67c84', '4dd13a79-b70c-4b43-bdba-bacd4e977c1b'), -- lisa
  ('84fa4513-9b60-4379-ade7-1e4b48d67c84', '979f194e-49f2-4bbb-b364-598cdc6a7d11'), -- bart
  -- bad-kids
  ('8e88b9a4-2500-48e0-bcea-b1fa4eab6b72', '84fa4513-9b60-4379-ade7-1e4b48d67c84'), -- older-kids
  ('8e88b9a4-2500-48e0-bcea-b1fa4eab6b72', '34e60324-4fb6-4f10-ab1b-333b07680228'), -- bad-younger-kids
  -- bad-younger-kids
  ('34e60324-4fb6-4f10-ab1b-333b07680228', 'c96402d7-1c7b-4242-a35c-b92c8ec9dfa2'), -- maggie
  ('34e60324-4fb6-4f10-ab1b-333b07680228', '8e88b9a4-2500-48e0-bcea-b1fa4eab6b72'); -- bad-kids
