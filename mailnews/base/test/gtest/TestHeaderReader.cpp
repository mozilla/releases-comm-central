#include "gtest/gtest.h"
#include "nsString.h"
#include "HeaderReader.h"
#include "nsTArray.h"
#include "mozilla/ArrayUtils.h"

// Invocation:
// $ ./mach gtest "TestHeaderReader.*"

TEST(TestHeaderReader, Basic)
{
  struct hdr {
    nsCString name;
    nsCString rawValue;
  };

  struct {
    nsCString raw;
    nsTArray<hdr> expected;
    bool isComplete;     // expect to find complete header block?
    nsCString leftOver;  // Data which should be left unprocessed.
  } testMsgs[] = {
      // Simple case works?
      {
          "Message-ID: one\r\n"
          "To: alice@example.com\r\n"
          "\r\n"
          "Body here. HeaderReader should have stopped by now.\r\n"
          "Note: this line looks like a header, but it isn't!\r\n"_ns,
          {
              {"Message-ID"_ns, "one"_ns},
              {"To"_ns, "alice@example.com"_ns},
          },
          true,
          "Body here. HeaderReader should have stopped by now.\r\n"
          "Note: this line looks like a header, but it isn't!\r\n"_ns,
      },
      // Handle folded header values correctly?
      {
          "To: bob@example.com\r\n"
          "Subject: Do\r\n"
          " we\r\n"
          " handle\r\n"
          "\tfolded\r\n"  // Can fold with tabs too.
          " fields OK?\r\n"
          "Message-ID: two\r\n"
          "\r\n"
          "...message body here...\r\n"_ns,
          {
              {"To"_ns, "bob@example.com"_ns},
              {"Subject"_ns,
               "Do\r\n we\r\n handle\r\n\tfolded\r\n fields OK?"_ns},
              {"Message-ID"_ns, "two"_ns},
          },
          true,
          "...message body here...\r\n"_ns,
      },
      // Handle no whitespace after colon?
      {
          "Foo:bar\r\n"
          "\r\n"_ns,
          {
              {"Foo"_ns, "bar"_ns},
          },
          true,
          ""_ns,
      },
      // Folding with no text on first line?
      // (I _think_ this is legal...)
      {
          "Foo: \r\n"
          " bar\r\n"
          "\r\n"_ns,
          {
              {"Foo"_ns, "\r\n bar"_ns},
          },
          true,
          ""_ns,
      },
      // Folded line with no end of header block.
      // Input could be truncated. So we don't want this to output any headers
      // (The missing next line could be folded or not - we just don't know).
      {
          "Foo:\r\n"
          " bar\r\n"
          " wibble\r\n"_ns,
          {},
          false,
          "Foo:\r\n bar\r\n wibble\r\n"_ns,
      },
      // Ignore incomplete lines as expected?.
      {
          "Foo: bar\r\n"
          "Wibble: this is a part"_ns,  // ... "ial line".
          {
              {"Foo"_ns, "bar"_ns},
          },
          false,
          "Wibble: this is a part"_ns,
      },
      // Ignore incomplete folded lines?
      {
          "Foo: bar\r\n"
          "Wibble: this\r\n"
          " value is not co"_ns,  // ... "mplete".
          {
              {"Foo"_ns, "bar"_ns},
          },
          false,
          "Wibble: this\r\n value is not co"_ns,
      },
      // Handle empty input without crashing?
      {
          ""_ns,
          {},
          false,
          ""_ns,
      }};

  for (size_t i = 0; i < mozilla::ArrayLength(testMsgs); ++i) {
    auto const& t = testMsgs[i];
    // Collect all the headers.
    nsTArray<HeaderReader::Hdr> gotHeaders;
    HeaderReader rdr;
    auto handler = [&](HeaderReader::Hdr const& hdr) {
      gotHeaders.AppendElement(hdr);
      return true;  // Keep going.
    };

    // Simulate multiple passes over a growing buffer - we'll add a quarter
    // of the data each pass.
    for (uint32_t i = 1; i < 4; ++i) {
      // Encourage each pass to use different memory.
      nsCString fudge(t.raw.BeginReading(), i * t.raw.Length() / 4);
      rdr.Parse(fudge, handler);
    }

    // Last pass - give the reader the entire input.
    auto leftOver = rdr.Parse(t.raw, handler);

    // Did we get all the headers we expected?
    ASSERT_EQ(gotHeaders.Length(), t.expected.Length());
    for (size_t i = 0; i < t.expected.Length(); ++i) {
      auto const& expect = t.expected[i];
      auto const& got = gotHeaders[i];
      ASSERT_EQ(expect.name, nsCString(got.Name(t.raw)));
      ASSERT_EQ(expect.rawValue, nsCString(got.RawValue(t.raw)));
    }

    // Correctly detected the end of the header block?
    ASSERT_EQ(t.isComplete, rdr.IsComplete());

    // Make sure processing stopped where expected.
    ASSERT_EQ(t.leftOver, nsCString(leftOver));
  }
}

// Check that callback can halt processing, and that it can be correctly
// resumed.
TEST(TestHeaderReader, Stop)
{
  // We'll stop each time we find a header name containing "STOP".
  struct {
    nsCString raw;
    int expectedCount;   // Number of headers we expect to find.
    int expectedPasses;  // Number of passes we expect to run.
  } testMsgs[] = {
      {"foo: bar\r\n\r\n"_ns, 1, 1},
      {"Message-ID: one\r\n"
       "STOP: pause here please\r\n"
       "foo-One: nothing to see here...\r\n"
       "foo-Two: still nothing...\r\n"
       "\r\n"_ns,
       4, 2},
      {"A: eh\r\n"
       "B: bee\r\n"
       "STOP_1: pause here.\r\n"
       "C: sea\r\n"
       "STOP_2: another pause.\r\n"
       "E: eee\r\n"
       "STOP_3: last one.\r\n"
       "\r\n"_ns,
       7, 3},
  };

  for (size_t i = 0; i < mozilla::ArrayLength(testMsgs); ++i) {
    auto const& t = testMsgs[i];
    HeaderReader rdr;
    int gotCount = 0;
    auto handler = [&](HeaderReader::Hdr const& hdr) {
      ++gotCount;
      return nsCString(hdr.Name(t.raw)).Find("STOP") == kNotFound;
    };

    int passes = 0;
    // All our examples have a complete header block.
    while (!rdr.IsComplete()) {
      rdr.Parse(t.raw, handler);
      ++passes;
    }
    ASSERT_EQ(gotCount, t.expectedCount);
    ASSERT_EQ(passes, t.expectedPasses);
    ASSERT_TRUE(rdr.IsComplete());
  }
}
