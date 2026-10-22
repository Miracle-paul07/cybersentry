# DoS Slowhttptest Attack on Web Server
**Incident ID:** CS-20261022-DOSSLOWHTT-402  |  **Generated:** 2026-10-22 22:54  |  **Severity:** High  |  **Attack type:** DoS Slowhttptest

## Summary
A DoS Slowhttptest attack was detected, targeting port 80 with 402 flows. The attack used extremely slow inter-arrival times, exhausting server connections.

## Detection details
- Flows detected: **402** (1.69% of analysed traffic)
- Model confidence: mean **98.88%**, minimum 58.02%
- Flows needing analyst review (confidence below threshold): 3
- MITRE ATT&CK: T1499.002 Service Exhaustion Flood
- Top destination ports: 80 (402 flows)

## What happened
The attacker sent HTTP requests with very long inter-arrival times, causing the server to keep connections open and eventually exhaust available sockets. The median forward IAT standard deviation was 11900000 microseconds, and the forward IAT mean was 10500000 microseconds, far exceeding normal values.

## Key evidence
- 402 flows detected on port 80
- Fwd IAT Std median 11900000 microseconds
- Fwd IAT Mean median 10500000 microseconds, 2620000.0 times normal
- Idle Min median 8015916 microseconds
- Active Min median 6709950 microseconds

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Fwd IAT Std | microseconds | 11900000 | 0 | n/a |
| Idle Min | microseconds | 8015916 | 0 | n/a |
| Active Min | microseconds | 6709950 | 0 | n/a |
| Fwd IAT Mean | microseconds | 10500000 | 4 | 2620000.0 |
| Fwd IAT Min | microseconds | 996674 | 3 | 332000.0 |
| Flow IAT Min | microseconds | 996370 | 4 | 249000.0 |

## Potential impact
The attack likely saturated the web server’s connection pool, leading to denial of service for legitimate users.

## Recommended actions
1. Reduce request body and header timeouts
2. Limit connections per IP
3. Put the server behind a reverse proxy
4. Verify that timeout settings reject slow requests

## Analyst note
Verification is needed because 3 flows require analyst review and the minimum confidence is 58.02%. Times_normal is not available for several features, and source/destination IP addresses and timestamps are not provided in the evidence. This report is AI-assisted; please confirm the findings with additional logs.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*