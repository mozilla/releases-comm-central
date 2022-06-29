/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* ****************************************************************************
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 *
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 *
 * Dear Mortals,
 *
 * Please be advised that if you are adding something here, you should also
 * strongly consider adding it to the other place it goes too!  These can be
 * found in paths like so: mailnews/.../build/WhateverFactory.cpp
 *
 * If you do not, your (static) release builds will be quite pleasant, but
 * (dynamic) debug builds will disappoint you by not having your component in
 * them.
 *
 * Yours truly,
 * The ghost that haunts the MailNews codebase.
 *
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 *
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 * ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION! ATTENTION!
 * ****************************************************************************/

////////////////////////////////////////////////////////////////////////////////
// Core Module Include Files
////////////////////////////////////////////////////////////////////////////////

#include "mozilla/ModuleUtils.h"
#include "nsIFactory.h"
#include "nsISupports.h"
#include "nsIModule.h"
#include "nsICategoryManager.h"
#include "nsIComponentManager.h"
#include "nsIServiceManager.h"
#include "nsCRT.h"
#include "nsCOMPtr.h"
#include "msgCore.h"

////////////////////////////////////////////////////////////////////////////////
// mailnews base includes
////////////////////////////////////////////////////////////////////////////////
#include "nsMsgBaseCID.h"
#include "nsRssIncomingServer.h"
#include "nsRssService.h"
#include "nsMsgBrkMBoxStore.h"
#include "nsMsgMaildirStore.h"
#include "nsCURILoader.h"

////////////////////////////////////////////////////////////////////////////////
// bayesian spam filter includes
////////////////////////////////////////////////////////////////////////////////
#include "nsBayesianFilterCID.h"
#include "nsBayesianFilter.h"

////////////////////////////////////////////////////////////////////////////////
//  jsAccount includes
////////////////////////////////////////////////////////////////////////////////

// Warning: When you re-enable this, be sure to touch msgIDelegateList.idl
// or else msgIDelegateList.h is not generated again and you get inexplicable
// compile errors.
#define JSACCOUNT_ENABLED 1
#if JSACCOUNT_ENABLED
#  include "msgJsAccountCID.h"
#  include "JaAbDirectory.h"
#  include "JaCompose.h"
#  include "JaIncomingServer.h"
#  include "JaMsgFolder.h"
#  include "JaUrl.h"
#endif

///////////////////////////////////////////////////////////////////////////////
// msgdb includes
///////////////////////////////////////////////////////////////////////////////
#include "nsMsgDBCID.h"
#include "nsMailDatabase.h"
#include "nsNewsDatabase.h"
#include "nsImapMailDatabase.h"

///////////////////////////////////////////////////////////////////////////////
// mime includes
///////////////////////////////////////////////////////////////////////////////
#include "nsMsgMimeCID.h"
#include "nsStreamConverter.h"
#include "nsMimeObjectClassAccess.h"

///////////////////////////////////////////////////////////////////////////////
// mime emitter includes
///////////////////////////////////////////////////////////////////////////////
#include "nsMimeEmitterCID.h"
#include "nsIMimeEmitter.h"
#include "nsMimeHtmlEmitter.h"
#include "nsMimeRawEmitter.h"
#include "nsMimeXmlEmitter.h"
#include "nsMimePlainEmitter.h"

///////////////////////////////////////////////////////////////////////////////
// mail views includes
///////////////////////////////////////////////////////////////////////////////
#include "nsMsgMailViewsCID.h"
#include "nsMsgMailViewList.h"

///////////////////////////////////////////////////////////////////////////////
// mdn includes
///////////////////////////////////////////////////////////////////////////////
#include "nsMsgMdnCID.h"
#include "nsMsgMdnGenerator.h"

///////////////////////////////////////////////////////////////////////////////
// smime includes
///////////////////////////////////////////////////////////////////////////////
#include "nsMsgCompCID.h"
#include "nsCMS.h"
#include "nsCMSSecureMessage.h"
#include "nsCertPicker.h"
#include "nsMsgSMIMECID.h"
#include "nsMsgComposeSecure.h"
#include "nsSMimeJSHelper.h"
#include "nsEncryptedSMIMEURIsService.h"

///////////////////////////////////////////////////////////////////////////////
// FTS3 Tokenizer
///////////////////////////////////////////////////////////////////////////////
#include "nsFts3TokenizerCID.h"
#include "nsFts3Tokenizer.h"

////////////////////////////////////////////////////////////////////////////////
// PGP/MIME includes
////////////////////////////////////////////////////////////////////////////////
#include "nsMimeContentTypeHandler.h"
#include "nsPgpMimeProxy.h"

////////////////////////////////////////////////////////////////////////////////
// i18n includes
////////////////////////////////////////////////////////////////////////////////
#include "nsCommUConvCID.h"

#include "nsCharsetConverterManager.h"

////////////////////////////////////////////////////////////////////////////////
// mailnews base factories
////////////////////////////////////////////////////////////////////////////////
using namespace mozilla::mailnews;

////////////////////////////////////////////////////////////////////////////////
// bayesian spam filter factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsBayesianFilter, Init)

NS_DEFINE_NAMED_CID(NS_BAYESIANFILTER_CID);

////////////////////////////////////////////////////////////////////////////////
// jsAccount factories
////////////////////////////////////////////////////////////////////////////////
#if JSACCOUNT_ENABLED
NS_GENERIC_FACTORY_CONSTRUCTOR(JaCppAbDirectoryDelegator)
NS_GENERIC_FACTORY_CONSTRUCTOR(JaCppComposeDelegator)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(JaCppIncomingServerDelegator, Init)
NS_GENERIC_FACTORY_CONSTRUCTOR(JaCppMsgFolderDelegator)
NS_GENERIC_FACTORY_CONSTRUCTOR(JaCppUrlDelegator)

NS_DEFINE_NAMED_CID(JACPPABDIRECTORYDELEGATOR_CID);
NS_DEFINE_NAMED_CID(JACPPCOMPOSEDELEGATOR_CID);
NS_DEFINE_NAMED_CID(JACPPINCOMINGSERVERDELEGATOR_CID);
NS_DEFINE_NAMED_CID(JACPPMSGFOLDERDELEGATOR_CID);
NS_DEFINE_NAMED_CID(JACPPURLDELEGATOR_CID);
#endif

////////////////////////////////////////////////////////////////////////////////
// msgdb factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMsgDBService)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMailDatabase)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsNewsDatabase)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsImapMailDatabase)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMsgRetentionSettings)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMsgDownloadSettings)

NS_DEFINE_NAMED_CID(NS_MAILDB_CID);
NS_DEFINE_NAMED_CID(NS_NEWSDB_CID);
NS_DEFINE_NAMED_CID(NS_IMAPDB_CID);
NS_DEFINE_NAMED_CID(NS_MSG_RETENTIONSETTINGS_CID);
NS_DEFINE_NAMED_CID(NS_MSG_DOWNLOADSETTINGS_CID);
NS_DEFINE_NAMED_CID(NS_MSGDB_SERVICE_CID);

////////////////////////////////////////////////////////////////////////////////
// mime factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMimeObjectClassAccess)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsStreamConverter)

NS_DEFINE_NAMED_CID(NS_MIME_OBJECT_CLASS_ACCESS_CID);
NS_DEFINE_NAMED_CID(NS_MAILNEWS_MIME_STREAM_CONVERTER_CID);

////////////////////////////////////////////////////////////////////////////////
// mime emitter factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMimeRawEmitter)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMimeXmlEmitter)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMimePlainEmitter)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsMimeHtmlDisplayEmitter, Init)

NS_DEFINE_NAMED_CID(NS_HTML_MIME_EMITTER_CID);
NS_DEFINE_NAMED_CID(NS_XML_MIME_EMITTER_CID);
NS_DEFINE_NAMED_CID(NS_PLAIN_MIME_EMITTER_CID);
NS_DEFINE_NAMED_CID(NS_RAW_MIME_EMITTER_CID);

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsFts3Tokenizer)

NS_DEFINE_NAMED_CID(NS_FTS3TOKENIZER_CID);

////////////////////////////////////////////////////////////////////////////////
// mail view factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMsgMailViewList)

NS_DEFINE_NAMED_CID(NS_MSGMAILVIEWLIST_CID);

////////////////////////////////////////////////////////////////////////////////
// mdn factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMsgMdnGenerator)

NS_DEFINE_NAMED_CID(NS_MSGMDNGENERATOR_CID);

////////////////////////////////////////////////////////////////////////////////
// smime factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMsgComposeSecure)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsSMimeJSHelper)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsEncryptedSMIMEURIsService)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsCMSDecoder, Init)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsCMSDecoderJS, Init)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsCMSEncoder, Init)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsCMSMessage, Init)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsCMSSecureMessage, Init)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsCertPicker, Init)

NS_DEFINE_NAMED_CID(NS_MSGCOMPOSESECURE_CID);
NS_DEFINE_NAMED_CID(NS_SMIMEJSJELPER_CID);
NS_DEFINE_NAMED_CID(NS_SMIMEENCRYPTURISERVICE_CID);
NS_DEFINE_NAMED_CID(NS_CMSDECODER_CID);
NS_DEFINE_NAMED_CID(NS_CMSDECODERJS_CID);
NS_DEFINE_NAMED_CID(NS_CMSENCODER_CID);
NS_DEFINE_NAMED_CID(NS_CMSMESSAGE_CID);
NS_DEFINE_NAMED_CID(NS_CMSSECUREMESSAGE_CID);
NS_DEFINE_NAMED_CID(NS_CERT_PICKER_CID);

////////////////////////////////////////////////////////////////////////////////
// PGP/MIME factories
////////////////////////////////////////////////////////////////////////////////

NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsPgpMimeProxy, Init)

NS_DEFINE_NAMED_CID(NS_PGPMIMEPROXY_CID);

NS_DEFINE_NAMED_CID(NS_PGPMIME_CONTENT_TYPE_HANDLER_CID);

extern "C" MimeObjectClass* MIME_PgpMimeCreateContentTypeHandlerClass(
    const char* content_type, contentTypeHandlerInitStruct* initStruct);

static nsresult nsPgpMimeMimeContentTypeHandlerConstructor(REFNSIID aIID,
                                                           void** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = nullptr;

  RefPtr<nsMimeContentTypeHandler> inst(new nsMimeContentTypeHandler(
      "multipart/encrypted", &MIME_PgpMimeCreateContentTypeHandlerClass));

  NS_ENSURE_TRUE(inst, NS_ERROR_OUT_OF_MEMORY);

  return inst->QueryInterface(aIID, aResult);
}

////////////////////////////////////////////////////////////////////////////////
// i18n factories
////////////////////////////////////////////////////////////////////////////////

NS_GENERIC_FACTORY_CONSTRUCTOR(nsCharsetConverterManager)

NS_DEFINE_NAMED_CID(NS_ICHARSETCONVERTERMANAGER_CID);

const mozilla::Module::CIDEntry kMailNewsCIDs[] = {
    // Bayesian Filter Entries
    {&kNS_BAYESIANFILTER_CID, false, NULL, nsBayesianFilterConstructor},
// JsAccount Entries
#if JSACCOUNT_ENABLED
    {&kJACPPABDIRECTORYDELEGATOR_CID, false, nullptr,
     JaCppAbDirectoryDelegatorConstructor},
    {&kJACPPCOMPOSEDELEGATOR_CID, false, nullptr,
     JaCppComposeDelegatorConstructor},
    {&kJACPPINCOMINGSERVERDELEGATOR_CID, false, nullptr,
     JaCppIncomingServerDelegatorConstructor},
    {&kJACPPMSGFOLDERDELEGATOR_CID, false, nullptr,
     JaCppMsgFolderDelegatorConstructor},
    {&kJACPPURLDELEGATOR_CID, false, nullptr, JaCppUrlDelegatorConstructor},
#endif
    // msgdb Entries
    {&kNS_MAILDB_CID, false, NULL, nsMailDatabaseConstructor},
    {&kNS_NEWSDB_CID, false, NULL, nsNewsDatabaseConstructor},
    {&kNS_IMAPDB_CID, false, NULL, nsImapMailDatabaseConstructor},
    {&kNS_MSG_RETENTIONSETTINGS_CID, false, NULL,
     nsMsgRetentionSettingsConstructor},
    {&kNS_MSG_DOWNLOADSETTINGS_CID, false, NULL,
     nsMsgDownloadSettingsConstructor},
    {&kNS_MSGDB_SERVICE_CID, false, NULL, nsMsgDBServiceConstructor},
    // Mime Entries
    {&kNS_MIME_OBJECT_CLASS_ACCESS_CID, false, NULL,
     nsMimeObjectClassAccessConstructor},
    {&kNS_MAILNEWS_MIME_STREAM_CONVERTER_CID, false, NULL,
     nsStreamConverterConstructor},
    {&kNS_HTML_MIME_EMITTER_CID, false, NULL,
     nsMimeHtmlDisplayEmitterConstructor},
    {&kNS_XML_MIME_EMITTER_CID, false, NULL, nsMimeXmlEmitterConstructor},
    {&kNS_PLAIN_MIME_EMITTER_CID, false, NULL, nsMimePlainEmitterConstructor},
    {&kNS_RAW_MIME_EMITTER_CID, false, NULL, nsMimeRawEmitterConstructor},
    // Fts 3
    {&kNS_FTS3TOKENIZER_CID, false, NULL, nsFts3TokenizerConstructor},
    // Mail View Entries
    {&kNS_MSGMAILVIEWLIST_CID, false, NULL, nsMsgMailViewListConstructor},
    // mdn Entries
    {&kNS_MSGMDNGENERATOR_CID, false, NULL, nsMsgMdnGeneratorConstructor},
    // SMime Entries
    {&kNS_MSGCOMPOSESECURE_CID, false, NULL, nsMsgComposeSecureConstructor},
    {&kNS_SMIMEJSJELPER_CID, false, NULL, nsSMimeJSHelperConstructor},
    {&kNS_SMIMEENCRYPTURISERVICE_CID, false, NULL,
     nsEncryptedSMIMEURIsServiceConstructor},
    {&kNS_CMSDECODER_CID, false, NULL, nsCMSDecoderConstructor},
    {&kNS_CMSDECODERJS_CID, false, NULL, nsCMSDecoderJSConstructor},
    {&kNS_CMSENCODER_CID, false, NULL, nsCMSEncoderConstructor},
    {&kNS_CMSMESSAGE_CID, false, NULL, nsCMSMessageConstructor},
    {&kNS_CMSSECUREMESSAGE_CID, false, NULL, nsCMSSecureMessageConstructor},
    {&kNS_CERT_PICKER_CID, false, nullptr, nsCertPickerConstructor},
    // PGP/MIME Entries
    {&kNS_PGPMIME_CONTENT_TYPE_HANDLER_CID, false, NULL,
     nsPgpMimeMimeContentTypeHandlerConstructor},
    {&kNS_PGPMIMEPROXY_CID, false, NULL, nsPgpMimeProxyConstructor},
    // i18n Entries
    {&kNS_ICHARSETCONVERTERMANAGER_CID, false, nullptr,
     nsCharsetConverterManagerConstructor},
    // Tokenizer Entries
    {NULL}};

const mozilla::Module::ContractIDEntry kMailNewsContracts[] = {
    // Bayesian Filter Entries
    {NS_BAYESIANFILTER_CONTRACTID, &kNS_BAYESIANFILTER_CID},
// JsAccount Entries
#if JSACCOUNT_ENABLED
    {JACPPABDIRECTORYDELEGATOR_CONTRACTID, &kJACPPABDIRECTORYDELEGATOR_CID},
    {JACPPCOMPOSEDELEGATOR_CONTRACTID, &kJACPPCOMPOSEDELEGATOR_CID},
    {JACPPINCOMINGSERVERDELEGATOR_CONTRACTID,
     &kJACPPINCOMINGSERVERDELEGATOR_CID},
    {JACPPMSGFOLDERDELEGATOR_CONTRACTID, &kJACPPMSGFOLDERDELEGATOR_CID},
    {JACPPURLDELEGATOR_CONTRACTID, &kJACPPURLDELEGATOR_CID},
#endif
    // msgdb Entries
    {NS_MAILBOXDB_CONTRACTID, &kNS_MAILDB_CID},
    {NS_NEWSDB_CONTRACTID, &kNS_NEWSDB_CID},
    {NS_IMAPDB_CONTRACTID, &kNS_IMAPDB_CID},
    {NS_MSG_RETENTIONSETTINGS_CONTRACTID, &kNS_MSG_RETENTIONSETTINGS_CID},
    {NS_MSG_DOWNLOADSETTINGS_CONTRACTID, &kNS_MSG_DOWNLOADSETTINGS_CID},
    {NS_MSGDB_SERVICE_CONTRACTID, &kNS_MSGDB_SERVICE_CID},
    // Mime Entries
    {NS_MIME_OBJECT_CONTRACTID, &kNS_MIME_OBJECT_CLASS_ACCESS_CID},
    {NS_MAILNEWS_MIME_STREAM_CONVERTER_CONTRACTID,
     &kNS_MAILNEWS_MIME_STREAM_CONVERTER_CID},
    {NS_MAILNEWS_MIME_STREAM_CONVERTER_CONTRACTID1,
     &kNS_MAILNEWS_MIME_STREAM_CONVERTER_CID},
    {NS_MAILNEWS_MIME_STREAM_CONVERTER_CONTRACTID2,
     &kNS_MAILNEWS_MIME_STREAM_CONVERTER_CID},
    {NS_HTML_MIME_EMITTER_CONTRACTID, &kNS_HTML_MIME_EMITTER_CID},
    {NS_XML_MIME_EMITTER_CONTRACTID, &kNS_XML_MIME_EMITTER_CID},
    {NS_PLAIN_MIME_EMITTER_CONTRACTID, &kNS_PLAIN_MIME_EMITTER_CID},
    {NS_RAW_MIME_EMITTER_CONTRACTID, &kNS_RAW_MIME_EMITTER_CID},
    // FTS3
    {NS_FTS3TOKENIZER_CONTRACTID, &kNS_FTS3TOKENIZER_CID},
    // Mail View Entries
    {NS_MSGMAILVIEWLIST_CONTRACTID, &kNS_MSGMAILVIEWLIST_CID},
    // mdn Entries
    {NS_MSGMDNGENERATOR_CONTRACTID, &kNS_MSGMDNGENERATOR_CID},
    // SMime Entries
    {NS_MSGCOMPOSESECURE_CONTRACTID, &kNS_MSGCOMPOSESECURE_CID},
    {NS_SMIMEJSHELPER_CONTRACTID, &kNS_SMIMEJSJELPER_CID},
    {NS_SMIMEENCRYPTURISERVICE_CONTRACTID, &kNS_SMIMEENCRYPTURISERVICE_CID},
    {NS_CMSSECUREMESSAGE_CONTRACTID, &kNS_CMSSECUREMESSAGE_CID},
    {NS_CMSDECODER_CONTRACTID, &kNS_CMSDECODER_CID},
    {NS_CMSDECODERJS_CONTRACTID, &kNS_CMSDECODERJS_CID},
    {NS_CMSENCODER_CONTRACTID, &kNS_CMSENCODER_CID},
    {NS_CMSMESSAGE_CONTRACTID, &kNS_CMSMESSAGE_CID},
    {NS_CERTPICKDIALOGS_CONTRACTID, &kNS_CERT_PICKER_CID},
    {NS_CERT_PICKER_CONTRACTID, &kNS_CERT_PICKER_CID},
    // PGP/MIME Entries
    {"@mozilla.org/mimecth;1?type=multipart/encrypted",
     &kNS_PGPMIME_CONTENT_TYPE_HANDLER_CID},
    {NS_PGPMIMEPROXY_CONTRACTID, &kNS_PGPMIMEPROXY_CID},
    // i18n Entries
    {NS_CHARSETCONVERTERMANAGER_CONTRACTID, &kNS_ICHARSETCONVERTERMANAGER_CID},
    // Tokenizer Entries
    {NULL}};

static const mozilla::Module::CategoryEntry kMailNewsCategories[] = {
    // Bayesian Filter Entries
    // JsAccount Entries
    // msgdb Entries
    // Mime Entries
    {"mime-emitter", NS_HTML_MIME_EMITTER_CONTRACTID,
     NS_HTML_MIME_EMITTER_CONTRACTID},
    {"mime-emitter", NS_XML_MIME_EMITTER_CONTRACTID,
     NS_XML_MIME_EMITTER_CONTRACTID},
    {"mime-emitter", NS_PLAIN_MIME_EMITTER_CONTRACTID,
     NS_PLAIN_MIME_EMITTER_CONTRACTID},
    {"mime-emitter", NS_RAW_MIME_EMITTER_CONTRACTID,
     NS_RAW_MIME_EMITTER_CONTRACTID},
    {NULL}};

static void msgMailNewsModuleDtor() {}

extern const mozilla::Module kMailNewsModule = {
    mozilla::Module::kVersion, kMailNewsCIDs, kMailNewsContracts,
    kMailNewsCategories,       NULL,          NULL,
    msgMailNewsModuleDtor};
