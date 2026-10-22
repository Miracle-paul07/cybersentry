# Heartbleed Exploit Detected on Server
**Incident ID:** CS-20261022-HEARTBLEED-1  |  **Generated:** 2026-10-22 22:57  |  **Severity:** Critical  |  **Attack type:** Heartbleed

## Summary
A Heartbleed vulnerability (CVE-2014-0160) was exploited, leaking server memory. The attack was detected by anomalous IAT metrics with high confidence.

## Detection details
- Flows detected: **1** (0.0% of analysed traffic)
- Model confidence: mean **100.0%**, minimum 100.0%
- Flows needing analyst review (confidence below threshold): 0
- MITRE ATT&CK: T1190 Exploit Public-Facing Application
- Top destination ports: 444 (1 flows)

## What happened
An attacker sent a malformed heartbeat request that caused the server to return memory contents. The ML model flagged unusually high backward inter-arrival times, with the median Bwd IAT Total 119000000 microseconds, 39700000.0 times the normal median of 3 microseconds.

## Key evidence
- Bwd IAT Total: 119000000 microseconds (attack median) vs 3 microseconds (normal median) – 39700000.0 times higher than normal
- Bwd IAT Max: 995262 microseconds vs 3 microseconds – 332000.0 times higher than normal
- Bwd IAT Mean: 57669 microseconds vs 3 microseconds – 19200.0 times higher than normal
- Fwd IAT Mean: 42592 microseconds vs 4 microseconds – 10600.0 times higher than normal
- Bwd IAT Std: 231139 microseconds vs 0 microseconds – times_normal null

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Bwd IAT Total | microseconds | 119000000 | 3 | 39700000.0 |
| Bwd IAT Max | microseconds | 995262 | 3 | 332000.0 |
| Bwd IAT Std | microseconds | 231139 | 0 | n/a |
| Fwd IAT Std | microseconds | 200438 | 0 | n/a |
| Bwd IAT Mean | microseconds | 57669 | 3 | 19200.0 |
| Fwd IAT Mean | microseconds | 42592 | 4 | 10600.0 |

## Potential impact
The Heartbleed exploit can leak server memory, potentially exposing cryptographic keys and passwords.

## Recommended actions
1. Patch OpenSSL on the affected server
2. Revoke and reissue TLS certificates and keys
3. Reset credentials that may have been exposed

## Analyst note
Verify that the affected server has been patched and that certificates have been reissued; this report is AI-assisted.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*