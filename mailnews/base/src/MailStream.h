/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_MAILSTREAM_H_
#define COMM_MAILNEWS_BASE_SRC_MAILSTREAM_H_

#include "nsIInputStream.h"
#include "nsCOMPtr.h"
#include "mozilla/Vector.h"
#include "mozilla/Span.h"
#include "mozilla/RecursiveMutex.h"

/**
 * MailStream wraps an input stream to allow access to the RFC5322 header
 * block (without affecting reading).
 * It works by reading enough of the underlying stream to buffer up
 * at least the header block.
 * That data can then be accessed at any time without affecting the stream
 * reading. Initial stream reads will be supplied from the buffer.
 * Once past the buffer, reads will be passed through to the original
 * (wrapped) input stream.
 *
 * Example usage:
 *
 *   nsCOMPtr<nsIInputStream> raw;
 *   NS_NewCStringInputStream(getter_AddRefs(raw),
 *     "From: alice\r\nTo: bob\r\n\r\nHello Bob!\r\n"_ns);
 *
 *   RefPtr<MailStream> wrapped = new MailStream(raw);
 *
 *   // Can access the header at any point.
 *   nsCString hdr(wrapped->HeaderBlock().unwrap());
 *   fmt::println("hdr: '{}'", CEscapeString(hdr));
 *   // Outputs:
 *   // hdr: 'From: alice\r\nTo: bob\r\n\r\n'
 *
 *   // Can still read the stream as normal.
 *   nsCString all;
 *   NS_ReadInputStreamToString(wrapped, all, -1, nullptr);
 *
 *   fmt::println("all: '{}'", CEscapeString(all));
 *   // Outputs:
 *   // all: 'From: alice\r\nTo: bob\r\n\r\nHello Bob!\r\n'
 *
 * For more examples: ../test/gtest/TestMailStream.cpp
 *
 * For small (hopefully typical) messages, the default buffer should be large
 * enough to contain the whole thing, avoiding the need for extra underlying
 * reads.
 */
class MailStream : public nsIInputStream {
 public:
  // Implementation note:
  // in theory we could support other interfaces (e.g. nsISeekableStream),
  // but in practice this class is designed purely for plumbing, so we don't
  // really want to encourage anything beyond sequential streaming of data.
  // But if you're interested, see nsBufferedInputStream for more a elaborate
  // example, with conditional QIing (e.g. only support QI to
  // nsISeekableStream if underlying stream supports it).

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIINPUTSTREAM

  explicit MailStream(nsIInputStream* realStream);
  MailStream() = delete;

  /**
   * Returns the header block, or an error.
   * The returned block will include the blank separator line.
   * Calling this has no effect upon the nsIInputStream methods of this
   * class - it may be called before or after reading the stream, or even
   * after calling Close().
   */
  mozilla::Result<mozilla::Span<const char>, nsresult> HeaderBlock();

  /**
   * The maximum size header block we'll accept before throwing an error.
   * Beyond this we'll assume the messages is malicious/malformed and
   * that we can't deal with it.
   * There's no well defined hard limit here, but for calibration, gmail
   * refuses messages with over 500KB of headers, so that's the ballpark
   * we're in.
   * https://support.google.com/a/answer/14016360
   *
   * NOTE: it might be better to clip oversize headers rather than
   * rejecting them? After all, we should probably attempt to handle any
   * message thrown at us, even bonkers ones.
   * But if we go that route, care would need to be taken to avoid partial
   * headers (eg clipping a folded header value).
   */
  static constexpr uint32_t kMaxHeaderSize = 1024 * 1024;

 protected:
  // Internal calibration constants. Ideally, these should be set so most
  // messages fit entirely within the buffer. It'd be nice to gather some
  // empirical data to tune these properly.

  // How many bytes we'll attempt to read at a time.
  static constexpr uint32_t kChunkSize = 64 * 1024;

  // Initial capacity of buffer. If the header is smaller than this, no
  // reallocation is required (it's included as part of the MailStream object
  // itself).
  static constexpr uint32_t kInitialCapacity = kChunkSize;

  virtual ~MailStream() = default;

 private:
  // Guard the buffer access.
  mozilla::RecursiveMutex mBufferMutex{"MailStream::mBufferMutex"};

  // The buffer. Will grow to hold at least the header block.
  // Will likely also hold some of the message body (maybe even the whole
  // message).
  mozilla::Vector<char, kInitialCapacity> mBuffer MOZ_GUARDED_BY(mBufferMutex);

  // The underlying stream we're sourcing the message from.
  nsCOMPtr<nsIInputStream> mStream;

  // Have we buffered up the entire header yet?
  bool mGotHeader{false};

  // The size of the header block (or at least as much as we've read so far).
  uint32_t mHeaderSize{0};

  // The read cursor. If it's still inside the buffer we can supply reads
  // from ram, but once we exhaust the buffer we'll have to start calling
  // mStream->Read().
  uint32_t mCursor{0};

  // Make sure the entire header is in the buffer, or fail.
  nsresult EnsureHeaderInBuffer();
};

#endif  // COMM_MAILNEWS_BASE_SRC_MAILSTREAM_H_
