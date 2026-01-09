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

  // Because this list of IDs is not intended to be restrictive (it's intended
  // to be used for offering a list of timezones to users), we only request the
  // canonical IDs to avoid providing lots of redundant options.
  icu::StringEnumeration* icuEnum = icu::VTimeZone::createTimeZoneIDEnumeration(
      UCAL_ZONE_TYPE_CANONICAL, nullptr, nullptr, err);
  if (U_FAILURE(err)) {
    NS_WARNING(nsPrintfCString("ICU error: %s", u_errorName(err)).get());
    return NS_ERROR_FAILURE;
  }

  const char* value;
  err = U_ZERO_ERROR;
  while ((value = icuEnum->next(nullptr, err)) != nullptr && U_SUCCESS(err)) {
    // The string pointed to by the call to `next()` is owned by ICU and must
    // not be freed.
    nsCString tzid(value);
    aTimezoneIds.AppendElement(tzid);
  }

  delete icuEnum;

  if (U_FAILURE(err)) {
    // If we encountered any error during enumeration of the timezones, we want
    // to return an empty list.
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
  // underlying, which makes the UnicodeString ctor ambiguous; be explicit here.
  const char16_t* convertedTzidPtr = convertedTzid.get();

  icu::UnicodeString icuTzid(convertedTzidPtr,
                             static_cast<int>(convertedTzid.Length()));

  // Try to convert Windows timezone IDs (like "Romance Standard Time") to
  // IANA timezone IDs (like "Europe/Paris"). This is necessary because
  // Exchange/Office 365 calendars often use Windows timezone names, which
  // ICU doesn't recognize on non-Windows platforms.
  UErrorCode err = U_ZERO_ERROR;
  icu::UnicodeString convertedIcuTzid;
  icu::TimeZone::getIDForWindowsID(icuTzid, nullptr, convertedIcuTzid, err);

  // If the conversion succeeded and returned a non-empty result, use the
  // converted IANA timezone ID. Otherwise, continue with the original ID.
  if (U_SUCCESS(err) && !convertedIcuTzid.isEmpty()) {
    icuTzid = convertedIcuTzid;
  }

  auto* icuTimezone = icu::VTimeZone::createVTimeZoneByID(icuTzid);
  if (icuTimezone == nullptr) {
    return NS_OK;
  }

  // Work around https://unicode-org.atlassian.net/browse/ICU-22175.
  // This workaround is overly complex because there's no simple, reliable way
  // to determine if a `VTimeZone` is "Etc/Unknown". `getID()` doesn't work
  // because the `VTimeZone` ctor doesn't set the ID field, and `hasSameRules()`
  // will return true for "Etc/Unknown" and "GMT". We need to use the `TimeZone`
  // class instead of `VTimeZone` to get the ID field.
  if (!tzid.Equals("Etc/Unknown") &&
      icuTimezone->hasSameRules(icu::TimeZone::getUnknown())) {
    icu::UnicodeString actualTzid;

    // `createTimeZone()` is guaranteed to never return `nullptr`, but it does
    // allocate memory.
    icu::TimeZone* tz = icu::TimeZone::createTimeZone(icuTzid);
    tz->getID(actualTzid);
    delete tz;

    if (actualTzid == UNICODE_STRING("Etc/Unknown", 11)) {
      // The caller has requested a timezone other than "Etc/Unknown", but ICU
      // has returned "Etc/Unknown", meaning the TZID was not recognized.
      delete icuTimezone;
      return NS_OK;
    }
  }

  // Extract the VTIMEZONE definition from the timezone object as a string.
  icu::UnicodeString vtimezoneDef;
  err = U_ZERO_ERROR;
  icuTimezone->write(vtimezoneDef, err);
  delete icuTimezone;

  if (U_FAILURE(err)) {
    NS_WARNING(
        nsPrintfCString("ICU error while generating VTIMEZONE definition: %s",
                        u_errorName(err))
            .get());

    return NS_ERROR_FAILURE;
  }

  NS_ConvertUTF16toUTF8 convertedDef(vtimezoneDef.getTerminatedBuffer());
  _retval.Assign(convertedDef);

  return NS_OK;
}
