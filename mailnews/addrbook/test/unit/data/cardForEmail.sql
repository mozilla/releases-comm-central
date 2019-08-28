-- Address book data for use in various tests.
PRAGMA user_version = 1;

CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER);
CREATE TABLE properties (card TEXT, name TEXT, value TEXT);
CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT);
CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card));

INSERT INTO cards (uid, localId) VALUES
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 1),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 2),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 3),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 4);

INSERT INTO properties (card, name, value) VALUES
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'LastName', 'Email'),
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'DisplayName', 'Empty Email'),
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'FirstName', 'Empty'),
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'AllowRemoteContent', '0'),
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'PopularityIndex', '0'),
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'PreferMailFormat', '0'),
  ('85f4ad83-38fd-4d17-9364-038d11da77e6', 'LastModifiedDate', '0'),

  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'LastName', 'LastName1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Custom4', 'Custom41'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'LastModifiedDate', '1237281794'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WebPage2', 'http://WebPage11'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'NickName', 'NickName1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'DisplayName', 'DisplayName1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkZipCode', 'WorkZipCode1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', '_AimScreenName', 'ScreenName1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkAddress', 'WorkAddress1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomeCountry', 'HomeCountry1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkPhone', 'WorkPhone1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'PrimaryEmail', 'PrimaryEmail1@test.invalid'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomeAddress', 'HomeAddress11'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'LowercasePrimaryEmail', 'primaryemail1@test.invalid'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkCity', 'WorkCity1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'SecondEmail', 'SecondEmail1Ð@test.invalid'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomeZipCode', 'HomeZipCode1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Custom3', 'Custom31'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'FaxNumber', 'FaxNumber1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Custom1', 'Custom11'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomePhone', 'HomePhone1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'FirstName', 'FirstName1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomeCity', 'HomeCity1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'PagerNumber', 'PagerNumber1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'CellularNumber', 'CellularNumber1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkAddress2', 'WorkAddress21'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkState', 'WorkState1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomeAddress2', 'HomeAddress21'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WebPage1', 'http://WebPage21'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Notes', 'Notes1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Custom2', 'Custom21'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Department', 'Department1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'WorkCountry', 'WorkCountry1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'HomeState', 'HomeState1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'JobTitle', 'JobTitle1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'Company', 'Organization1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'PopularityIndex', '0'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'AllowRemoteContent', '1'),
  ('fdcb9131-38ec-4daf-a4a7-2ef115f562a7', 'PreferMailFormat', '0'),

  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'LastModifiedDate', '1245128765'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'NickName', 'johnd'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'DisplayName', 'John Doe'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'LastName', 'Doe'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'PrimaryEmail', 'john.doe@mailinator.invalid'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'FirstName', 'John'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'LowercasePrimaryEmail', 'john.doe@mailinator.invalid'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'AllowRemoteContent', '0'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'PopularityIndex', '0'),
  ('61c3b8fe-69d0-4a11-a970-ff381ae82d95', 'PreferMailFormat', '0'),

  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'NickName', 'janed'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'DisplayName', 'Jane Doe'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'LastName', 'Doe'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'PrimaryEmail', 'jane.doe@mailinator.invalid'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'FirstName', 'Jane'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'LowercasePrimaryEmail', 'jane.doe@mailinator.invalid'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'LastModifiedDate', '0'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'AllowRemoteContent', '0'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'PopularityIndex', '0'),
  ('b73bffd5-850d-4a59-8c72-12272d2616a6', 'PreferMailFormat', '0');
