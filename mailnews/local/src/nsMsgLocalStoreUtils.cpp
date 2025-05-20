/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsMsgLocalStoreUtils.h"
#include "nsIMsgDatabase.h"
#include "nsIRandomAccessStream.h"
#include "HeaderReader.h"
#include "nsMailHeaders.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"
#include "nsPrintfCString.h"
#include "nsReadableUtils.h"
#include "mozilla/Buffer.h"
#include "nsIInputStream.h"
#include "prprf.h"

#define EXTRA_SAFETY_SPACE 0x400000  // (4MiB)

nsMsgLocalStoreUtils::nsMsgLocalStoreUtils() {}

nsresult nsMsgLocalStoreUtils::AddDirectorySeparator(nsIFile* path) {
  nsAutoString leafName;
  path->GetLeafName(leafName);
  leafName.AppendLiteral(FOLDER_SUFFIX);
  return path->SetLeafName(leafName);
}

bool nsMsgLocalStoreUtils::nsShouldIgnoreFile(nsIFile* path) {
  nsAutoString name;
  if (NS_FAILED(path->GetLeafName(name))) {
    return true;
  }

  if (name.IsEmpty()) return true;

  char16_t firstChar = name.First();
  if (firstChar == '.' || firstChar == '#' ||
      name.CharAt(name.Length() - 1) == '~')
    return true;

  if (name.LowerCaseEqualsLiteral("msgfilterrules.dat") ||
      name.LowerCaseEqualsLiteral("rules.dat") ||
      name.LowerCaseEqualsLiteral("filterlog.html") ||
      name.LowerCaseEqualsLiteral("junklog.html") ||
      name.LowerCaseEqualsLiteral("rulesbackup.dat"))
    return true;

  // don't add summary files to the list of folders;
  // don't add popstate files to the list either, or rules (sort.dat).
  if (StringEndsWith(name, u".snm"_ns) ||
      name.LowerCaseEqualsLiteral("popstate.dat") ||
      name.LowerCaseEqualsLiteral("sort.dat") ||
      name.LowerCaseEqualsLiteral("mailfilt.log") ||
      name.LowerCaseEqualsLiteral("filters.js") ||
      StringEndsWith(name, u".toc"_ns))
    return true;

  // ignore RSS data source files (see FeedUtils.sys.mjs)
  if (name.LowerCaseEqualsLiteral("feeds.json") ||
      name.LowerCaseEqualsLiteral("feeds.json.tmp") ||
      name.LowerCaseEqualsLiteral("feeds.json.backup") ||
      name.LowerCaseEqualsLiteral("feeds.json.corrupt") ||
      name.LowerCaseEqualsLiteral("feeditems.json") ||
      name.LowerCaseEqualsLiteral("feeditems.json.tmp") ||
      name.LowerCaseEqualsLiteral("feeditems.json.backup") ||
      name.LowerCaseEqualsLiteral("feeditems.json.corrupt") ||
      name.LowerCaseEqualsLiteral("feeds.rdf") ||
      name.LowerCaseEqualsLiteral("feeditems.rdf") ||
      StringBeginsWith(name, u"feeditems_error"_ns))
    return true;

  // Ignore hidden and other special system files.
  bool specialFile = false;
  path->IsHidden(&specialFile);
  if (specialFile) return true;
  specialFile = false;
  path->IsSpecial(&specialFile);
  if (specialFile) return true;

  // The .mozmsgs dir is for spotlight support
  return (StringEndsWith(name, u".mozmsgs"_ns) ||
          StringEndsWith(name, NS_LITERAL_STRING_FROM_CSTRING(FOLDER_SUFFIX)) ||
          StringEndsWith(name, NS_LITERAL_STRING_FROM_CSTRING(SUMMARY_SUFFIX)));
}

// Attempts to fill a buffer. Returns a span holding the data read.
// Might be less than buffer size, if EOF was encountered.
// Upon error, an empty span is returned.
static mozilla::Span<char> readBuf(nsIInputStream* readable,
                                   mozilla::Buffer<char>& buf) {
  uint32_t total = 0;
  while (total < buf.Length()) {
    uint32_t n;
    nsresult rv =
        readable->Read(buf.Elements() + total, buf.Length() - total, &n);
    if (NS_FAILED(rv)) {
      total = 0;
      break;
    }
    if (n == 0) {
      break;  // EOF
    }
    total += n;
  }
  return mozilla::Span<char>(buf.Elements(), total);
}

// static
nsMsgLocalStoreUtils::StatusDetails
nsMsgLocalStoreUtils::FindXMozillaStatusHeaders(nsIRandomAccessStream* stream,
                                                int64_t msgStart) {
  StatusDetails details;

  // Seek to start of message.
  nsresult rv = stream->Seek(nsISeekableStream::NS_SEEK_SET, msgStart);
  if (NS_FAILED(rv)) {
    return details;
  }

  // Read in the first chunk of the header and search for the X-Mozilla-Status
  // headers. We know that those headers always appear at the beginning, so
  // don't need to look too far in.
  mozilla::Buffer<char> buf(512);
  mozilla::Span<const char> data = readBuf(stream->InputStream(), buf);

  // If there's a "From " line, consume it.
  mozilla::Span<const char> fromLine;
  if (data.Length() >= 5 &&
      nsDependentCSubstring(data.First(5)).EqualsLiteral("From ")) {
    fromLine = FirstLine(data);
    data = data.From(fromLine.Length());
  }

  // Find X-Mozilla-Status and X-Mozilla-Status2
  auto findHeadersFn = [&](auto const& hdr) {
    if (hdr.Name(data).EqualsLiteral(X_MOZILLA_STATUS)) {
      // Record location and value.
      details.statusValOffset = fromLine.Length() + hdr.pos + hdr.rawValOffset;
      details.statusValSize = hdr.rawValLen;
      uint32_t lo = hdr.Value(data).ToInteger(&rv, 16);
      if (NS_SUCCEEDED(rv)) {
        details.msgFlags |= (lo & 0xFFFF);
      }
    } else if (hdr.Name(data).EqualsLiteral(X_MOZILLA_STATUS2)) {
      // Record location and value.
      details.status2ValOffset = fromLine.Length() + hdr.pos + hdr.rawValOffset;
      details.status2ValSize = hdr.rawValLen;
      uint32_t hi = hdr.Value(data).ToInteger(&rv, 16);
      if (NS_SUCCEEDED(rv)) {
        details.msgFlags |= (hi & 0xFFFF0000);
      }
    }
    // Only continue looking if we haven't found them both.
    return details.statusValOffset < 0 || details.status2ValOffset < 0;
  };
  HeaderReader rdr;
  rdr.Parse(data, findHeadersFn);

  return details;
}

// static
nsresult nsMsgLocalStoreUtils::PatchXMozillaStatusHeaders(
    nsIRandomAccessStream* stream, int64_t msgStart,
    StatusDetails const& details, uint32_t newFlags) {
  nsresult rv;

  // Some flags are really folder state, not message state.
  // So we don't want to store them in X-Mozilla-Status headers.
  newFlags &= ~nsMsgMessageFlags::RuntimeOnly;

  // Preserve the Queued flag from existing X-Mozilla-Status header.
  // (Note: kept for historical reasons, probably worth revisiting).
  newFlags |= (details.msgFlags & nsMsgMessageFlags::Queued);

  // IF the lower 16bit flags are to be changed...
  if ((newFlags & 0xFFFF) != (details.msgFlags & 0xFFFF)) {
    // ...AND we located an X-Mozilla-Status header...
    if (details.statusValOffset >= 0) {
      auto out = nsPrintfCString("%4.4x", newFlags & 0xFFFF);
      // ...AND it has enough room for the new value:
      if (out.Length() <= details.statusValSize) {
        rv = stream->Seek(nsISeekableStream::NS_SEEK_SET,
                          msgStart + details.statusValOffset);
        NS_ENSURE_SUCCESS(rv, rv);
        // Pad out unused space.
        while (out.Length() < details.statusValSize) {
          out.Append(' ');  // pad it out.
        }
        rv = SyncWriteAll(stream->OutputStream(), out.BeginReading(),
                          out.Length());
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  }
  // IF the upper 16bit flags are to be changed...
  if ((newFlags & 0xFFFF0000) != (details.msgFlags & 0xFFFF0000)) {
    // ...AND we located an X-Mozilla-Status2 header...
    if (details.status2ValOffset >= 0) {
      auto out = nsPrintfCString("%8.8x", newFlags & 0xFFFF0000);
      // ...AND it has enough room for the new value:
      if (out.Length() <= details.status2ValSize) {
        rv = stream->Seek(nsISeekableStream::NS_SEEK_SET,
                          msgStart + details.status2ValOffset);
        NS_ENSURE_SUCCESS(rv, rv);
        // Pad out unused space.
        while (out.Length() < details.status2ValSize) {
          out.Append(' ');  // pad it out.
        }
        rv = SyncWriteAll(stream->OutputStream(), out.BeginReading(),
                          out.Length());
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  }
  return NS_OK;
}

/**
 * Returns true if there is enough space on disk.
 *
 * @param aFile  Any file in the message store that is on a logical
 *               disk volume so that it can be queried for disk space.
 * @param aSpaceRequested  The size of free space there must be on the disk
 *                         to return true.
 */
bool nsMsgLocalStoreUtils::DiskSpaceAvailableInStore(nsIFile* aFile,
                                                     uint64_t aSpaceRequested) {
  int64_t diskFree;
  nsresult rv = aFile->GetDiskSpaceAvailable(&diskFree);
  if (NS_SUCCEEDED(rv)) {
#ifdef DEBUG
    printf("GetDiskSpaceAvailable returned: %lld bytes\n", (long long)diskFree);
#endif
    // When checking for disk space available, take into consideration
    // possible database changes, therefore ask for a little more
    // (EXTRA_SAFETY_SPACE) than what the requested size is. Also, due to disk
    // sector sizes, allocation blocks, etc. The space "available" may be
    // greater than the actual space usable.
    return ((aSpaceRequested + EXTRA_SAFETY_SPACE) < (uint64_t)diskFree);
  } else if (rv == NS_ERROR_NOT_IMPLEMENTED) {
    // The call to GetDiskSpaceAvailable is not implemented!
    // This will happen on certain platforms where GetDiskSpaceAvailable
    // is not implemented. Since people on those platforms still need
    // to download mail, we will simply bypass the disk-space check.
    //
    // We'll leave a debug message to warn people.
#ifdef DEBUG
    printf(
        "Call to GetDiskSpaceAvailable FAILED because it is not "
        "implemented!\n");
#endif
    return true;
  } else {
    printf("Call to GetDiskSpaceAvailable FAILED!\n");
    return false;
  }
}

/**
 * Update the value of an X-Mozilla-Keys header in place.
 *
 * @param stream   The stream containing the message, positioned at the
 *                 beginning of the message.
 * @param keywordsToAdd The list of keywords to add.
 * @param keywordsToRemove The list of keywords to remove.
 * @param notEnoughRoom Upon return, this will be set if the header is missing
 * or too small to contain the new keywords.
 *
 */
nsresult nsMsgLocalStoreUtils::ChangeKeywordsHelper(
    nsIRandomAccessStream* stream, nsTArray<nsCString> const& keywordsToAdd,
    nsTArray<nsCString> const& keywordsToRemove, bool& notEnoughRoom) {
  MOZ_ASSERT(stream);

  notEnoughRoom = false;
  nsresult rv;

  // Remember where we started.
  int64_t msgStart;
  rv = stream->Tell(&msgStart);
  NS_ENSURE_SUCCESS(rv, rv);

  // Read in the first chunk of the header and search for X-Mozilla-Keys.
  // We know that it always appears near the beginning, so don't need to look
  // too far in.
  mozilla::Buffer<char> buf(512);
  mozilla::Span<const char> data = readBuf(stream->InputStream(), buf);

  // If there's a "From " line, consume it.
  mozilla::Span<const char> fromLine;
  if (data.Length() >= 5 &&
      nsDependentCSubstring(data.First(5)).EqualsLiteral("From ")) {
    fromLine = FirstLine(data);
    data = data.From(fromLine.Length());
  }

  HeaderReader::Hdr kwHdr;
  auto findHeaderFn = [&](auto const& hdr) {
    if (hdr.Name(data).EqualsLiteral(HEADER_X_MOZILLA_KEYWORDS)) {
      kwHdr = hdr;
      return false;
    }
    return true;  // Keep looking.
  };
  HeaderReader rdr;
  rdr.Parse(data, findHeaderFn);

  if (kwHdr.IsEmpty()) {
    notEnoughRoom = true;
    return NS_OK;
  }

  // Get existing keywords.
  nsTArray<nsCString> keywords;
  nsAutoCString old(kwHdr.Value(data));
  old.CompressWhitespace();
  for (nsACString const& kw : old.Split(' ')) {
    keywords.AppendElement(kw);
  }

  bool altered = false;
  // Add missing keywords.
  for (auto const& add : keywordsToAdd) {
    if (!keywords.Contains(add)) {
      keywords.AppendElement(add);
      altered = true;
    }
  }

  // Remove any keywords we want gone.
  for (auto const& remove : keywordsToRemove) {
    auto idx = keywords.IndexOf(remove);
    if (idx != keywords.NoIndex) {
      keywords.RemoveElementAt(idx);
      altered = true;
    }
  }

  if (!altered) {
    return NS_OK;
  }

  // Write updated keywords over existing value.
  auto out = StringJoin(" "_ns, keywords);
  if (out.Length() > kwHdr.rawValLen) {
    notEnoughRoom = true;
    return NS_OK;
  }
  while (out.Length() < kwHdr.rawValLen) {
    out.Append(' ');
  }

  rv = stream->Seek(
      nsISeekableStream::NS_SEEK_SET,
      msgStart + fromLine.Length() + kwHdr.pos + kwHdr.rawValOffset);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = SyncWriteAll(stream->OutputStream(), out.BeginReading(), out.Length());
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

// static
nsString nsMsgLocalStoreUtils::EncodeFilename(nsACString const& str) {
  // TODO: IMPLEMENT THIS!
  // 1. Decide if it's an acceptable filename.
  //    - Start by copying code in nsLocalFile::CheckForReservedFileName().
  //    - add extra check from the microsoft.com links above.
  // 2. if not ok, percent-encode the offending parts.
  //    For things like "COM1", have to encode all chars.
  //    For things like "foo/bar", just '/' needs encoding.
  return NS_ConvertUTF8toUTF16(str);
}

// static
nsCString nsMsgLocalStoreUtils::DecodeFilename(nsAString const& filename) {
  // TODO: IMPLEMENT THIS!
  // Just percent-decoding it should be enough:
  // NS_UnescapeURL(str);
  return NS_ConvertUTF16toUTF8(filename);
}
