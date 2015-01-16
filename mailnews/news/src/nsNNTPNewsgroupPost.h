/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsNNTPNewsgroupPost_h
#define __nsNNTPNewsgroupPost_h

#include "msgCore.h"
#include "nsINNTPNewsgroupPost.h"
#include "nsCOMPtr.h"
#include "nsStringGlue.h"
#include "nsIFile.h"

#define IDX_HEADER_FROM             0
#define IDX_HEADER_NEWSGROUPS       1
#define IDX_HEADER_SUBJECT          2

// set this to the last required header
#define IDX_HEADER_LAST_REQUIRED    IDX_HEADER_SUBJECT

#define IDX_HEADER_PATH             3
#define IDX_HEADER_DATE             4

#define IDX_HEADER_REPLYTO          5
#define IDX_HEADER_SENDER           6
#define IDX_HEADER_FOLLOWUPTO       7
#define IDX_HEADER_DATERECEIVED     8
#define IDX_HEADER_EXPIRES          9
#define IDX_HEADER_CONTROL          10
#define IDX_HEADER_DISTRIBUTION     11
#define IDX_HEADER_ORGANIZATION     12
#define IDX_HEADER_REFERENCES       13

// stuff that's required to be in the message,
// but probably generated on the server
#define IDX_HEADER_RELAYVERSION     14
#define IDX_HEADER_POSTINGVERSION   15
#define IDX_HEADER_MESSAGEID        16

// keep this in sync with the above
#define HEADER_LAST                 IDX_HEADER_MESSAGEID

class nsNNTPNewsgroupPost : public nsINNTPNewsgroupPost {
    
public:
    nsNNTPNewsgroupPost();
    
    NS_DECL_ISUPPORTS
    NS_DECL_NSINNTPNEWSGROUPPOST
    
private:
    virtual ~nsNNTPNewsgroupPost();

    nsCOMPtr<nsIFile> m_postMessageFile;
    nsCString m_header[HEADER_LAST+1];
    nsCString m_body;
    bool m_isControl;
};

#endif /* __nsNNTPNewsgroupPost_h */
