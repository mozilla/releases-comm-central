/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#pragma warning (disable : 4996) // MAPILogoff is deprecated

#include <windows.h>
#include <mapidefs.h>
#include <mapi.h>
#include "msgMapi.h"

#define MAX_RECIPS  2000
#define MAX_FILES   100


#define           MAX_NAME_LEN    256
#define           MAX_PW_LEN      256
#define           MAX_MSGINFO_LEN 512
#define           MAX_POINTERS    32

const CLSID CLSID_CMapiImp = {0x29f458be, 0x8866, 0x11d5,
                              {0xa3, 0xdd, 0x0, 0xb0, 0xd0, 0xf3, 0xba, 0xa7}};
const IID IID_nsIMapi = {0x6EDCD38E,0x8861,0x11d5,
                        {0xA3,0xDD,0x00,0xB0,0xD0,0xF3,0xBA,0xA7}};

DWORD tId = 0;

#define   MAPI_MESSAGE_TYPE     0
#define   MAPI_RECIPIENT_TYPE   1

typedef struct {
  LPVOID    lpMem;
  UCHAR     memType;
} memTrackerType;


// this can't be right.
memTrackerType    memArray[MAX_POINTERS];

//
// For remembering memory...how ironic.
//
void
SetPointerArray(LPVOID ptr, BYTE type)
{
int i;

  for (i=0; i<MAX_POINTERS; i++)
  {
    if (memArray[i].lpMem == NULL)
    {
      memArray[i].lpMem = ptr;
      memArray[i].memType = type;
      break;
    }
  }
}


BOOL WINAPI DllMain(HINSTANCE aInstance, DWORD aReason, LPVOID aReserved)
{
    switch (aReason)
    {
        case DLL_PROCESS_ATTACH : tId = TlsAlloc();
                                  if (tId == 0xFFFFFFFF)
                                      return FALSE;
                                  break;

        case DLL_PROCESS_DETACH : TlsFree(tId);
                                  break;
    }
    return TRUE;
}

BOOL InitMozillaReference(nsIMapi **aRetValue)
{
    // Check whether this thread has a valid Interface
    // by looking into thread-specific-data variable

    *aRetValue = (nsIMapi *)TlsGetValue(tId);

    // Check whether the pointer actually resolves to
    // a valid method call; otherwise mozilla is not running

    if ((*aRetValue) && (*aRetValue)->IsValid() == S_OK)
         return TRUE;

    HRESULT hRes = ::CoInitialize(NULL) ;

    hRes = ::CoCreateInstance(CLSID_CMapiImp, NULL, CLSCTX_LOCAL_SERVER,
                                         IID_nsIMapi, (LPVOID *)aRetValue);

    if (hRes == S_OK && (*aRetValue)->Initialize() == S_OK)
        if (TlsSetValue(tId, (LPVOID)(*aRetValue)))
            return TRUE;

    // Either CoCreate or TlsSetValue failed; so return FALSE

    if ((*aRetValue))
        (*aRetValue)->Release();

    ::CoUninitialize();
    return FALSE;
}

////////////////////////////////////////////////////////////////////////////////////////
// The MAPILogon function begins a Simple MAPI session, loading the default message ////
// store and address book providers                            ////
////////////////////////////////////////////////////////////////////////////////////////

ULONG FAR PASCAL MAPILogon(ULONG aUIParam, LPSTR aProfileName,
                           LPSTR aPassword, FLAGS aFlags,
                           ULONG aReserved, LPLHANDLE aSession)
{
    HRESULT hr = 0;
    ULONG nSessionId = 0;
    nsIMapi *pNsMapi = NULL;

    if (!InitMozillaReference(&pNsMapi))
        return MAPI_E_FAILURE;

    hr = pNsMapi->Login(aUIParam, aProfileName, aPassword, aFlags, &nSessionId);
    if (hr == S_OK)
        (*aSession) = (LHANDLE) nSessionId;
    else
        return nSessionId;

    return SUCCESS_SUCCESS;
}

ULONG FAR PASCAL MAPILogoff (LHANDLE aSession, ULONG aUIParam,
                                            FLAGS aFlags, ULONG aReserved)
{
    nsIMapi *pNsMapi = (nsIMapi *)TlsGetValue(tId);
    if (pNsMapi != NULL)
    {
        if (pNsMapi->Logoff((ULONG) aSession) == S_OK)
            pNsMapi->Release();
        pNsMapi = NULL;
    }

    TlsSetValue(tId, NULL);

    ::CoUninitialize();

    return SUCCESS_SUCCESS;
}

ULONG FAR PASCAL MAPISendMail (LHANDLE lhSession, ULONG ulUIParam, nsMapiMessage *lpMessage,
                FLAGS flFlags, ULONG ulReserved )
{
    HRESULT hr = 0;
    BOOL bTempSession = FALSE ;
    nsIMapi *pNsMapi = NULL;

    if (!InitMozillaReference(&pNsMapi))
        return MAPI_E_FAILURE;

    if (lpMessage->nRecipCount > MAX_RECIPS)
        return MAPI_E_TOO_MANY_RECIPIENTS ;

    if (lpMessage->nFileCount > MAX_FILES)
        return MAPI_E_TOO_MANY_FILES ;

    if ( (!(flFlags & MAPI_DIALOG)) && (lpMessage->lpRecips == NULL) )
        return MAPI_E_UNKNOWN_RECIPIENT ;

    if (!lhSession || pNsMapi->IsValidSession(lhSession) != S_OK)
    {
        FLAGS LoginFlag = 0;
        if ( (flFlags & MAPI_LOGON_UI) && (flFlags & MAPI_NEW_SESSION) )
            LoginFlag = MAPI_LOGON_UI | MAPI_NEW_SESSION ;
        else if (flFlags & MAPI_LOGON_UI)
            LoginFlag = MAPI_LOGON_UI ;

        hr = MAPILogon(ulUIParam, nullptr, nullptr, LoginFlag, 0, &lhSession);
        if (hr != SUCCESS_SUCCESS)
            return MAPI_E_LOGIN_FAILURE ;
        bTempSession = TRUE ;
    }

    hr = pNsMapi->SendMail(lhSession, lpMessage, flFlags, ulReserved);

    // we are seeing a problem when using Word, although we return success from the MAPI support
    // MS COM interface in mozilla, we are getting this error here. This is a temporary hack !!
    if (hr == 0x800703e6)
        hr = SUCCESS_SUCCESS;

    if (bTempSession)
        MAPILogoff (lhSession, ulUIParam, 0,0) ;

    return hr ;
}

ULONG FAR PASCAL MAPISendMailW(LHANDLE lhSession, ULONG ulUIParam, nsMapiMessageW *lpMessage,
                               FLAGS flFlags, ULONG ulReserved)
{
    HRESULT hr = 0;
    BOOL bTempSession = FALSE;
    nsIMapi *pNsMapi = nullptr;

    if (!InitMozillaReference(&pNsMapi))
      return MAPI_E_FAILURE;

    if (lpMessage->nRecipCount > MAX_RECIPS)
      return MAPI_E_TOO_MANY_RECIPIENTS;

    if (lpMessage->nFileCount > MAX_FILES)
      return MAPI_E_TOO_MANY_FILES;

    if ((!(flFlags & MAPI_DIALOG)) && (lpMessage->lpRecips == nullptr))
      return MAPI_E_UNKNOWN_RECIPIENT;

    if (!lhSession || pNsMapi->IsValidSession(lhSession) != S_OK)
    {
      FLAGS LoginFlag = 0;
      if ((flFlags & MAPI_LOGON_UI) && (flFlags & MAPI_NEW_SESSION))
        LoginFlag = MAPI_LOGON_UI | MAPI_NEW_SESSION;
      else if (flFlags & MAPI_LOGON_UI)
        LoginFlag = MAPI_LOGON_UI;

      hr = MAPILogon(ulUIParam, nullptr, nullptr, LoginFlag, 0, &lhSession);
      if (hr != SUCCESS_SUCCESS)
        return MAPI_E_LOGIN_FAILURE;
      bTempSession = TRUE;
    }

    hr = pNsMapi->SendMailW(lhSession, lpMessage, flFlags, ulReserved);

    // we are seeing a problem when using Word, although we return success from the MAPI support
    // MS COM interface in mozilla, we are getting this error here. This is a temporary hack !!
    if (hr == 0x800703e6)
      hr = SUCCESS_SUCCESS;

    if (bTempSession)
      MAPILogoff(lhSession, ulUIParam, 0, 0);

    return hr;
}

ULONG FAR PASCAL MAPISendDocuments(ULONG ulUIParam, LPSTR lpszDelimChar, LPSTR lpszFilePaths,
                                   LPSTR lpszFileNames, ULONG ulReserved)
{
    LHANDLE lhSession ;
    nsIMapi *pNsMapi = NULL;

    if (!InitMozillaReference(&pNsMapi))
        return MAPI_E_FAILURE;

    unsigned long result = MAPILogon(ulUIParam, nullptr, nullptr, MAPI_LOGON_UI, 0, &lhSession);
    if (result != SUCCESS_SUCCESS)
        return MAPI_E_LOGIN_FAILURE ;

    HRESULT hr;

    hr = pNsMapi->SendDocuments(lhSession, lpszDelimChar, lpszFilePaths, lpszFileNames, ulReserved);

    MAPILogoff (lhSession, ulUIParam, 0,0) ;

    return hr ;
}

ULONG FAR PASCAL MAPIFindNext(LHANDLE lhSession, ULONG ulUIParam, const LPSTR lpszMessageType,
                              const LPSTR lpszSeedMessageID, FLAGS flFlags, ULONG ulReserved,
                              unsigned char lpszMessageID[64])
{
  nsIMapi *pNsMapi = NULL;

  if (!InitMozillaReference(&pNsMapi))
    return MAPI_E_FAILURE;

  if (lhSession == 0)
    return MAPI_E_INVALID_SESSION;

  return pNsMapi->FindNext(lhSession, ulUIParam, lpszMessageType, lpszSeedMessageID,
                           flFlags, ulReserved, lpszMessageID);
}


ULONG FAR PASCAL MAPIReadMail(LHANDLE lhSession, ULONG ulUIParam, LPSTR lpszMessageID,
                              FLAGS flFlags, ULONG ulReserved, nsMapiMessage **lppMessage)
{
  nsIMapi *pNsMapi = NULL;

  if (!InitMozillaReference(&pNsMapi))
    return MAPI_E_FAILURE;

  if (lhSession == 0)
    return MAPI_E_INVALID_SESSION;

  return pNsMapi->ReadMail(lhSession, ulUIParam,
                              lpszMessageID, flFlags, ulReserved,
                              lppMessage) ;

}

ULONG FAR PASCAL MAPISaveMail(LHANDLE lhSession, ULONG ulUIParam, lpnsMapiMessage lpMessage,
                              FLAGS flFlags, ULONG ulReserved, LPSTR lpszMessageID)
{
  nsIMapi *pNsMapi = NULL;

  if (lhSession == 0)
    return MAPI_E_INVALID_SESSION;

  if (!InitMozillaReference(&pNsMapi))
    return MAPI_E_FAILURE;

  return MAPI_E_FAILURE;
}

ULONG FAR PASCAL MAPIDeleteMail(LHANDLE lhSession, ULONG ulUIParam, LPSTR lpszMessageID,
                                FLAGS flFlags, ULONG ulReserved)
{
  nsIMapi *pNsMapi = NULL;

  if (lhSession == 0)
    return MAPI_E_INVALID_SESSION;

  if (!InitMozillaReference(&pNsMapi))
    return MAPI_E_FAILURE;

  return pNsMapi->DeleteMail(lhSession, ulUIParam,
                              lpszMessageID, flFlags, ulReserved) ;
}

ULONG FAR PASCAL MAPIAddress(LHANDLE lhSession, ULONG ulUIParam, LPSTR lpszCaption,
                             ULONG nEditFields, LPSTR lpszLabels, ULONG nRecips,
                             lpMapiRecipDesc lpRecips, FLAGS flFlags,
                             ULONG ulReserved, LPULONG lpnNewRecips,
                             lpMapiRecipDesc FAR *lppNewRecips)
{
    return MAPI_E_NOT_SUPPORTED;
}

ULONG FAR PASCAL MAPIDetails(LHANDLE lhSession, ULONG ulUIParam, lpMapiRecipDesc lpRecip,
                             FLAGS flFlags, ULONG ulReserved)
{
    return MAPI_E_NOT_SUPPORTED;
}

ULONG FAR PASCAL MAPIResolveName(LHANDLE lhSession, ULONG ulUIParam, LPSTR lpszName,
                                 FLAGS flFlags, ULONG ulReserved, lpMapiRecipDesc FAR *lppRecip)
{
  char* lpszRecipName = new char[(strlen((const char*)lpszName) + 1)];
  if (lpszRecipName == NULL)
    return MAPI_E_INSUFFICIENT_MEMORY;
  char* lpszRecipAddress = new char[(strlen((const char*)lpszName) + 6)];
  if (!lpszRecipAddress) {
    delete[] lpszRecipName;
    return MAPI_E_INSUFFICIENT_MEMORY;
  }
  strcpy(lpszRecipName, (const char*)lpszName);
  strcpy(lpszRecipAddress, (const char*)lpszName);
  (*lppRecip) = (lpMapiRecipDesc FAR)malloc(sizeof(MapiRecipDesc));
  if (!(*lppRecip)) {
    delete[] lpszRecipName;
    delete[] lpszRecipAddress;
    return MAPI_E_INSUFFICIENT_MEMORY;
  }
  (*lppRecip)->ulRecipClass = 1;
  (*lppRecip)->lpszName = lpszRecipName;
  (*lppRecip)->lpszAddress = lpszRecipAddress;
  (*lppRecip)->ulEIDSize = 0;
  (*lppRecip)->lpEntryID = 0;
  return SUCCESS_SUCCESS;
}

void FreeMAPIRecipient(lpMapiRecipDesc pv);
void FreeMAPIMessage(lpMapiMessage pv);

ULONG FAR PASCAL MAPIFreeBuffer(LPVOID pv)
{
  int   i;

  if (!pv)
    return S_OK;

  for (i=0; i<MAX_POINTERS; i++)
  {
    if (pv == memArray[i].lpMem)
    {
      if (memArray[i].memType == MAPI_MESSAGE_TYPE)
      {
        FreeMAPIMessage((MapiMessage *)pv);
        memArray[i].lpMem = NULL;
      }
      else if (memArray[i].memType == MAPI_RECIPIENT_TYPE)
      {
        FreeMAPIRecipient((MapiRecipDesc *)pv);
        memArray[i].lpMem = NULL;
      }
    }
  }

  pv = NULL;
  return S_OK;
}

ULONG FAR PASCAL GetMapiDllVersion()
{
  return 94;
}

void
FreeMAPIFile(lpMapiFileDesc pv)
{
  if (!pv)
    return;

  if (pv->lpszPathName != NULL)
    free(pv->lpszPathName);

  if (pv->lpszFileName != NULL)
    free(pv->lpszFileName);
}

void
FreeMAPIMessage(lpMapiMessage pv)
{
  ULONG i;

  if (!pv)
    return;

  if (pv->lpszSubject != NULL)
    free(pv->lpszSubject);

  if (pv->lpszNoteText)
      free(pv->lpszNoteText);

  if (pv->lpszMessageType)
    free(pv->lpszMessageType);

  if (pv->lpszDateReceived)
    free(pv->lpszDateReceived);

  if (pv->lpszConversationID)
    free(pv->lpszConversationID);

  if (pv->lpOriginator)
    FreeMAPIRecipient(pv->lpOriginator);

  for (i=0; i<pv->nRecipCount; i++)
  {
    if (&(pv->lpRecips[i]) != NULL)
    {
      FreeMAPIRecipient(&(pv->lpRecips[i]));
    }
  }

  if (pv->lpRecips != NULL)
  {
    free(pv->lpRecips);
  }

  for (i=0; i<pv->nFileCount; i++)
  {
    if (&(pv->lpFiles[i]) != NULL)
    {
      FreeMAPIFile(&(pv->lpFiles[i]));
    }
  }

  if (pv->lpFiles != NULL)
  {
    free(pv->lpFiles);
  }

  free(pv);
  pv = NULL;
}

void
FreeMAPIRecipient(lpMapiRecipDesc pv)
{
  if (!pv)
    return;

  if (pv->lpszName != NULL)
    free(pv->lpszName);

  if (pv->lpszAddress != NULL)
    free(pv->lpszAddress);

  if (pv->lpEntryID != NULL)
    free(pv->lpEntryID);
}
