/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "comi18n.h"
#include "nsMsgUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsIMimeConverter.h"
#include "mozilla/Preferences.h"
#include "mozilla/Encoding.h"
#include "mozilla/EncodingDetector.h"

using namespace mozilla;

////////////////////////////////////////////////////////////////////////////////
// BEGIN PUBLIC INTERFACE
extern "C" {

void MIME_DecodeMimeHeader(const char* header, const char* default_charset,
                           bool override_charset, bool eatContinuations,
                           nsACString& result) {
  nsresult rv;
  nsCOMPtr<nsIMimeConverter> mimeConverter =
      do_GetService("@mozilla.org/messenger/mimeconverter;1", &rv);
  if (NS_FAILED(rv)) {
    result.Truncate();
    return;
  }
  mimeConverter->DecodeMimeHeaderToUTF8(nsDependentCString(header),
                                        default_charset, override_charset,
                                        eatContinuations, result);
}

nsresult MIME_detect_charset(const char* aBuf, int32_t aLength,
                             nsACString& aCharset) {
  mozilla::UniquePtr<mozilla::EncodingDetector> detector =
      mozilla::EncodingDetector::Create();
  mozilla::Span<const uint8_t> src =
      mozilla::AsBytes(mozilla::Span(aBuf, aLength));
  Unused << detector->Feed(src, true);
  auto encoding = detector->Guess(nullptr, true);
  encoding->Name(aCharset);
  return NS_OK;
}

} /* end of extern "C" */
// END PUBLIC INTERFACE
