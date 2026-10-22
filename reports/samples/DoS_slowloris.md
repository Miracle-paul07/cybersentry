# DoS Slowloris Attack Detected
**Incident ID:** CS-20261022-DOSSLOWLOR-393  |  **Generated:** 2026-10-22 22:55  |  **Severity:** High  |  **Attack type:** DoS slowloris

## Summary
A DoS slowloris attack was identified, holding web server connections open by sending partial requests very slowly. The attack involved 393 flows, representing 1.65% of analyzed traffic, with a mean confidence of 99.22%.

## Detection details
- Flows detected: **393** (1.65% of analysed traffic)
- Model confidence: mean **99.22%**, minimum 60.97%
- Flows needing analyst review (confidence below threshold): 2
- MITRE ATT&CK: T1499.002 Service Exhaustion Flood
- Top destination ports: 80 (393 flows)

## What happened
The attack is characterized by extremely long inter-arrival times in the backward direction, with the median Bwd IAT Total at 100000000 microseconds, 33300000.0 times longer than normal. Similar patterns are seen in Bwd IAT Max, Mean, and Min, all several million times longer than normal, indicating a low‑and‑slow strategy to exhaust server resources.

## Key evidence
- Bwd IAT Total median 100000000 microseconds, 33300000.0 times normal.
- Bwd IAT Max median 71100000 microseconds, 23700000.0 times normal.
- Bwd IAT Mean median 51300000 microseconds, 17100000.0 times normal.
- Bwd IAT Min median 31400000 microseconds, 15700000.0 times normal.
- Fwd IAT Mean median 7048912 microseconds, 1760000.0 times normal.

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Bwd IAT Total | microseconds | 100000000 | 3 | 33300000.0 |
| Bwd IAT Max | microseconds | 71100000 | 3 | 23700000.0 |
| Bwd IAT Mean | microseconds | 51300000 | 3 | 17100000.0 |
| Bwd IAT Min | microseconds | 31400000 | 2 | 15700000.0 |
| Idle Min | microseconds | 5773251 | 0 | n/a |
| Fwd IAT Mean | microseconds | 7048912 | 4 | 1760000.0 |

## Potential impact
The prolonged connection times can exhaust web server resources, leading to denial of service for legitimate users.

## Recommended actions
1. Reduce connection and header timeouts.
2. Limit connections per IP.
3. Put the server behind a reverse proxy.

## Analyst note
Verify the 2 flows that require analyst review and confirm the attack characteristics. This report is AI‑assisted; cross‑check with additional logs if needed.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*