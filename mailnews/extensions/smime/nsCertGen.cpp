/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCertGen.h"
#include "ScopedNSSTypes.h"
#include "cert.h"
#include "secoid.h"
#include "certdb.h"
#include "nss.h"
#include "nsString.h"
#include "base64.h"

// Much of this code was copied from certutil.c
// Some code was copied from security/manager/ssl/nsKeygenHandler.cpp
// on old branch mozilla-esr68.
// The code was reordered to have proper cleanup without using goto.

typedef struct curveNameTagParamsStr {
  const char* curveName;
  SECOidTag curveOidTag;
  SECOidTag hashAlgTag;
} curveNameTagParams;

static curveNameTagParams nameTagParams[] = {
    {"secp256r1", SEC_OID_SECG_EC_SECP256R1, SEC_OID_SHA256},
    {"secp384r1", SEC_OID_SECG_EC_SECP384R1, SEC_OID_SHA384},
    {"secp521r1", SEC_OID_SECG_EC_SECP521R1, SEC_OID_SHA512},
};

mozilla::UniqueSECItem EncodeECParams(const char* curve,
                                      SECOidTag& hashAlgTag) {
  SECOidData* oidData = nullptr;
  SECOidTag curveOidTag = SEC_OID_UNKNOWN; /* default */

  if (curve && *curve) {
    int numCurves = sizeof(nameTagParams) / sizeof(curveNameTagParams);
    for (int i = 0; ((i < numCurves) && (curveOidTag == SEC_OID_UNKNOWN));
         i++) {
      if (PL_strcmp(curve, nameTagParams[i].curveName) == 0) {
        curveOidTag = nameTagParams[i].curveOidTag;
        hashAlgTag = nameTagParams[i].hashAlgTag;
      }
    }
  }

  /* Return nullptr if curve name is not recognized */
  if ((curveOidTag == SEC_OID_UNKNOWN) ||
      (oidData = SECOID_FindOIDByTag(curveOidTag)) == nullptr) {
    return nullptr;
  }

  mozilla::UniqueSECItem ecparams(
      SECITEM_AllocItem(nullptr, nullptr, 2 + oidData->oid.len));
  if (!ecparams) {
    return nullptr;
  }

  /*
   * ecparams->data needs to contain the ASN encoding of an object ID (OID)
   * representing the named curve. The actual OID is in
   * oidData->oid.data so we simply prepend 0x06 and OID length
   */
  ecparams->data[0] = SEC_ASN1_OBJECT_ID;
  ecparams->data[1] = oidData->oid.len;
  memcpy(ecparams->data + 2, oidData->oid.data, oidData->oid.len);

  return ecparams;
}

#define DEFAULT_RSA_KEYGEN_PE 65537L

NS_IMPL_ISUPPORTS(nsCertGen, nsICertGen)

/* Partial copy from NSS certutil. Removed was reading of the type from
 * the name string. Removed was support for types other than email.
 * Parameter constNames is a comma separated list. */
static SECStatus AddEmailSubjectAltNames(PLArenaPool* arena,
                                         CERTGeneralName** existingListp,
                                         const char* constNames) {
  CERTGeneralName* nameList = NULL;
  CERTGeneralName* current = NULL;
  PRCList* prev = NULL;
  char *cp, *nextName = NULL;
  SECStatus rv = SECSuccess;
  char* names = NULL;

  if (constNames) {
    names = PORT_Strdup(constNames);
  }

  if (names == NULL) {
    return SECFailure;
  }

  /*
   * walk down the comma separated list of names. NOTE: there is
   * no sanity checks to see if the email address look like
   * email addresses.
   */
  for (cp = names; cp; cp = nextName) {
    nextName = NULL;
    if (*cp == ',') {
      cp++;
    }
    if ((*cp) == 0) {
      continue;
    }

    current = PORT_ArenaZNew(arena, CERTGeneralName);
    if (!current) {
      rv = SECFailure;
      break;
    }

    current->type = certRFC822Name;
    current->name.other.data = (unsigned char*)PORT_ArenaStrdup(arena, cp);
    current->name.other.len = PORT_Strlen(cp);

    if (prev) {
      current->l.prev = prev;
      prev->next = &(current->l);
    } else {
      nameList = current;
    }
    prev = &(current->l);
  }
  PORT_Free(names);
  /* at this point nameList points to the head of a doubly linked,
   * but not yet circular, list and current points to its tail. */
  if (rv == SECSuccess && nameList) {
    if (*existingListp != NULL) {
      PRCList* existingprev;
      /* add nameList to the end of the existing list */
      existingprev = (*existingListp)->l.prev;
      (*existingListp)->l.prev = &(current->l);
      nameList->l.prev = existingprev;
      existingprev->next = &(nameList->l);
      current->l.next = &((*existingListp)->l);
    } else {
      /* make nameList circular and set it as the new existingList */
      nameList->l.prev = prev;
      current->l.next = &(nameList->l);
      *existingListp = nameList;
    }
  }
  return rv;
}

NS_IMETHODIMP nsCertGen::Gen(const nsACString& keyType,
                             const nsACString& keyStrength,
                             const nsAString& email, nsACString& _retval) {
  uint32_t keyGenMechanism;
  SECOidTag hashAlgTag;
  KeyType keytype = rsaKey;
  PK11RSAGenParams rsaParams;
  mozilla::UniqueSECItem ecParams;
  void* params = nullptr;  // Non-owning.
  nsresult result = NS_ERROR_FAILURE;
  _retval = "";

  if (keyType == "RSA") {
    keyGenMechanism = CKM_RSA_PKCS_KEY_PAIR_GEN;
    keytype = rsaKey;
    if (keyStrength == "2048") {
      rsaParams.keySizeInBits = 2048;
      hashAlgTag = SEC_OID_SHA256;
    } else if (keyStrength == "3072") {
      rsaParams.keySizeInBits = 3072;
      hashAlgTag = SEC_OID_SHA384;
    } else if (keyStrength == "4096") {
      rsaParams.keySizeInBits = 4096;
      hashAlgTag = SEC_OID_SHA512;
    } else {
      return NS_ERROR_INVALID_ARG;
    }
    rsaParams.pe = DEFAULT_RSA_KEYGEN_PE;
    params = &rsaParams;
  } else if (keyType == "ECC") {
    keyGenMechanism = CKM_EC_KEY_PAIR_GEN;
    keytype = ecKey;
    ecParams =
        EncodeECParams(PromiseFlatCString(keyStrength).get(), hashAlgTag);
    params = ecParams.get();
  } else {
    return NS_ERROR_INVALID_ARG;
  }

  // permanent and sensitive flags for keygen
  PK11AttrFlags attrFlags =
      PK11_ATTR_TOKEN | PK11_ATTR_SENSITIVE | PK11_ATTR_PRIVATE;

  SECKEYPrivateKey* privateKey = nullptr;
  SECKEYPublicKey* publicKey = nullptr;

  mozilla::UniquePLArenaPool arena(PORT_NewArena(DER_DEFAULT_CHUNKSIZE));

  PK11SlotInfo* slot = PK11_GetInternalKeySlot();
  if (slot) {
    privateKey = PK11_GenerateKeyPairWithFlags(slot, keyGenMechanism, params,
                                               &publicKey, attrFlags, nullptr);
  }

  CERTSubjectPublicKeyInfo* spki = nullptr;
  if (privateKey && publicKey) {
    spki = SECKEY_CreateSubjectPublicKeyInfo(publicKey);
  }

  CERTCertificateRequest* cr = nullptr;
  if (spki) {
    CERTName* subject = NULL;
    if (email.Length() > 0) {
      nsAutoCString dn("E=");
      dn += NS_LossyConvertUTF16toASCII(email);
      subject = CERT_AsciiToName(dn.get());
    } else {
      subject = CERT_CreateName(NULL);
    }
    if (subject) {
      cr = CERT_CreateCertificateRequest(subject, spki, NULL);
      CERT_DestroyName(subject);
    }
    SECKEY_DestroySubjectPublicKeyInfo(spki);
  }

  SECItem* requestEncoding = nullptr;
  if (cr) {
    if (email.Length() > 0) {
      void* extHandle;
      extHandle = CERT_StartCertificateRequestAttributes(cr);
      if (extHandle == NULL) {
        CERT_DestroyCertificateRequest(cr);
        return NS_ERROR_FAILURE;
      }

      CERTGeneralName* namelist = NULL;
      SECItem item = {siBuffer, NULL, 0};

      if (AddEmailSubjectAltNames(arena.get(), &namelist,
                                  NS_ConvertUTF16toUTF8(email).get()) ==
          SECSuccess) {
        if (CERT_EncodeAltNameExtension(arena.get(), namelist, &item) ==
            SECSuccess) {
          if (CERT_AddExtension(extHandle, SEC_OID_X509_SUBJECT_ALT_NAME, &item,
                                PR_FALSE, PR_TRUE) != SECSuccess) {
            return NS_ERROR_FAILURE;
          }
        }
      }

      CERT_FinishExtensions(extHandle);
      CERT_FinishCertificateRequestAttributes(cr);
    }

    /* Der encode the request */
    requestEncoding = SEC_ASN1EncodeItem(
        arena.get(), NULL, cr, SEC_ASN1_GET(CERT_CertificateRequestTemplate));
    CERT_DestroyCertificateRequest(cr);
  }

  if (requestEncoding) {
    SECOidTag signAlgTag;
    signAlgTag = SEC_GetSignatureAlgorithmOidTag(keytype, hashAlgTag);
    if (signAlgTag != SEC_OID_UNKNOWN) {
      SECAlgorithmID signAlg;
      PORT_Memset(&signAlg, 0, sizeof(signAlg));

      SECStatus rv;
      rv = SECOID_SetAlgorithmID(arena.get(), &signAlg, signAlgTag, 0);
      if (rv == SECSuccess) {
        SECItem signedReq = {siBuffer, NULL, 0};

        rv = SEC_DerSignDataWithAlgorithmID(
            arena.get(), &signedReq, requestEncoding->data,
            requestEncoding->len, privateKey, &signAlg);
        if (rv == SECSuccess) {
          char* obuf;
          obuf = BTOA_ConvertItemToAscii(&signedReq);
          if (obuf) {
            _retval = "-----BEGIN CERTIFICATE REQUEST-----\n";
            _retval += obuf;
            _retval += "\n-----END CERTIFICATE REQUEST-----\n";
            result = NS_OK;
            PORT_Free(obuf);
          }
        }
      }
    }
  }

  if (slot) {
    PK11_FreeSlot(slot);
  }
  if (privateKey) {
    SECKEY_DestroyPrivateKey(privateKey);
  }
  if (publicKey) {
    SECKEY_DestroyPublicKey(publicKey);
  }
  return result;
}
