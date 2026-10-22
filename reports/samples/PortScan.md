# Port Scan Detected: 403 Flows
**Incident ID:** CS-20261022-PORTSCAN-403  |  **Generated:** 2026-10-22 22:54  |  **Severity:** Medium  |  **Attack type:** PortScan

## Summary
A reconnaissance port scan was detected involving 403 flows, representing 1.69% of the analyzed traffic. The detection confidence is 99.84% with a minimum confidence of 46.72%.

## Detection details
- Flows detected: **403** (1.69% of analysed traffic)
- Model confidence: mean **99.84%**, minimum 46.72%
- Flows needing analyst review (confidence below threshold): 1
- MITRE ATT&CK: T1046 Network Service Discovery
- Top destination ports: 1216 (5 flows), 8180 (3 flows), 31337 (3 flows)

## What happened
The system identified a rapid probing of multiple ports, with unusually high packets per second and extremely short flow durations, indicating a scanning activity.

## Key evidence
- 403 flows detected, 1.69% of analyzed traffic.
- Mean confidence 99.84%, minimum confidence 46.72%.
- Flow Duration median 49 microseconds vs 46290 microseconds (0.00106 times normal).
- Bwd Packets/s median 20408 packets per second vs 23.87 packets per second (855.0 times normal).
- Top destination ports: 1216 (5 flows), 8180 (3 flows), 31337 (3 flows).

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Flow Duration | microseconds | 49 | 46290 | 0.00106 |
| Bwd Packets/s | packets per second | 20408 | 23.87 | 855.0 |
| Flow IAT Max | microseconds | 49 | 32075 | 0.00153 |
| Flow Packets/s | packets per second | 40816 | 84.5 | 483.0 |
| Flow IAT Std | microseconds | 0 | 436 | 0.0 |
| Flow IAT Mean | microseconds | 49 | 16213 | 0.00302 |

## Potential impact
If the scanning source is malicious, it could lead to discovery of open services and potential exploitation.

## Recommended actions
1. Identify and monitor the source of the scanning activity.
2. Close or firewall any unnecessary open ports that were targeted.
3. Investigate for any follow‑up attacks originating from the same source.

## Analyst note
Verify the source of the scans (IP addresses are not available in the current data) and confirm that the identified ports are secured. This report is AI‑assisted and requires analyst verification due to one flow needing review.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*