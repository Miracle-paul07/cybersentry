# Critical DDoS Attack on Port 80
**Incident ID:** CS-20261022-DDOS-400  |  **Generated:** 2026-10-22 22:54  |  **Severity:** Critical  |  **Attack type:** DDoS

## Summary
A distributed denial of service attack was detected with 400 flows, representing 1.68% of the analyzed traffic, and the system assigned a confidence of 100%. The attack shows extreme inter‑arrival time and packet length variance on port 80.

## Detection details
- Flows detected: **400** (1.68% of analysed traffic)
- Model confidence: mean **100.0%**, minimum 99.18%
- Flows needing analyst review (confidence below threshold): 0
- MITRE ATT&CK: T1498 Network Denial of Service
- Top destination ports: 80 (400 flows)

## What happened
Multiple external hosts flooded the target’s port 80 with traffic, creating unusually high forward and backward inter‑arrival time variability and a massive packet length variance, which is typical of a bandwidth‑exhaustion DDoS attack.

## Key evidence
- Fwd IAT Std median 1083023 microseconds, normal median 0 microseconds, times_normal not available
- Fwd IAT Mean median 551785 microseconds, normal median 4 microseconds, 138000.0 times normal
- Bwd IAT Std median 19371 microseconds, normal median 0 microseconds, times_normal not available
- Bwd IAT Total median 46128 microseconds, normal median 3 microseconds, 15400.0 times normal
- Packet Length Variance median 3203976 bytes, normal median 941 bytes, 3410.0 times normal

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Fwd IAT Std | microseconds | 1083023 | 0 | n/a |
| Fwd IAT Mean | microseconds | 551785 | 4 | 138000.0 |
| Bwd IAT Std | microseconds | 19371 | 0 | n/a |
| Bwd IAT Total | microseconds | 46128 | 3 | 15400.0 |
| Bwd IAT Max | microseconds | 41836 | 3 | 13900.0 |
| Packet Length Variance | bytes | 3203976 | 941 | 3410.0 |

## Potential impact
The high volume of traffic on port 80 could exhaust network bandwidth and disrupt service availability, posing a critical risk to the target system.

## Recommended actions
1. Enable upstream rate limiting / DDoS protection
2. Block or rate‑limit the top source addresses
3. Check service availability and scale or fail over if needed

## Analyst note
Verify source/destination IP addresses, timestamps, packet payloads, and usernames if needed. The detection confidence is 100% and no flows require analyst review, but confirm that rate limiting and fail‑over measures are active. This report is AI‑assisted and should be cross‑checked with additional logs.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*