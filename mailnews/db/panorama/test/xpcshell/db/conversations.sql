INSERT INTO folders (id, parent, name) VALUES
  (1, 0, 'server1'),
  (2, 1, 'folderA'),
  (3, 1, 'folderB'),
  (4, 1, 'folderC');

INSERT INTO messages (id, folderId, threadId, threadParent, messageId) VALUES
  (1, 2, 1, 0, 'message1@invalid'),
  (2, 2, 7, 7, 'message2@invalid'),
  (3, 3, 3, 0, 'message3@invalid'),
  (4, 3, 7, 7, 'message4@invalid'),
  (5, 3, 3, 3, 'message5@invalid'),
  (6, 3, 3, 5, 'message6@invalid'),
  (7, 4, 7, 0, 'message7@invalid'),
  (8, 4, 8, 0, 'message8@invalid'),
  (9, 4, 9, 0, 'message9@invalid'),
  (10, 4, 10, 0, 'message10@invalid');
