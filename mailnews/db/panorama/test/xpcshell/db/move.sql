CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  parent INTEGER REFERENCES folders(id),
  ordinal INTEGER DEFAULT NULL,
  name TEXT,
  flags INTEGER DEFAULT 0
);

INSERT INTO folders (id, parent, name) VALUES
  (1, 0, 'grandparent'),
  (2, 1, 'left'),
  (3, 1, 'parent'),
  (4, 3, 'a'),
  (5, 4, 'a.1'),
  (6, 4, 'a.2'),
  (7, 3, 'b'),
  (8, 7, 'b.1'),
  (9, 3, 'c'),
  (10, 3, 'd'),
  (11, 10, 'd.1'),
  (12, 11, 'd.1.1'),
  (13, 12, 'd.1.1.1'),
  (14, 1, 'right'),
  (15, 0, 'other root'),
  (16, 15, 'other child');
