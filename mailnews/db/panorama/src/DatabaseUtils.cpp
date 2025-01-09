/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseUtils.h"

#include "mozilla/intl/FormatBuffer.h"
#include "mozilla/intl/String.h"
#include "mozilla/storage/Variant.h"
#include "mozIStorageStatement.h"
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

NS_IMPL_ISUPPORTS(TagsMatchFunction, mozIStorageFunction)

NS_IMETHODIMP TagsMatchFunction::OnFunctionCall(
    mozIStorageValueArray* aArguments, nsIVariant** aResult) {
  MOZ_ASSERT(aArguments);
  MOZ_ASSERT(aResult);

  uint32_t argc;
  aArguments->GetNumEntries(&argc);

  if (argc != 2) {
    NS_WARNING("Don't call me with the wrong number of arguments!");
    return NS_ERROR_INVALID_ARG;
  }

  int32_t type;
  bool found = false;
  aArguments->GetTypeOfIndex(0, &type);
  if (type != mozIStorageStatement::VALUE_TYPE_NULL) {
    if (type != mozIStorageStatement::VALUE_TYPE_TEXT) {
      NS_WARNING("Don't call me with the wrong type of argument 1!");
      return NS_ERROR_UNEXPECTED;
    }
    aArguments->GetTypeOfIndex(1, &type);
    if (type != mozIStorageStatement::VALUE_TYPE_TEXT) {
      NS_WARNING("Don't call me with the wrong type of argument 2!");
      return NS_ERROR_UNEXPECTED;
    }

    nsAutoCString haystack;
    aArguments->GetUTF8String(0, haystack);
    nsAutoCString needle;
    aArguments->GetUTF8String(1, needle);

    for (auto field : haystack.Split(' ')) {
      if (field.Equals(needle)) {
        found = true;
        break;
      }
    }
  }

  nsCOMPtr<nsIVariant> result =
      new mozilla::storage::BooleanVariant(found == mWanted);
  result.forget(aResult);
  return NS_OK;
}

}  // namespace mailnews
}  // namespace mozilla
