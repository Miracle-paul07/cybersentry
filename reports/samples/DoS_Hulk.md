# DoS Hulk HTTP Flood Detected
**Incident ID:** CS-20261022-DOSHULK-405  |  **Generated:** 2026-10-22 22:53  |  **Severity:** High  |  **Attack type:** DoS Hulk

## Summary
A DoS Hulk attack was detected, flooding the web server with many unique HTTP requests. 405 flows were observed, confidence 99.33%, showing extreme idle times and inter-arrival time variations.

## Detection details
- Flows detected: **405** (1.7% of analysed traffic)
- Model confidence: mean **99.33%**, minimum 44.14%
- Flows needing analyst review (confidence below threshold): 3
- MITRE ATT&CK: T1499.002 Service Exhaustion Flood
- Top destination ports: 80 (403 flows), 22 (2 flows)

## What happened
The system observed unusually high idle times (85800000 microseconds) and large forward inter-arrival time standard deviations (37300000 microseconds), indicating a flood of requests. Forward IAT mean was 14300000 microseconds, 3580000.0 times higher than normal, and flow IAT standard deviation was 26000000 microseconds, 59600.0 times higher than normal.

## Key evidence
- Idle Min 85800000 microseconds
- Fwd IAT Std 37300000 microseconds
- Fwd IAT Mean 14300000 microseconds (3580000.0× normal)
- Flow IAT Std 26000000 microseconds (59600.0× normal)
- Bwd IAT Total 147451 microseconds (49200.0× normal)

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Idle Min | microseconds | 85800000 | 0 | n/a |
| Fwd IAT Std | microseconds | 37300000 | 0 | n/a |
| Fwd IAT Mean | microseconds | 14300000 | 4 | 3580000.0 |
| Bwd IAT Std | microseconds | 59740 | 0 | n/a |
| Flow IAT Std | microseconds | 26000000 | 436 | 59600.0 |
| Bwd IAT Total | microseconds | 147451 | 3 | 49200.0 |

## Potential impact
The flood can exhaust server resources, causing legitimate traffic to be dropped or delayed.

## Recommended actions
1. Rate-limit HTTP requests per source
2. Enable WAF rules for HTTP floods
3. Monitor web server load

## Analyst note
Verify the 3 flows that require analyst review to confirm the attack. This report is AI-assisted and may need human validation.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*