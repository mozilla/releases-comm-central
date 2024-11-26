#!python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import datetime
import json
import logging
import os
import random
import string
import sys
from enum import Enum
from pathlib import Path
from pprint import pprint as pp
from typing import List, Literal, NamedTuple, Tuple, Union

import jwt
import requests
from redo import retry

logging.getLogger("requests").setLevel(logging.DEBUG)

ATN_UPLOAD_URL = "https://addons.thunderbird.net/api/v3/addons/langpack-{langcode}@thunderbird.mozilla.org/versions/{version}/"
CHUNK_SIZE = 128 * 1024


class ATNChannel(Enum):
    LISTED = "listed"
    UNLISTED = "unlisted"


Locales = List[str]
Version = str
ApiParam = str
EnvVars = NamedTuple(
    "EnvVars",
    [
        ("langpack_version", Version),
        ("locales", Locales),
        ("langpack_dir", Path),
        ("langpack_channel", Literal[ATNChannel.LISTED, ATNChannel.UNLISTED]),
        ("api_key", ApiParam),
        ("api_secret", ApiParam),
    ],
)
Result = Tuple[str, Union[object, None]]


def print_line(message):
    msg_bytes = message.encode("utf-8")
    written = 0
    while written < len(msg_bytes):
        written += sys.stdout.buffer.write(msg_bytes[written:]) or 0
    sys.stdout.buffer.flush()


class ATNUploader:
    def __init__(self, options: EnvVars):
        self.api_key = options.api_key
        self.api_secret = options.api_secret
        self.langpack_dir = options.langpack_dir
        self.langpack_version = options.langpack_version
        self.langpack_channel = options.langpack_channel
        self.locales = options.locales

    def mk_headers(self) -> dict:
        now = datetime.datetime.utcnow()
        payload = {
            "iss": self.api_key,
            "jti": "".join(
                random.choice(string.ascii_uppercase + string.digits) for _ in range(64)
            ),
            "exp": now + datetime.timedelta(seconds=60),
            "iat": now,
        }
        headers = {
            "Authorization": "JWT {0}".format(
                jwt.encode(payload, self.api_secret, algorithm="HS256")
            )
        }
        return headers

    def upload_langpack(self, locale: str) -> Result:
        langpack_path = self.langpack_dir / locale / "target.langpack.xpi"
        headers = self.mk_headers()
        langpack_fd = open(langpack_path, "rb")
        file = {"upload": ("upload", langpack_fd)}
        data = {"channel": self.langpack_channel}

        url = ATN_UPLOAD_URL.format(version=self.langpack_version, langcode=locale)
        with requests.put(url, files=file, data=data, headers=headers, verify=False) as resp:
            if not resp.ok:
                print_line(f"Failed {locale}")
                
                # Print response to help determine if failure caused by client or host
                print(resp.text)
                
                return resp.json()
            else:
                return resp.json()

    def upload_all_locales(self) -> Tuple[List[Result], List[Result]]:
        failed = []
        success = []
        for locale in self.locales:
            try:
                rv = retry(self.upload_langpack, args=(locale,), attempts=3, sleeptime=10)
                if "error" not in rv:
                    success.append((locale, rv))
                elif rv["error"].find("Version already exists. Latest version is:") == 0:
                    success.append((locale, rv))
                else:
                    failed.append((locale, rv))
            except requests.HTTPError as e:
                print_line(e)
                failed.append((locale, None))
        return success, failed


def get_secret(name: str) -> Tuple[ApiParam, ApiParam]:
    secret = {}
    if "MOZ_SCM_LEVEL" in os.environ:
        level = os.environ.get("MOZ_SCM_LEVEL", "1")
        taskcluster_url = os.environ.get("TASKCLUSTER_PROXY_URL") or os.environ.get(
            "TASKCLUSTER_ROOT_URL", ""
        )
        secrets_url = (
            f"{taskcluster_url}/secrets/v1/secret/project/comm/thunderbird/releng"
            f"/build/level-{level}/{name}"
        )
        res = requests.get(secrets_url)
        res.raise_for_status()
        secret = res.json()
    elif "SECRET_FILE" in os.environ:  # For local dev/debug
        with open(os.environ["SECRET_FILE"]) as fp:
            secret = json.load(fp)["secret"]
    secret = secret.get("secret")
    api_key = secret["api_key"] if "api_key" in secret else None
    api_secret = secret["api_secret"] if "api_secret" in secret else None
    if api_key is None or api_secret is None:
        raise Exception(f"Unable to get secret. {secret.keys()}")

    return api_key, api_secret


def read_env_vars() -> EnvVars:
    try:
        langpack_version = os.environ["LANGPACK_VERSION"]
        locales_json = os.environ["LOCALES"]
        langpack_dir = Path(os.environ["MOZ_FETCHES_DIR"]).resolve()
        langpack_channel = os.environ["ATN_CHANNEL"]
    except KeyError:
        raise Exception("Missing environment variable(s)")

    locales = json.loads(locales_json)
    api_key, api_secret = get_secret("atn_langpack")

    return EnvVars(
        langpack_version, locales, langpack_dir, ATNChannel(langpack_channel), api_key, api_secret
    )


def main():
    options = read_env_vars()

    atn_uploader = ATNUploader(options)
    success, failed = atn_uploader.upload_all_locales()

    pp(success)
    if failed:
        pp(failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
