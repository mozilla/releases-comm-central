/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsIAbCard.h"
#include "nsIStringBundle.h"
#include "nsImportFieldMap.h"
#include "nsImportStringBundle.h"
#include "nsCRTGlue.h"
#include "ImportDebug.h"
#include "nsCOMPtr.h"

////////////////////////////////////////////////////////////////////////

nsresult nsImportFieldMap::Create(nsIStringBundle* aBundle, REFNSIID aIID,
                                  void** aResult) {
  RefPtr<nsImportFieldMap> it = new nsImportFieldMap(aBundle);
  return it->QueryInterface(aIID, aResult);
}

NS_IMPL_ISUPPORTS(nsImportFieldMap, nsIImportFieldMap)

NS_IMETHODIMP nsImportFieldMap::GetSkipFirstRecord(bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  *result = m_skipFirstRecord;
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::SetSkipFirstRecord(bool aResult) {
  m_skipFirstRecord = aResult;
  return NS_OK;
}

nsImportFieldMap::nsImportFieldMap(nsIStringBundle* aBundle) {
  m_numFields = 0;
  m_pFields = nullptr;
  m_pActive = nullptr;
  m_allocated = 0;
  // need to init the description array
  m_mozFieldCount = 0;
  m_skipFirstRecord = false;
  nsCOMPtr<nsIStringBundle> pBundle = aBundle;

  nsString* pStr;
  for (int32_t i = IMPORT_FIELD_DESC_START; i <= IMPORT_FIELD_DESC_END;
       i++, m_mozFieldCount++) {
    pStr = new nsString();
    if (pBundle) {
      nsImportStringBundle::GetStringByID(i, pBundle, *pStr);
    } else
      pStr->AppendInt(i);
    m_descriptions.AppendElement(pStr);
  }
}

nsImportFieldMap::~nsImportFieldMap() {
  if (m_pFields) delete[] m_pFields;
  if (m_pActive) delete[] m_pActive;

  nsString* pStr;
  for (int32_t i = 0; i < m_mozFieldCount; i++) {
    pStr = m_descriptions.ElementAt(i);
    delete pStr;
  }
  m_descriptions.Clear();
}

NS_IMETHODIMP nsImportFieldMap::GetNumMozFields(int32_t* aNumFields) {
  NS_ASSERTION(aNumFields != nullptr, "null ptr");
  if (!aNumFields) return NS_ERROR_NULL_POINTER;

  *aNumFields = m_mozFieldCount;
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::GetMapSize(int32_t* aNumFields) {
  NS_ASSERTION(aNumFields != nullptr, "null ptr");
  if (!aNumFields) return NS_ERROR_NULL_POINTER;

  *aNumFields = m_numFields;
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::GetFieldDescription(int32_t index,
                                                    char16_t** _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  *_retval = nullptr;
  if ((index < 0) || ((size_t)index >= m_descriptions.Length()))
    return NS_ERROR_FAILURE;

  *_retval = ToNewUnicode(*(m_descriptions.ElementAt(index)));
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::SetFieldMapSize(int32_t size) {
  nsresult rv = Allocate(size);
  if (NS_FAILED(rv)) return rv;

  m_numFields = size;

  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::DefaultFieldMap(int32_t size) {
  nsresult rv = SetFieldMapSize(size);
  if (NS_FAILED(rv)) return rv;
  for (int32_t i = 0; i < size; i++) {
    m_pFields[i] = i;
    m_pActive[i] = true;
  }

  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::GetFieldMap(int32_t index, int32_t* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  if ((index < 0) || (index >= m_numFields)) return NS_ERROR_FAILURE;

  *_retval = m_pFields[index];
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::SetFieldMap(int32_t index, int32_t fieldNum) {
  if (index == -1) {
    nsresult rv = Allocate(m_numFields + 1);
    if (NS_FAILED(rv)) return rv;
    index = m_numFields;
    m_numFields++;
  } else {
    if ((index < 0) || (index >= m_numFields)) return NS_ERROR_FAILURE;
  }

  if ((fieldNum != -1) && ((fieldNum < 0) || (fieldNum >= m_mozFieldCount)))
    return NS_ERROR_FAILURE;

  m_pFields[index] = fieldNum;
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::GetFieldActive(int32_t index, bool* active) {
  NS_ASSERTION(active != nullptr, "null ptr");
  if (!active) return NS_ERROR_NULL_POINTER;
  if ((index < 0) || (index >= m_numFields)) return NS_ERROR_FAILURE;

  *active = m_pActive[index];
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::SetFieldActive(int32_t index, bool active) {
  if ((index < 0) || (index >= m_numFields)) return NS_ERROR_FAILURE;

  m_pActive[index] = active;
  return NS_OK;
}

NS_IMETHODIMP nsImportFieldMap::SetFieldValue(nsIAbDirectory* database,
                                              nsIAbCard* row, int32_t fieldNum,
                                              const nsAString& value) {
  // Allow the special value for a null field
  if (fieldNum == -1) return NS_OK;

  if ((fieldNum < 0) || (fieldNum >= m_mozFieldCount)) return NS_ERROR_FAILURE;

  // UGGG!!!!! lot's of typing here!
  nsresult rv;

  switch (fieldNum) {
    case 0:
      rv = row->SetFirstName(value);
      break;
    case 1:
      rv = row->SetLastName(value);
      break;
    case 2:
      rv = row->SetDisplayName(value);
      break;
    case 3:
      rv = row->SetPropertyAsAString(kNicknameProperty, value);
      break;
    case 4:
      rv = row->SetPrimaryEmail(value);
      break;
    case 5:
      rv = row->SetPropertyAsAString(k2ndEmailProperty, value);
      break;
    case 6:
      rv = row->SetPropertyAsAString(kWorkPhoneProperty, value);
      break;
    case 7:
      rv = row->SetPropertyAsAString(kHomePhoneProperty, value);
      break;
    case 8:
      rv = row->SetPropertyAsAString(kFaxProperty, value);
      break;
    case 9:
      rv = row->SetPropertyAsAString(kPagerProperty, value);
      break;
    case 10:
      rv = row->SetPropertyAsAString(kCellularProperty, value);
      break;
    case 11:
      rv = row->SetPropertyAsAString(kHomeAddressProperty, value);
      break;
    case 12:
      rv = row->SetPropertyAsAString(kHomeAddress2Property, value);
      break;
    case 13:
      rv = row->SetPropertyAsAString(kHomeCityProperty, value);
      break;
    case 14:
      rv = row->SetPropertyAsAString(kHomeStateProperty, value);
      break;
    case 15:
      rv = row->SetPropertyAsAString(kHomeZipCodeProperty, value);
      break;
    case 16:
      rv = row->SetPropertyAsAString(kHomeCountryProperty, value);
      break;
    case 17:
      rv = row->SetPropertyAsAString(kWorkAddressProperty, value);
      break;
    case 18:
      rv = row->SetPropertyAsAString(kWorkAddress2Property, value);
      break;
    case 19:
      rv = row->SetPropertyAsAString(kWorkCityProperty, value);
      break;
    case 20:
      rv = row->SetPropertyAsAString(kWorkStateProperty, value);
      break;
    case 21:
      rv = row->SetPropertyAsAString(kWorkZipCodeProperty, value);
      break;
    case 22:
      rv = row->SetPropertyAsAString(kWorkCountryProperty, value);
      break;
    case 23:
      rv = row->SetPropertyAsAString(kJobTitleProperty, value);
      break;
    case 24:
      rv = row->SetPropertyAsAString(kDepartmentProperty, value);
      break;
    case 25:
      rv = row->SetPropertyAsAString(kCompanyProperty, value);
      break;
    case 26:
      rv = row->SetPropertyAsAString(kWorkWebPageProperty, value);
      break;
    case 27:
      rv = row->SetPropertyAsAString(kHomeWebPageProperty, value);
      break;
    case 28:
      rv = row->SetPropertyAsAString(kBirthYearProperty, value);
      break;
    case 29:
      rv = row->SetPropertyAsAString(kBirthMonthProperty, value);
      break;
    case 30:
      rv = row->SetPropertyAsAString(kBirthDayProperty, value);
      break;
    case 31:
      rv = row->SetPropertyAsAString(kCustom1Property, value);
      break;
    case 32:
      rv = row->SetPropertyAsAString(kCustom2Property, value);
      break;
    case 33:
      rv = row->SetPropertyAsAString(kCustom3Property, value);
      break;
    case 34:
      rv = row->SetPropertyAsAString(kCustom4Property, value);
      break;
    case 35:
      rv = row->SetPropertyAsAString(kNotesProperty, value);
      break;
    case 36:
      rv = row->SetPropertyAsAString(kAIMProperty, value);
      break;
    default:
      /* Get the field description, and add it as an anonymous attr? */
      /* OR WHAT???? */
      { rv = NS_ERROR_FAILURE; }
  }

  return rv;
}

nsresult nsImportFieldMap::Allocate(int32_t newSize) {
  if (newSize <= m_allocated) return NS_OK;

  int32_t sz = m_allocated;
  while (sz < newSize) sz += 30;

  int32_t* pData = new int32_t[sz];
  if (!pData) return NS_ERROR_OUT_OF_MEMORY;
  bool* pActive = new bool[sz];
  if (!pActive) {
    delete[] pData;
    return NS_ERROR_OUT_OF_MEMORY;
  }

  int32_t i;
  for (i = 0; i < sz; i++) {
    pData[i] = -1;
    pActive[i] = true;
  }
  if (m_numFields) {
    for (i = 0; i < m_numFields; i++) {
      pData[i] = m_pFields[i];
      pActive[i] = m_pActive[i];
    }
    delete[] m_pFields;
    delete[] m_pActive;
  }
  m_allocated = sz;
  m_pFields = pData;
  m_pActive = pActive;
  return NS_OK;
}
