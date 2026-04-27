# Support Links

## Formats

These are in order of preference. `<slug>` should usually be the slug of the
knowledge base article, but can also be a custom string we deploy a [redirect](#redirects)
for if it's a `support.thunderbird.net` URL.

### `https://support.thunderbird.net/%APP%/%VERSION%/%OS%/%LOCALE%/<slug>`

These URLs are generated in JavaScript with `Services.urlFormatter.formatURLPref("app.support.baseURL") + "<slug>"`.
This format is also often used in mozilla-central code and will automatically
point to our URL thanks to using the preference, like the
[`<moz-support-link>` custom element](https://firefoxux.github.io/firefox-desktop-components/?path=/story/ui-widgets-support-link--primary).
Typically if a [redirect](#redirects) is wanted, this format is used.

### `https://support.thunderbird.net/kb/<slug>`

This format can be used to easily refer to any article without needing any JS,
so the link can be statically declared. Make sure that no language code sneaks
into the URL.

### `https://support.mozilla.org/kb/<slug>`

While this would work, we want to avoid hard coding `support.mozilla.org` in our
code base. Instead the `support.thunderbird.net` variant should be used if the
dynamic generation from the pref is not feasible.

## Redirects

Redirects are defined in the
[Thunderbird Website](https://github.com/thunderbird/thunderbird-website/blob/master/docker/conf/ssl.conf)
repository.
If discussion on the desired slug for the article is ongoing and blocking
further engineering work, using a redirect allows code to land and the correct
slug can then later be set in the redirect.

## Requesting a new article

Sometimes articles were accounted for in the design, but none has been created
yet. To request the creation of a knowledge base article, file an issue in the
[Thunderbird SUMO KB Issues](https://github.com/thunderbird/knowledgebase-issues/)
repository.
