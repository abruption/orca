# Terminal mailbox subscriptions

A running agent in an Orca terminal can opt into mailbox pointers without joining a
Run or Dispatch:

```sh
orca orchestration subscribe --json
orca orchestration subscription status --json
orca orchestration unsubscribe --json
```

Run these commands inside the receiving agent's Orca-launched environment. The
runtime verifies the existing launch proof, exact pane, process incarnation and
host authority. A terminal handle alone is not authorization. There is no target
selector and no automatic registration. A subscribed receiver gets a pointer for
existing undelivered mail as well as later arrivals; the original message body
stays in the inbox.

Registration is ephemeral and belongs to the execution runtime. Repeating
`subscribe` for the same live identity is idempotent. Runtime restart, process
replacement, PTY exit, handle remint or invalid host authority requires explicit
registration again. A new client against a host without
`orchestration.terminal-subscription.v1` reports `unsupported` without attempting
registration. Existing Run/Dispatch mail keeps its original delivery path.

The runtime rechecks the recipient before writing a pointer and before submitting
Enter. Working agents, unsettled prompts and permission waits do not receive an
automatic submit. Cursor retains the existing manual-submit behavior. A sender
cannot override these checks. Only the existing runtime PTY writer performs the
write; no provider socket, native queue or `session-peer` installation is required.

`subscription status` describes the latest notification attempt, not message
processing. `submitted` means the Enter write was accepted; `deferred` means the
notification is waiting (including Cursor manual submit); `unverifiable` means a
write may have reached the PTY and must not be retried automatically. `unsupported`
also describes a missing registration. `messageIds` identifies the attempted
batch. The existing send receipt, unread/read flags and acknowledgement semantics
are unchanged. Inbox inspection does not acknowledge a message.

After an ambiguous write, inspect the inbox explicitly. The same execution
incarnation must not replay the pointer or Enter. A replacement process needs a
new registration and the old reservation is reconciled by the existing recovery
path. No message body is replayed, and no old handle is rebound to a new recipient.

This first version supports bare terminal recipients that the runtime can resolve
through its existing live-leaf delivery path. It does not add background PTY
resolution, restart slept panes, introduce a Codex app-server controller, or migrate
mail between handles. Related work: Orca issues/PRs #18206, #8057, #12033, #18731,
and #18208.
