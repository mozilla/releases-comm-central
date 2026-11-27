# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Generates the static OCSP responses used by test_ocspRevocation.js:
<cert>-good.ocsp and <cert>-revoked.ocsp, for the end-entity certificates
ocsp-ee.pem (TLS) and ocsp-email.pem (S/MIME) issued by ocsp-ca.pem, signed
directly by the CA ("default" pykey).

The responses use fixed dates, so the output is deterministic and the test
verifies at a fixed time within the response validity window.

Run from the top of the source tree, after regenerating the certificates with
mach generate-test-certs:
  ./mach python comm/mailnews/base/test/unit/data/gen_ocsp_responses.py
"""

import hashlib
import os
import sys

TOPSRCDIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([os.pardir] * 6))
)
sys.path.insert(0, os.path.join(TOPSRCDIR, "security", "manager", "tools"))

import pykey  # noqa: E402
from pyasn1.codec.der import decoder, encoder  # noqa: E402
from pyasn1.type import tag, univ, useful  # noqa: E402
from pyasn1_modules import pem, rfc2560, rfc5280  # noqa: E402

DATA_DIR = os.path.dirname(os.path.abspath(__file__))

THIS_UPDATE = "20260101000000Z"
NEXT_UPDATE = "20260108000000Z"
REVOCATION_TIME = "20251201000000Z"

SHA1 = univ.ObjectIdentifier("1.3.14.3.2.26")
SHA256_WITH_RSA = univ.ObjectIdentifier("1.2.840.113549.1.1.11")


def load_cert(name):
    with open(os.path.join(DATA_DIR, name)) as f:
        der = pem.readPemFromFile(f)
    cert, _ = decoder.decode(der, asn1Spec=rfc5280.Certificate())
    return cert


def key_hash(cert):
    spk = cert["tbsCertificate"]["subjectPublicKeyInfo"]["subjectPublicKey"]
    return hashlib.sha1(spk.asOctets()).digest()


def make_cert_id(ee, ca):
    cert_id = rfc2560.CertID()
    algorithm = cert_id["hashAlgorithm"]
    algorithm["algorithm"] = SHA1
    algorithm["parameters"] = univ.Null()
    issuer_der = encoder.encode(ee["tbsCertificate"]["issuer"])
    cert_id["issuerNameHash"] = hashlib.sha1(issuer_der).digest()
    cert_id["issuerKeyHash"] = key_hash(ca)
    cert_id["serialNumber"] = int(ee["tbsCertificate"]["serialNumber"])
    return cert_id


def make_response(ee, ca, revoked):
    single = rfc2560.SingleResponse()
    single["certID"] = make_cert_id(ee, ca)
    status = single["certStatus"]
    if revoked:
        info = status["revoked"]
        info["revocationTime"] = useful.GeneralizedTime(REVOCATION_TIME)
    else:
        status["good"] = univ.Null().subtype(
            implicitTag=tag.Tag(tag.tagClassContext, tag.tagFormatSimple, 0)
        )
    single["thisUpdate"] = useful.GeneralizedTime(THIS_UPDATE)
    single["nextUpdate"] = useful.GeneralizedTime(NEXT_UPDATE).subtype(
        explicitTag=tag.Tag(tag.tagClassContext, tag.tagFormatSimple, 0)
    )

    data = rfc2560.ResponseData()
    data["responderID"]["byKey"] = rfc2560.KeyHash(key_hash(ca)).subtype(
        explicitTag=tag.Tag(tag.tagClassContext, tag.tagFormatSimple, 2)
    )
    data["producedAt"] = useful.GeneralizedTime(THIS_UPDATE)
    data["responses"].append(single)

    basic = rfc2560.BasicOCSPResponse()
    basic["tbsResponseData"] = data
    basic["signatureAlgorithm"]["algorithm"] = SHA256_WITH_RSA
    basic["signatureAlgorithm"]["parameters"] = univ.Null()
    signing_key = pykey.keyFromSpecification("default")
    basic["signature"] = univ.BitString(
        signing_key.sign(encoder.encode(data), pykey.HASH_SHA256)
    )

    response = rfc2560.OCSPResponse()
    response["responseStatus"] = "successful"
    response_bytes = response["responseBytes"]
    response_bytes["responseType"] = rfc2560.id_pkix_ocsp_basic
    response_bytes["response"] = encoder.encode(basic)
    return encoder.encode(response)


def main():
    ca = load_cert("ocsp-ca.pem")
    for cert_name in ("ocsp-ee", "ocsp-email"):
        ee = load_cert(f"{cert_name}.pem")
        for name, revoked in (("good", False), ("revoked", True)):
            path = os.path.join(DATA_DIR, f"{cert_name}-{name}.ocsp")
            with open(path, "wb") as f:
                f.write(make_response(ee, ca, revoked))
            print(f"Wrote {path}")


if __name__ == "__main__":
    main()
