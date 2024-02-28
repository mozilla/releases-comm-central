/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsICharsetConverterManager.h"
#include "mozilla/Utf8.h"
#include "nsIServiceManager.h"

#include "nsISupports.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsIMimeConverter.h"
#include "nsMsgUtils.h"
#include "nsMsgI18N.h"
#include "nsILineInputStream.h"
#include "nsMimeTypes.h"
#include "nsString.h"
#include "prmem.h"
#include "plstr.h"
#include "nsUTF8Utils.h"
#include "nsNetUtil.h"
#include "nsCRTGlue.h"
#include "nsComponentManagerUtils.h"
#include "nsUnicharUtils.h"
#include "nsIFileStreams.h"
#include "../../intl/nsUTF7ToUnicode.h"
#include "../../intl/nsMUTF7ToUnicode.h"
#include "../../intl/nsUnicodeToMUTF7.h"

#include <stdlib.h>
#include <tuple>

//
// International functions necessary for composition
//

nsresult nsMsgI18NConvertFromUnicode(const nsACString& aCharset,
                                     const nsAString& inString,
                                     nsACString& outString,
                                     bool aReportUencNoMapping) {
  if (inString.IsEmpty()) {
    outString.Truncate();
    return NS_OK;
  }

  auto encoding = mozilla::Encoding::ForLabelNoReplacement(aCharset);
  if (!encoding) {
    return NS_ERROR_UCONV_NOCONV;
  } else if (encoding == UTF_16LE_ENCODING || encoding == UTF_16BE_ENCODING) {
    // We shouldn't ever ship anything in these encodings.
    return NS_ERROR_UCONV_NOCONV;
  }

  nsresult rv;
  std::tie(rv, std::ignore) = encoding->Encode(inString, outString);

  if (rv == NS_OK_HAD_REPLACEMENTS) {
    rv = aReportUencNoMapping ? NS_ERROR_UENC_NOMAPPING : NS_OK;
  }

  return rv;
}

nsresult nsMsgI18NConvertToUnicode(const nsACString& aCharset,
                                   const nsACString& inString,
                                   nsAString& outString) {
  if (inString.IsEmpty()) {
    outString.Truncate();
    return NS_OK;
  }
  if (aCharset.IsEmpty()) {
    // Despite its name, it also works for Latin-1.
    CopyASCIItoUTF16(inString, outString);
    return NS_OK;
  }

  if (aCharset.Equals("UTF-8", nsCaseInsensitiveCStringComparator)) {
    return UTF_8_ENCODING->DecodeWithBOMRemoval(inString, outString);
  }

  // Look up Thunderbird's special aliases from charsetalias.properties.
  nsresult rv;
  nsCOMPtr<nsICharsetConverterManager> ccm =
      do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString newCharset;
  rv = ccm->GetCharsetAlias(PromiseFlatCString(aCharset).get(), newCharset);
  NS_ENSURE_SUCCESS(rv, rv);

  if (newCharset.Equals("UTF-7", nsCaseInsensitiveCStringComparator)) {
    // Special treatment for decoding UTF-7 since it's not handled by
    // encoding_rs.
    return CopyUTF7toUTF16(inString, outString);
  }

  auto encoding = mozilla::Encoding::ForLabelNoReplacement(newCharset);
  if (!encoding) return NS_ERROR_UCONV_NOCONV;
  return encoding->DecodeWithoutBOMHandling(inString, outString);
}

// This is used to decode UTF-7. No support for encoding in UTF-7.
nsresult CopyUTF7toUTF16(const nsACString& aSrc, nsAString& aDest) {
  // UTF-7 encoding size cannot be larger than the size in UTF-16.
  nsUTF7ToUnicode converter;
  int32_t inLen = aSrc.Length();
  int32_t outLen = inLen;
  aDest.SetLength(outLen);
  converter.ConvertNoBuff(aSrc.BeginReading(), &inLen, aDest.BeginWriting(),
                          &outLen);
  MOZ_ASSERT(inLen == (int32_t)aSrc.Length(),
             "UTF-7 should not produce a longer output");
  aDest.SetLength(outLen);
  return NS_OK;
}

nsresult CopyUTF16toMUTF7(const nsAString& aSrc, nsACString& aDest) {
#define IMAP_UTF7_BUF_LENGTH 100
  nsUnicodeToMUTF7 converter;
  static char buffer[IMAP_UTF7_BUF_LENGTH];
  const char16_t* in = aSrc.BeginReading();
  int32_t inLen = aSrc.Length();
  int32_t outLen;
  aDest.Truncate();
  while (inLen > 0) {
    outLen = IMAP_UTF7_BUF_LENGTH;
    int32_t remaining = inLen;
    converter.ConvertNoBuffNoErr(in, &remaining, buffer, &outLen);
    aDest.Append(buffer, outLen);
    in += remaining;
    inLen -= remaining;
  }
  outLen = IMAP_UTF7_BUF_LENGTH;
  converter.FinishNoBuff(buffer, &outLen);
  if (outLen > 0) aDest.Append(buffer, outLen);
  return NS_OK;
}

// Hacky function to use for IMAP folders where the name can be in
// MUTF-7 or UTF-8.
nsresult CopyFolderNameToUTF16(const nsACString& aSrc, nsAString& aDest) {
  if (NS_IsAscii(aSrc.BeginReading(), aSrc.Length())) {
    // An ASCII string may not be valid MUTF-7. For example, it may contain an
    // ampersand not immediately followed by a dash which is invalid MUTF-7.
    // Check for validity by converting to UTF-16 and then back to MUTF-7 and
    // the result should be unchanged. If the MUTF-7 is invalid, treat it as
    // UTF-8.
    if (NS_SUCCEEDED(CopyMUTF7toUTF16(aSrc, aDest))) {
      nsAutoCString tmp;
      CopyUTF16toMUTF7(aDest, tmp);
      if (aSrc.Equals(tmp)) return NS_OK;
    }
  }
  // Do if aSrc non-ASCII or if ASCII but invalid MUTF-7.
  CopyUTF8toUTF16(aSrc, aDest);
  return NS_OK;
}

nsresult CopyMUTF7toUTF16(const nsACString& aSrc, nsAString& aDest) {
  // MUTF-7 encoding size cannot be larger than the size in UTF-16.
  nsMUTF7ToUnicode converter;
  int32_t inLen = aSrc.Length();
  int32_t outLen = inLen;
  aDest.SetLength(outLen);
  converter.ConvertNoBuff(aSrc.BeginReading(), &inLen, aDest.BeginWriting(),
                          &outLen);
  MOZ_ASSERT(inLen == (int32_t)aSrc.Length(),
             "MUTF-7 should not produce a longer output");
  aDest.SetLength(outLen);
  return NS_OK;
}

// MIME encoder, output string should be freed by PR_FREE
// XXX : fix callers later to avoid allocation and copy
char* nsMsgI18NEncodeMimePartIIStr(const char* header, bool structured,
                                   const char* charset, int32_t fieldnamelen) {
  nsAutoCString encodedString;
  nsresult res;
  nsCOMPtr<nsIMimeConverter> converter =
      do_GetService("@mozilla.org/messenger/mimeconverter;1", &res);
  if (NS_SUCCEEDED(res) && nullptr != converter) {
    res = converter->EncodeMimePartIIStr_UTF8(
        nsDependentCString(header), structured, fieldnamelen,
        nsIMimeConverter::MIME_ENCODED_WORD_SIZE, encodedString);
  }

  return NS_SUCCEEDED(res) ? PL_strdup(encodedString.get()) : nullptr;
}

// Return True if a charset is stateful (e.g. JIS).
bool nsMsgI18Nstateful_charset(const char* charset) {
  // TODO: use charset manager's service
  return (PL_strcasecmp(charset, "ISO-2022-JP") == 0);
}

bool nsMsgI18Nmultibyte_charset(const char* charset) {
  nsresult res;
  nsCOMPtr<nsICharsetConverterManager> ccm =
      do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &res);
  bool result = false;

  if (NS_SUCCEEDED(res)) {
    nsAutoString charsetData;
    res = ccm->GetCharsetData(charset, u".isMultibyte", charsetData);
    if (NS_SUCCEEDED(res)) {
      result = charsetData.LowerCaseEqualsLiteral("true");
    }
  }

  return result;
}

bool nsMsgI18Ncheck_data_in_charset_range(const char* charset,
                                          const char16_t* inString) {
  if (!charset || !*charset || !inString || !*inString) return true;

  bool res = true;

  auto encoding =
      mozilla::Encoding::ForLabelNoReplacement(nsDependentCString(charset));
  if (!encoding) return false;
  auto encoder = encoding->NewEncoder();

  uint8_t buffer[512];
  auto src = mozilla::MakeStringSpan(inString);
  auto dst = mozilla::Span(buffer);
  while (true) {
    uint32_t result;
    size_t read;
    size_t written;
    std::tie(result, read, written) =
        encoder->EncodeFromUTF16WithoutReplacement(src, dst, false);
    if (result == mozilla::kInputEmpty) {
      // All converted successfully.
      break;
    } else if (result != mozilla::kOutputFull) {
      // Didn't use all the input but the output isn't full, hence
      // there was an unencodable character.
      res = false;
      break;
    }
    src = src.From(read);
    // dst = dst.From(written); // Just overwrite output since we don't need it.
  }

  return res;
}

// Simple parser to parse META charset.
// It only supports the case when the description is within one line.
const char* nsMsgI18NParseMetaCharset(nsIFile* file) {
  static char charset[nsIMimeConverter::MAX_CHARSET_NAME_LENGTH + 1];

  *charset = '\0';

  bool isDirectory = false;
  file->IsDirectory(&isDirectory);
  if (isDirectory) {
    NS_ERROR("file is a directory");
    return charset;
  }

  nsresult rv;
  nsCOMPtr<nsIFileInputStream> fileStream =
      do_CreateInstance(NS_LOCALFILEINPUTSTREAM_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, charset);

  rv = fileStream->Init(file, PR_RDONLY, 0664, false);
  nsCOMPtr<nsILineInputStream> lineStream = do_QueryInterface(fileStream, &rv);

  nsCString curLine;
  bool more = true;
  while (NS_SUCCEEDED(rv) && more) {
    rv = lineStream->ReadLine(curLine, &more);
    if (curLine.IsEmpty()) continue;

    ToUpperCase(curLine);

    if (curLine.Find("/HEAD") != -1) break;

    if (curLine.Find("META") != -1 && curLine.Find("HTTP-EQUIV") != -1 &&
        curLine.Find("CONTENT-TYPE") != -1 && curLine.Find("CHARSET") != -1) {
      char* cp = (char*)PL_strchr(PL_strstr(curLine.get(), "CHARSET"), '=');
      char* token = nullptr;
      if (cp) {
        char* newStr = cp + 1;
        token = NS_strtok(" \"\'", &newStr);
      }
      if (token) {
        PL_strncpy(charset, token, sizeof(charset));
        charset[sizeof(charset) - 1] = '\0';

        // this function cannot parse a file if it is really
        // encoded by one of the following charsets
        // so we can say that the charset label must be incorrect for
        // the .html if we actually see those charsets parsed
        // and we should ignore them
        if (!PL_strncasecmp("UTF-16", charset, sizeof("UTF-16") - 1) ||
            !PL_strncasecmp("UTF-32", charset, sizeof("UTF-32") - 1))
          charset[0] = '\0';

        break;
      }
    }
  }

  return charset;
}

nsresult nsMsgI18NShrinkUTF8Str(const nsACString& inString, uint32_t aMaxLength,
                                nsACString& outString) {
  if (inString.IsEmpty()) {
    outString.Truncate();
    return NS_OK;
  }
  if (inString.Length() < aMaxLength) {
    outString.Assign(inString);
    return NS_OK;
  }
  NS_ASSERTION(mozilla::IsUtf8(inString), "Invalid UTF-8 string is inputted");
  const char* start = inString.BeginReading();
  const char* end = start + inString.Length();
  const char* last = start + aMaxLength;
  const char* cur = start;
  const char* prev = nullptr;
  bool err = false;
  while (cur < last) {
    prev = cur;
    if (!UTF8CharEnumerator::NextChar(&cur, end, &err) || err) break;
  }
  if (!prev || err) {
    outString.Truncate();
    return NS_OK;
  }
  uint32_t len = prev - start;
  outString.Assign(Substring(inString, 0, len));
  return NS_OK;
}

void nsMsgI18NConvertRawBytesToUTF16(const nsACString& inString,
                                     const nsACString& charset,
                                     nsAString& outString) {
  if (mozilla::IsUtf8(inString)) {
    CopyUTF8toUTF16(inString, outString);
    return;
  }

  nsresult rv = nsMsgI18NConvertToUnicode(charset, inString, outString);
  if (NS_SUCCEEDED(rv)) return;

  const char* cur = inString.BeginReading();
  const char* end = inString.EndReading();
  outString.Truncate();
  while (cur < end) {
    char c = *cur++;
    if (c & char(0x80))
      outString.Append(UCS2_REPLACEMENT_CHAR);
    else
      outString.Append(c);
  }
}

void nsMsgI18NConvertRawBytesToUTF8(const nsACString& inString,
                                    const nsACString& charset,
                                    nsACString& outString) {
  if (mozilla::IsUtf8(inString)) {
    outString.Assign(inString);
    return;
  }

  nsAutoString utf16Text;
  nsresult rv = nsMsgI18NConvertToUnicode(charset, inString, utf16Text);
  if (NS_SUCCEEDED(rv)) {
    CopyUTF16toUTF8(utf16Text, outString);
    return;
  }

  // EF BF BD (UTF-8 encoding of U+FFFD)
  constexpr auto utf8ReplacementChar = "\357\277\275"_ns;
  const char* cur = inString.BeginReading();
  const char* end = inString.EndReading();
  outString.Truncate();
  while (cur < end) {
    char c = *cur++;
    if (c & char(0x80))
      outString.Append(utf8ReplacementChar);
    else
      outString.Append(c);
  }
}
