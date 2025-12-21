# ADR 0003 Front-end State Management

## Using Redux for state management in the front-end

### Links

<!-- [Where to find more detail about reasoning and resolutions]

The complexity of the issue will dictate where the discussion occurred with the
details of the decision and below are some link suggestions of these possible
discussion locations.

-->

- [Mailing List Discussion](https://thunderbird.topicbox.com/groups/developers/Tfb81187d438cf8b9/proposing-a-structured-state-management-solution-for-the-front-end-redux)
- [Bug #1993524](https://bugzilla.mozilla.org/show_bug.cgi?id=1993524)

### Status

<!-- [Status from the options: accepted, deprecated, superseded]

- **Accepted**: The decision described in the ADR has been accepted and should be
adhered to.
- **Deprecated**: The decision described in the ADR is no longer
relevant due to changes in system context.
- **Superseded**: The decision described in the ADR has been replaced by
another decision. Link to the new ADR doc that supersedes the existing one.

See the "ADR Life Cycle" section in the docs/adr/README.md
-->

- **Status:** Accepted

### Context

<!-- [Description of the context and problem statement that the decision is
addressing. It should contain any relevant factors that influenced the
decision.] -->
Currently all front-end code has its own bespoke state management. Sometimes it
will use HTML attributes, some structure in memory or some back-end store.

To speed up and streamline development, we should introduce a universal solution
to manage state for the front-end. This potential goes further than just using
the same structure everywhere, we should also be able to share code for
synchronizing state with common back-end systems.

Another aspect of introducing a dedicated solution is that we introduce
separation between consumption of the state and the set up and updating of the
state. This should reduce entanglement of front-end and back-end as well as make
it easier to change specific parts of the behavior.

## Decision

<!-- [Description of the decision that was made. Detail the change that will be
implemented.] -->
We choose to use Redux-Toolkit to manage state in our front-end code. Redux
(in-memory) stores will be shared on a document level. Parts of the state might
be synchronized with back-end systems like prefs, XUL store or databases.

We will develop some additional helpers to make Redux fully usable in our
context and simplify use of it. While some helpers are initially provided, they
will require further refinement and we will likely create additional helpers as
time goes on.

### Consequences and Risks

<!-- [Explanation of the consequences of the decision. This includes both the
positive effects and any potential risks.] -->

#### Positive Consequences

- Simplifying implementation of state management for front-end code, speeding
  up development by reducing the amount of design has to go into state
  management when building something new.
- Unifying how we implement state management in front-end code.
- By using an existing solution, we can profit from the knowledge of the project
- Redux is fairly well known, so new developers might already be familiar with
  some of the concepts.
- The separation Redux enforces makes it easier to change either the data
  structure used to build the state, or what we do with the state. It also
  simplifies changing logic related to the state.
- Similarly, the separation allows testing more individual units with reducers,
  action creators and selectors being somewhat simple functions that can be
  tested in isolation in XPCShell tests.

#### Potential Risks

- Redux state management can require a bunch of boilerplate code.
- Developers already working on our front-end code might not have encountered
  Redux yet and will have to learn about it.
- Redux tends to trade code readability and adaptability for more memory usage.
- Since we're using Redux with custom elements, there are no established
  interface solutions and we have to build our own.

### Alternatives

<!-- [Mention any alternative suggestions.] -->
Most popular JS state management frameworks were considered, including Vuex and
Zustand. However they enforced less about how state should be managed, thus
leaving developers more freedoms in how they used the solution, to some extent
defeating the goals of this change.

Another option would have been to build our own framework. However, using an
established framework means we can avoid a lot of common issues and further make
our code more accessible for new developers.

Historically, we've often stored state in the DOM in the form of attributes. We
already started to move away from that, since there's seldom a reason for the
information to be exposed to the DOM (since custom elements can have their own
fields in JS and often have a dedicated module scope) and if we want to expose
data so CSS can react to it we're typically using classes now.

In terms of implementation details, one of the alternatives considered was to
host the Redux store in the system scope, meaning it would be shared globally
across the application. The big downside of this approach is that a lot of
document specific state (like which email is being displayed, what's the
selected folder, etc.) would still have to be separated by document, meaning we'd
need some identifier in the state for the document for those parts of the state.
Since Redux is supposed to serve the front-end, most of the state is expected to
be specific to what's being displayed, and by consequence most of the state
would thus end up having to be document specific. The only benefit then of using
a central store would be to slightly reduce memory consumption, while requiring
additional overhead to manage the most common state.

### Security Considerations

<!-- [Mention any security considerations that were brought up in the
discussion.] -->
We are not anticipating any security implications by this change. Even if Redux
should create a security release, it is fairly unlikely for us to be affected,
since we're only using Redux within chrome code and we're currently only using
a very limited set of packages with Redux.

### Rollout Plan

New front-end projects should use the new state management solution by default,
which will also help solidify some of the details not set in stone yet. When
useful we should also consider introducing Redux to existing components and
documents.
