# SSH Brute Force Attack Detected
**Incident ID:** CS-20261022-SSH-PATATO-394  |  **Generated:** 2026-10-22 22:54  |  **Severity:** High  |  **Attack type:** SSH-Patator

## Summary
Automated password‑guessing attempts targeted SSH port 22, generating 394 suspicious flows. The attack shows extreme deviations in inter‑arrival times, indicating rapid repeated login attempts.

## Detection details
- Flows detected: **394** (1.65% of analysed traffic)
- Model confidence: mean **99.41%**, minimum 43.5%
- Flows needing analyst review (confidence below threshold): 2
- MITRE ATT&CK: T1110.001 Brute Force: Password Guessing
- Top destination ports: 22 (393 flows), 21 (1 flows)

## What happened
A botnet used the SSH‑Patator tool to brute‑force passwords against SSH, sending many short bursts of traffic that caused unusually high forward and backward inter‑arrival times.

## Key evidence
- Bwd IAT Total median 11950000 microseconds, 3980000.0 times higher than normal
- Fwd IAT Std median 878374 microseconds, normal median 0 microseconds
- Bwd IAT Std median 771698 microseconds, normal median 0 microseconds
- Bwd IAT Max median 2319018 microseconds, 773000.0 times higher than normal
- Fwd IAT Mean median 498020 microseconds, 125000.0 times higher than normal
- Bwd IAT Mean median 386639 microseconds, 129000.0 times higher than normal
- 394 flows detected, 393 targeting port 22 and 1 targeting port 21

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Bwd IAT Total | microseconds | 11950000 | 3 | 3980000.0 |
| Fwd IAT Std | microseconds | 878374 | 0 | n/a |
| Bwd IAT Std | microseconds | 771698 | 0 | n/a |
| Bwd IAT Max | microseconds | 2319018 | 3 | 773000.0 |
| Fwd IAT Mean | microseconds | 498020 | 4 | 125000.0 |
| Bwd IAT Mean | microseconds | 386639 | 3 | 129000.0 |

## Potential impact
Repeated password attempts may lead to credential compromise or account lockout.

## Recommended actions
1. Block the source (e.g. fail2ban)
2. Check auth logs for any successful login
3. Use key‑based authentication and disable password login

## Analyst note
Two flows require analyst review; source/destination IP addresses, timestamps, packet payloads, and usernames are not available in this report. Verify the findings and note that this is AI‑assisted.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*