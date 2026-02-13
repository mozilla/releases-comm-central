#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT


def migrate(ctx):
    """Bug 1935334 - Migrate FilterEditor from PluralForm.sys.mjs, part {index}."""

    target = reference = "mail/messenger/filterEditor.ftl"
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("run-periodically"),
                attributes=[
                    FTL.Attribute(
                       id=FTL.Identifier("label"),
                       value=PLURALS(
                          "mail/chrome/messenger/filter.properties",
                          "contextPeriodic.label",
                          VARIABLE_REFERENCE("minutes"),
                          foreach=lambda n: REPLACE_IN_TEXT(
                              n,
                              dict(
                                  {
                                      "#1": VARIABLE_REFERENCE("minutes"),
                                  }
                              ),
                          ),
                       )
                    ),
                    FTL.Attribute(
                    id=FTL.Identifier("accesskey"),
                    value=PLURALS(
                      "mail/chrome/messenger/FilterEditor.dtd",
                      "contextPeriodic.accesskey",
                      VARIABLE_REFERENCE("minutes"),
                      foreach=lambda n: REPLACE_IN_TEXT(
                          n,
                          dict(
                              {
                                  "#1": VARIABLE_REFERENCE("minutes"),
                              }
                          ),
                      ),
                    )
                  ),
                ],
             )
          ]
    )
