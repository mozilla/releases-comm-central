/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsPrintfCString.h"
#include "nsString.h"
#include "unicode/strenum.h"
#include "unicode/timezone.h"
#include "unicode/ucal.h"
#include "unicode/utypes.h"
#include "unicode/vtzone.h"

#include "TimezoneDatabase.h"

NS_IMPL_ISUPPORTS(TimezoneDatabase, calITimezoneDatabase)

NS_IMETHODIMP
TimezoneDatabase::GetVersion(nsACString& aVersion) {
  UErrorCode err = U_ZERO_ERROR;
  const char* version = icu::VTimeZone::getTZDataVersion(err);
  if (U_FAILURE(err)) {
    NS_WARNING(nsPrintfCString("ICU error: %s", u_errorName(err)).get());
    return NS_ERROR_FAILURE;
  }

  aVersion.Assign(version);

  return NS_OK;
}

NS_IMETHODIMP
TimezoneDatabase::GetCanonicalTimezoneIds(nsTArray<nsCString>& aTimezoneIds) {
  aTimezoneIds.Clear();

  UErrorCode err = U_ZERO_ERROR;

  // Because this list of IDs is not intended to be restrictive, we only request
  // the canonical IDs to avoid providing lots of redundant options to users
  icu::StringEnumeration* icuEnum = icu::VTimeZone::createTimeZoneIDEnumeration(
      UCAL_ZONE_TYPE_CANONICAL, nullptr, nullptr, err);
  if (U_FAILURE(err)) {
    NS_WARNING(nsPrintfCString("ICU error: %s", u_errorName(err)).get());
    return NS_ERROR_FAILURE;
  }

  const char* value;
  err = U_ZERO_ERROR;
  while ((value = icuEnum->next(nullptr, err)) != nullptr && U_SUCCESS(err)) {
    nsCString tzid(value);
    aTimezoneIds.AppendElement(tzid);
  }

  if (U_FAILURE(err)) {
    // If we encountered any error during enumeration of the timezones, we want
    // to return an empty list
    aTimezoneIds.Clear();

    NS_WARNING(nsPrintfCString("ICU error: %s", u_errorName(err)).get());
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP
TimezoneDatabase::GetTimezoneDefinition(const nsACString& tzid,
                                        nsACString& _retval) {
  _retval.Truncate();

  NS_ConvertUTF8toUTF16 convertedTzid(tzid);

  // It seems Windows can potentially build `convertedTzid` with wchar_t
  // underlying, which makes the UnicodeString ctor ambiguous; be explicit here
  const char16_t* convertedTzidPtr = convertedTzid.get();

  icu::UnicodeString icuTzid(convertedTzidPtr,
                             static_cast<int>(convertedTzid.Length()));

  auto* icuTimezone = icu::VTimeZone::createVTimeZoneByID(icuTzid);
  if (icuTimezone == nullptr) {
    return NS_OK;
  }

  // Work around https://unicode-org.atlassian.net/browse/ICU-22175
  // This workaround is overly complex because there's no simple, reliable way
  // to determine if a VTimeZone is Etc/Unknown; getID() doesn't work because
  // the ctor doesn't set the ID field, and hasSameRules() against Etc/Unknown
  // will return true if icuTimezone is GMT
  if (icuTimezone->hasSameRules(icu::TimeZone::getUnknown()) &&
      !tzid.Equals("Etc/Unknown")) {
    icu::UnicodeString actualTzid;
    icu::TimeZone::createTimeZone(icuTzid)->getID(actualTzid);

    if (actualTzid == UNICODE_STRING("Etc/Unknown", 11)) {
      return NS_OK;
    }
  }

  // Extract the VTIMEZONE definition from the timezone object
  icu::UnicodeString vtimezoneDef;
  UErrorCode err = U_ZERO_ERROR;
  icuTimezone->write(vtimezoneDef, err);
  if (U_FAILURE(err)) {
    NS_WARNING(nsPrintfCString("ICU error: %s", u_errorName(err)).get());

    return NS_ERROR_FAILURE;
  }

  NS_ConvertUTF16toUTF8 convertedDef(vtimezoneDef.getTerminatedBuffer());

  _retval.Assign(convertedDef);

  return NS_OK;
}
