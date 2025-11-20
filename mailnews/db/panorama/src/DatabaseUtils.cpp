/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseUtils.h"

#include "mozilla/Components.h"
#include "mozilla/intl/FormatBuffer.h"
#include "mozilla/intl/String.h"
#include "mozilla/Logging.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/storage/Variant.h"
#include "mozIStorageStatement.h"
#include "nsIAbCard.h"
#include "nsILiveView.h"
#include "nsIMsgHeaderParser.h"
#include "nsString.h"
#include "prtime.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;
using mozilla::intl::nsTStringToBufferAdapter;

namespace mozilla::mailnews {

extern LazyLogModule gPanoramaLog;  // Defined by DatabaseCore.

/* static */
nsCString DatabaseUtils::Normalize(const nsACString& inString) {
  nsAutoString inStringW = NS_ConvertUTF8toUTF16(inString);
  nsAutoString outStringW;
  nsTStringToBufferAdapter buffer(outStringW);
  auto alreadyNormalized = intl::String::Normalize(
      intl::String::NormalizationForm::NFC, inStringW, buffer);
  if (alreadyNormalized.unwrap() == intl::String::AlreadyNormalized::Yes) {
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
    mShowCondensedAddresses = StaticPrefs::mail_showCondensedAddresses();
  } else if (!NS_strcmp(aData, u"mail.addressDisplayFormat")) {
    mAddressDisplayFormat = StaticPrefs::mail_addressDisplayFormat();
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

NS_IMPL_ISUPPORTS(GroupedByDateFunction, mozIStorageFunction)

/**
 * Groups date values relative to the current time, for the "grouped by sort"
 * display when the sort is by date.
 *
 * There are five special categories here, "Future", "Today", "Yesterday", "Last
 * 7 Days", and "Last 14 Days". For input values in those ranges, magic output
 * values are returned. It doesn't matter what those values are as long as they
 * match the front-end code that handles them, and they are greater than the
 * current year so they get sorted correctly.
 *
 * For older input values, the year is returned.
 */
NS_IMETHODIMP GroupedByDateFunction::OnFunctionCall(
    mozIStorageValueArray* aArguments, nsIVariant** aResult) {
  MOZ_ASSERT(aArguments);
  MOZ_ASSERT(aResult);

  uint32_t argc;
  aArguments->GetNumEntries(&argc);

  if (argc != 1) {
    NS_WARNING("Don't call me with the wrong number of arguments!");
    return NS_ERROR_INVALID_ARG;
  }

  int64_t year = 0;
  int32_t type;
  aArguments->GetTypeOfIndex(0, &type);
  if (type != mozIStorageStatement::VALUE_TYPE_INTEGER) {
    NS_WARNING("Don't call me with the wrong type of argument 1!");
    return NS_ERROR_UNEXPECTED;
  }

  PRTime now = PR_Now();
  if (now >= mTomorrow) {
    // Precalculate all of the dates we're interested in. Doing this prevents a
    // call to PR_ExplodeTime for each message, instead we just do integer
    // comparison.
    // TODO: Reset mTomorrow to 0 if the system time zone changes. Observing
    // "default-timezone-changed" should be enough.
    MOZ_LOG(gPanoramaLog, LogLevel::Info,
            ("GroupedByDateFunction: (re)calculating dates"));

    char buf[24];
    PRExplodedTime explodedNow;
    PR_ExplodeTime(now, PR_LocalTimeParameters, &explodedNow);

    // Today, actually midnight last night.
    explodedNow.tm_hour = 0;
    explodedNow.tm_min = 0;
    explodedNow.tm_sec = 0;
    explodedNow.tm_usec = 0;
    mToday = PR_ImplodeTime(&explodedNow);
    PR_FormatTime(buf, 24, "%FT%T", &explodedNow);
    MOZ_LOG(gPanoramaLog, LogLevel::Debug,
            ("GroupedByDateFunction: today it was %s", buf));

    // Tomorrow, actually midnight tonight. If the actual time passes this
    // value, all the dates will be recalculated.
    explodedNow.tm_mday++;
    explodedNow.tm_hour =
        12;  // Normalise the middle of the day to avoid DST weirdness.
    PR_NormalizeTime(&explodedNow, PR_LocalTimeParameters);
    explodedNow.tm_hour = 0;  // Reset to midnight.
    explodedNow.tm_min = 0;
    mTomorrow = PR_ImplodeTime(&explodedNow);
    PR_FormatTime(buf, 24, "%FT%T", &explodedNow);
    MOZ_LOG(gPanoramaLog, LogLevel::Debug,
            ("GroupedByDateFunction: tomorrow it will be %s", buf));

    // Midnight yesterday.
    explodedNow.tm_mday -= 2;  // We went forward 1 day, now go back 2.
    explodedNow.tm_hour = 12;
    PR_NormalizeTime(&explodedNow, PR_LocalTimeParameters);
    explodedNow.tm_hour = 0;
    explodedNow.tm_min = 0;
    mYesterday = PR_ImplodeTime(&explodedNow);
    PR_FormatTime(buf, 24, "%FT%T", &explodedNow);
    MOZ_LOG(gPanoramaLog, LogLevel::Debug,
            ("GroupedByDateFunction: yesterday it was %s", buf));

    // "7 Days Ago", actually 6 days before midnight last night.
    explodedNow.tm_mday -= 5;  // 5 days before yesterday.
    explodedNow.tm_hour = 12;
    PR_NormalizeTime(&explodedNow, PR_LocalTimeParameters);
    explodedNow.tm_hour = 0;
    explodedNow.tm_min = 0;
    mThisWeek = PR_ImplodeTime(&explodedNow);
    PR_FormatTime(buf, 24, "%FT%T", &explodedNow);
    MOZ_LOG(gPanoramaLog, LogLevel::Debug,
            ("GroupedByDateFunction: 7 days ago it was %s", buf));

    // "14 Days Ago", actually 13 days before midnight last night.
    explodedNow.tm_mday -= 7;  // Another week earlier.
    explodedNow.tm_hour = 12;
    PR_NormalizeTime(&explodedNow, PR_LocalTimeParameters);
    explodedNow.tm_hour = 0;
    explodedNow.tm_min = 0;
    mLastWeek = PR_ImplodeTime(&explodedNow);
    PR_FormatTime(buf, 24, "%FT%T", &explodedNow);
    MOZ_LOG(gPanoramaLog, LogLevel::Debug,
            ("GroupedByDateFunction: 14 days ago it was %s", buf));
  }

  PRTime date = aArguments->AsInt64(0);
  if (date > now + 1800) {
    // A message from the future! (And a half-hour grace period for weirdness
    // like clock skew.)
    year = nsILiveView::DATE_GROUP_FUTURE;
  } else if (date >= mToday) {
    year = nsILiveView::DATE_GROUP_TODAY;
  } else if (date >= mYesterday) {
    year = nsILiveView::DATE_GROUP_YESTERDAY;
  } else if (date >= mThisWeek) {
    year = nsILiveView::DATE_GROUP_LAST_SEVEN_DAYS;
  } else if (date >= mLastWeek) {
    year = nsILiveView::DATE_GROUP_LAST_FOURTEEN_DAYS;
  } else {
    // TODO: This could be improved, to remove the PR_ExplodeTime call, by
    // pre-calculating the start of each year as a PRTime and doing integer
    // comparisons. But that's not important right now.
    PRExplodedTime explodedDate;
    PR_ExplodeTime(date, PR_LocalTimeParameters, &explodedDate);
    year = explodedDate.tm_year;
  }

  nsCOMPtr<nsIVariant> result = new mozilla::storage::IntegerVariant(year);
  result.forget(aResult);
  return NS_OK;
}

}  // namespace mozilla::mailnews
