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
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from pathlib import Path
from pprint import pprint as pp
from time import sleep
from typing import List, Literal, NamedTuple, Tuple, Union

import jwt
import requests
from redo import retry

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

ATN_UPLOAD_URL = "https://addons.thunderbird.net/api/v4/addons/langpack-{langcode}@thunderbird.mozilla.org/versions/{version}/"
ATN_VERSION_URL = "https://addons.thunderbird.net/api/v4/addons/addon/{guid}/versions/?page_size=1"
CHUNK_SIZE = 128 * 1024


class ATNChannel(Enum):
    LISTED = "listed"
    UNLISTED = "unlisted"

class TransientError(requests.HTTPError):
    pass


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
    message = message + "\n"
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

    def upload_langpack(self, locale: str) -> requests.Response:
        ALREADY_UPLOADED = "Version already exists. Latest version is:"

        def attempt_upload():
            langpack_path = self.langpack_dir / locale / "target.langpack.xpi"

            with open(langpack_path, "rb") as langpack_fd:
                file = {"upload": ("upload", langpack_fd)}
                data = {"channel": self.langpack_channel}
                headers = self.mk_headers()

                url = ATN_UPLOAD_URL.format(version=self.langpack_version, langcode=locale)

                with requests.put(url, files=file, data=data, headers=headers, verify=False, timeout=(30, 300)) as resp:
                    http_code = resp.status_code
                    json_obj = response_json(resp)

                    if http_code == 429 or http_code >= 500:
                        # Raise TransientError to trigger wrapping retry() method
                        raise TransientError(response=resp)
                    elif json_obj and "error" in json_obj:
                        if not json_obj["error"].startswith(ALREADY_UPLOADED):
                            # Raise TransientError to trigger wrapping retry() method
                            raise TransientError(response=resp)
                    elif not resp.ok:
                        resp.raise_for_status()

                    return resp, json_obj

        def response_json(resp):
            try:
                json_obj = resp.json()
            except ValueError:
                log.warning(f"Warning: non-JSON response returned for locale {locale}")
                return None

            return json_obj

        upload_resp, json_obj = retry(
            attempt_upload,
            retry_exceptions=(TransientError,),
            attempts=5,
            sleeptime=30,
            sleepscale=2.0,
        )

        if json_obj and json_obj.get("error", "").startswith(ALREADY_UPLOADED):
            return upload_resp

        # Sleep so addon uploads can process/validate
        sleep(5 * 60)

        # Check if langpack was uploaded successfully
        if json_obj and "guid" in json_obj:
            url = ATN_VERSION_URL.format(guid=json_obj["guid"])

            with requests.get(url, timeout=(30, 60)) as version_resp:
                json_obj = response_json(version_resp)

                if json_obj and "results" in json_obj:
                    if len(json_obj["results"]) > 0:
                        if "version" in json_obj["results"][0]:
                            latest_version = json_obj["results"][0]["version"]

                            if latest_version == self.langpack_version:
                                return upload_resp
                else:
                    raise TransientError(response=version_resp)

        # Raise TransientError to trigger wrapping retry() method
        raise TransientError(response=upload_resp)

    def upload_all_locales(self) -> Tuple[List[Result], List[Result]]:
        successes = []
        failures = []

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {locale: executor.submit(
                retry,
                self.upload_langpack,
                args=(locale,),
                retry_exceptions=(TransientError,),
                attempts=2,
                sleeptime=3 * 60,
            ) for locale in self.locales}

            for locale, future in futures.items():
                try:
                    successes.append((locale, future.result()))
                except Exception as e:
                    resp = getattr(e, "response", None)

                    if resp is not None:
                        print_line(str(resp.url))
                        print_line(str(resp.status_code))
                        print_line(str(resp.text))
                    else:
                        print_line(str(e))

                    failures.append((locale, e))

        return successes, failures


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
        res = requests.get(secrets_url, timeout=(30, 60))
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

    successes, failures = atn_uploader.upload_all_locales()

    pp(successes)
    if failures:
        pp(failures)
        sys.exit(1)


if __name__ == "__main__":
    main()
