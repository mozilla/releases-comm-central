CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent INTEGER REFERENCES folders(id),
  ordinal INTEGER DEFAULT NULL,
  name TEXT,
  flags INTEGER DEFAULT 0
) STRICT;

INSERT INTO folders (id, parent, name) VALUES
  (1, 0, 'server1'),
  (2, 1, 'folderA'),
  (3, 1, 'folderB'),
  (4, 1, 'folderC');

CREATE TABLE folder_properties(
  id INTEGER REFERENCES folders(id),
  name TEXT,
  value ANY,
  PRIMARY KEY(id, name)
) STRICT;

CREATE TABLE messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folderId INTEGER REFERENCES folders(id),
  messageId TEXT,
  date INTEGER,
  sender TEXT,
  subject TEXT,
  flags INTEGER,
  tags TEXT
) STRICT;

CREATE INDEX messages_date ON messages(date);

INSERT INTO messages (id, folderId, date, sender, subject, flags, tags) VALUES
  (1, 2, UNIXEPOCH('2019-02-01') * 1000000, '"Tara White" <tara@white.invalid>', 'Fundamental empowering pricing structure', 0, ''),
  (2, 2, UNIXEPOCH('2019-09-14') * 1000000, '"Lydia Rau" <lydia@rau.invalid>', 'Networked even-keeled forecast', 0, '$label1'),
  (3, 2, UNIXEPOCH('2019-11-02') * 1000000, '"Frederick Rolfson" <frederick@rolfson.invalid>', 'Streamlined bandwidth-monitored help-desk', 5, '$label1 $label2'),
  (4, 2, UNIXEPOCH('2019-11-03T12:34:56Z') * 1000000, '"Eliseo Bauch" <eliseo@bauch.invalid>', 'Proactive intermediate collaboration', 5, ''),
  (5, 4, UNIXEPOCH('2023-04-10') * 1000000, '"Hope Bosco" <hope@bosco.invalid>', 'Universal 5th generation conglomeration', 1, ''),
  (6, 4, UNIXEPOCH('2023-05-13') * 1000000, '"Kip Mann" <kip@mann.invalid>', 'Self-enabling clear-thinking archive', 1, ''),
  (7, 4, UNIXEPOCH('2023-06-26') * 1000000, '"Abe Koepp" <abe@koepp.invalid>', 'Enterprise-wide mission-critical middleware', 0, ''),
  (8, 4, UNIXEPOCH('2023-08-06T06:02:00Z') * 1000000, '"Edgar Stokes" <edgar@stokes.invalid>', 'Balanced static project', 0, '$label1'),
  (9, 4, UNIXEPOCH('2023-08-14') * 1000000, '"Neal Jast" <neal@jast.invalid>', 'Virtual solution-oriented knowledge user', 0, ''),
  (10, 4, UNIXEPOCH('2023-09-14') * 1000000, '"Christian Murray" <christian@murray.invalid>', 'Distributed mobile access', 5, '');

CREATE TABLE message_properties(
  id INTEGER REFERENCES messages(id),
  name TEXT,
  value ANY,
  PRIMARY KEY(id, name)
) STRICT;
