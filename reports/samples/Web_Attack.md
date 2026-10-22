# High-Severity Web Attack Detected
**Incident ID:** CS-20261022-WEBATTACK-313  |  **Generated:** 2026-10-22 22:56  |  **Severity:** High  |  **Attack type:** Web Attack

## Summary
A high‑severity web attack was detected involving 313 flows, primarily targeting port 80. The attack shows extreme deviations in inter‑arrival time statistics and unusually low data transfer rates.

## Detection details
- Flows detected: **313** (1.31% of analysed traffic)
- Model confidence: mean **99.07%**, minimum 82.3%
- Flows needing analyst review (confidence below threshold): 0
- MITRE ATT&CK: T1190 Exploit Public-Facing Application, T1110 Brute Force
- Top destination ports: 80 (313 flows)

## What happened
The system identified 313 flows with unusually high forward inter‑arrival time standard deviations (3813354 microseconds vs 0 microseconds) and forward inter‑arrival time means (2697336 microseconds vs 4 microseconds, 674000.0 times higher). Additionally, the flow inter‑arrival time standard deviation was 3113847 microseconds compared to 436 microseconds, 7140.0 times higher. Conversely, flow bytes per second and packet length variance were 0 versus 4147 bytes per second and 941 bytes, respectively, indicating much lower activity than normal.

## Key evidence
- Fwd IAT Std: 3813354 microseconds (attack) vs 0 microseconds (normal)
- Fwd IAT Mean: 2697336 microseconds (attack) vs 4 microseconds (normal), 674000.0 times higher
- Flow IAT Std: 3113847 microseconds (attack) vs 436 microseconds (normal), 7140.0 times higher
- Flow Bytes/s: 0 bytes per second (attack) vs 4147 bytes per second (normal), 0.0 times lower
- Packet Length Variance: 0 bytes (attack) vs 941 bytes (normal), 0.0 times lower

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Fwd IAT Std | microseconds | 3813354 | 0 | n/a |
| Fwd IAT Mean | microseconds | 2697336 | 4 | 674000.0 |
| Init_Win_bytes_backward | bytes (TCP window size; -1 = not available) | 28960 | -1 | n/a |
| Flow IAT Std | microseconds | 3113847 | 436 | 7140.0 |
| Flow Bytes/s | bytes per second | 0 | 4147 | 0.0 |
| Packet Length Variance | bytes | 0 | 941 | 0.0 |

## Potential impact
The attack could allow attackers to perform brute‑force login attempts or inject malicious code, potentially compromising application integrity and user data.

## Recommended actions
1. Review web server and application logs for the affected endpoints
2. Enable WAF rules for XSS / SQL injection
3. Validate and sanitise all user input

## Analyst note
The model confidence is 99.07%, well above the 90% threshold, and no flows require analyst review. Verify that the traffic patterns are not legitimate and confirm the absence of source/destination IP addresses, timestamps, packet payloads, and usernames. This report is AI‑assisted and should be cross‑checked with additional logs.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: numbers not found in evidence: 90 - verify these. CyberSentry assists analysts; it does not replace them.*