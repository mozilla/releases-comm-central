# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import
import fluent.syntax.ast as FTL
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1567070 - Migrate about:rights to Fluent in Thunderbird, part {index}."""

    ctx.add_transforms(
        "mail/messenger/aboutRights.ftl",
        "mail/messenger/aboutRights.ftl",
        transforms_from(
            """
rights-title = {COPY_PATTERN(from_path, "rights-title")}

rights-intro = {COPY_PATTERN(from_path, "rights-intro")}

rights-intro-point-1 = {COPY_PATTERN(from_path, "rights-intro-point-1")}

rights-intro-point-3 = {COPY_PATTERN(from_path, "rights-intro-point-3")}

rights-intro-point-4 = {COPY_PATTERN(from_path, "rights-intro-point-4")}

rights-intro-point-4-unbranded = {COPY_PATTERN(from_path, "rights-intro-point-4-unbranded ")}

rights-intro-point-5 = {COPY_PATTERN(from_path, "rights-intro-point-5")}

rights-intro-point-5-unbranded = {COPY_PATTERN(from_path, "rights-intro-point-5-unbranded")}

rights-intro-point-6 = {COPY_PATTERN(from_path, "rights-intro-point-6")}

rights-webservices-header = {COPY_PATTERN(from_path, "rights-webservices-header")}

rights-webservices = {COPY_PATTERN(from_path, "rights-webservices")}

rights-locationawarebrowsing = {COPY_PATTERN(from_path, "rights-locationawarebrowsing")}

rights-locationawarebrowsing-term-1 = {COPY_PATTERN(from_path, "rights-locationawarebrowsing-term-1")}

rights-locationawarebrowsing-term-2 = {COPY_PATTERN(from_path, "rights-locationawarebrowsing-term-2")}

rights-locationawarebrowsing-term-3 = {COPY_PATTERN(from_path, "rights-locationawarebrowsing-term-3")}

rights-locationawarebrowsing-term-4 = {COPY_PATTERN(from_path, "rights-locationawarebrowsing-term-4")}

rights-webservices-unbranded = {COPY_PATTERN(from_path, "rights-webservices-unbranded")}

rights-webservices-term-unbranded = {COPY_PATTERN(from_path, "rights-webservices-term-unbranded")}

rights-webservices-term-1 = {COPY_PATTERN(from_path, "rights-webservices-term-1")}

rights-webservices-term-2 = {COPY_PATTERN(from_path, "rights-webservices-term-2")}

rights-webservices-term-3 = {COPY_PATTERN(from_path, "rights-webservices-term-3")}

rights-webservices-term-4 = {COPY_PATTERN(from_path, "rights-webservices-term-4")}

rights-webservices-term-5 = {COPY_PATTERN(from_path, "rights-webservices-term-5")}

rights-webservices-term-6 = {COPY_PATTERN(from_path, "rights-webservices-term-6")}

rights-webservices-term-7 = {COPY_PATTERN(from_path, "rights-webservices-term-7")}

""",
            from_path="toolkit/toolkit/about/aboutRights.ftl",
        ),
    )


"""
rights-intro-point-2 = ### this needs s/Firefox/Thunderbird

rights-safebrowsing = ### No safebrowsing in tb.
rights-safebrowsing-term-1 = ### No safebrowsing in tb.
rights-safebrowsing-term-2 = ### No safebrowsing in tb.
rights-safebrowsing-term-3 = ### No safebrowsing in tb.
enableSafeBrowsing-label = ### No safebrowsing in tb.
rights-safebrowsing-term-4 = ### No safebrowsing in tb.
"""
