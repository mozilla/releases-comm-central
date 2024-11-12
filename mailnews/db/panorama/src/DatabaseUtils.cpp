/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseUtils.h"

#include "mozilla/intl/FormatBuffer.h"
#include "mozilla/intl/String.h"
#include "nsString.h"

using mozilla::intl::nsTStringToBufferAdapter;
using mozilla::intl::String;

namespace mozilla {
namespace mailnews {

/* static */
nsCString DatabaseUtils::Normalize(const nsACString& inString) {
  nsAutoString inStringW = NS_ConvertUTF8toUTF16(inString);
  nsAutoString outStringW;
  nsTStringToBufferAdapter buffer(outStringW);
  auto alreadyNormalized =
      String::Normalize(String::NormalizationForm::NFC, inStringW, buffer);
  if (alreadyNormalized.unwrap() == String::AlreadyNormalized::Yes) {
    return nsCString(inString);
  }
  return NS_ConvertUTF16toUTF8(buffer.data());
}

}  // namespace mailnews
}  // namespace mozilla
