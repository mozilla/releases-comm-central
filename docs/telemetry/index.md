# Notes on Glean/Telemetry in Thunderbird

## Hooking into the build process

The comm-central definitions in `comm/mail/metrics.yaml`,
`comm/mail/pings.yaml` and `comm/mail/tags.yaml` are used _in addition_ to
their mozilla-central counterparts..

As part of the mozilla-central telemetry build process, scripts are used to
generate the C++ files which define the probe registry (enums, string tables
etc).

Because of this code generation, the extra comm-central probe definitions
need to be included when the mozilla-central Glean is built.

This is done by setting `MOZ_GLEAN_EXTRA_*` config values. You can
see these in `comm/mail/moz.configure`.
These config values are used by `toolkit/components/glean/moz.build`
(mozilla-central) to pass the extra probe definitions to the code
generation scripts.

The build scripts can be found under `toolkit/components/telemetry/build_scripts`.
They are written in Python.

## Naming probes

To avoid clashing with the mozilla-central probes, we'll be pretty liberal
about slapping on prefixes to our definitions.

## Compile-time switches

Telemetry is compiled in by default for Nightly and Official builds. To enable for
unofficial builds, add the following line to your mozconfig (lack of a value is
intentional):

    ac_add_options MOZ_TELEMETRY_REPORTING=

## Runtime prefs for testing

There are a few `user.js` settings you'll want to set up for enabling telemetry local builds:

### Send telemetry to a local server

To set the Glean end point to a locally-running http server on port 8080, use:
```
user_pref("telemetry.fog.test.localhost_port", 8080);
user_pref("datareporting.healthreport.uploadEnabled", true);
```

For a simple test server, try https://github.com/mozilla/gzipServer
(or alternatively https://github.com/bcampbell/webhole).

### Bypass data policy checks

The data policy checks make sure the user has been shown and
has accepted the data policy. Bypass them with:

```
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification",true);
user_pref("datareporting.policy.dataSubmissionEnabled", true);
```

### Enable telemetry tracing

For logging, see https://firefox-source-docs.mozilla.org/toolkit/components/glean/dev/testing.html#logging

## Troubleshooting

### Sending test pings

Go to about:glean - you can find it on Help | Troubleshooting information (about:support).


## Further documentation

The Glean documentation is at:

https://docs.telemetry.mozilla.org/concepts/glean/glean.html
