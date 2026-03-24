#include "gtest/gtest.h"
#include "nsString.h"
#include "nsNetUtil.h"
#include "nsStringStream.h"
#include "MailStream.h"

// Invocation:
// $ ./mach gtest "TestMailStream.*"

typedef nsCString (*genFn)();

// Some (well-formed) test messages.
static const struct {
  genFn Header;
  genFn Body;
  nsCString All() const { return Header() + Body(); }
} wellFormedMsgs[] = {
    // Simple case works?
    {
        // Header + separatorline.
        []() -> nsCString {
          return "Message-ID: one\r\nTo: alice@example.com\r\n\r\n"_ns;
        },
        // Body.
        []() -> nsCString {
          return "Body here.\r\nNote: this line looks like a header, but it isn't!\r\n"_ns;
        },
    },
    // Works with bare LF line endings (rather than CRLF)?
    {
        // Header + separatorline.
        []() -> nsCString {
          return "Message-ID: one\nTo: alice@example.com\n\n"_ns;
        },
        // Body.
        []() -> nsCString {
          return "Body here.\nNote: this line looks like a header, but it isn't!\n"_ns;
        },
    },
    // Folded header values don't screw things up?
    {
        // Header.
        []() -> nsCString {
          return "To: bob@example.com\r\n"
                 "Subject: Do\r\n"
                 " we\r\n"
                 " handle\r\n"
                 "\tfolded\r\n"  // Can fold with tabs too.
                 " fields OK?\r\n"
                 "Message-ID: two\r\n"
                 "\r\n"_ns;
        },
        // Body.
        []() -> nsCString { return "...message body here...\r\n"_ns; },
    },
    // Huge header block works? (to test that buffer resizing works).
    {
        // Header - aiming for ~250KB.
        []() -> nsCString {
          nsCString out;
          for (int i = 0; i < 10000; ++i) {
            out.AppendFmt("Name{:#06d}: value{:#06d}\r\n", i, i);  // 25 bytes
          }
          // Need the separator line.
          out.Append("\r\n");
          return out;
        },
        // Body.
        []() -> nsCString { return "...message body here...\r\n"_ns; },
    },
    // Huge body works? (to make sure reads will hit the underlying stream
    // once we read past the buffer).
    {
        // Minimal Header.
        []() -> nsCString { return "Foo: bar\r\n\r\n"_ns; },
        // Huge Body - aiming for about 250KB.
        []() -> nsCString {
          nsCString out;
          for (int i = 0; i < 10000; ++i) {
            out.AppendFmt("this is line {:#06d}....\r\n", i);  // 25 bytes
          }
          return out;
        },
    },
};

// We should be able to access the header block _before_ we
// read anything from the stream.
TEST(TestMailStream, HeaderBeforeReading)
{
  for (auto const& t : wellFormedMsgs) {
    nsCOMPtr<nsIInputStream> raw;
    ASSERT_EQ(NS_OK, NS_NewCStringInputStream(getter_AddRefs(raw), t.All()));

    RefPtr<MailStream> wrapped = new MailStream(raw);

    // HeaderBlock() should return the header block exactly.
    nsCString gotHeader(wrapped->HeaderBlock().unwrap());
    ASSERT_EQ(gotHeader, t.Header());

    // Read() should return the entire message (including header block).
    nsCString gotWhole;
    ASSERT_EQ(NS_OK,
              NS_ReadInputStreamToString(wrapped, gotWhole, -1, nullptr));
    ASSERT_EQ(gotWhole, t.All());
  }
}

// The header block should be available even _after_ the stream
// has been drained.
TEST(TestMailStream, HeaderAfterReading)
{
  //  for (size_t i = 0; i < std::size(wellFormedMsgs); ++i) {
  for (auto const& t : wellFormedMsgs) {
    //   auto const& t = wellFormedMsgs[i];
    nsCOMPtr<nsIInputStream> raw;
    ASSERT_EQ(NS_OK, NS_NewCStringInputStream(getter_AddRefs(raw), t.All()));

    RefPtr<MailStream> wrapped = new MailStream(raw);

    // Read() should return the entire message (including header block).
    nsCString gotWhole;
    ASSERT_EQ(NS_OK,
              NS_ReadInputStreamToString(wrapped, gotWhole, -1, nullptr));
    ASSERT_EQ(gotWhole, t.All());

    // HeaderBlock() should return the header block exactly.
    nsCString gotHeader(wrapped->HeaderBlock().unwrap());
    ASSERT_EQ(gotHeader, t.Header());
  }
}

// Make sure messages without an obvious header block are rejected.
TEST(TestMailStream, RejectBadlyFormedMsg)
{
  nsCString badMsgs[] = {"This has no header block"_ns};

  for (auto& bad : badMsgs) {
    nsCOMPtr<nsIInputStream> raw;
    ASSERT_EQ(NS_OK, NS_NewCStringInputStream(getter_AddRefs(raw), bad));

    RefPtr<MailStream> wrapped = new MailStream(raw);
    ASSERT_TRUE(wrapped->HeaderBlock().isErr());
  }
}

// Ensure oversized header blocks are rejected.
TEST(TestMailStream, RejectLudicrouslyLargeHeader)
{
  nsCString badMsg("Blah: BLAHBLAHBLAHBLAHBLAHBLAHBLAHBLAHBLAHBLAHBLAH\r\n");
  while (badMsg.Length() <= MailStream::kMaxHeaderSize) {
    badMsg.Append(badMsg);  // Double the size.
  }
  badMsg.Append("\r\nTeeny tiny message body.\r\n");

  nsCOMPtr<nsIInputStream> raw;
  ASSERT_EQ(NS_OK, NS_NewCStringInputStream(getter_AddRefs(raw), badMsg));
  RefPtr<MailStream> wrapped = new MailStream(raw);

  ASSERT_TRUE(wrapped->HeaderBlock().isErr());
}
