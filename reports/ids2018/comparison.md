# CIC-IDS2017 vs CSE-CIC-IDS2018

Same models, not retrained. 2017 is the held-out test split. The 2018 sample caps each class at 20,000 rows, so about 80.02% of it is attacks. "All 2018 rows" uses every distinct flow, where 22.10% are attacks.

## Stage 1: attack vs benign

| Metric | 2017 test | 2018 sample | All 2018 rows |
|---|---:|---:|---:|
| Accuracy | 99.92% | 24.74% | 79.16% |
| Precision | 99.54% | 99.92% | 98.73% |
| Recall | 99.96% | 5.96% | 5.79% |
| F1 | 99.75% | 11.25% | 10.93% |
| FPR | 0.09% | 0.02% | 0.02% |
| FNR | 0.04% | 94.04% | 94.21% |
| ROC-AUC | 100.00% | 81.84% | 74.34% |

## Full pipeline: which attack

| Metric | 2017 test | 2018 sample |
|---|---:|---:|
| Accuracy | 99.89% | 20.14% |
| Macro-F1 | 95.33% (13 classes) | 5.12% (7 classes) |

## Per class

| Class | Rows | Precision | Recall | F1 | 2017 test recall | 2017 test F1 |
|---|---:|---:|---:|---:|---:|---:|
| BENIGN | 20,000 | 20.63% | 99.98% | 34.20% | 99.91% | 99.95% |
| Bot | 20,000 | 0.00% | 0.00% | 0.00% | 91.44% | 82.03% |
| DDoS | 20,000 | 0.00% | 0.00% | 0.00% | 99.98% | 99.98% |
| DoS Hulk | 20,000 | 99.32% | 0.73% | 1.44% | 99.78% | 99.81% |
| DoS Slowhttptest | 55 | 0.00% | 0.00% | 0.00% | 98.72% | 98.29% |
| FTP-Patator | 53 | 0.00% | 0.00% | 0.00% | 99.78% | 99.50% |
| SSH-Patator | 20,000 | 95.65% | 0.11% | 0.22% | 98.55% | 99.06% |

## Per day file, 2018 sample

| Day | Rows | Stage 1 recall | Stage 1 FPR | ROC-AUC | Pipeline accuracy | Macro-F1 |
|---|---:|---:|---:|---:|---:|---:|
| 02-14-2018 | 25,053 | 0.35% | 0.06% | 90.98% | 20.03% | 11.19% |
| 02-16-2018 | 25,055 | 23.45% | 0.00% | 99.88% | 20.53% | 12.84% |
| 02-21-2018 | 25,000 | 0.00% | 0.00% | 22.41% | 20.00% | 16.67% |
| 03-02-2018 | 25,000 | 0.00% | 0.02% | 89.91% | 20.00% | 16.66% |
