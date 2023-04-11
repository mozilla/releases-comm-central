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
#include "nsMemory.h"
#include "mozITXTToHTMLConv.h"
#include "nsIAbManager.h"
#include "nsIUUIDGenerator.h"
#include "nsIMsgVCardService.h"
#include "nsVariant.h"
#include "nsIProperty.h"
#include "nsCOMArray.h"
#include "prmem.h"
#include "mozilla/ArrayUtils.h"
#include "mozilla/Components.h"
using namespace mozilla;

#define PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST "mail.addr_book.lastnamefirst"

const char sAddrbookProperties[] =
    "chrome://messenger/locale/addressbook/addressBook.properties";

enum EAppendType {
  eAppendLine,
  eAppendLabel,
  eAppendCityStateZip,
  eAppendUndefined
};

struct AppendItem {
  const char* mColumn;
  const char* mLabel;
  EAppendType mAppendType;
};

static const AppendItem NAME_ATTRS_ARRAY[] = {
    {kDisplayNameProperty, "propertyDisplayName", eAppendLabel},
    {kNicknameProperty, "propertyNickname", eAppendLabel},
    {kPriEmailProperty, "", eAppendLine},
    {k2ndEmailProperty, "", eAppendLine}};

static const AppendItem PHONE_ATTRS_ARRAY[] = {
    {kWorkPhoneProperty, "propertyWork", eAppendLabel},
    {kHomePhoneProperty, "propertyHome", eAppendLabel},
    {kFaxProperty, "propertyFax", eAppendLabel},
    {kPagerProperty, "propertyPager", eAppendLabel},
    {kCellularProperty, "propertyCellular", eAppendLabel}};

static const AppendItem HOME_ATTRS_ARRAY[] = {
    {kHomeAddressProperty, "", eAppendLine},
    {kHomeAddress2Property, "", eAppendLine},
    {kHomeCityProperty, "", eAppendCityStateZip},
    {kHomeCountryProperty, "", eAppendLine},
    {kHomeWebPageProperty, "", eAppendLine}};

static const AppendItem WORK_ATTRS_ARRAY[] = {
    {kJobTitleProperty, "", eAppendLine},
    {kDepartmentProperty, "", eAppendLine},
    {kCompanyProperty, "", eAppendLine},
    {kWorkAddressProperty, "", eAppendLine},
    {kWorkAddress2Property, "", eAppendLine},
    {kWorkCityProperty, "", eAppendCityStateZip},
    {kWorkCountryProperty, "", eAppendLine},
    {kWorkWebPageProperty, "", eAppendLine}};

static const AppendItem CUSTOM_ATTRS_ARRAY[] = {
    {kCustom1Property, "propertyCustom1", eAppendLabel},
    {kCustom2Property, "propertyCustom2", eAppendLabel},
    {kCustom3Property, "propertyCustom3", eAppendLabel},
    {kCustom4Property, "propertyCustom4", eAppendLabel},
    {kNotesProperty, "", eAppendLine}};

static const AppendItem CHAT_ATTRS_ARRAY[] = {
    {kGtalkProperty, "propertyGtalk", eAppendLabel},
    {kAIMProperty, "propertyAIM", eAppendLabel},
    {kYahooProperty, "propertyYahoo", eAppendLabel},
    {kSkypeProperty, "propertySkype", eAppendLabel},
    {kQQProperty, "propertyQQ", eAppendLabel},
    {kMSNProperty, "propertyMSN", eAppendLabel},
    {kICQProperty, "propertyICQ", eAppendLabel},
    {kXMPPProperty, "propertyXMPP", eAppendLabel},
    {kIRCProperty, "propertyIRC", eAppendLabel}};

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

// XXX: Use the category manager instead of this file to implement these
NS_IMETHODIMP nsAbCardProperty::TranslateTo(const nsACString& type,
                                            nsACString& result) {
  if (type.EqualsLiteral("base64xml")) {
    return ConvertToBase64EncodedXML(result);
  } else if (type.EqualsLiteral("xml")) {
    nsString utf16String;
    nsresult rv = ConvertToXMLPrintData(utf16String);
    NS_ENSURE_SUCCESS(rv, rv);
    result = NS_ConvertUTF16toUTF8(utf16String);
    return NS_OK;
  } else if (type.EqualsLiteral("vcard")) {
    return ConvertToEscapedVCard(result);
  }

  return NS_ERROR_ILLEGAL_VALUE;
}

nsresult nsAbCardProperty::ConvertToEscapedVCard(nsACString& aResult) {
  nsresult rv;
  nsCOMPtr<nsIMsgVCardService> vCardService =
      do_GetService("@mozilla.org/addressbook/msgvcardservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString result;
  rv = vCardService->AbCardToEscapedVCard(this, result);
  NS_ENSURE_SUCCESS(rv, rv);

  aResult = NS_ConvertUTF16toUTF8(result);
  return NS_OK;
}

nsresult nsAbCardProperty::ConvertToBase64EncodedXML(nsACString& result) {
  nsresult rv;
  nsString xmlStr;

  xmlStr.AppendLiteral(
      "<?xml version=\"1.0\"?>\n"
      "<?xml-stylesheet type=\"text/css\" "
      "href=\"chrome://messagebody/skin/abPrint.css\"?>\n"
      "<directory>\n");

  // Get Address Book string and set it as title of XML document
  nsCOMPtr<nsIStringBundle> bundle;
  nsCOMPtr<nsIStringBundleService> stringBundleService =
      mozilla::components::StringBundle::Service();
  if (stringBundleService) {
    rv = stringBundleService->CreateBundle(sAddrbookProperties,
                                           getter_AddRefs(bundle));
    if (NS_SUCCEEDED(rv)) {
      nsString addrBook;
      rv = bundle->GetStringFromName("addressBook", addrBook);
      if (NS_SUCCEEDED(rv)) {
        xmlStr.AppendLiteral("<title xmlns=\"http://www.w3.org/1999/xhtml\">");
        xmlStr.Append(addrBook);
        xmlStr.AppendLiteral("</title>\n");
      }
    }
  }

  nsString xmlSubstr;
  rv = ConvertToXMLPrintData(xmlSubstr);
  NS_ENSURE_SUCCESS(rv, rv);

  xmlStr.Append(xmlSubstr);
  xmlStr.AppendLiteral("</directory>\n");

  char* tmpRes =
      PL_Base64Encode(NS_ConvertUTF16toUTF8(xmlStr).get(), 0, nullptr);
  result.Assign(tmpRes);
  PR_Free(tmpRes);
  return NS_OK;
}

nsresult nsAbCardProperty::ConvertToXMLPrintData(nsAString& aXMLSubstr) {
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t generatedNameFormat;
  rv = prefBranch->GetIntPref(PREF_MAIL_ADDR_BOOK_LASTNAMEFIRST,
                              &generatedNameFormat);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIStringBundleService> stringBundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(stringBundleService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  rv = stringBundleService->CreateBundle(sAddrbookProperties,
                                         getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString generatedName;
  rv = GenerateName(generatedNameFormat, bundle, generatedName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozITXTToHTMLConv> conv =
      do_CreateInstance(MOZ_TXTTOHTMLCONV_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString xmlStr;
  xmlStr.SetLength(
      4096);  // to reduce allocations. should be enough for most cards
  xmlStr.AssignLiteral("<GeneratedName>\n");

  // use ScanTXT to convert < > & to safe values.
  nsString safeText;
  if (!generatedName.IsEmpty()) {
    rv = conv->ScanTXT(generatedName, mozITXTToHTMLConv::kEntities, safeText);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (safeText.IsEmpty()) {
    nsAutoString primaryEmail;
    GetPrimaryEmail(primaryEmail);

    // use ScanTXT to convert < > & to safe values.
    rv = conv->ScanTXT(primaryEmail, mozITXTToHTMLConv::kEntities, safeText);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  xmlStr.Append(safeText);

  xmlStr.AppendLiteral(
      "</GeneratedName>\n"
      "<table><tr><td>");

  rv = AppendSection(NAME_ATTRS_ARRAY,
                     sizeof(NAME_ATTRS_ARRAY) / sizeof(AppendItem),
                     EmptyString(), bundle, conv, xmlStr);

  xmlStr.AppendLiteral("</td></tr><tr><td>");

  rv = AppendSection(PHONE_ATTRS_ARRAY,
                     sizeof(PHONE_ATTRS_ARRAY) / sizeof(AppendItem),
                     u"headingPhone"_ns, bundle, conv, xmlStr);

  if (!m_IsMailList) {
    rv = AppendSection(CUSTOM_ATTRS_ARRAY,
                       sizeof(CUSTOM_ATTRS_ARRAY) / sizeof(AppendItem),
                       u"headingOther"_ns, bundle, conv, xmlStr);
    rv = AppendSection(CHAT_ATTRS_ARRAY,
                       sizeof(CHAT_ATTRS_ARRAY) / sizeof(AppendItem),
                       u"headingChat"_ns, bundle, conv, xmlStr);
  } else {
    rv = AppendSection(CUSTOM_ATTRS_ARRAY,
                       sizeof(CUSTOM_ATTRS_ARRAY) / sizeof(AppendItem),
                       u"headingDescription"_ns, bundle, conv, xmlStr);

    xmlStr.AppendLiteral("<section><sectiontitle>");

    nsString headingAddresses;
    rv = bundle->GetStringFromName("headingAddresses", headingAddresses);
    NS_ENSURE_SUCCESS(rv, rv);

    xmlStr.Append(headingAddresses);
    xmlStr.AppendLiteral("</sectiontitle>");

    nsCOMPtr<nsIAbManager> abManager =
        do_GetService("@mozilla.org/abmanager;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbDirectory> mailList = nullptr;
    rv = abManager->GetDirectory(m_MailListURI, getter_AddRefs(mailList));
    NS_ENSURE_SUCCESS(rv, rv);

    nsTArray<RefPtr<nsIAbCard>> mailListAddresses;
    rv = mailList->GetChildCards(mailListAddresses);
    NS_ENSURE_SUCCESS(rv, rv);

    for (nsIAbCard* listCard : mailListAddresses) {
      xmlStr.AppendLiteral("<PrimaryEmail>\n");

      nsAutoString displayName;
      rv = listCard->GetDisplayName(displayName);
      NS_ENSURE_SUCCESS(rv, rv);

      // use ScanTXT to convert < > & to safe values.
      nsString safeText;
      rv = conv->ScanTXT(displayName, mozITXTToHTMLConv::kEntities, safeText);
      NS_ENSURE_SUCCESS(rv, rv);
      xmlStr.Append(safeText);

      xmlStr.AppendLiteral(" &lt;");

      nsAutoString primaryEmail;
      listCard->GetPrimaryEmail(primaryEmail);

      // use ScanTXT to convert < > & to safe values.
      nsString safeText2;
      rv = conv->ScanTXT(primaryEmail, mozITXTToHTMLConv::kEntities, safeText2);
      NS_ENSURE_SUCCESS(rv, rv);
      xmlStr.Append(safeText2);

      xmlStr.AppendLiteral("&gt;</PrimaryEmail>\n");
    }
    xmlStr.AppendLiteral("</section>");
  }

  xmlStr.AppendLiteral("</td><td>");

  rv = AppendSection(HOME_ATTRS_ARRAY,
                     sizeof(HOME_ATTRS_ARRAY) / sizeof(AppendItem),
                     u"headingHome"_ns, bundle, conv, xmlStr);
  rv = AppendSection(WORK_ATTRS_ARRAY,
                     sizeof(WORK_ATTRS_ARRAY) / sizeof(AppendItem),
                     u"headingWork"_ns, bundle, conv, xmlStr);

  xmlStr.AppendLiteral("</td></tr></table>");

  aXMLSubstr = xmlStr;

  return NS_OK;
}

nsresult nsAbCardProperty::AppendSection(
    const AppendItem* aArray, int16_t aCount, const nsString& aHeading,
    nsIStringBundle* aBundle, mozITXTToHTMLConv* aConv, nsString& aResult) {
  nsresult rv = NS_OK;

  aResult.AppendLiteral("<section>");

  nsString attrValue;
  bool sectionIsEmpty = true;

  int16_t i = 0;
  for (i = 0; i < aCount; i++) {
    rv = GetPropertyAsAString(aArray[i].mColumn, attrValue);
    if (NS_SUCCEEDED(rv) && !attrValue.IsEmpty()) sectionIsEmpty = false;
  }

  if (!sectionIsEmpty && !aHeading.IsEmpty()) {
    nsString heading;
    rv = aBundle->GetStringFromName(NS_ConvertUTF16toUTF8(aHeading).get(),
                                    heading);
    NS_ENSURE_SUCCESS(rv, rv);

    aResult.AppendLiteral("<sectiontitle>");
    aResult.Append(heading);
    aResult.AppendLiteral("</sectiontitle>");
  }

  for (i = 0; i < aCount; i++) {
    switch (aArray[i].mAppendType) {
      case eAppendLine:
        rv = AppendLine(aArray[i], aConv, aResult);
        break;
      case eAppendLabel:
        rv = AppendLabel(aArray[i], aBundle, aConv, aResult);
        break;
      case eAppendCityStateZip:
        rv = AppendCityStateZip(aArray[i], aBundle, aConv, aResult);
        break;
      default:
        rv = NS_ERROR_FAILURE;
        break;
    }

    if (NS_FAILED(rv)) {
      NS_WARNING("append item failed");
      break;
    }
  }
  aResult.AppendLiteral("</section>");

  return rv;
}

nsresult nsAbCardProperty::AppendLine(const AppendItem& aItem,
                                      mozITXTToHTMLConv* aConv,
                                      nsString& aResult) {
  NS_ENSURE_ARG_POINTER(aConv);

  nsString attrValue;
  nsresult rv = GetPropertyAsAString(aItem.mColumn, attrValue);

  if (NS_FAILED(rv) || attrValue.IsEmpty()) return NS_OK;

  aResult.Append(char16_t('<'));
  aResult.Append(NS_ConvertUTF8toUTF16(aItem.mColumn));
  aResult.Append(char16_t('>'));

  // use ScanTXT to convert < > & to safe values.
  nsString safeText;
  rv = aConv->ScanTXT(attrValue, mozITXTToHTMLConv::kEntities, safeText);
  NS_ENSURE_SUCCESS(rv, rv);
  aResult.Append(safeText);

  aResult.AppendLiteral("</");
  aResult.Append(NS_ConvertUTF8toUTF16(aItem.mColumn));
  aResult.Append(char16_t('>'));

  return NS_OK;
}

nsresult nsAbCardProperty::AppendLabel(const AppendItem& aItem,
                                       nsIStringBundle* aBundle,
                                       mozITXTToHTMLConv* aConv,
                                       nsString& aResult) {
  NS_ENSURE_ARG_POINTER(aBundle);

  nsresult rv;
  nsString label, attrValue;

  rv = GetPropertyAsAString(aItem.mColumn, attrValue);

  if (NS_FAILED(rv) || attrValue.IsEmpty()) return NS_OK;

  rv = aBundle->GetStringFromName(aItem.mLabel, label);
  NS_ENSURE_SUCCESS(rv, rv);

  aResult.AppendLiteral("<labelrow><label>");

  aResult.Append(label);
  aResult.AppendLiteral(": </label>");

  rv = AppendLine(aItem, aConv, aResult);
  NS_ENSURE_SUCCESS(rv, rv);

  aResult.AppendLiteral("</labelrow>");

  return NS_OK;
}

nsresult nsAbCardProperty::AppendCityStateZip(const AppendItem& aItem,
                                              nsIStringBundle* aBundle,
                                              mozITXTToHTMLConv* aConv,
                                              nsString& aResult) {
  NS_ENSURE_ARG_POINTER(aBundle);

  nsresult rv;
  AppendItem item;
  const char *statePropName, *zipPropName;

  if (strcmp(aItem.mColumn, kHomeCityProperty) == 0) {
    statePropName = kHomeStateProperty;
    zipPropName = kHomeZipCodeProperty;
  } else {
    statePropName = kWorkStateProperty;
    zipPropName = kWorkZipCodeProperty;
  }

  nsAutoString cityResult, stateResult, zipResult;

  rv = AppendLine(aItem, aConv, cityResult);
  NS_ENSURE_SUCCESS(rv, rv);

  item.mColumn = statePropName;
  item.mLabel = "";
  item.mAppendType = eAppendUndefined;

  rv = AppendLine(item, aConv, stateResult);
  NS_ENSURE_SUCCESS(rv, rv);

  item.mColumn = zipPropName;

  rv = AppendLine(item, aConv, zipResult);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString formattedString;

  if (!cityResult.IsEmpty() && !stateResult.IsEmpty() && !zipResult.IsEmpty()) {
    AutoTArray<nsString, 3> formatStrings = {cityResult, stateResult,
                                             zipResult};
    rv = aBundle->FormatStringFromName("cityAndStateAndZip", formatStrings,
                                       formattedString);
    NS_ENSURE_SUCCESS(rv, rv);
  } else if (!cityResult.IsEmpty() && !stateResult.IsEmpty() &&
             zipResult.IsEmpty()) {
    AutoTArray<nsString, 2> formatStrings = {cityResult, stateResult};
    rv = aBundle->FormatStringFromName("cityAndStateNoZip", formatStrings,
                                       formattedString);
    NS_ENSURE_SUCCESS(rv, rv);
  } else if ((!cityResult.IsEmpty() && stateResult.IsEmpty() &&
              !zipResult.IsEmpty()) ||
             (cityResult.IsEmpty() && !stateResult.IsEmpty() &&
              !zipResult.IsEmpty())) {
    AutoTArray<nsString, 2> formatStrings = {
        cityResult.IsEmpty() ? stateResult : cityResult, zipResult};
    rv = aBundle->FormatStringFromName("cityOrStateAndZip", formatStrings,
                                       formattedString);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    if (!cityResult.IsEmpty())
      formattedString = cityResult;
    else if (!stateResult.IsEmpty())
      formattedString = stateResult;
    else
      formattedString = zipResult;
  }

  aResult.Append(formattedString);

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
