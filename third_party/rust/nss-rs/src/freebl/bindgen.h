// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

// Minimal wrapper header for generating FREEBLVectorStr bindings.
// blapit.h provides full definitions for the context types nss-rs uses
// (AESContext, ChaCha20Poly1305Context); everything else referenced by
// loader.h signatures is forward-declared to keep the generated output small.

#include "blapit.h"
#include <prtypes.h>

// Forward-declare everything else referenced in loader.h function signatures.
// We never dereference these through Rust, so incomplete types are fine.
typedef CK_ULONG CK_HEDGE_TYPE;
typedef CK_ULONG CK_ML_DSA_PARAMETER_SET_TYPE;
typedef struct AESKeyWrapContextStr AESKeyWrapContext;
typedef struct Blake2bContextStr BLAKE2BContext;
typedef struct CMACContextStr CMACContext;
typedef struct CamelliaContextStr CamelliaContext;
typedef struct ChaCha20ContextStr ChaCha20Context;
typedef struct DESContextStr DESContext;
typedef struct DHParamsStr DHParams;
typedef struct DHPrivateKeyStr DHPrivateKey;
typedef struct DSAPrivateKeyStr DSAPrivateKey;
typedef struct DSAPublicKeyStr DSAPublicKey;
typedef struct ECGroup ECGroup;
typedef struct ECParamsStr ECParams;
typedef struct ECPoint ECPoint;
typedef struct ECPrivateKeyStr ECPrivateKey;
typedef struct ECPublicKeyStr ECPublicKey;
typedef struct HMACContextStr HMACContext;
typedef struct MD2ContextStr MD2Context;
typedef struct MD5ContextStr MD5Context;
typedef struct MLDSAContextStr MLDSAContext;
typedef struct MLDSAPrivateKeyStr MLDSAPrivateKey;
typedef struct MLDSAPublicKeyStr MLDSAPublicKey;
typedef struct PLArena PLArena;
typedef struct PLArenaPool PLArenaPool;
typedef struct PQGParamsStr PQGParams;
typedef struct PQGVerifyStr PQGVerify;
typedef struct RC2ContextStr RC2Context;
typedef struct RC4ContextStr RC4Context;
typedef struct RC5ContextStr RC5Context;
typedef struct RSAPrivateKeyStr RSAPrivateKey;
typedef struct RSAPublicKeyStr RSAPublicKey;
typedef struct SECHashObjectStr SECHashObject;
typedef struct SECItemStr SECItem;
typedef struct SEEDContextStr SEEDContext;
typedef struct SHA1ContextStr SHA1Context;
typedef struct SHA256ContextStr SHA256Context;
typedef struct SHA3ContextStr SHA3Context;
typedef struct SHA512ContextStr SHA512Context;
typedef struct SHAKEContextStr SHAKEContext;
typedef unsigned long CK_ULONG;

#include "loader.h"
