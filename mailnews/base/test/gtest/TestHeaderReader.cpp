#include "gtest/gtest.h"
#include "nsString.h"
#include "HeaderReader.h"
#include "nsTArray.h"
#include "mozilla/ArrayUtils.h"

// Invocation:
// $ ./mach gtest "TestHeaderReader.*"

TEST(TestHeaderReader, Basic)
{
  struct {
    nsCString raw;
    nsTArray<HeaderReader::Header> expected;
  } testMsgs[] = {
      // Simple case works?
      {
          "Message-ID: one\r\n"
          "To: alice@example.com\r\n"
          "\r\n"
          "Body here. HeaderReader should have stopped by now.\r\n"
          "Note: this line looks like a header, but it isn't!\r\n"_ns,
          {
              {"Message-ID"_ns, "one"_ns, 12ull, 3ull},
              {"To"_ns, "alice@example.com"_ns, 21ull, 17ull},
          },
      },
      // Handle folded header values correctly?
      {
          "To: bob@example.com\r\n"
          "Subject: Do\r\n"
          " we\r\n"
          " handle\r\n"
          " folded\r\n"
          " fields OK?\r\n"
          "Message-ID: two\r\n"
          "\r\n"
          "...message body here...\r\n"_ns,
          {
              {"To"_ns, "bob@example.com"_ns, 4ull, 15ull},
              {"Subject"_ns, "Do we handle folded fields OK?"_ns, 30ull, 38ull},
              {"Message-ID"_ns, "two"_ns, 82ull, 3ull},
          },
      },
      // Handle no whitespace after comma?
      {
          "Foo:bar\r\n"
          "\r\n"_ns,
          {
              {"Foo"_ns, "bar"_ns, 4ull, 3ull},
          },
      },
      // Folding with no text on first line?
      // (I _think_ this is legal...)
      {
          "Foo: \r\n"
          " bar\r\n"
          "\r\n"_ns,
          {
              {"Foo"_ns, " bar"_ns, 5ull, 6ull},
          },
      },
      // Folded line with no EOL.
      // Input could be truncated. So we don't want this to output any headers!
      {
          "Foo:\r\n"
          " bar\r\n"_ns,
          {},
      },
      // Ignore incomplete lines as expected?.
      {
          "Foo: bar\r\n"
          "Wibble: this line is not co"_ns,  // ... "mplete".
          {
              {"Foo"_ns, "bar"_ns, 5ull, 3ull},
          },
      },
      // Ignore incomplete folded lines?
      {
          "Foo: bar\r\n"
          "Wibble: this\r\n"
          " value is not co"_ns,  // ... "mplete".
          {
              {"Foo"_ns, "bar"_ns, 5ull, 3ull},
          },
      },
  };

  for (size_t i = 0; i < mozilla::ArrayLength(testMsgs); ++i) {
    auto const& t = testMsgs[i];
    // Read out all the headers.
    nsTArray<HeaderReader::Header> headers;
    HeaderReader rdr;
    auto handler = [&](HeaderReader::Header const& hdr) {
      headers.AppendElement(hdr);
      return true;  // Keep going.
    };
    rdr.Feed(mozilla::Span<const char>(t.raw.BeginReading(), t.raw.Length()),
             handler);
    rdr.Flush(handler);
    // Check against what we expect to find.
    ASSERT_EQ(headers.Length(), t.expected.Length());
    for (size_t i = 0; i < t.expected.Length(); ++i) {
      auto const& expect = t.expected[i];
      auto const& got = headers[i];
      ASSERT_EQ(expect.name, got.name);
      ASSERT_EQ(expect.value, got.value);
      ASSERT_EQ(expect.rawValuePos, got.rawValuePos);
      ASSERT_EQ(expect.rawValueLength, got.rawValueLength);
    }
  }
}

// Check that callback can halt processing.
TEST(TestHeaderReader, Stop)
{
  // We'll stop when we find a header name containing "STOP".
  struct {
    nsCString raw;
    int expectedCount;
  } testMsgs[] = {
      {"Message-ID: one\r\n"
       "STOP: This is the last header\r\n"
       "Ignored-One: nothing to see here...\r\n"
       "Ignored-Two: still nothing...\r\n"
       "\r\n"_ns,
       2},
      {"A: eh\r\n"
       "B: bee\r\n"
       "C: sea\r\n"
       "STOP: no more please.\r\n"
       "D: dee\r\n"
       "E: eee\r\n"_ns,
       4},
  };

  for (size_t i = 0; i < mozilla::ArrayLength(testMsgs); ++i) {
    auto const& t = testMsgs[i];
    HeaderReader rdr;
    int gotCount = 0;
    auto handler = [&](HeaderReader::Header const& hdr) {
      ++gotCount;
      return hdr.name.Find("STOP") == kNotFound;
    };
    rdr.Feed(mozilla::Span<const char>(t.raw.BeginReading(), t.raw.Length()),
             handler);
    rdr.Flush(handler);
    ASSERT_EQ(gotCount, t.expectedCount);
  }
}
