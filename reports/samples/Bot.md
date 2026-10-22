# Bot activity detected
**Incident ID:** CS-20261022-BOT-274  |  **Generated:** 2026-10-22 22:56  |  **Severity:** High  |  **Attack type:** Bot

## Summary
CyberSentry detected 274 flows classified as Bot. Severity is rated High.

## Detection details
- Flows detected: **274** (1.15% of analysed traffic)
- Model confidence: mean **89.84%**, minimum 50.3%
- Flows needing analyst review (confidence below threshold): 45
- MITRE ATT&CK: T1071 Application Layer Protocol (Command and Control)
- Top destination ports: 8080 (177 flows), 3844 (1 flows), 53935 (1 flows)

## What happened
Traffic from a compromised machine communicating with a botnet controller (command and control).

## Key evidence
- 274 flows classified as Bot (1.15% of analysed traffic)
- Mean model confidence 89.84% (minimum 50.3%)
- Bwd IAT Total: median 70514 vs 3 microseconds in normal traffic
- Bwd IAT Max: median 69770 vs 3 microseconds in normal traffic
- Bwd IAT Mean: median 35030 vs 3 microseconds in normal traffic

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Bwd IAT Total | microseconds | 70514 | 3 | 23500.0 |
| Bwd IAT Max | microseconds | 69770 | 3 | 23300.0 |
| Bwd IAT Mean | microseconds | 35030 | 3 | 11700.0 |
| Fwd IAT Mean | microseconds | 23872 | 4 | 5970.0 |
| Bwd IAT Std | microseconds | 1908 | 0 | n/a |
| Fwd IAT Std | microseconds | 1745 | 0 | n/a |

## Potential impact
See attack description; impact depends on the targeted service.

## Recommended actions
1. Isolate the suspected infected host
2. Block the controller address/domain
3. Run malware analysis on the host

## Analyst note
45 flows have low confidence and need manual review. Template report (LLM unavailable); verify against raw logs.

---
*Narrative source: template (no LLM). Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*