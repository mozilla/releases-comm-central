CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  parent INTEGER REFERENCES folders(id),
  ordinal INTEGER DEFAULT NULL,
  name TEXT,
  flags INTEGER DEFAULT 0
);

-- These id values are deliberately out-of-order. It shouldn't matter.
INSERT INTO folders (id, parent, ordinal, name) VALUES
  (7, 0, null, 'parent1'),
  (10, 7, null, 'ëcho'),
  (9, 7, null, 'Foxtrot'),
  (15, 7, null, 'golf'),
  (3, 7, null, 'Hotel'),

  (12, 0, null, 'parent2'),
  (6, 12, 3, 'kilo'),
  (2, 12, 1, 'Lima'),
  (14, 12, 4, 'November'),
  (8, 12, 2, 'Quebec'),

  (11, 0, null, 'parent3'),
  (4, 11, 3, 'sierra'),
  (13, 11, null, 'Tango'),
  (1, 11, null, 'Uniform'),
  (5, 11, 2, 'whisky');
