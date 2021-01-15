/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsString.h"
#include "MapiMimeTypes.h"

uint8_t CMimeTypes::m_mimeBuffer[kMaxMimeTypeSize];

BOOL CMimeTypes::GetKey(HKEY root, LPCWSTR pName, PHKEY pKey) {
  LONG result = RegOpenKeyExW(root, pName, 0,
                              KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS, pKey);
  return result == ERROR_SUCCESS;
}

BOOL CMimeTypes::GetValueBytes(HKEY rootKey, LPCWSTR pValName,
                               LPBYTE* ppBytes) {
  LONG err;
  DWORD bufSz;

  *ppBytes = NULL;
  // Get the installed directory
  err = RegQueryValueExW(rootKey, pValName, NULL, NULL, NULL, &bufSz);
  if (err == ERROR_SUCCESS) {
    *ppBytes = new BYTE[bufSz];
    err = RegQueryValueExW(rootKey, pValName, NULL, NULL, *ppBytes, &bufSz);
    if (err == ERROR_SUCCESS) {
      return TRUE;
    }
    delete *ppBytes;
    *ppBytes = NULL;
  }
  return FALSE;
}

void CMimeTypes::ReleaseValueBytes(LPBYTE pBytes) {
  if (pBytes) delete pBytes;
}

BOOL CMimeTypes::GetMimeTypeFromReg(const nsString& ext, LPBYTE* ppBytes) {
  HKEY extensionKey;
  BOOL result = FALSE;
  *ppBytes = NULL;
  if (GetKey(HKEY_CLASSES_ROOT, ext.get(), &extensionKey)) {
    result = GetValueBytes(extensionKey, L"Content Type", ppBytes);
    RegCloseKey(extensionKey);
  }

  return result;
}

uint8_t* CMimeTypes::GetMimeType(const nsString& theExt) {
  nsString ext = theExt;
  if (ext.Length()) {
    if (ext.First() != '.') {
      ext = L".";
      ext += theExt;
    }
  }

  BOOL result = FALSE;
  int len;

  if (!ext.Length()) return NULL;
  LPBYTE pByte;
  if (GetMimeTypeFromReg(ext, &pByte)) {
    len = strlen((const char*)pByte);
    if (len && (len < kMaxMimeTypeSize)) {
      memcpy(m_mimeBuffer, pByte, len);
      m_mimeBuffer[len] = 0;
      result = TRUE;
    }
    ReleaseValueBytes(pByte);
  }

  if (result) return m_mimeBuffer;

  return NULL;
}
