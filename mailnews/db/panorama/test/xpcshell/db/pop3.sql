INSERT INTO folders (id, parent, name, flags) VALUES
  (1, 0, 'server1', 0),
  (2, 1, 'Inbox', 4100),
  (3, 1, 'Trash', 260);

INSERT INTO folder_properties (id, name, value) VALUES
  (2, 'MRUTime', 1794467999);

INSERT INTO messages (id, folderId, messageId, date, sender, recipients, subject, flags) VALUES
  (1, 2, '0@made.up.invalid', DATE_0000000, '"Andy Anway" <andy@anway.invalid>', '"Bob Bell" <bob@bell.invalid>', 'Big Meeting Today', 65536),
  (2, 2, '1@made.up.invalid', DATE_1000000, '"Chris Clarke" <chris@clarke.invalid>', '"David Davol" <david@davol.invalid>', 'Small Party Tomorrow', 65536);

INSERT INTO message_properties (id, name, value) VALUES
  (1, 'messageSize', SIZE_0),
  (1, 'dateReceived', DATE_0),
  (1, 'storeToken', 'STORE_TOKEN_0'),
  (1, 'lineCount', 3),
  (2, 'messageSize', SIZE_1),
  (2, 'dateReceived', DATE_1),
  (2, 'storeToken', 'STORE_TOKEN_1'),
  (2, 'lineCount', 3);
