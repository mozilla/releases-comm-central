# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY

def migrate(ctx):
    """Bug 2044373 - Migrate charsetTitles.properties strings to Fluent, part {index}"""

    target = reference = "mail/messenger/menulist-charsetpicker.ftl"

    source = "mail/chrome/messenger/charsetTitles.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
charset-utf-8 = { COPY(source, "utf-8.title") }
charset-big5 = { COPY(source, "big5.title") }
charset-euc-kr = { COPY(source, "euc-kr.title") }
charset-gbk = { COPY(source, "gbk.title") }
charset-koi8-r = { COPY(source, "koi8-r.title") }
charset-iso-2022-jp = { COPY(source, "iso-2022-jp.title") }
charset-iso-8859-1 = { COPY(source, "iso-8859-1.title") }
charset-iso-8859-2 = { COPY(source, "iso-8859-2.title") }
charset-iso-8859-7 = { COPY(source, "iso-8859-7.title") }
charset-windows-874 = { COPY(source, "windows-874.title") }
charset-windows-1250 = { COPY(source, "windows-1250.title") }
charset-windows-1251 = { COPY(source, "windows-1251.title") }
charset-windows-1252 = { COPY(source, "windows-1252.title") }
charset-windows-1255 = { COPY(source, "windows-1255.title") }
charset-windows-1256 = { COPY(source, "windows-1256.title") }
charset-windows-1257 = { COPY(source, "windows-1257.title") }
charset-windows-1258 = { COPY(source, "windows-1258.title") }
            """,
            source=source,
        ),
    )
