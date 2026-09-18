# Jira is the record of logged time

ergon writes time two ways. `ergon start` and `ergon stop` drive Clockwork's
timer; `ergon log` posts a worklog to Jira's REST API. It reads time one way:
Clockwork's `GET /v1/worklogs`. So the reader is blind to one of the writers,
and `ergon status`'s daily total silently omits every hour logged with
`ergon
log`.

Reading a day from Jira instead makes the reader downstream of every writer.
Clockwork is a Jira app and its timers land as Jira worklogs, so Jira sees both
of ergon's write paths — and also the one ergon does not own, time typed
straight into the Jira UI, which ergon has never been able to see at all.

The alternative was to unify on Clockwork by routing `ergon log` through it.
That fixes the discrepancy between ergon's own two paths and leaves the third
unfixed, and it rests on Clockwork exposing a worklog-create endpoint that
ergon's client does not currently use. Reading both sources and reconciling them
was also considered; if Jira is a superset, the reconciliation rule is machinery
that exists only to be got wrong.

The decision was forced by what the total is about to be used for rather than by
the cosmetic error. A wrong number on `ergon status` is a wrong number. The same
number feeding the `wrapup` skill, which proposes worklogs for the hours a day
does not yet cover, turns every hour logged through `ergon log` into an hour
that looks uncovered — and the proposal is to log it a second time. The failure
runs in the direction of over-reporting client time, which is the worst
direction available.

Jira's worklog API is per-issue, so a day costs a JQL search for the issues with
worklogs by this author on this date, then one worklog fetch per issue found. A
normal day is a handful of calls where there was one. That cost falls on
`ergon status` and `ergon worklogs`, neither of which is on a hot path.

## Consequences

Writing stays where it is. Clockwork's timer remains the way a running timer is
started and stopped, and `ergon log` keeps posting to Jira. This decision is
about where a day is _read_ from, not where it is written to.

`ergon status` makes several requests where it made one, and stops reporting a
figure that was quietly partial.

Time logged in the Jira UI now appears in ergon's totals for the first time.
Reconstructing a day may therefore show entries ergon did not create, which is
correct and was previously impossible.

Clockwork remains the source for the running timer itself, which Jira does not
model — a timer is not a Worklog until it stops.
