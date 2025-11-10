# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from

replacements_download_headers_info_text = {
    "%1$S": VARIABLE_REFERENCE("count"),
}

replacements_enter_news_server_credentials = {
    "%1$S": VARIABLE_REFERENCE("server"),
}

replacements_enter_news_group_credentials = {
    "%1$S": VARIABLE_REFERENCE("newsgroup"),
    "%2$S": VARIABLE_REFERENCE("server"),
}

replacements_auto_subscribe_text = {
    "%1$S": VARIABLE_REFERENCE("newsgroup"),
}


def migrate(ctx):
    """Bug 1998524 - Migrate news.properties and downloadheaders.dtd to Fluent, part {index}."""

    properties_source = "mail/chrome/messenger/news.properties"
    dtd_source_downloadheaders = "mail/chrome/messenger/downloadheaders.dtd"
    dtd_source_newsError = "mail/chrome/messenger/newsError.dtd"
    ftl_target = "mail/messenger/news.ftl"

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
download-headers-dialog-title = { COPY(from_path, "downloadHeadersTitlePrefix") }

download-headers-info-text = { REPLACE(from_path, "downloadHeadersInfoText", replacements_download_headers_info_text) }

download-headers-ok-button =
    .label = { COPY(from_path, "okButtonText") }

cancel-confirm = { COPY(from_path, "cancelConfirm") }

enter-news-credentials-title = { COPY(from_path, "enterUserPassTitle") }

enter-news-server-credentials = { REPLACE(from_path, "enterUserPassServer", replacements_enter_news_server_credentials) }

enter-news-group-credentials = { REPLACE(from_path, "enterUserPassGroup", replacements_enter_news_group_credentials) }

auto-subscribe-text = { REPLACE(from_path, "autoSubscribeText", replacements_auto_subscribe_text) }
            """,
            from_path=properties_source,
            replacements_download_headers_info_text=replacements_download_headers_info_text,
            replacements_enter_news_server_credentials=replacements_enter_news_server_credentials,
            replacements_enter_news_group_credentials=replacements_enter_news_group_credentials,
            replacements_auto_subscribe_text=replacements_auto_subscribe_text,
        ),
    )

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
download-all-headers =
    .label = { COPY(from_path, "all.label") }
    .accesskey = { COPY(from_path, "all.accesskey") }

download-n =
    .label = { COPY(from_path, "download.label") }
    .accesskey = { COPY(from_path, "download.accesskey") }

n-headers =
    .value = { COPY(from_path, "headers.label") }
    .accesskey = { COPY(from_path, "headers.accesskey") }

mark-headers-read =
    .label = { COPY(from_path, "mark.label") }
    .accesskey = { COPY(from_path, "mark.accesskey") }
            """,
            from_path=dtd_source_downloadheaders,
        ),
    )

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
news-error-title = { COPY(from_path, "newsError.title") }
article-not-found-title = { COPY(from_path, "articleNotFound.title") }
article-not-found-desc = { COPY(from_path, "articleNotFound.desc") }
news-server-responded-prefix = { COPY(from_path, "serverResponded.title") }
article-may-have-expired = { COPY(from_path, "articleExpired.title") }
try-searching-prefix = { COPY(from_path, "trySearching.title") }
remove-expired-articles-label = { COPY(from_path, "removeExpiredArticles.title") }
            """,
            from_path=dtd_source_newsError,
        ),
    )
