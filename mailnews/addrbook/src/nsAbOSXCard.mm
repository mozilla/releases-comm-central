/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbOSXCard.h"

#include <AddressBook/AddressBook.h>

#include "mozilla/Components.h"
#include "nsAbOSXDirectory.h"
#include "nsAbOSXUtils.h"
#include "nsObjCExceptions.h"
#include "nsServiceManagerUtils.h"

NS_IMPL_ISUPPORTS_INHERITED(nsAbOSXCard, nsAbCardProperty, nsIAbOSXCard)

#ifdef DEBUG
static ABPropertyType GetPropertyType(ABRecord* aCard, NSString* aProperty) {
  ABPropertyType propertyType = kABErrorInProperty;
  if ([aCard isKindOfClass:[ABPerson class]])
    propertyType = [ABPerson typeOfProperty:aProperty];
  else if ([aCard isKindOfClass:[ABGroup class]])
    propertyType = [ABGroup typeOfProperty:aProperty];
  return propertyType;
}
#endif

static void SetStringProperty(nsAbOSXCard* aCard, const nsString& aValue,
                              const char* aMemberName, bool aNotify) {
  nsString oldValue;
  nsresult rv = aCard->GetPropertyAsAString(aMemberName, oldValue);
  if (NS_FAILED(rv)) oldValue.Truncate();

  if (!aNotify) {
    aCard->SetPropertyAsAString(aMemberName, aValue);
  } else if (!oldValue.Equals(aValue)) {
    aCard->SetPropertyAsAString(aMemberName, aValue);
  }
}

static void SetStringProperty(nsAbOSXCard* aCard, NSString* aValue,
                              const char* aMemberName, bool aNotify) {
  nsAutoString value;
  if (aValue) AppendToString(aValue, value);

  SetStringProperty(aCard, value, aMemberName, aNotify);
}

static void MapStringProperty(nsAbOSXCard* aCard, ABRecord* aOSXCard,
                              NSString* aProperty, const char* aMemberName,
                              bool aNotify) {
  NS_ASSERTION(aProperty, "This is bad! You asked for an unresolved symbol.");
  NS_ASSERTION(GetPropertyType(aOSXCard, aProperty) == kABStringProperty,
               "Wrong type!");

  SetStringProperty(aCard, [aOSXCard valueForProperty:aProperty], aMemberName,
                    aNotify);
}

static ABMutableMultiValue* GetMultiValue(ABRecord* aCard,
                                          NSString* aProperty) {
  NS_ASSERTION(aProperty, "This is bad! You asked for an unresolved symbol.");
  NS_ASSERTION(GetPropertyType(aCard, aProperty) & kABMultiValueMask,
               "Wrong type!");

  return [aCard valueForProperty:aProperty];
}

static void MapDate(nsAbOSXCard* aCard, NSDate* aDate,
                    const char* aYearPropName, const char* aMonthPropName,
                    const char* aDayPropName, bool aNotify) {
  // XXX Should we pass a format and timezone?
  NSCalendarDate* date = [aDate dateWithCalendarFormat:nil timeZone:nil];

  nsAutoString value;
  value.AppendInt(static_cast<int32_t>([date yearOfCommonEra]));
  SetStringProperty(aCard, value, aYearPropName, aNotify);
  value.Truncate();
  value.AppendInt(static_cast<int32_t>([date monthOfYear]));
  SetStringProperty(aCard, value, aMonthPropName, aNotify);
  value.Truncate();
  value.AppendInt(static_cast<int32_t>([date dayOfMonth]));
  SetStringProperty(aCard, value, aDayPropName, aNotify);
}

static bool MapMultiValue(nsAbOSXCard* aCard, ABRecord* aOSXCard,
                          const nsAbOSXPropertyMap& aMap, bool aNotify) {
  ABMultiValue* value = GetMultiValue(aOSXCard, aMap.mOSXProperty);
  if (value) {
    unsigned int j;
    unsigned int count = [value count];
    for (j = 0; j < count; ++j) {
      if ([[value labelAtIndex:j] isEqualToString:aMap.mOSXLabel]) {
        NSString* stringValue =
            (aMap.mOSXKey) ? [[value valueAtIndex:j] objectForKey:aMap.mOSXKey]
                           : [value valueAtIndex:j];

        SetStringProperty(aCard, stringValue, aMap.mPropertyName, aNotify);

        return true;
      }
    }
  }
  // String wasn't found, set value of card to empty if it was set previously
  SetStringProperty(aCard, EmptyString(), aMap.mPropertyName, aNotify);

  return false;
}

// Maps Address Book's instant messenger name to the corresponding nsIAbCard
// field name.
static const char* InstantMessengerFieldName(NSString* aInstantMessengerName) {
  if ([aInstantMessengerName isEqualToString:@"AIMInstant"]) {
    return "_AimScreenName";
  }
  if ([aInstantMessengerName isEqualToString:@"GoogleTalkInstant"]) {
    return "_GoogleTalk";
  }
  if ([aInstantMessengerName isEqualToString:@"ICQInstant"]) {
    return "_ICQ";
  }
  if ([aInstantMessengerName isEqualToString:@"JabberInstant"]) {
    return "_JabberId";
  }
  if ([aInstantMessengerName isEqualToString:@"MSNInstant"]) {
    return "_MSN";
  }
  if ([aInstantMessengerName isEqualToString:@"QQInstant"]) {
    return "_QQ";
  }
  if ([aInstantMessengerName isEqualToString:@"SkypeInstant"]) {
    return "_Skype";
  }
  if ([aInstantMessengerName isEqualToString:@"YahooInstant"]) {
    return "_Yahoo";
  }

  // Fall back to AIM for everything else.
  // We don't have nsIAbCard fields for FacebookInstant and GaduGaduInstant.
  return "_AimScreenName";
}

nsresult nsAbOSXCard::Init(const char* aUri) {
  if (strncmp(aUri, NS_ABOSXCARD_URI_PREFIX,
              sizeof(NS_ABOSXCARD_URI_PREFIX) - 1) != 0)
    return NS_ERROR_FAILURE;

  mURI = aUri;

  // Extract the UID part.
  mUID = Substring(mURI, 16, mURI.Length());
  // Now make sure we don't use the `:ABPerson` on the end, so that
  // we don't expose it to extensions etc.
  int32_t pos = mUID.RFindChar(':');
  if (pos != kNotFound) {
    mUID = Substring(mUID, 0, pos);
  }
  // Also lower case so that we match other UIDs generated by the address book.
  ToLowerCase(mUID);

  return Update(false);
}

nsresult nsAbOSXCard::GetURI(nsACString& aURI) {
  if (mURI.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  aURI = mURI;
  return NS_OK;
}

NS_IMETHODIMP nsAbOSXCard::GetUID(nsACString& uid) {
  uid = mUID;
  return NS_OK;
}

NS_IMETHODIMP nsAbOSXCard::SetUID(const nsACString& aUID) {
  // The UIDs are obtained from the OS X contacts and cannot be changed.
  return NS_ERROR_FAILURE;
}

nsresult nsAbOSXCard::Update(bool aNotify) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  ABAddressBook* addressBook = [ABAddressBook sharedAddressBook];

  const char* uid = &((mURI.get())[16]);
  ABRecord* card =
      [addressBook recordForUniqueId:[NSString stringWithUTF8String:uid]];
  NS_ENSURE_TRUE(card, NS_ERROR_FAILURE);

  if ([card isKindOfClass:[ABGroup class]]) {
    m_IsMailList = true;
    m_MailListURI.AssignLiteral(NS_ABOSXDIRECTORY_URI_PREFIX);
    m_MailListURI.Append(uid);
    MapStringProperty(this, card, kABGroupNameProperty, "DisplayName", aNotify);
    MapStringProperty(this, card, kABGroupNameProperty, "LastName", aNotify);

    return NS_OK;
  }

  bool foundHome = false, foundWork = false;

  uint32_t i;
  for (i = 0; i < nsAbOSXUtils::kPropertyMapSize; ++i) {
    const nsAbOSXPropertyMap& propertyMap = nsAbOSXUtils::kPropertyMap[i];
    if (!propertyMap.mOSXProperty) continue;

    if (propertyMap.mOSXLabel) {
      if (MapMultiValue(this, card, propertyMap, aNotify) &&
          propertyMap.mOSXProperty == kABAddressProperty) {
        if (propertyMap.mOSXLabel == kABAddressHomeLabel)
          foundHome = true;
        else
          foundWork = true;
      }
    } else {
      MapStringProperty(this, card, propertyMap.mOSXProperty,
                        propertyMap.mPropertyName, aNotify);
    }
  }

  int flags = 0;
  if (kABPersonFlags) flags = [[card valueForProperty:kABPersonFlags] intValue];

#define SET_STRING(_value, _name, _notify) \
  SetStringProperty(this, _value, #_name, _notify)

  // If kABShowAsCompany is set we use the company name as display name.
  if (kABPersonFlags && (flags & kABShowAsCompany)) {
    nsString company;
    nsresult rv = GetPropertyAsAString(kCompanyProperty, company);
    if (NS_FAILED(rv)) company.Truncate();
    SET_STRING(company, DisplayName, aNotify);
  } else {
    // Use the order used in the OS X address book to set DisplayName.
    int order = kABPersonFlags && (flags & kABNameOrderingMask);
    if (kABPersonFlags && (order == kABDefaultNameOrdering)) {
      order = [addressBook defaultNameOrdering];
    }

    nsAutoString displayName, tempName;
    if (kABPersonFlags && (order == kABFirstNameFirst)) {
      GetFirstName(tempName);
      displayName.Append(tempName);

      GetLastName(tempName);

      // Only append a space if the last name and the first name are not empty
      if (!tempName.IsEmpty() && !displayName.IsEmpty())
        displayName.Append(' ');

      displayName.Append(tempName);
    } else {
      GetLastName(tempName);
      displayName.Append(tempName);

      GetFirstName(tempName);

      // Only append a space if the last name and the first name are not empty
      if (!tempName.IsEmpty() && !displayName.IsEmpty())
        displayName.Append(' ');

      displayName.Append(tempName);
    }
    SET_STRING(displayName, DisplayName, aNotify);
  }

  ABMultiValue* value = GetMultiValue(card, kABEmailProperty);
  if (value) {
    unsigned int count = [value count];
    if (count > 0) {
      unsigned int j = [value indexForIdentifier:[value primaryIdentifier]];

      if (j < count) SET_STRING([value valueAtIndex:j], PrimaryEmail, aNotify);

      // If j is 0 (first in the list) we want the second in the list
      // (index 1), if j is anything else we want the first in the list
      // (index 0).
      j = (j == 0);
      if (j < count) SET_STRING([value valueAtIndex:j], SecondEmail, aNotify);
    }
  }

  // We map the first home address we can find and the first work address
  // we can find. If we find none, we map the primary address to the home
  // address.
  if (!foundHome && !foundWork) {
    value = GetMultiValue(card, kABAddressProperty);
    if (value) {
      unsigned int count = [value count];
      unsigned int j = [value indexForIdentifier:[value primaryIdentifier]];

      if (j < count) {
        NSDictionary* address = [value valueAtIndex:j];
        if (address) {
          SET_STRING([address objectForKey:kABAddressStreetKey], HomeAddress,
                     aNotify);
          SET_STRING([address objectForKey:kABAddressCityKey], HomeCity,
                     aNotify);
          SET_STRING([address objectForKey:kABAddressStateKey], HomeState,
                     aNotify);
          SET_STRING([address objectForKey:kABAddressZIPKey], HomeZipCode,
                     aNotify);
          SET_STRING([address objectForKey:kABAddressCountryKey], HomeCountry,
                     aNotify);
        }
      }
    }
  }
  // This was kABAIMInstantProperty previously, but it was deprecated in OS
  // X 10.7.
  value = GetMultiValue(card, kABInstantMessageProperty);
  if (value) {
    unsigned int count = [value count];
    for (size_t i = 0; i < count; i++) {
      id imValue = [value valueAtIndex:i];
      // Depending on the macOS version, imValue can be an NSString or an
      // NSDictionary.
      if ([imValue isKindOfClass:[NSString class]]) {
        if (i == [value indexForIdentifier:[value primaryIdentifier]]) {
          SET_STRING(imValue, _AimScreenName, aNotify);
        }
      } else if ([imValue isKindOfClass:[NSDictionary class]]) {
        NSString* instantMessageService =
            [imValue objectForKey:@"InstantMessageService"];
        const char* fieldName =
            InstantMessengerFieldName(instantMessageService);
        NSString* userName = [imValue objectForKey:@"InstantMessageUsername"];
        SetStringProperty(this, userName, fieldName, aNotify);
      }
    }
  }

#define MAP_DATE(_date, _name, _notify) \
  MapDate(this, _date, #_name "Year", #_name "Month", #_name "Day", _notify)

  NSDate* date = [card valueForProperty:kABBirthdayProperty];
  if (date) MAP_DATE(date, Birth, aNotify);

  if (kABOtherDatesProperty) {
    value = GetMultiValue(card, kABOtherDatesProperty);
    if (value) {
      unsigned int j, count = [value count];
      for (j = 0; j < count; ++j) {
        if ([[value labelAtIndex:j] isEqualToString:kABAnniversaryLabel]) {
          date = [value valueAtIndex:j];
          if (date) {
            MAP_DATE(date, Anniversary, aNotify);
            break;
          }
        }
      }
    }
  }
#undef MAP_DATE
#undef SET_STRING

  date = [card valueForProperty:kABModificationDateProperty];
  if (date)
    SetPropertyAsUint32("LastModifiedDate",
                        uint32_t([date timeIntervalSince1970]));
  // XXX No way to notify about this?

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}
