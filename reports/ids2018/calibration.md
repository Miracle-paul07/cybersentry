# Stage 1 threshold calibration on CSE-CIC-IDS2018

Analysis only. The saved model and the website's threshold (0.5) are unchanged.

The 100,108-row evaluation sample was split in half, stratified with seed 42. The threshold was chosen on the calibration half as the lowest one with FPR under 5%, which gave **0.000059** (FPR 4.99% on that half). Everything below is from the 50,054-row test half. About 80% of its rows are attacks, so precision and accuracy are higher than they would be at a real traffic mix.

## Results

| Metric | Original threshold | Calibrated threshold |
|---|---:|---:|
| Stage 1 Recall | 5.81% | 61.11% |
| Stage 1 Precision | 99.91% | 97.87% |
| Stage 1 F1 | 10.98% | 75.24% |
| Stage 1 FPR | 0.02% | 5.32% |
| After Stage 2 Recall | 3.91% | 29.29% |
| After Stage 2 FPR | 0.02% | 1.66% |
| Pipeline accuracy | 20.14% | 34.55% |
| Pipeline macro-F1 | 5.11% | 18.75% |

## Share of each 2018 label flagged by Stage 1

| Label | Original threshold | Calibrated threshold |
|---|---:|---:|
| Benign | 0.02% | 5.32% |
| Bot | 0.00% | 72.18% |
| DDOS attack-HOIC | 0.00% | 0.00% |
| DDOS attack-LOIC-UDP | 0.00% | 100.00% |
| DoS attacks-Hulk | 22.71% | 86.97% |
| DoS attacks-SlowHTTPTest | 92.86% | 100.00% |
| FTP-BruteForce | 88.46% | 100.00% |
| SSH-Bruteforce | 0.07% | 76.45% |

## How much depends on the FPR budget

| FPR budget | Threshold | Stage 1 recall | Stage 1 FPR | Macro-F1 |
|---:|---:|---:|---:|---:|
| 1% | 0.003377 | 21.46% | 0.95% | 6.07% |
| 5% | 0.000059 | 61.11% | 5.32% | 18.75% |
| 10% | 0.000027 | 70.80% | 10.29% | 20.26% |

## What Stage 2 does at the calibrated threshold

| 2018 class | Rows | Reached Stage 2 | Named correctly | Stage 2 predictions | Closest 2017 classes |
|---|---:|---:|---:|---|---|
| BENIGN | 10,000 | 532 | 366 | BENIGN 366, DoS GoldenEye 156, DoS Hulk 5, DoS Slowhttptest 2 | DDoS, Bot, DoS Hulk |
| Bot | 10,000 | 7,218 | 7,068 | Bot 7,068, BENIGN 150 | Bot, BENIGN, SSH-Patator |
| DDoS | 10,000 | 865 | 0 | Infiltration 865 | SSH-Patator, DDoS, DoS GoldenEye |
| DoS Hulk | 10,000 | 8,697 | 370 | BENIGN 4,978, DoS GoldenEye 3,280, DoS Hulk 370, DoS Slowhttptest 53 | Web Attack, DoS Slowhttptest, BENIGN |
| DoS Slowhttptest | 28 | 28 | 0 | PortScan 28 | PortScan, BENIGN, Web Attack |
| FTP-Patator | 26 | 26 | 0 | PortScan 26 | PortScan, BENIGN, Web Attack |
| SSH-Patator | 10,000 | 7,645 | 23 | BENIGN 7,621, SSH-Patator 23, DoS Hulk 1 | SSH-Patator, FTP-Patator, DoS GoldenEye |

"Closest" compares the median flow of each class as Stage 2 sees it (signed log, then its scaler).

## Features that moved most from the same class in 2017

Shift is in Stage 2's input units, where 1 is one standard deviation of its training data.

| 2018 class | Feature | Shift | 2017 median | 2018 median |
|---|---|---:|---:|---:|
| BENIGN | Destination Port | 3.09 | 80.00 | 40,388.00 |
| BENIGN | Fwd Packet Length Std | 2.49 | 0.00 | 283.68 |
| BENIGN | Init_Win_bytes_backward | 1.94 | -1.00 | 211.00 |
| Bot | Fwd Packet Length Std | 2.31 | 0.00 | 188.22 |
| Bot | Fwd Packet Length Max | 1.75 | 6.00 | 326.00 |
| Bot | Fwd Packet Length Mean | 1.74 | 6.00 | 108.67 |
| DDoS | PSH Flag Count | 2.04 | 0.00 | 1.00 |
| DDoS | Fwd Packet Length Mean | 1.58 | 7.00 | 96.00 |
| DDoS | Flow Bytes/s | 1.52 | 159.22 | 87,185.98 |
| DoS Hulk | Flow IAT Min | 3.28 | 1.00 | 18,545.00 |
| DoS Hulk | Fwd Packet Length Max | 2.66 | 345.00 | 0.00 |
| DoS Hulk | Packet Length Mean | 2.65 | 852.64 | 0.00 |
| DoS Slowhttptest | Fwd IAT Min | 4.16 | 996,965.00 | 0.00 |
| DoS Slowhttptest | Flow IAT Min | 3.73 | 996,550.50 | 29.50 |
| DoS Slowhttptest | Active Min | 3.62 | 7,004,681.50 | 0.00 |
| FTP-Patator | Bwd Packets/s | 2.48 | 1.73 | 51,315.79 |
| FTP-Patator | Total Fwd Packets | 2.44 | 9.00 | 1.00 |
| FTP-Patator | Flow Packets/s | 2.36 | 2.77 | 102,631.58 |
| SSH-Patator | Flow Bytes/s | 0.83 | 392.50 | 12,285.90 |
| SSH-Patator | Flow Packets/s | 0.71 | 4.44 | 117.98 |
| SSH-Patator | Bwd Packets/s | 0.70 | 2.66 | 57.83 |
