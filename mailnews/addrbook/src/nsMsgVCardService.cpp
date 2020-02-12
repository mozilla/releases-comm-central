/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIAbCard.h"
#include "nsAbBaseCID.h"
#include "nsString.h"
#include "nsMsgUtils.h"
#include "nsMsgVCardService.h"
#include "nsVCard.h"
#include "prmem.h"
#include "plstr.h"

NS_IMPL_ISUPPORTS(nsMsgVCardService, nsIMsgVCardService)

nsMsgVCardService::nsMsgVCardService() {}

nsMsgVCardService::~nsMsgVCardService() {}

NS_IMETHODIMP_(void) nsMsgVCardService::CleanVObject(VObject *o) {
  cleanVObject(o);
}

NS_IMETHODIMP_(VObject *) nsMsgVCardService::NextVObjectInList(VObject *o) {
  return nextVObjectInList(o);
}

NS_IMETHODIMP_(VObject *)
nsMsgVCardService::Parse_MIME(const char *input, uint32_t len) {
  return parse_MIME(input, (unsigned long)len);
}

NS_IMETHODIMP_(char *) nsMsgVCardService::FakeCString(VObject *o) {
  return fakeCString(vObjectUStringZValue(o));
}

NS_IMETHODIMP_(VObject *)
nsMsgVCardService::IsAPropertyOf(VObject *o, const char *id) {
  return isAPropertyOf(o, id);
}

NS_IMETHODIMP_(char *)
nsMsgVCardService::WriteMemoryVObjects(const char *s, int32_t *len,
                                       VObject *list, bool expandSpaces) {
  return writeMemoryVObjects((char *)s, len, list, expandSpaces);
}

NS_IMETHODIMP_(VObject *) nsMsgVCardService::NextVObject(VObjectIterator *i) {
  return nextVObject(i);
}

NS_IMETHODIMP_(void)
nsMsgVCardService::InitPropIterator(VObjectIterator *i, VObject *o) {
  initPropIterator(i, o);
}

NS_IMETHODIMP_(int32_t) nsMsgVCardService::MoreIteration(VObjectIterator *i) {
  return ((int32_t)moreIteration(i));
}

NS_IMETHODIMP_(const char *) nsMsgVCardService::VObjectName(VObject *o) {
  return vObjectName(o);
}

NS_IMETHODIMP_(char *) nsMsgVCardService::VObjectAnyValue(VObject *o) {
  char *retval = (char *)PR_MALLOC(strlen((char *)vObjectAnyValue(o)) + 1);
  if (retval) PL_strcpy(retval, (char *)vObjectAnyValue(o));
  return retval;
}

char *getCString(VObject *vObj) {
  if (VALUE_TYPE(vObj) == VCVT_USTRINGZ)
    return fakeCString(vObjectUStringZValue(vObj));
  if (VALUE_TYPE(vObj) == VCVT_STRINGZ)
    return PL_strdup(vObjectStringZValue(vObj));
  return NULL;
}

static void convertNameValue(VObject *vObj, nsIAbCard *aCard) {
  const char *cardPropName = NULL;

  // if the vCard property is not a root property then we need to determine its
  // exact property. a good example of this is VCTelephoneProp, this prop has
  // four objects underneath it: fax, work and home and cellular.
  if (PL_strcasecmp(VCCityProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkCityProperty;
  else if (PL_strcasecmp(VCTelephoneProp, vObjectName(vObj)) == 0) {
    if (isAPropertyOf(vObj, VCFaxProp))
      cardPropName = kFaxProperty;
    else if (isAPropertyOf(vObj, VCWorkProp))
      cardPropName = kWorkPhoneProperty;
    else if (isAPropertyOf(vObj, VCHomeProp))
      cardPropName = kHomePhoneProperty;
    else if (isAPropertyOf(vObj, VCCellularProp))
      cardPropName = kCellularProperty;
    else if (isAPropertyOf(vObj, VCPagerProp))
      cardPropName = kPagerProperty;
    else
      return;
  } else if (PL_strcasecmp(VCEmailAddressProp, vObjectName(vObj)) == 0)
    cardPropName = kPriEmailProperty;
  else if (PL_strcasecmp(VCFamilyNameProp, vObjectName(vObj)) == 0)
    cardPropName = kLastNameProperty;
  else if (PL_strcasecmp(VCFullNameProp, vObjectName(vObj)) == 0)
    cardPropName = kDisplayNameProperty;
  else if (PL_strcasecmp(VCGivenNameProp, vObjectName(vObj)) == 0)
    cardPropName = kFirstNameProperty;
  else if (PL_strcasecmp(VCOrgNameProp, vObjectName(vObj)) == 0)
    cardPropName = kCompanyProperty;
  else if (PL_strcasecmp(VCOrgUnitProp, vObjectName(vObj)) == 0)
    cardPropName = kDepartmentProperty;
  else if (PL_strcasecmp(VCPostalCodeProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkZipCodeProperty;
  else if (PL_strcasecmp(VCRegionProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkStateProperty;
  else if (PL_strcasecmp(VCStreetAddressProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkAddressProperty;
  else if (PL_strcasecmp(VCPostalBoxProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkAddress2Property;
  else if (PL_strcasecmp(VCCountryNameProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkCountryProperty;
  else if (PL_strcasecmp(VCTitleProp, vObjectName(vObj)) == 0)
    cardPropName = kJobTitleProperty;
  else if (PL_strcasecmp(VCUseHTML, vObjectName(vObj)) == 0)
    cardPropName = kPreferMailFormatProperty;
  else if (PL_strcasecmp(VCNoteProp, vObjectName(vObj)) == 0)
    cardPropName = kNotesProperty;
  else if (PL_strcasecmp(VCURLProp, vObjectName(vObj)) == 0)
    cardPropName = kWorkWebPageProperty;
  else
    return;

  if (!VALUE_TYPE(vObj)) return;

  char *cardPropValue = getCString(vObj);
  if (PL_strcmp(cardPropName, kPreferMailFormatProperty)) {
    aCard->SetPropertyAsAUTF8String(cardPropName,
                                    nsDependentCString(cardPropValue));
  } else {
    if (!PL_strcmp(cardPropValue, "TRUE"))
      aCard->SetPropertyAsUint32(cardPropName, nsIAbPreferMailFormat::html);
    else if (!PL_strcmp(cardPropValue, "FALSE"))
      aCard->SetPropertyAsUint32(cardPropName,
                                 nsIAbPreferMailFormat::plaintext);
    else
      aCard->SetPropertyAsUint32(cardPropName, nsIAbPreferMailFormat::unknown);
  }
  PR_FREEIF(cardPropValue);
  return;
}

static void convertFromVObject(VObject *vObj, nsIAbCard *aCard) {
  if (vObj) {
    VObjectIterator t;

    convertNameValue(vObj, aCard);

    initPropIterator(&t, vObj);
    while (moreIteration(&t)) {
      VObject *nextObject = nextVObject(&t);
      convertFromVObject(nextObject, aCard);
    }
  }
  return;
}

NS_IMETHODIMP nsMsgVCardService::EscapedVCardToAbCard(
    const char *aEscapedVCardStr, nsIAbCard **aCard) {
  NS_ENSURE_ARG_POINTER(aEscapedVCardStr);
  NS_ENSURE_ARG_POINTER(aCard);

  nsCOMPtr<nsIAbCard> cardFromVCard =
      do_CreateInstance(NS_ABCARDPROPERTY_CONTRACTID);
  if (!cardFromVCard) return NS_ERROR_FAILURE;

  // aEscapedVCardStr will be "" the first time, before you have a vCard
  if (*aEscapedVCardStr != '\0') {
    nsCString unescapedData;
    MsgUnescapeString(nsDependentCString(aEscapedVCardStr), 0, unescapedData);

    VObject *vObj = parse_MIME(unescapedData.get(), unescapedData.Length());
    if (vObj) {
      convertFromVObject(vObj, cardFromVCard);

      cleanVObject(vObj);
    } else
      NS_WARNING("Parse of vCard failed");
  }

  cardFromVCard.forget(aCard);
  return NS_OK;
}
