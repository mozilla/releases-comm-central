# ADR Process

The `/docs/adr` folder contains the
architecture decision records (ADRs) for our project.

ADRs are short text documents that serve as a historical context for the
architecture decisions we make over the course of the project.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important
architectural decision made along with its context and consequences. ADRs record
the decision making process and allow others to understand the rationale behind
decisions, providing insight and facilitating future decision-making processes.

## Decision Process

When some architectural decision is needed, there should be some discussion and
decision made that the ADR then reflects. The complexity of the issue will
influence where that discussion is had. For example, more complex issues might
be discussed on a broad mailing list whereas smaller decisions might have been
discussed on the relevant bug or Phabricator patch.

The decision should be reached from the discussion and then that decision is
reflected in its corresponding ADR patch.

### Who should support the decision?

Here are the guidelines for decision making:
1. There should be a rough consensus of the people closest to the topic that support the decision.
2. The relevant [module owner](/mots/index) should be included in the decision supporters.

## Format of an ADR

We adhere to Michael Nygard's [ADR format
proposal](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions),
where each ADR document should contain:

1. **Title**: A short descriptive name for the decision.
2. **Links**: Relevant link(s) to Bugzilla et al.
3. **Status**: The current status of the decision (accepted, deprecated,
superseded).
4. **Context**: The context that motivates this decision.
5. **Decision**: The change that we're proposing and/or doing.
6. **Consequences**: What becomes easier or more difficult to do and any risks
introduced as a result of the decision.

## Creating a new ADR

When creating a new ADR, please follow the provided [ADR template
file](/adr/records/0000-adr-template) and ensure that your document is clear and concise.

## Directory Structure

The ADRs will be stored in a directory named `docs/adr`, and each ADR will be a
file named `NNNN-title-with-dashes.md` where `NNNN` is a four-digit number that
is increased by 1 for every new ADR.

When the ADR is written about a given decision, use next available `NNNN` value
in the name of the ADR. If there happens to be another simultaneous patch that
commits the same ADR number, the first one committed with retain the number and
subsequently accepted ADR numbers will be incremented accordingly.

## ADR Life Cycle

The life cycle of an ADR is as follows:

1. **Proposal**: Someone proposes an architectural change. This will most
commonly be on a relevant mailing list. Then discussion is opened and the
proposal changes as points are made that shape the best architectural decision
to be made.
2. **Accepted**: The decision described in the ADR has either been
accepted and should be adhered to.
3. **Deprecated**: The decision described in the ADR is no longer relevant due
to changes in system context.
4. **Superseded**: The decision described in the ADR has been replaced by
another decision. Link to the new ADR doc that supersedes the existing one.

Each ADR will have a status indicating its current life-cycle stage. An ADR can
be updated over time, either to change the status or to add more information.

## Contributions

We welcome contributions in the form of new ADRs or updates to existing ones.
Please ensure all contributions follow the standard format and provide clear and
concise information.
