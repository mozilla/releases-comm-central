/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsMsgLocalStoreUtils.h"
#include "nsIFile.h"
#include "nsIDBFolderInfo.h"
#include "nsIMsgDatabase.h"
#include "HeaderReader.h"
#include "nsPrintfCString.h"
#include "nsReadableUtils.h"
#include "mozilla/Buffer.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "prprf.h"

#define EXTRA_SAFETY_SPACE 0x400000  // (4MiB)

nsMsgLocalStoreUtils::nsMsgLocalStoreUtils() {}

nsresult nsMsgLocalStoreUtils::AddDirectorySeparator(nsIFile* path) {
  nsAutoString leafName;
  path->GetLeafName(leafName);
  leafName.AppendLiteral(FOLDER_SUFFIX);
  return path->SetLeafName(leafName);
}

bool nsMsgLocalStoreUtils::nsShouldIgnoreFile(nsAString& name, nsIFile* path) {
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

  // ignore RSS data source files (see FeedUtils.jsm)
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

// Write data to outputstream, until complete or error.
static nsresult writeBuf(nsIOutputStream* writeable, const char* data,
                         size_t dataSize) {
  uint32_t written = 0;
  while (written < dataSize) {
    uint32_t n;
    nsresult rv = writeable->Write(data + written, dataSize - written, &n);
    NS_ENSURE_SUCCESS(rv, rv);
    written += n;
  }
  return NS_OK;
}

/**
 * Attempt to update X-Mozilla-Status and X-Mozilla-Status2 headers with
 * new message flags by rewriting them in place.
 */
nsresult nsMsgLocalStoreUtils::RewriteMsgFlags(nsISeekableStream* seekable,
                                               uint32_t msgFlags) {
  nsresult rv;

  // Remember where we started.
  int64_t msgStart;
  rv = seekable->Tell(&msgStart);
  NS_ENSURE_SUCCESS(rv, rv);

  // We edit the file in-place, so need to be able to read and write too.
  nsCOMPtr<nsIInputStream> readable(do_QueryInterface(seekable, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIOutputStream> writable = do_QueryInterface(seekable, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Read in the first chunk of the header and search for the X-Mozilla-Status
  // headers. We know that those headers always appear at the beginning, so
  // don't need to look too far in.
  mozilla::Buffer<char> buf(512);
  mozilla::Span<const char> data = readBuf(readable, buf);

  // If there's a "From " line, consume it.
  mozilla::Span<const char> fromLine;
  if (data.Length() >= 5 &&
      nsDependentCSubstring(data.First(5)).EqualsLiteral("From ")) {
    fromLine = FirstLine(data);
    data = data.From(fromLine.Length());
  }

  HeaderReader::Hdr statusHdr;
  HeaderReader::Hdr status2Hdr;
  auto findHeadersFn = [&](auto const& hdr) {
    if (hdr.Name(data).EqualsLiteral(X_MOZILLA_STATUS)) {
      statusHdr = hdr;
    } else if (hdr.Name(data).EqualsLiteral(X_MOZILLA_STATUS2)) {
      status2Hdr = hdr;
    } else {
      return true;  // Keep looking.
    }
    // Keep looking until we find both.
    return statusHdr.IsEmpty() || status2Hdr.IsEmpty();
  };
  HeaderReader rdr;
  rdr.Parse(data, findHeadersFn);

  // Update X-Mozilla-Status (holds the lower 16bits worth of flags).
  if (!statusHdr.IsEmpty()) {
    uint32_t oldFlags = statusHdr.Value(data).ToInteger(&rv, 16);
    if (NS_SUCCEEDED(rv)) {
      // Preserve the Queued flag from existing X-Mozilla-Status header.
      // (Note: not sure why we do this, but keeping it in for now. - BenC)
      msgFlags |= oldFlags & nsMsgMessageFlags::Queued;

      if ((msgFlags & 0xFFFF) != oldFlags) {
        auto out = nsPrintfCString("%4.4x", msgFlags & 0xFFFF);
        if (out.Length() <= statusHdr.rawValLen) {
          rv = seekable->Seek(nsISeekableStream::NS_SEEK_SET,
                              msgStart + fromLine.Length() + statusHdr.pos +
                                  statusHdr.rawValOffset);
          NS_ENSURE_SUCCESS(rv, rv);
          // Should be an exact fit already, but just in case...
          while (out.Length() < statusHdr.rawValLen) {
            out.Append(' ');
          }
          rv = writeBuf(writable, out.BeginReading(), out.Length());
          NS_ENSURE_SUCCESS(rv, rv);
        }
      }
    }
  }

  // Update X-Mozilla-Status2 (holds the upper 16bit flags only(!)).
  if (!status2Hdr.IsEmpty()) {
    uint32_t oldFlags = status2Hdr.Value(data).ToInteger(&rv, 16);
    if (NS_SUCCEEDED(rv)) {
      if ((msgFlags & 0xFFFF0000) != oldFlags) {
        auto out = nsPrintfCString("%8.8x", msgFlags & 0xFFFF0000);
        if (out.Length() <= status2Hdr.rawValLen) {
          rv = seekable->Seek(nsISeekableStream::NS_SEEK_SET,
                              msgStart + fromLine.Length() + status2Hdr.pos +
                                  status2Hdr.rawValOffset);
          NS_ENSURE_SUCCESS(rv, rv);
          while (out.Length() < status2Hdr.rawValLen) {
            out.Append(' ');
          }
          rv = writeBuf(writable, out.BeginReading(), out.Length());
          NS_ENSURE_SUCCESS(rv, rv);
        }
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
 * @param seekable The stream containing the message, positioned at the
 *                 beginning of the message (must also be readable and
 *                 writable).
 * @param keywordsToAdd The list of keywords to add.
 * @param keywordsToRemove The list of keywords to remove.
 * @param notEnoughRoom Upon return, this will be set if the header is missing
 * or too small to contain the new keywords.
 *
 */
nsresult nsMsgLocalStoreUtils::ChangeKeywordsHelper(
    nsISeekableStream* seekable, nsTArray<nsCString> const& keywordsToAdd,
    nsTArray<nsCString> const& keywordsToRemove, bool& notEnoughRoom) {
  notEnoughRoom = false;
  nsresult rv;

  // Remember where we started.
  int64_t msgStart;
  rv = seekable->Tell(&msgStart);
  NS_ENSURE_SUCCESS(rv, rv);

  // We edit the file in-place, so need to be able to read and write too.
  nsCOMPtr<nsIInputStream> readable(do_QueryInterface(seekable, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIOutputStream> writable = do_QueryInterface(seekable, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Read in the first chunk of the header and search for X-Mozilla-Keys.
  // We know that it always appears near the beginning, so don't need to look
  // too far in.
  mozilla::Buffer<char> buf(512);
  mozilla::Span<const char> data = readBuf(readable, buf);

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

  rv = seekable->Seek(
      nsISeekableStream::NS_SEEK_SET,
      msgStart + fromLine.Length() + kwHdr.pos + kwHdr.rawValOffset);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = writeBuf(writable, out.BeginReading(), out.Length());
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}
