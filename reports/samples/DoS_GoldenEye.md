# DoS GoldenEye Attack Detected
**Incident ID:** CS-20261022-DOSGOLDENE-409  |  **Generated:** 2026-10-22 22:53  |  **Severity:** High  |  **Attack type:** DoS GoldenEye

## Summary
A DoS GoldenEye attack was detected, targeting HTTP port 80 with 409 flows. The attack shows unusually high idle and inter‑arrival times, indicating a service exhaustion flood.

## Detection details
- Flows detected: **409** (1.72% of analysed traffic)
- Model confidence: mean **99.26%**, minimum 34.9%
- Flows needing analyst review (confidence below threshold): 6
- MITRE ATT&CK: T1499.002 Service Exhaustion Flood
- Top destination ports: 80 (409 flows)

## What happened
The attacker opened many connections to port 80, keeping them idle for long periods and sending packets with irregular timing, exhausting server resources.

## Key evidence
- Idle Min: attack median 6577724 microseconds, normal median 0 microseconds.
- Bwd IAT Std: attack median 2888087 microseconds, normal median 0 microseconds.
- Bwd IAT Total: attack median 10400000 microseconds, normal median 3 microseconds, times_normal 3470000.0 microseconds.
- Bwd IAT Max: attack median 5382853 microseconds, normal median 3 microseconds, times_normal 1790000.0 microseconds.
- Bwd IAT Mean: attack median 2143309 microseconds, normal median 3 microseconds, times_normal 714000.0 microseconds.

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Idle Min | microseconds | 6577724 | 0 | n/a |
| Bwd IAT Std | microseconds | 2888087 | 0 | n/a |
| Bwd IAT Total | microseconds | 10400000 | 3 | 3470000.0 |
| Fwd IAT Std | microseconds | 1955881 | 0 | n/a |
| Bwd IAT Max | microseconds | 5382853 | 3 | 1790000.0 |
| Bwd IAT Mean | microseconds | 2143309 | 3 | 714000.0 |

## Potential impact
The attack can overwhelm the web server, causing legitimate traffic to be dropped and potentially leading to service outages.

## Recommended actions
1. Limit concurrent connections per source.
2. Enable WAF or reverse‑proxy protection.
3. Monitor web server load.

## Analyst note
The detection confidence is 99.26%, but 6 flows require analyst review. Verify the flow details and confirm that the traffic is indeed malicious. This report is AI‑assisted and may require manual review.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*