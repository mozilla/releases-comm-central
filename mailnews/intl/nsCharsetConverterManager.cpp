/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsString.h"
#include "nsCharsetAlias.h"
#include "nsICharsetConverterManager.h"
#include "mozilla/intl/EncodingToLang.h"

#include "../base/src/nsMsgI18N.h"

// just for CONTRACTIDs
#include "nsCharsetConverterManager.h"

// Class nsCharsetConverterManager [implementation]

NS_IMPL_ISUPPORTS(nsCharsetConverterManager, nsICharsetConverterManager)

//----------------------------------------------------------------------------//----------------------------------------------------------------------------
// Interface nsICharsetConverterManager [implementation]

// XXX Improve the implementation of this method. Right now, it is build on
// top of the nsCharsetAlias service. We can make the nsCharsetAlias
// better, with its own hash table (not the StringBundle anymore) and
// a nicer file format.
NS_IMETHODIMP
nsCharsetConverterManager::GetCharsetAlias(const char* aCharset,
                                           nsACString& aResult) {
  NS_ENSURE_ARG_POINTER(aCharset);

  // We try to obtain the preferred name for this charset from the charset
  // aliases.
  nsresult rv;

  rv = nsCharsetAlias::GetPreferred(nsDependentCString(aCharset), aResult);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP
nsCharsetConverterManager::GetCharsetLangGroup(const char* aCharset,
                                               nsACString& aResult) {
  // Resolve a possible charset alias first.
  nsAutoCString label;
  nsresult rv = GetCharsetAlias(aCharset, label);
  NS_ENSURE_SUCCESS(rv, rv);

  // There is no UTF-7 mozilla::Encoding, so we do this replacement which
  // yields the same result.
  if (label.Equals("UTF-7")) {
    label = "utf-8";
  }

  const mozilla::Encoding* encoding = mozilla::Encoding::ForLabel(label);
  if (!encoding) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Unfortunately, the Mozilla lookup function returns the current
  // locale for these encodings, so we check these directly.
  const mozilla::NotNull<const mozilla::Encoding*>* xUnicodeEncodings[] = {
      &UTF_8_ENCODING, &UTF_16BE_ENCODING, &UTF_16LE_ENCODING,
      &REPLACEMENT_ENCODING, &X_USER_DEFINED_ENCODING};
  for (auto& xUnicodeEncoding : xUnicodeEncodings) {
    if (*xUnicodeEncoding == encoding) {
      aResult = "x-unicode";
      return NS_OK;
    }
  }
  nsAtom* lang = mozilla::intl::EncodingToLang::Lookup(WrapNotNull(encoding));
  lang->ToUTF8String(aResult);
  return NS_OK;
}

NS_IMETHODIMP
nsCharsetConverterManager::IsMultiByteCharset(const char* aCharset,
                                              bool* aResult) {
  if (!aCharset) {
    *aResult = false;
    return NS_OK;
  }
  nsAutoCString label(aCharset);
  ToLowerCase(label);
  const mozilla::Encoding* encoding = mozilla::Encoding::ForLabel(label);
  if (!encoding) {
    // mozilla::Encoding doesn't know about UTF-7, which is also multi byte.
    *aResult = label.Equals("utf-7");
    return NS_OK;
  }
  *aResult = !encoding->IsSingleByte();
  return NS_OK;
}

NS_IMETHODIMP
nsCharsetConverterManager::Utf7ToUnicode(const nsACString& aSrc,
                                         nsAString& aDest) {
  return CopyUTF7toUTF16(aSrc, aDest);
}

NS_IMETHODIMP
nsCharsetConverterManager::Mutf7ToUnicode(const nsACString& aSrc,
                                          nsAString& aDest) {
  return CopyMUTF7toUTF16(aSrc, aDest);
}

NS_IMETHODIMP
nsCharsetConverterManager::UnicodeToMutf7(const nsAString& aSrc,
                                          nsACString& aDest) {
  return CopyUTF16toMUTF7(aSrc, aDest);
}
