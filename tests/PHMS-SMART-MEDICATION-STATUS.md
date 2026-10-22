# PHMS v2.3 medication intake candidate — NOT RELEASE READY

Production baseline read on 2026-10-22: `line-webhook` v1335 ACTIVE, SHA-256 `5e8c644ab3526874f2c9910f71dbe34f990f38d67969c8a62eba08ee1b8f6768` (Supabase bundle identifier).
No production deployment or database schema changes were made by this patch.

## Implemented candidate

- Separate explanatory Flex card and copyable LINE Text Message; an explicit exemption prevents the global Flex-first renderer from converting the template back into a bubble.
- Shared normalized medication draft schema for structured text and field entry, including generic/brand, numeric strength/unit, form, dose/unit, frequency, weekdays, times, food relation, instructions, warnings, start date, notes and eye side.
- Standard choices plus typed values, editable draft review, missing/ambiguous field validation, example guard, explicit confirmation and existing PHMS authorization/intake/canonical gates.
- Reply-based review avoids dependence on chargeable Push, whose configured test window has expired.
- Person context binding and authorized candidate readback before confirmation. No new tables, RPCs or registries.
- Existing global presentation pipeline continues to apply category design tokens, navigation, action budgets and payload formatting.

## Verification performed

`node --test tests/smart-medication.test.mjs`: 19 passed, 0 failed.

Includes Gabapentin 100 mg capsule/bedtime, Vitamin D2 weekly/IU/weekday, ophthalmic drops/eye side, incomplete values, invalid numeric units/dates/times, conflicting duplicate fields, identical normalization for both modes, example replay, mocked draft/review/explicit commit, denied authorization, changed person, blocked commit, expired buttons, and actual full runtime presentation pipeline preserving copyable text and action postbacks.

Full runtime and imported modules parsed/transformed with Node 24 TypeScript support. This is syntax verification, not a Deno type-check or Supabase compilation result.

Production read-only authorization negative check: an unknown synthetic identity is rejected by `phms_resolve_line_command_context` with `line_identity_not_found` before any intake is created.

## Release blockers and remaining work

1. The inspected `private.phms_commit_medication_candidate` persists `medication_regimens`, but not weekday schedules. Weekly input is normalized/reviewed and explicitly blocked from canonical activation in this candidate. Complete the existing canonical order/schedule integration and verify schedule readback before releasing. Do not encode weekly schedules as daily orders or silently bury weekdays in a note.
2. Production `allow_test_data=false`, `allow_destructive_changes=false`; 128 existing medication UI UAT cases are `NOT_RUN`. No test patient records were inserted and no gate flags were changed.
3. No live LINE reply token or verified test conversation was available. No message was sent to any real user. LINE API payload validation and real end-to-end delivery remain unverified.
4. Deno/Supabase compilation, full regression, database positive authorization/readback, production deployment/readback and real LINE UAT remain outstanding.
5. Confirmed-but-uncommitted sessions can be retried through existing gates. The current database finalizer disallows cancellation of confirmed sessions; editing after a blocked commit needs an explicit supported transition before release.
6. Existing production advisers include security/performance findings; those pre-existing findings were inspected but not modified in this scoped patch.

Do not describe this candidate as COMPLETE, deployed, or ready for production use. All successful canonical commit tests in the automated suite are mocks, not clinical database writes.
