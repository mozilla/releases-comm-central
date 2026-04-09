/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Tests that we can read Mork (.msf) data. */

var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);
var { MorkParser } = ChromeUtils.importESModule(
  "resource:///modules/MorkParser.sys.mjs"
);

add_task(async function testReadMSF() {
  const path = do_get_file("../../../data/love.msf").path;
  const msfData = await IOUtils.read(path);
  const msf = MailStringUtils.uint8ArrayToByteString(msfData);
  const parsed = new MorkParser().parseContent(msf);

  Assert.ok(Array.isArray(parsed), "should get array data");

  // Get the specific table containing message headers
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];
  Assert.ok(Array.isArray(msgTable), "messages table should be an array");

  // Find the message in the table
  const msgRow = msgTable.find(row => row["@id"] === "1");
  Assert.ok(msgRow, "should find the target message row");
  Assert.equal(
    msgRow["message-id"],
    "fe06cac4-18ed-43aa-98a9-ee358e82b368@example.com"
  );
});

add_task(async function testReadMSFWithJSON() {
  const path = do_get_file("../../../data/withjson.msf").path;
  const msfData = await IOUtils.read(path);
  const msf = MailStringUtils.uint8ArrayToByteString(msfData);
  const parsed = new MorkParser().parseContent(msf);

  Assert.ok(Array.isArray(parsed), "should get array data");

  // Column states are stored in the folder info table, not the messages table

  const folderInfoTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:dbfolderinfo:all"
  );
  const folderInfoTable = folderInfoTableObj ? folderInfoTableObj.data : [];
  Assert.ok(
    Array.isArray(folderInfoTable),
    "folder info table should be an array"
  );

  // The new MorkParser automatically unpacks embedded JSON (like columnStates)
  const statesRow = folderInfoTable.find(row => row.columnStates);
  Assert.ok(statesRow, "should find the row with columnStates");
  Assert.equal(statesRow.columnStates.selectCol.visible, false);

  // Check the messages table for the specific message
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];
  Assert.ok(Array.isArray(msgTable), "messages table should be an array");

  const msgRow = msgTable.find(row => row["@id"] === "43");
  Assert.ok(msgRow, "should find the ex.sqlite message row");
  Assert.equal(msgRow["message-id"], "ex.sqlite@example");
});

add_task(async function testAngleBracketAndLinebreakBug() {
  // Construct a minimal MSF payload mimicking the bug conditions:
  // 1. A value containing an unescaped angle bracket (->)
  // 2. A dictionary pair with a hard linebreak between the hex ID (DB) and the value
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)>
<(8A=Test -> Inbox)(DB
 =Test POP3)>
{1:^80 {(k^96:c)(s=9)}
  [1(^81^8A)]
  [2(^81^DB)]
}`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  // Verify the unescaped angle bracket (> ) did not truncate the block
  const msg1 = msgTable.find(row => row["@id"] === "1");
  Assert.equal(
    msg1.subject,
    "Test -> Inbox",
    "Subjects with angle brackets should parse perfectly"
  );

  // Verify the linebreak between the ID (DB) and the value was handled
  const msg2 = msgTable.find(row => row["@id"] === "2");
  Assert.equal(
    msg2.subject,
    "Test POP3",
    "Values with linebreaks before the assignment should parse perfectly"
  );
});

add_task(async function testDoubleSlashInValueBug() {
  // Construct a minimal MSF payload mimicking the double-slash bug:
  // 1. A subject value containing a URL (https://...)
  // 2. A subject value containing arbitrary text with a double slash
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)>
<(8A=https://bugzilla.mozilla.org)(8B=Meeting // Updates)>
{1:^80 {(k^96:c)(s=9)}
  [1(^81^8A)]
  [2(^81^8B)]
}`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  // Verify that the URL with a double slash was not truncated
  const msg1 = msgTable.find(row => row["@id"] === "1");
  Assert.ok(msg1, "Row 1 should be parsed successfully");
  Assert.equal(
    msg1.subject,
    "https://bugzilla.mozilla.org",
    "URLs containing double slashes (//) should not be truncated"
  );

  // Verify that regular text with a double slash was not truncated
  const msg2 = msgTable.find(row => row["@id"] === "2");
  Assert.ok(msg2, "Row 2 should be parsed successfully");
  Assert.equal(
    msg2.subject,
    "Meeting // Updates",
    "Values containing double slashes (//) should not be truncated"
  );
});

add_task(async function testBracketInValueBug() {
  // Construct a minimal MSF payload mimicking the bracket bug:
  // 1. A value consisting entirely of bracketed text (like an IP)
  // 2. A value containing bracketed text inside a longer string
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)>
<(8A=[127.0.0.1])(8B=Received from [unix socket] by server)>
{1:^80 {(k^96:c)(s=9)}
  [1(^81^8A)]
  [2(^81^8B)]
}`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  // The most critical assertion: ensure the parser didn't spawn phantom rows
  // out of the bracketed strings in the values.
  Assert.equal(
    msgTable.length,
    2,
    "Should only parse the 2 explicit rows, safely ignoring brackets inside dictionary values"
  );

  // Verify the literal bracketed IP was successfully preserved as text
  const msg1 = msgTable.find(row => row["@id"] === "1");
  Assert.ok(msg1, "Row 1 should be parsed successfully");
  Assert.equal(
    msg1.subject,
    "[127.0.0.1]",
    "Values consisting of brackets should be parsed exactly as literal text"
  );

  // Verify the embedded brackets were preserved
  const msg2 = msgTable.find(row => row["@id"] === "2");
  Assert.ok(msg2, "Row 2 should be parsed successfully");
  Assert.equal(
    msg2.subject,
    "Received from [unix socket] by server",
    "Values containing brackets should not disrupt the parser state machine"
  );
});

add_task(async function testAdjacentTableAndRowBug() {
  // Construct a minimal MSF payload mimicking the adjacent table/row bug:
  // The old parser's regex would accidentally consume the '[' if a row
  // immediately followed a table's closing brace like `}[A:^80]`.
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)>
<(8A=Adjacent Row Test)>
{7:^80 {(k^97:c)(s=9)7:m } 7 8 9 }[A:^80(^81^8A)]`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  // Verify the row immediately following the table was parsed successfully
  const msgA = msgTable.find(row => row["@id"] === "A");

  Assert.ok(msgA, "Row A should be parsed successfully");
  Assert.equal(
    msgA.subject,
    "Adjacent Row Test",
    "Rows immediately following a table declaration (}[...]) should be parsed perfectly"
  );
});

add_task(async function testUnpackEmbeddedJsonEscapes() {
  // Simulate a stringified JSON object that was split across lines by Mork.
  // Note: We have to double-escape backslashes in the JS literal so the
  // string holds the literal characters: \n and \\
  const input = '{"path": "C:\\\\folder", \\\n"text": "line1\\nline2"}';

  // If the old, aggressive regex (/\\([^"]/g) was used, "C:\\folder" would
  // become "C:folder", and "\\n" would become "n", mangling the data.
  const result = MorkParser.unpackEmbeddedJson(input);

  Assert.equal(
    typeof result,
    "object",
    "Should successfully parse the embedded JSON"
  );

  Assert.equal(
    result.path,
    "C:\\folder",
    "Should preserve standard JSON escaped backslashes"
  );

  Assert.equal(
    result.text,
    "line1\nline2",
    "Should preserve standard JSON escaped newlines"
  );
});

add_task(async function testWhitespacePreservationInLiteralValues() {
  // Construct a minimal MSF payload with heavily padded structural whitespace
  // (newlines and indentation) to prove the parser doesn't choke, and a literal
  // row value that contains intentional spaces ("Hello World").
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)>
  
  {1:^80 {(k^96:c)(s=9)}
    
    [ 1( ^81=Hello World ) ]
    
  }`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  // Verify the row was found and the literal spaces were perfectly preserved
  const msg1 = msgTable.find(row => row["@id"] === "1");

  Assert.ok(
    msg1,
    "Row 1 should be parsed successfully despite the structural padding"
  );

  // If the old blanket regex (/\s+/g) was still active, this would equal "HelloWorld"
  Assert.equal(
    msg1.subject,
    "Hello World",
    "Literal values containing spaces should not be stripped of their whitespace"
  );
});

add_task(async function testEncodingFixes() {
  // Construct a minimal MSF payload mimicking the two encoding scenarios:
  // 1. Contiguous UTF-8 bytes that span multiple characters ("standardmäßig")
  // 2. Legacy single-byte encoding that requires the fallback ("Märchen")
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)(82=preview)>
<(8A=standardm$C3$A4$C3$9Fig)(8B=M$E4rchen)>
{1:^80 {(k^96:c)(s=9)}
  [1(^81^8A)(^82^8B)]
}`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  const msg1 = msgTable.find(row => row["@id"] === "1");
  Assert.ok(msg1, "Row 1 should be parsed successfully");

  // Verify the contiguous UTF-8 sequence was decoded perfectly
  // without dropping the last byte or creating C1 control characters.
  Assert.equal(
    msg1.subject,
    "standardmäßig",
    "Contiguous UTF-8 bytes should be decoded correctly without chunking errors"
  );

  // Verify that an invalid UTF-8 byte ($E4) correctly threw an error
  // in the strict TextDecoder and fell back to the legacy ISO-8859-1 decoding.
  Assert.equal(
    msg1.preview,
    "Märchen",
    "Legacy single-byte encodings (invalid UTF-8) should safely fall back to ISO-8859-1"
  );
});

add_task(async function testEscapedLiteralValues() {
  // Construct a minimal MSF payload mimicking escaped dollar signs:
  // 1. A mixed sequence: escaped \\$ followed by an unescaped $
  // 2. A fully escaped sequence: both $ signs have backslashes
  // Note: We use \\$ in the JS literal to represent a single literal \ in the MSF.
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)>
<(8A=Hello \\$C3$A4)(8B=\\$C3\\$A4 at the start)>
{1:^80 {(k^96:c)(s=9)}
  [1(^81^8A)]
  [2(^81^8B)]
}`;

  const parsed = new MorkParser().parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  const msg1 = msgTable.find(row => row["@id"] === "1");
  Assert.ok(msg1, "Row 1 should be parsed successfully");

  // Verify that the unescaped $A4 was correctly decoded into ¤ (ISO-8859-1),
  // while the escaped \\$C3 was preserved.
  Assert.equal(
    msg1.subject,
    "Hello \\$C3¤",
    "Unescaped sequences following escaped ones should be correctly decoded"
  );

  const msg2 = msgTable.find(row => row["@id"] === "2");
  Assert.ok(msg2, "Row 2 should be parsed successfully");

  // Verify that when both are escaped, the whole string is preserved as text.
  Assert.equal(
    msg2.subject,
    "\\$C3\\$A4 at the start",
    "Fully escaped sequences at the beginning of a string should be preserved as literal text"
  );
});

add_task(async function testSplitEmailsQuotedCommas() {
  // Create a mock raw Mork object with tricky email formatting
  // (Commas inside quotes, spaces after delimiters, etc.)
  const rawMorkRow = {
    "@id": "1:^80",
    // 1. Single sender with a comma in the quoted name
    sender: '"Picard, Jean-Luc" <captainexample.org>',
    // 2. Multiple recipients with a space after the delimiter and a comma in the quote
    recipients:
      'data@example.org, "Riker, William T." <number.one@example.org>',
    // 3. Complex list with multiple quoted names and plain emails
    ccList:
      '"Last, First" <last@example.org>, "Another, Name" <another@example.org>, plain@example.org',
  };

  const prettyData = MorkParser.readableMsgHdrData(rawMorkRow);

  // Verify Sender
  Assert.deepEqual(
    prettyData.from,
    ['"Picard, Jean-Luc" <captainexample.org>'],
    "Should not split a single sender with a comma inside quotes"
  );

  // Verify Recipients (The exact scenario the reviewer caught)
  Assert.deepEqual(
    prettyData.recipients,
    ["data@example.org", '"Riker, William T." <number.one@example.org>'],
    "Should correctly split multiple recipients while ignoring commas inside quotes"
  );

  // Verify CC List
  Assert.deepEqual(
    prettyData.ccList,
    [
      '"Last, First" <last@example.org>',
      '"Another, Name" <another@example.org>',
      "plain@example.org",
    ],
    "Should handle complex lists with multiple quoted names containing commas"
  );
});

add_task(async function testUnescapedParenthesisInRowCell() {
  // Construct a minimal MSF payload mimicking the "Received" header bug:
  // A row cell value contains an unescaped opening parenthesis '('
  // and an escaped closing parenthesis '\)'.
  // Note: We use \\) in the JS string literal to represent \) in the Mork file.
  const msfData = `< <(a=c)>(80=ns:msg:db:row:scope:msgs:all)(81=subject)(82=received)>
{1:^80 {(k^96:c)(s=9)}
  [1(^81=Test Subject)(^82=from localhost ([127.0.0.1]\\) by server)]
}`;

  const parser = new MorkParser();
  const parsed = parser.parseContent(msfData);
  const msgTableObj = parsed.find(
    t => t["@id"] === "ns:msg:db:row:scope:msgs:all"
  );
  const msgTable = msgTableObj ? msgTableObj.data : [];

  Assert.ok(Array.isArray(msgTable), "messages table should exist");

  const msg1 = msgTable.find(row => row["@id"] === "1");
  Assert.ok(msg1, "Row 1 should be parsed successfully");

  // Verify that the unescaped '(' did not shatter the cell and the escaped '\\)'
  // was correctly transformed back into a standard closing bracket.
  Assert.equal(
    msg1.received,
    "from localhost ([127.0.0.1]) by server",
    "Values containing unescaped opening parentheses should not be fragmented"
  );

  // Ensure that no "Malformed cell data" warnings were thrown for this row
  const malformedWarnings = parser.warnings.filter(w =>
    w.includes("Malformed cell data")
  );
  Assert.equal(
    malformedWarnings.length,
    0,
    "Should not generate malformed cell warnings for unescaped parentheses"
  );
});
