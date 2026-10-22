# FTP Brute Force Attack Detected
**Incident ID:** CS-20261022-FTP-PATATO-405  |  **Generated:** 2026-10-22 22:53  |  **Severity:** High  |  **Attack type:** FTP-Patator

## Summary
An automated password-guessing attack targeted FTP services, generating 405 suspicious flows. The attack shows unusually high inter-arrival times, indicating a brute-force pattern.

## Detection details
- Flows detected: **405** (1.7% of analysed traffic)
- Model confidence: mean **99.84%**, minimum 61.51%
- Flows needing analyst review (confidence below threshold): 1
- MITRE ATT&CK: T1110.001 Brute Force: Password Guessing
- Top destination ports: 21 (399 flows), 22 (6 flows)

## What happened
The attacker repeatedly attempted FTP logins, causing a spike in backward packet inter-arrival times. The median backward IAT total reached 8673890 microseconds, 2890000.0 times the normal median of 3 microseconds, while forward IAT mean was 715116 microseconds, 179000.0 times the normal median of 4 microseconds.

## Key evidence
- Bwd IAT Total: 8673890 microseconds vs 3 microseconds (2890000.0 times normal)
- Bwd IAT Max: 3148500 microseconds vs 3 microseconds (1050000.0 times normal)
- Bwd IAT Mean: 619564 microseconds vs 3 microseconds (207000.0 times normal)
- Fwd IAT Mean: 715116 microseconds vs 4 microseconds (179000.0 times normal)
- Port 21 handled 399 of the 405 flows, indicating FTP traffic dominance

| Feature | Unit | Attack median | Normal median | x normal |
|---|---|---:|---:|---:|
| Bwd IAT Total | microseconds | 8673890 | 3 | 2890000.0 |
| Fwd IAT Std | microseconds | 1320104 | 0 | n/a |
| Bwd IAT Std | microseconds | 1210461 | 0 | n/a |
| Bwd IAT Max | microseconds | 3148500 | 3 | 1050000.0 |
| Bwd IAT Mean | microseconds | 619564 | 3 | 207000.0 |
| Fwd IAT Mean | microseconds | 715116 | 4 | 179000.0 |

## Potential impact
High severity brute-force attempts could compromise FTP credentials, granting unauthorized access to sensitive data.

## Recommended actions
1. Block the source after repeated failed logins
2. Check FTP logs for any successful login
3. Enforce strong passwords or disable FTP in favour of SFTP

## Analyst note
Verification needed because 1 flow requires analyst review. Confirm source IPs, timestamps, and usernames from external logs. This report is AI-assisted.

---
*Narrative source: Groq openai/gpt-oss-20b. Grounding check: all numbers match the evidence. CyberSentry assists analysts; it does not replace them.*