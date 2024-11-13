CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  parent INTEGER REFERENCES folders(id),
  ordinal INTEGER DEFAULT NULL,
  name TEXT,
  flags INTEGER DEFAULT 0
);

-- These id values are deliberately out-of-order. It shouldn't matter.
INSERT INTO folders (id, parent, name) VALUES
  (5, 0, 'server1'),
  (1, 5, 'INBOX'),
  (3, 5, 'Sent'),
  (9, 5, 'Junk'),
  (7, 5, 'Trash'),
  (4, 0, 'server2'),
  (6, 4, 'folder'),
  (2, 6, 'sub1'),
  (8, 2, 'sub2');
