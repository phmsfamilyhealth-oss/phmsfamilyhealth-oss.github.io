# Appointment release acceptance — authorized synthetic accounts only

Status: NOT EXECUTED. No real-device evidence has been supplied. Do not enable general rollout.

Operator prerequisite: identify the authorized LINE account and its PHMS actor UUID; prepare two synthetic people and two synthetic medications in an isolated test environment. Never select a patient. An empty allowlist is not an approved test account. Keep production paid sends disabled for general users.

Record for every case: timestamp/timezone, LINE OS/version, selected synthetic person, appointment UUID, expected vs actual result, screenshots before/after, and corresponding database/log readback. Do not publish LINE UIDs, tokens or signed file URLs.

| Case | Human action on LINE | Expected result |
|---|---|---|
| 1 | Open appointments for synthetic A; create a doctor visit using the calendar; go back once; review; press Confirm twice | Values survive Back; one appointment only; success opens actual saved record; no clipped text/buttons |
| 2 | Repeat for follow-up, referral with no source, preventive/vaccine, and Walk-in | No unwanted doctor/source requirement; planned, confirmed and historical states remain distinct |
| 3 | Create diagnostic with VF 24-2 and OCT RNFL; remove/re-add one item | Exactly two saved procedures; no invented fasting or medication-stop instruction |
| 4 | Save draft for A; leave/reopen; switch to B before confirmation | Draft survives; A's medication/document/source data cannot be committed to B |
| 5 | Refill two medicines with expected quantities; confirm; record full, partial and zero receipt on separate synthetic items; repeat confirmation | Planning adds no stock; actual receipt alone creates ledger/container/expense; partial quantity is actual; zero adds no stock; repeat adds nothing |
| 6 | Attach synthetic JPG and PDF; open; attempt from unauthorized B; reschedule then cancel | Authorized bytes open correctly; unauthorized read/link denied; files remain attached to correct owner |
| 7 | Schedule reminder to authorized test account only; retry dispatch; reschedule/cancel | One delivery per event; old job cancelled/replaced; no delivery after cancellation; no general-user recipients |

After all cases pass: attach evidence, verify native DB/Storage/security/CI gates, approve the exact release commit, then enable the public gate using a transaction and verify readback/error logs. Any failed case blocks general rollout.
