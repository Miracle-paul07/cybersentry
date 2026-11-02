# Cross-dataset evaluation: what generalised and what didn't

**The models did not generalise to CSE-CIC-IDS2018.** Trained on CIC-IDS2017 and not retrained, they miss about 94% of 2018 attacks and almost never name the right attack. The 99.9% results on 2017 only hold for traffic that looks like the 2017 network. They should not be read as how the system would do on a new network.

Numbers are in [comparison.md](comparison.md) and [metrics.json](metrics.json). The matrix is in [confusion_matrix.png](confusion_matrix.png).

## The results

| | 2017 test | 2018 sample |
|---|---:|---:|
| Stage 1 recall (attacks caught) | 99.96% | 5.96% |
| Stage 1 false positive rate | 0.09% | 0.02% |
| Stage 1 ROC-AUC | 1.000 | 0.818 |
| Full pipeline macro-F1 | 95.33% (13 classes) | 5.12% (7 classes) |

These numbers are real, not a scoring bug. The same code run on the 2017 test split gives the macro-F1 and accuracy saved at training time, exactly (0.953288 and 0.998853).

## What held up

- **Benign traffic is rarely flagged.** The false positive rate is 0.02%, even better than on 2017, and it holds across all 2.06 million distinct benign flows.
- **When Stage 1 does flag something, it is nearly always an attack.** Precision is 98.7% across all distinct flows, at the real mix of 22% attacks.

Both have the same cause, so don't read them as strengths on their own: the model calls almost everything benign, so it raises very few alarms of any kind.

## What failed

| 2018 label | Flagged by Stage 1, distinct flows | Flagged, duplicates left in | Named correctly, duplicates left in |
|---|---:|---:|---:|
| Bot | 0.0% | 0.0% | 0.0% |
| DDOS attack-HOIC | 0.0% | 0.0% | 0.0% |
| DDOS attack-LOIC-UDP | 0.0% | 0.0% | 0.0% |
| SSH-Bruteforce | 0.1% | 1.0% | 1.0% |
| DoS attacks-Hulk | 23.2% | 66.0% | 12.0% |
| FTP-BruteForce (53 distinct flows) | 90.6% | 12.2% | 0.0% |
| DoS attacks-SlowHTTPTest (55 distinct flows) | 90.9% | 13.5% | 0.0% |

- **DDoS is ranked backwards.** On the 02-21 file ROC-AUC is 0.224, so these attacks score lower than benign traffic. A threshold change can't fix that.
- **Stage 2 mislabels what reaches it.** Flagged Hulk flows mostly become DoS GoldenEye, and flagged FTP and SlowHTTPTest flows become PortScan.

Accuracy is misleading here in both directions. It is 24.74% on the sample, where 80% of rows are attacks, and 79.16% across all distinct flows, where most rows are benign and calling everything benign already scores about 78%. Recall, false positive rate and ROC-AUC are the fair comparison.

## Likely reasons

The first two are measured. The others are the most likely explanations, not proven causes.

1. **Traffic measurements moved** (measured). `Packet Length Variance` and `Fwd Packet Length Max` carry 73% of Stage 1's importance, and their medians shifted a lot. For DDoS, variance fell from about 3.6 million to about 110,000. For Hulk, both fell to 0 once duplicates are dropped, from about 2.7 million and 345.
2. **The model leans on network-specific values** (measured on the demo sample). `Init_Win_bytes_backward` and `Init_Win_bytes_forward` push most 2018 attack types towards benign, and these TCP window sizes depend on the operating systems and setup of the test network. Benign traffic also moved, with its median destination port going from 80 to 41162.
3. **Same name, different attack.** 2017 DDoS and 2018 HOIC and LOIC-UDP are different tools, and LOIC-UDP floods over UDP. The Bot class also looks different, with a median `Fwd Packet Length Max` of 6 in 2017 and 326 in 2018.
4. **A different network and flow tool version.** 2018 was captured on a different network, and CICFlowMeter's version may differ too, so some of the shift may come from how flows were measured rather than from attacker behaviour.
5. **No training for this.** Nothing in training rewarded the models for working on other networks, and a tree model can't extrapolate beyond the value ranges it saw.

## Limits of this evaluation

- **FTP-BruteForce and DoS SlowHTTPTest rest on about 50 rows each.** Dropping duplicates left 53 of 193,354 and 55 of 139,890 rows. Their per-class scores aren't reliable, and the flagged rates above swing widely depending on whether duplicates count.
- **The SlowHTTPTest label looks unreliable.** All 139,890 rows target port 21 (FTP) with one forward packet, the same pattern as every FTP-BruteForce row. That doesn't look like an attack on a web server, so this class may be mislabelled in these files.
- **The files may be incomplete.** Each CSV has exactly 1,048,575 rows, which is Excel's row limit, so they may have been cut off.
- **Not the whole dataset.** These are 4 days of CSE-CIC-IDS2018 and 7 of the 13 classes the models know.
- **2017 and 2018 mixes differ.** Macro-F1 covers 13 classes on 2017 and 7 on 2018, so the comparison is indicative.

## Does a lower threshold fix it?

Partly for detection, and only a little for naming the attack. The full analysis is in [calibration.md](calibration.md). None of this changes the website, which still uses the saved threshold of 0.5.

| Test half of the 2018 sample | Threshold 0.5 | Calibrated, 0.000059 |
|---|---:|---:|
| Stage 1 recall | 5.81% | 61.11% |
| Stage 1 FPR | 0.02% | 5.32% |
| Recall after Stage 2 | 3.91% | 29.29% |
| Pipeline macro-F1 | 5.11% | 18.75% |

- **What improved:** the scores do hold useful signal. Stage 1 now flags most Bot (72%), SSH-Bruteforce (76%) and Hulk (87%) flows, and Stage 2 names 98% of the flagged Bot flows correctly. That one class accounts for much of the macro-F1 gain.
- **What didn't:** HOIC is still never flagged. Stage 2 sends almost all flagged SSH flows and over half of flagged Hulk flows to BENIGN, labels LOIC-UDP as Infiltration, and labels FTP and SlowHTTPTest as PortScan.
- **Why Stage 2 still fails:** for Hulk, the features that moved most include `Flow IAT Min` (median 1 to 18,545) and `Fwd Packet Length Max` (345 to 0), so these flows no longer look like 2017 Hulk. For SSH the median flow barely moved and is still closest to 2017 SSH-Patator, yet Stage 2 calls it BENIGN, so medians don't explain that one.
- **Why this isn't a deployable fix:** the threshold is 8,000 times lower than the saved one and very sensitive: a 1% FPR budget gives only 21.46% recall. Finding it took labelled 2018 traffic, which a new network wouldn't have. The 5% budget was also slightly exceeded on the test half, at 5.32%. And that half is about 80% attacks, so its 97.87% precision is flattering: at the real mix of about 22% attacks, precision would be roughly 76%, as an estimate.

The honest conclusion is that the strict threshold explains part of the problem, not all of it. Fixing detection and naming on a new network still needs retraining.

## What this means for the project

- The honest claim is that the models detect 2017-style attacks very well on that dataset, not that they detect attacks in general.
- Uploading a 2018 file on the website will show most attacks being missed. That is the correct result, and the Model Evaluation page explains it.
- AI incident reports describe what the model predicted, so on this data a report can be confidently worded and still name the wrong attack.
- A real fix would need retraining with 2018 or mixed-network data, or removing the network-specific features. That was out of scope here.
