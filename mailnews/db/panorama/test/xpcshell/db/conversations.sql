INSERT INTO folders (id, parent, name) VALUES
  (1, 0, 'server1'),
  (2, 1, 'folderA'),
  (3, 1, 'folderB'),
  (4, 1, 'folderC');

INSERT INTO messages (id, folderId, threadId, threadParent, messageId, date) VALUES
  (1, 2, 1, 0, 'message1@invalid', UNIXEPOCH('2025-09-01') * 1000000),
  (2, 2, 7, 7, 'message2@invalid', UNIXEPOCH('2025-09-02') * 1000000),
  (3, 3, 3, 0, 'message3@invalid', UNIXEPOCH('2025-09-03') * 1000000),
  (4, 3, 7, 7, 'message4@invalid', UNIXEPOCH('2025-09-04') * 1000000),
  (5, 3, 3, 3, 'message5@invalid', UNIXEPOCH('2025-09-05') * 1000000),
  (6, 3, 3, 5, 'message6@invalid', UNIXEPOCH('2025-09-06') * 1000000),
  (7, 4, 7, 0, 'message7@invalid', UNIXEPOCH('2025-01-07') * 1000000),
  (8, 4, 8, 0, 'message8@invalid', UNIXEPOCH('2025-09-08') * 1000000),
  (9, 4, 9, 0, 'message9@invalid', UNIXEPOCH('2025-09-09') * 1000000),
  (10, 4, 10, 0, 'message10@invalid', UNIXEPOCH('2025-09-10') * 1000000);
