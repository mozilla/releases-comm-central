/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbCardProperty.h"
#include "nsIPrefService.h"
#include "nsIAbDirectory.h"
#include "plbase64.h"
#include "nsIStringBundle.h"
#include "plstr.h"
#include "nsMsgUtils.h"
#include "nsINetUtil.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "mozITXTToHTMLConv.h"
#include "nsIAbManager.h"
#include "nsIUUIDGenerator.h"
#include "nsIMsgVCardService.h"
#include "nsVariant.h"
#include "nsIProperty.h"
#include "prmem.h"
#include "mozilla/Components.h"

using namespace mozilla;

#define PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST "mail.addr_book.lastnamefirst"

const char sAddrbookProperties[] =
    "chrome://messenger/locale/addressbook/addressBook.properties";

nsAbCardProperty::nsAbCardProperty() : m_IsMailList(false) {
  // Initialize some default properties
  SetPropertyAsUint32(kPopularityIndexProperty, 0);
  // Uninitialized...
  SetPropertyAsUint32(kLastModifiedDateProperty, 0);
}

nsAbCardProperty::~nsAbCardProperty(void) {}

NS_IMPL_ISUPPORTS(nsAbCardProperty, nsIAbCard)

NS_IMETHODIMP nsAbCardProperty::GetDirectoryUID(nsACString& dirUID) {
  dirUID = m_directoryUID;
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetDirectoryUID(const nsACString& aDirUID) {
  m_directoryUID = aDirUID;
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsAbCardProperty::GetIsMailList(bool* aIsMailList) {
  *aIsMailList = m_IsMailList;
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetIsMailList(bool aIsMailList) {
  m_IsMailList = aIsMailList;
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetMailListURI(char** aMailListURI) {
  if (aMailListURI) {
    *aMailListURI = ToNewCString(m_MailListURI);
    return (*aMailListURI) ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
  } else
    return NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsAbCardProperty::SetMailListURI(const char* aMailListURI) {
  if (aMailListURI) {
    m_MailListURI = aMailListURI;
    return NS_OK;
  } else
    return NS_ERROR_NULL_POINTER;
}

///////////////////////////////////////////////////////////////////////////////
// Property bag portion of nsAbCardProperty
///////////////////////////////////////////////////////////////////////////////

class nsAbSimpleProperty final : public nsIProperty {
 public:
  nsAbSimpleProperty(const nsACString& aName, nsIVariant* aValue)
      : mName(aName), mValue(aValue) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROPERTY
 protected:
  ~nsAbSimpleProperty() {}
  nsCString mName;
  nsCOMPtr<nsIVariant> mValue;
};

NS_IMPL_ISUPPORTS(nsAbSimpleProperty, nsIProperty)

NS_IMETHODIMP
nsAbSimpleProperty::GetName(nsAString& aName) {
  aName.Assign(NS_ConvertUTF8toUTF16(mName));
  return NS_OK;
}

NS_IMETHODIMP
nsAbSimpleProperty::GetValue(nsIVariant** aValue) {
  NS_IF_ADDREF(*aValue = mValue);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetProperties(
    nsTArray<RefPtr<nsIProperty>>& props) {
  props.ClearAndRetainStorage();
  props.SetCapacity(m_properties.Count());
  for (auto iter = m_properties.Iter(); !iter.Done(); iter.Next()) {
    props.AppendElement(new nsAbSimpleProperty(iter.Key(), iter.UserData()));
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetProperty(const nsACString& name,
                                            nsIVariant* defaultValue,
                                            nsIVariant** value) {
  if (!m_properties.Get(name, value)) NS_ADDREF(*value = defaultValue);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetPropertyAsAString(const char* name,
                                                     nsAString& value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIVariant> variant;
  return m_properties.Get(nsDependentCString(name), getter_AddRefs(variant))
             ? variant->GetAsAString(value)
             : NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsAbCardProperty::GetPropertyAsAUTF8String(const char* name,
                                                         nsACString& value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIVariant> variant;
  return m_properties.Get(nsDependentCString(name), getter_AddRefs(variant))
             ? variant->GetAsAUTF8String(value)
             : NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsAbCardProperty::GetPropertyAsUint32(const char* name,
                                                    uint32_t* value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIVariant> variant;
  return m_properties.Get(nsDependentCString(name), getter_AddRefs(variant))
             ? variant->GetAsUint32(value)
             : NS_ERROR_NOT_AVAILABLE;
}

NS_IMETHODIMP nsAbCardProperty::GetPropertyAsBool(const char* name,
                                                  bool defaultValue,
                                                  bool* value) {
  NS_ENSURE_ARG_POINTER(name);

  *value = defaultValue;

  nsCOMPtr<nsIVariant> variant;
  return m_properties.Get(nsDependentCString(name), getter_AddRefs(variant))
             ? variant->GetAsBool(value)
             : NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetProperty(const nsACString& name,
                                            nsIVariant* value) {
  m_properties.InsertOrUpdate(name, value);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetPropertyAsAString(const char* name,
                                                     const nsAString& value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIWritableVariant> variant = new nsVariant();
  variant->SetAsAString(value);
  m_properties.InsertOrUpdate(nsDependentCString(name), variant);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetPropertyAsAUTF8String(
    const char* name, const nsACString& value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIWritableVariant> variant = new nsVariant();
  variant->SetAsAUTF8String(value);
  m_properties.InsertOrUpdate(nsDependentCString(name), variant);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetPropertyAsUint32(const char* name,
                                                    uint32_t value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIWritableVariant> variant = new nsVariant();
  variant->SetAsUint32(value);
  m_properties.InsertOrUpdate(nsDependentCString(name), variant);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::SetPropertyAsBool(const char* name,
                                                  bool value) {
  NS_ENSURE_ARG_POINTER(name);

  nsCOMPtr<nsIWritableVariant> variant = new nsVariant();
  variant->SetAsBool(value);
  m_properties.InsertOrUpdate(nsDependentCString(name), variant);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::DeleteProperty(const nsACString& name) {
  m_properties.Remove(name);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetSupportsVCard(bool* aSupportsVCard) {
  *aSupportsVCard = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetVCardProperties(
    JS::MutableHandle<JS::Value> properties) {
  properties.setNull();
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetUID(nsACString& uid) {
  nsAutoString aString;
  nsresult rv = GetPropertyAsAString(kUIDProperty, aString);
  if (NS_SUCCEEDED(rv)) {
    uid = NS_ConvertUTF16toUTF8(aString);
    return rv;
  }

  nsCOMPtr<nsIUUIDGenerator> uuidgen =
      mozilla::components::UUIDGenerator::Service();
  NS_ENSURE_TRUE(uuidgen, NS_ERROR_FAILURE);

  nsID id;
  rv = uuidgen->GenerateUUIDInPlace(&id);
  NS_ENSURE_SUCCESS(rv, rv);

  char idString[NSID_LENGTH];
  id.ToProvidedString(idString);

  uid.AppendASCII(idString + 1, NSID_LENGTH - 3);
  return SetUID(uid);
}

NS_IMETHODIMP nsAbCardProperty::SetUID(const nsACString& aUID) {
  nsAutoString aString;
  nsresult rv = GetPropertyAsAString(kUIDProperty, aString);
  if (NS_SUCCEEDED(rv)) {
    if (!aString.Equals(NS_ConvertUTF8toUTF16(aUID))) {
      return NS_ERROR_FAILURE;
    }
  }

  rv = SetPropertyAsAString(kUIDProperty, NS_ConvertUTF8toUTF16(aUID));
  NS_ENSURE_SUCCESS(rv, rv);

  if (m_directoryUID.IsEmpty()) {
    // This card's not in a directory.
    return NS_OK;
  }

  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectory> directory = nullptr;
  rv =
      abManager->GetDirectoryFromUID(m_directoryUID, getter_AddRefs(directory));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!directory) {
    // This card claims to be in a directory, but we can't find it.
    return NS_OK;
  }

  bool readOnly;
  rv = directory->GetReadOnly(&readOnly);
  NS_ENSURE_SUCCESS(rv, rv);

  if (readOnly) {
    // The directory is read-only.
    return NS_OK;
  }

  // Save the new UID so we can use it again in the future.
  return directory->ModifyCard(this);
}

NS_IMETHODIMP nsAbCardProperty::GetFirstName(nsAString& aString) {
  nsresult rv = GetPropertyAsAString(kFirstNameProperty, aString);
  if (rv == NS_ERROR_NOT_AVAILABLE) {
    aString.Truncate();
    return NS_OK;
  }
  return rv;
}

NS_IMETHODIMP nsAbCardProperty::SetFirstName(const nsAString& aString) {
  return SetPropertyAsAString(kFirstNameProperty, aString);
}

NS_IMETHODIMP nsAbCardProperty::GetLastName(nsAString& aString) {
  nsresult rv = GetPropertyAsAString(kLastNameProperty, aString);
  if (rv == NS_ERROR_NOT_AVAILABLE) {
    aString.Truncate();
    return NS_OK;
  }
  return rv;
}

NS_IMETHODIMP nsAbCardProperty::SetLastName(const nsAString& aString) {
  return SetPropertyAsAString(kLastNameProperty, aString);
}

NS_IMETHODIMP nsAbCardProperty::GetDisplayName(nsAString& aString) {
  nsresult rv = GetPropertyAsAString(kDisplayNameProperty, aString);
  if (rv == NS_ERROR_NOT_AVAILABLE) {
    aString.Truncate();
    return NS_OK;
  }
  return rv;
}

NS_IMETHODIMP nsAbCardProperty::SetDisplayName(const nsAString& aString) {
  return SetPropertyAsAString(kDisplayNameProperty, aString);
}

NS_IMETHODIMP nsAbCardProperty::GetPrimaryEmail(nsAString& aString) {
  nsresult rv = GetPropertyAsAString(kPriEmailProperty, aString);
  if (rv == NS_ERROR_NOT_AVAILABLE) {
    aString.Truncate();
    return NS_OK;
  }
  return rv;
}

NS_IMETHODIMP nsAbCardProperty::SetPrimaryEmail(const nsAString& aString) {
  return SetPropertyAsAString(kPriEmailProperty, aString);
}

NS_IMETHODIMP nsAbCardProperty::GetEmailAddresses(
    nsTArray<nsString>& aEmailAddresses) {
  aEmailAddresses.Clear();

  nsresult rv;
  nsString emailAddress;

  rv = GetPropertyAsAString(kPriEmailProperty, emailAddress);
  if (rv != NS_ERROR_NOT_AVAILABLE && !emailAddress.IsEmpty()) {
    aEmailAddresses.AppendElement(emailAddress);
  }

  rv = GetPropertyAsAString(k2ndEmailProperty, emailAddress);
  if (rv != NS_ERROR_NOT_AVAILABLE && !emailAddress.IsEmpty()) {
    aEmailAddresses.AppendElement(emailAddress);
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::HasEmailAddress(const nsACString& aEmailAddress,
                                                bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = false;

  nsCString emailAddress;
  nsresult rv = GetPropertyAsAUTF8String(kPriEmailProperty, emailAddress);
  if (rv != NS_ERROR_NOT_AVAILABLE &&
      emailAddress.Equals(aEmailAddress, nsCaseInsensitiveCStringComparator)) {
    *aResult = true;
    return NS_OK;
  }

  rv = GetPropertyAsAUTF8String(k2ndEmailProperty, emailAddress);
  if (rv != NS_ERROR_NOT_AVAILABLE &&
      emailAddress.Equals(aEmailAddress, nsCaseInsensitiveCStringComparator))
    *aResult = true;

  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GetPhotoURL(nsAString& aPhotoURL) {
  aPhotoURL.Truncate();
  return NS_OK;
}

// This function may be overridden by derived classes for
// nsAb*Card specific implementations.
NS_IMETHODIMP nsAbCardProperty::Copy(nsIAbCard* srcCard) {
  NS_ENSURE_ARG_POINTER(srcCard);

  nsTArray<RefPtr<nsIProperty>> properties;
  nsresult rv = srcCard->GetProperties(properties);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIProperty* property : properties) {
    nsAutoString name;
    property->GetName(name);
    nsCOMPtr<nsIVariant> value;
    property->GetValue(getter_AddRefs(value));

    SetProperty(NS_ConvertUTF16toUTF8(name), value);
  }

  bool isMailList;
  srcCard->GetIsMailList(&isMailList);
  SetIsMailList(isMailList);

  nsCString mailListURI;
  srcCard->GetMailListURI(getter_Copies(mailListURI));
  SetMailListURI(mailListURI.get());

  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::Equals(nsIAbCard* card, bool* result) {
  *result = (card == this);
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////
// The following methods are other views of a card
////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsAbCardProperty::ToVCard(nsACString& aResult) {
  nsresult rv;
  nsCOMPtr<nsIMsgVCardService> vCardService =
      do_GetService("@mozilla.org/addressbook/msgvcardservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString result;
  rv = vCardService->AbCardToVCard(this, result);
  NS_ENSURE_SUCCESS(rv, rv);

  aResult = NS_ConvertUTF16toUTF8(result);
  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GenerateName(int32_t aGenerateFormat,
                                             nsIStringBundle* aBundle,
                                             nsAString& aResult) {
  aResult.Truncate();

  // Cache the first and last names
  nsAutoString firstName, lastName;
  GetFirstName(firstName);
  GetLastName(lastName);

  // No need to check for aBundle present straight away, only do that if we're
  // actually going to use it.
  if (aGenerateFormat == GENERATE_DISPLAY_NAME)
    GetDisplayName(aResult);
  else if (lastName.IsEmpty())
    aResult = firstName;
  else if (firstName.IsEmpty())
    aResult = lastName;
  else {
    nsresult rv;
    nsCOMPtr<nsIStringBundle> bundle(aBundle);
    if (!bundle) {
      nsCOMPtr<nsIStringBundleService> stringBundleService =
          mozilla::components::StringBundle::Service();
      NS_ENSURE_TRUE(stringBundleService, NS_ERROR_UNEXPECTED);

      rv = stringBundleService->CreateBundle(sAddrbookProperties,
                                             getter_AddRefs(bundle));
      NS_ENSURE_SUCCESS(rv, rv);
    }

    nsString result;

    if (aGenerateFormat == GENERATE_LAST_FIRST_ORDER) {
      AutoTArray<nsString, 2> stringParams = {lastName, firstName};

      rv =
          bundle->FormatStringFromName("lastFirstFormat", stringParams, result);
    } else {
      AutoTArray<nsString, 2> stringParams = {firstName, lastName};

      rv =
          bundle->FormatStringFromName("firstLastFormat", stringParams, result);
    }
    NS_ENSURE_SUCCESS(rv, rv);

    aResult.Assign(result);
  }

  if (aResult.IsEmpty()) {
    // The normal names have failed, does this card have a company name? If so,
    // use that instead, because that is likely to be more meaningful than an
    // email address.
    //
    // If this errors, the string isn't found and we'll fall into the next
    // check.
    (void)GetPropertyAsAString(kCompanyProperty, aResult);
  }

  if (aResult.IsEmpty()) {
    // see bug #211078
    // if there is no generated name at this point
    // use the userid from the email address
    // it is better than nothing.
    GetPrimaryEmail(aResult);
    int32_t index = aResult.FindChar('@');
    if (index != -1) aResult.SetLength(index);
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GeneratePhoneticName(bool aLastNameFirst,
                                                     nsAString& aResult) {
  nsAutoString firstName, lastName;
  GetPropertyAsAString(kPhoneticFirstNameProperty, firstName);
  GetPropertyAsAString(kPhoneticLastNameProperty, lastName);

  if (aLastNameFirst) {
    aResult = lastName;
    aResult += firstName;
  } else {
    aResult = firstName;
    aResult += lastName;
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbCardProperty::GenerateChatName(nsAString& aResult) {
  aResult.Truncate();

#define CHECK_CHAT_PROPERTY(aProtocol)                                       \
  if (NS_SUCCEEDED(GetPropertyAsAString(k##aProtocol##Property, aResult)) && \
      !aResult.IsEmpty())                                                    \
  return NS_OK
  CHECK_CHAT_PROPERTY(Gtalk);
  CHECK_CHAT_PROPERTY(AIM);
  CHECK_CHAT_PROPERTY(Yahoo);
  CHECK_CHAT_PROPERTY(Skype);
  CHECK_CHAT_PROPERTY(QQ);
  CHECK_CHAT_PROPERTY(MSN);
  CHECK_CHAT_PROPERTY(ICQ);
  CHECK_CHAT_PROPERTY(XMPP);
  CHECK_CHAT_PROPERTY(IRC);
  return NS_OK;
}
