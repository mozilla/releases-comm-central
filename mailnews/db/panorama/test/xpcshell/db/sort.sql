CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  parent INTEGER REFERENCES folders(id),
  ordinal INTEGER DEFAULT NULL,
  name TEXT
);

-- These id values are deliberately out-of-order. It shouldn't matter.
INSERT INTO folders (id, parent, ordinal, name) VALUES
  (7, 0, null, 'parent1'),
  (10, 7, null, 'echo'),
  (9, 7, null, 'foxtrot'),
  (15, 7, null, 'golf'),
  (3, 7, null, 'hotel'),

  (12, 0, null, 'parent2'),
  (6, 12, 3, 'kilo'),
  (2, 12, 1, 'lima'),
  (14, 12, 4, 'november'),
  (8, 12, 2, 'quebec'),

  (11, 0, null, 'parent3'),
  (4, 11, 3, 'sierra'),
  (13, 11, null, 'tango'),
  (1, 11, null, 'uniform'),
  (5, 11, 2, 'whisky');
