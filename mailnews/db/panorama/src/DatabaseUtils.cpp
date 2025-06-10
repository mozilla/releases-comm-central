/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseUtils.h"

#include "mozilla/Components.h"
#include "mozilla/intl/FormatBuffer.h"
#include "mozilla/intl/String.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/storage/Variant.h"
#include "mozIStorageStatement.h"
#include "nsIAbCard.h"
#include "nsIMsgHeaderParser.h"
#include "nsString.h"

using mozilla::intl::nsTStringToBufferAdapter;
using mozilla::intl::String;

namespace mozilla::mailnews {

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

NS_IMPL_ISUPPORTS(AddressFormatFunction, mozIStorageFunction, nsIObserver)

NS_IMETHODIMP AddressFormatFunction::OnFunctionCall(
    mozIStorageValueArray* aArguments, nsIVariant** aResult) {
  MOZ_ASSERT(aArguments);
  MOZ_ASSERT(aResult);

  uint32_t argc;
  aArguments->GetNumEntries(&argc);

  if (argc != 1) {
    NS_WARNING("Don't call me with the wrong number of arguments!");
    return NS_ERROR_INVALID_ARG;
  }

  int32_t type;
  nsAutoCString value;
  aArguments->GetTypeOfIndex(0, &type);
  if (type != mozIStorageStatement::VALUE_TYPE_NULL) {
    if (type != mozIStorageStatement::VALUE_TYPE_TEXT) {
      NS_WARNING("Don't call me with the wrong type of argument 1!");
      return NS_ERROR_UNEXPECTED;
    }

    nsAutoCString header;
    aArguments->GetUTF8String(0, header);

    // TODO: Legacy code only handles the first sender address, and adds "et
    // al." if there are more. The zero recipients case also has special
    // handling not yet implemented here.

    nsCOMArray<msgIAddressObject> addresses = EncodedHeader(header);
    for (size_t i = 0; i < addresses.Length(); i++) {
      nsAutoString wName;
      nsAutoString wEmailAddress;
      addresses[i]->GetName(wName);
      addresses[i]->GetEmail(wEmailAddress);

      nsAutoCString name;
      nsAutoCString emailAddress;
      name.Assign(NS_ConvertUTF16toUTF8(wName));
      emailAddress.Assign(NS_ConvertUTF16toUTF8(wEmailAddress));

      nsAutoCString thisValue;
      if (mShowCondensedAddresses && !emailAddress.IsEmpty()) {
        GetDisplayNameInAddressBook(emailAddress, thisValue);
      }

      if (thisValue.IsEmpty()) {
        if (mAddressDisplayFormat == 0) {
          // Full name + address.
          thisValue = ExpandAddress(name, emailAddress);
        } else if (mAddressDisplayFormat == 1 && !emailAddress.IsEmpty()) {
          // Only email.
          thisValue.Assign(emailAddress);
        } else if (mAddressDisplayFormat == 2 && !name.IsEmpty()) {
          // Only name.
          thisValue = NoSpoofingSender(name, emailAddress);
        } else {
          // Try to automatically generate a name from the data we get.
          if (name.IsEmpty()) {
            thisValue.Assign(emailAddress);
          } else {
            thisValue = NoSpoofingSender(name, emailAddress);
          }
        }
      }

      if (i) {
        value.Append(", ");
      }
      value.Append(thisValue);
    }
  }

  nsCOMPtr<nsIVariant> result = new mozilla::storage::UTF8TextVariant(value);
  result.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP
AddressFormatFunction::Observe(nsISupports* aSubject, const char* aTopic,
                               const char16_t* aData) {
  if (!NS_strcmp(aData, u"mail.showCondensedAddresses")) {
    mShowCondensedAddresses =
        Preferences::GetBool("mail.showCondensedAddresses", true);
  } else if (!NS_strcmp(aData, u"mail.addressDisplayFormat")) {
    mAddressDisplayFormat = Preferences::GetInt("mail.addressDisplayFormat", 0);
  }
  return NS_OK;
}

/**
 * Generate a full expanded address string with the "Full name <email>" format.
 */
nsCString AddressFormatFunction::ExpandAddress(
    const nsCString& aName, const nsACString& aEmailAddress) {
  if (aName.IsEmpty() && aEmailAddress.IsEmpty()) {
    return nsCString();
  }

  nsCString displayName;
  displayName.Assign(aName);

  // We don't have a name, just return the email address.
  if (displayName.IsEmpty()) {
    displayName.Assign(aEmailAddress);
    return displayName;
  }

  // No email address, just return the name.
  if (aEmailAddress.IsEmpty()) {
    return displayName;
  }

  // We got both, compose the full string.
  displayName.AppendLiteral(" <");
  displayName.Append(aEmailAddress);
  displayName.Append('>');
  return displayName;
}

/**
 * Ensure we're safeguarding from spoofing attempt on the recipients name.
 */
nsCString AddressFormatFunction::NoSpoofingSender(
    const nsCString& aName, const nsACString& aEmailAddress) {
  int32_t atPos;
  if ((atPos = aName.FindChar('@')) == kNotFound ||
      aName.FindChar('.', atPos) == kNotFound) {
    return aName;
  }

  // Found @ followed by a dot, so this looks like a spoofing case.
  return ExpandAddress(aName, aEmailAddress);
}

nsresult AddressFormatFunction::GetDisplayNameInAddressBook(
    const nsACString& aEmailAddress, nsACString& aDisplayName) {
  if (!mAbManager) {
    mAbManager = mozilla::components::AbManager::Service();
  }

  nsCOMPtr<nsIAbCard> cardForAddress;
  nsresult rv = mAbManager->CardForEmailAddress(aEmailAddress,
                                                getter_AddRefs(cardForAddress));
  NS_ENSURE_SUCCESS(rv, rv);

  if (cardForAddress) {
    nsAutoString displayName;
    rv = cardForAddress->GetDisplayName(displayName);
    if (NS_SUCCEEDED(rv)) {
      aDisplayName.Assign(NS_ConvertUTF16toUTF8(displayName));
    }
  }

  return rv;
}

}  // namespace mozilla::mailnews
