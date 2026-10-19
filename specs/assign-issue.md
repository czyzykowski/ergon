# Assign an Issue

## Problem Statement

ergon reads an issue's Assignee — `ergon get` prints it, `ergon ls` lists only
the operator's issues — and has no way to write one. Both projects ergon serves
create issues unassigned, so every issue `ergon new` makes starts with nobody,
and taking it on means opening Jira.

That happens constantly. Of the operator's 40 most recent issues, created over
16–19 October 2026, about half were assigned by hand within half an hour of
`ergon new` creating them, almost all to the operator. The jira skill creates an
issue for the work it is about to do and leaves it unassigned, because nothing
it could run would do otherwise.

## Solution

```
ergon new  … --assignee <me|none>
ergon edit <KEY> --assignee <me|none>
```

`me` assigns the issue to the operator — the account ergon's credentials belong
to. `none` leaves it, or makes it, unassigned. Both are matched
case-insensitively, and anything else is refused before the first prompt or Jira
call: `--assignee takes 'me' or 'none'.`

## User Stories

1. As an agent creating an issue for work it is about to start, I want to create
   it assigned to the operator, so that it shows up in `ergon ls` and on the
   board as taken.
2. As an agent picking up an existing unassigned issue, I want to assign it to
   the operator without opening `$EDITOR`.
3. As an operator planning work, I want `ergon new` without `--assignee` to
   leave the issue as Jira's project default would, so that a planning batch is
   not handed to me.
4. As an operator, I want `--assignee none` to unassign an issue I am no longer
   working on.

## Implementation Decisions

- **`me` and `none` only.** Naming another person needs a user search and a
  refusal for an ambiguous name (`matt` matches two people), and is left for
  later. The flag takes a value rather than being a switch so that a name can
  join `me` and `none` without breaking a call.
- **Omitting `--assignee` on `ergon new` sends nothing**, so Jira's project
  default applies — unassigned on PCK and PGR. The Assignee is never Inherited
  from the Parent, never prompted for, and has no configured or remembered
  default: the operator's history splits about evenly between issues taken on at
  once and issues planned for later, so any default would be wrong half the
  time.
- **`--assignee none` on `ergon new` sends `null`**, making the issue unassigned
  even on a project whose default would assign someone.
- **`me` is resolved through `/rest/api/3/myself`** at the moment of the write,
  one extra request, never cached.
- **One request.** The Assignee travels in the create and edit payloads with
  every other field; it is on both screens for every issue type on PCK and PGR,
  so an issue is never created and then left unassigned by a second call
  failing.
- **`ergon edit --assignee` is a field write** like `--due` and `--sprint`: it
  does not open the editor or fetch the Description, and it is written after the
  other fields in the receipt — `Updated PCK-12 (due, assignee)`.
- **No guard on taking an issue from someone else.** Jira keeps every change of
  Assignee in the issue's history and notifies the person displaced, so nothing
  is lost that cannot be read back; a Replacement is guarded because Jira cannot
  restore it, and this is not one.

## Testing Decisions

- `parseAssignee` and `assigneeField` in `tests/assignee_test.ts`: both words in
  any case, a name refused, `none` resolving to `null` without asking Jira for
  the account.
- `createIssue` in the same file, against a stubbed `fetch`: the payload carries
  the account, carries `null`, or carries no `assignee` at all.
- `planEdit` in `tests/edit_fields_test.ts`: `--assignee` alone neither opens
  the editor nor fetches the Description, comes last in the receipt's order, and
  refuses a name.

## Out of Scope

- **Assigning someone other than the operator.** See the first decision.
- **Assigning on `ergon start` or `ergon move`.** A command that takes up an
  issue — assigns it, moves it to In Progress and starts the timer — is a
  follow-up with its own verb, since `start` already means the timer.
- **An `--assignee` filter on `ergon ls`.**
- **A receipt naming the displaced Assignee.**

## Outcome

Shipped as specified. `ergon edit PGR-1975 --assignee me` and `--assignee none`
were checked live, with `ergon get` showing each change. `ergon new --assignee`
was not run live, since that creates an issue; its payload is covered by the
`createIssue` tests, and Jira accepting `assignee: null` on create is the one
part not seen working.
