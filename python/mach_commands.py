# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os

from mozilla_version.gecko import GeckoVersion

from mach.decorators import Command, CommandArgument, SubCommand


@Command("tb-release", category="thunderbird", virtualenv_name="tb_common")
def tb_release(command_context):
    pass


@SubCommand(
    "tb-release",
    "send-buglist-email-thunderbird",
    description="Send an email with the bugs since the last release.",
)
@CommandArgument(
    "--address",
    required=True,
    action="append",
    dest="addresses",
    help="The email address to send the bug list to " "(may be specified more than once.",
)
@CommandArgument(
    "--version",
    type=GeckoVersion.parse,
    required=True,
    help="The version being built.",
)
@CommandArgument("--product", required=True, help="The product being built.")
@CommandArgument("--repo", required=True, help="The repo being built.")
@CommandArgument("--revision", required=True, help="The revision being built.")
@CommandArgument("--build-number", required=True, help="The build number")
@CommandArgument("--task-group-id", help="The task group of the build.")
@CommandArgument("--prefix-message", help="A message to insert into the email body.")
def buglist_email(
    command_context,
    addresses,
    product,
    version,
    repo,
    revision,
    build_number,
    task_group_id,
    prefix_message,
):
    import base64

    from mozrelease.buglist_creator import create_bugs_url

    from rocbuild.machutil import setup_logging
    from rocbuild.notify import email_notification

    setup_logging(command_context)

    email_buglist_string = create_bugs_url(product, version, revision, repo=repo)

    if prefix_message is not None:
        _msg = base64.b64decode(bytes(prefix_message.encode("utf-8"))).decode()
        release_prefix_msg = f"\n{_msg}\n"
    else:
        release_prefix_msg = ""

    content = """\
A new build has been started:
{release_prefix_msg}
Commit: [{revision}]({repo}/rev/{revision})
Task group: [{task_group_id}]({root_url}/tasks/groups/{task_group_id})

{email_buglist_string}
    """.format(
        release_prefix_msg=release_prefix_msg,
        repo=repo,
        revision=revision,
        root_url=os.environ["TASKCLUSTER_ROOT_URL"],
        task_group_id=task_group_id,
        email_buglist_string=email_buglist_string,
    )
    print(content)
    subject = "[Thunderbird] Build of {} {} build {}".format(product, version, build_number)
    email_notification(subject, content, addresses)
