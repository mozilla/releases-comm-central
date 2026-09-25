/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/mailnews/MsgSubjectUtils.h"

#include <algorithm>

#include "mozilla/Base64.h"
#include "mozilla/Components.h"
#include "mozilla/Preferences.h"
#include "mozilla/TextUtils.h"
#include "nsCOMPtr.h"
#include "nsIMimeConverter.h"
#include "nsTArray.h"

namespace mozilla::mailnews {

namespace {

/**
 * Find the length of a reply prefix at the given position.
 *
 * Empty counters and mismatched closing brackets are accepted for
 * compatibility with existing subjects.
 */
size_t ReplyPrefixLength(const nsACString& subject, size_t start,
                         const nsACString& prefix) {
  const size_t prefixLength = prefix.Length();
  if (!prefixLength || prefixLength >= subject.Length() - start ||
      !Substring(subject, start, prefixLength).Equals(prefix)) {
    return 0;
  }

  size_t cursor = start + prefixLength;
  if (subject[cursor] == ':') {
    return cursor + 1 - start;
  }
  if (subject[cursor] != '[' && subject[cursor] != '(') {
    return 0;
  }

  ++cursor;
  while (cursor < subject.Length() && IsAsciiDigit(subject[cursor])) {
    ++cursor;
  }
  if (cursor < subject.Length() - 1 &&
      (subject[cursor] == ']' || subject[cursor] == ')') &&
      subject[cursor + 1] == ':') {
    return cursor + 2 - start;
  }
  return 0;
}

}  // namespace

bool StripSubjectReplyPrefixes(nsCString& subject) {
  AutoTArray<nsCString, 8> prefixes{"Re"_ns, "RE"_ns, "re"_ns, "rE"_ns};
  nsAutoCString localizedPrefixes;
  if (NS_SUCCEEDED(Preferences::GetLocalizedCString("mailnews.localizedRe",
                                                    localizedPrefixes))) {
    for (const auto& prefix : localizedPrefixes.Split(',')) {
      prefixes.AppendElement(prefix);
    }
  }

  size_t cursor = 0;
  bool strippedPrefix = false;
  while (true) {
    while (cursor < subject.Length() &&
           (IsAsciiWhitespace(subject[cursor]) || subject[cursor] == '\v')) {
      ++cursor;
    }

    size_t consumed = 0;
    for (const auto& prefix : prefixes) {
      consumed = ReplyPrefixLength(subject, cursor, prefix);
      if (consumed) {
        break;
      }
    }
    if (!consumed) {
      break;
    }
    cursor += consumed;
    strippedPrefix = true;
  }

  if (strippedPrefix) {
    subject.Cut(0, cursor);
  }
  return strippedPrefix;
}

nsresult EncodeSubjectForLegacyStorage(const nsACString& subject,
                                       nsACString& encodedSubject) {
  if (subject.Find("=?") == kNotFound) {
    nsCOMPtr<nsIMimeConverter> mimeConverter =
        components::MimeConverter::Service();
    NS_ENSURE_TRUE(mimeConverter, NS_ERROR_FAILURE);
    return mimeConverter->EncodeMimePartIIStr_UTF8(
        subject, false, sizeof("Subject: ") - 1,
        nsIMimeConverter::MIME_ENCODED_WORD_SIZE, encodedSubject);
  }

  // Protect encoded-word-shaped literal text from being decoded when the
  // legacy database value is read back. Keep each word below the MIME limit.
  constexpr size_t kChunkSize = 42;
  encodedSubject.Truncate();
  for (size_t start = 0; start < subject.Length();) {
    size_t end = std::min(start + kChunkSize, subject.Length());
    while (end < subject.Length() &&
           (static_cast<unsigned char>(subject[end]) & 0xc0) == 0x80) {
      --end;
    }

    nsAutoCString base64;
    nsresult rv = Base64Encode(Substring(subject, start, end - start), base64);
    NS_ENSURE_SUCCESS(rv, rv);
    if (start) {
      encodedSubject.Append(' ');
    }
    encodedSubject.AppendLiteral("=?UTF-8?B?");
    encodedSubject.Append(base64);
    encodedSubject.AppendLiteral("?=");
    start = end;
  }
  return NS_OK;
}

NS_IMPL_ISUPPORTS(MsgSubjectUtils, nsIMsgSubjectUtils)

NS_IMETHODIMP MsgSubjectUtils::StripReplyPrefixes(const nsACString& subject,
                                                  nsACString& strippedSubject) {
  nsAutoCString result(subject);
  StripSubjectReplyPrefixes(result);
  strippedSubject = result;
  return NS_OK;
}

NS_IMETHODIMP MsgSubjectUtils::EncodeForLegacyStorage(
    const nsACString& subject, nsACString& encodedSubject) {
  return EncodeSubjectForLegacyStorage(subject, encodedSubject);
}

}  // namespace mozilla::mailnews
