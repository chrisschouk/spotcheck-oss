# Bot-scorer validation metrics

<!-- GENERATED FILE, do not edit by hand. Regenerate with:
     UPDATE_METRICS=1 npx vitest run __tests__/lib/bot-scorer-validation.test.ts -->

Computed from the constructed (synthetic) labelled corpus in `bot-scorer-corpus.ts` (40 rows: 25 bot / 15 human), scoring each playlist with `scoreWithHistory` and predicting "bot" when the score meets the threshold.

## Confusion matrix and metrics at each threshold

| Threshold | TP | FP | TN | FN | Precision | Recall | F1 |
| --------: | -: | -: | -: | -: | --------: | -----: | -: |
| 15 | 24 | 0 | 15 | 1 | 100.0% | 96.0% | 98.0% |
| 25 | 18 | 0 | 15 | 7 | 100.0% | 72.0% | 83.7% |
| 50 | 10 | 0 | 15 | 15 | 100.0% | 40.0% | 57.1% |

## Sub-threshold bots (the recall gap, missed at threshold 25)

Real bots whose only tell is a single weak signal, so they score below the medium band:

- **15**, Indie Discoveries Weekly: Round 10k follower package, ratio exactly 10 (no flag), plausible desc, only the round count fires (+15).
- **15**, Road Trip Classics: Round 5k purchased count, ratio 10, has a desc, only round count fires (+15).
- **15**, Chillhop Cafe Corner: Round 2k count, ratio 10, desc present, round count only (+15).
- **15**, Viral Hits Tracker: Followers being culled: 10k -> 8.8k over a week (-12%). Non-round, ratio 11, only the drop fires (+15).
- **15**, Fresh Finds Web: Purchased batch being culled: 20k -> 17.3k over a week (-13.5%). Non-round count, ratio 17, only the drop fires (+15).
- **15**, Bedroom Pop Dreams: Culled batch: 11.5k -> 9.2k over a week (-20%). Non-round count, ratio 10.2, only the drop fires (+15).
- **10**, Bangers Only Mix: Blank desc is the sole tell (+10); healthy ratio and non-round count. Slips under threshold.

## Human edge cases that score above zero

Genuine curators that trip a single static heuristic but stay below threshold 25:

- **10**, Running Playlist (no notes): Real runner who never wrote a description (+10) but has a healthy ratio and non-round count.
- **10**, Commute Mix: Left the description blank (+10); otherwise a perfectly ordinary personal playlist.
