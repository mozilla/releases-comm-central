/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Contains the definitions of contract IDs for modules in JsAccounts.

#ifndef _msgJsAccountCID_H_
#define _msgJsAccountCID_H_

#define JACPPURLDELEGATOR_CID \
{ 0x1a0b778c, 0x2fe6, 0x4012, { 0xb4, 0xf3, 0xe8, 0x1c, 0xc, 0x11, 0x64, 0x9 } }
#define JACPPURLDELEGATOR_CONTRACTID "@mozilla.org/jacppurldelegator;1"

#define JACPPABDIRECTORYDELEGATOR_CID \
{ 0x77b5592c, 0x5018, 0x436d, { 0xa4, 0x66, 0xc4, 0xe5, 0x44, 0x3a, 0x16, 0x69 } }
#define JACPPABDIRECTORYDELEGATOR_CONTRACTID "@mozilla.org/jacppabdirectorydelegator;1"

#define JACPPINCOMINGSERVERDELEGATOR_CID \
{ 0x7aa11dd3, 0x5590, 0x4e01, { 0xbd, 0x87, 0x91, 0xf6, 0x02, 0x72, 0xd0, 0x1a } }
#define JACPPINCOMINGSERVERDELEGATOR_CONTRACTID "@mozilla.org/jacppincomingserverdelegator;1"

#endif
