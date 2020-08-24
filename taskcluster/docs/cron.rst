Periodic Taskgraphs
===================

The cron functionality allows in-tree scheduling of task graphs that run
periodically, instead of on a push.


Cron.yml
--------

In the root of the Comm directory, you will find `.cron.yml`.  This defines
the periodic tasks ("cron jobs") that run for Thunderbird.

See `the Firefox CI cron documentation <https://firefox-source-docs.mozilla.org/taskcluster/cron.html>`_
for a description of `.cron.yml`.


Disabling Cron Jobs
-------------------

Sometimes due to build bustage, it's desirable to disable the automatic
Thunderbird Daily builds. The best way to do this is to change `.cron.yml`
so that the jobs are never scheduled. This is done by changing `when` to an
empty list.

The Daily build is started by the `nightly-desktop` job. Additionally, there
is a `searchfox-index` job that should be disabled as well when disabling
Dailies.

For both of these, comment out the `when` line that sets a time and uncomment
the next line which sets an empty list.

.. code-block:: yaml
  :linenos:
  :emphasize-lines: 8,9

    - name: nightly-desktop
      job:
          type: decision-task
          treeherder-symbol: Nd
          target-tasks-method: nightly_desktop
      run-on-projects:
          - comm-central
      when: [{hour: 11, minute: 0}]
      # when: []


L10n-bump Cron Job
------------------

`l10n-bump` runs daily on comm-beta. For RC week (week 4) it needs to be
disabled by pushing a change directly to `comm-beta` setting ``when`` to
an empty list as above.

**Do not make the change on comm-central first.** `l10n-bump` will be
re-enabled by merge day activities automatically.

