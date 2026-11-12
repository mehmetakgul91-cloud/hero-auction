# Tank shields

## Rates

The self-shield rate is stored in the trusted catalogs and calculated from catalog power, not auction credit or commander level:

`ratePercent = Math.round(25 + 15 * (catalogPower - 69) / 23)`

| Tank | Catalog power | Own shield | Other living front-row allies |
| --- | ---: | ---: | ---: |
| Demir Sur | 69 | 25% | 7% |
| Brunn | 75 | 29% | 8% |
| Çan Muhafızı | 76 | 30% | 8% |
| Kara Siper | 77 | 30% | 8% |
| Kaya Titanı | 80 | 32% | 8% |
| Kadim Meşe | 81 | 33% | 8% |
| Buz Kalesi | 83 | 34% | 8% |
| Obsidyen Muhafız | 90 | 39% | 9% |
| Altın Muhafız | 91 | 39% | 10% |
| Drogar | 92 | 40% | 9% |

Amounts use the casting tank's current defense and existing integer rounding. Other-front rates are half the previous per-hero rates. The caster never receives its own front-row distribution; another living tank in that row can receive it. Back-row and fallen allies do not. New tank kits grant one self shield. Previously captured kits use their stored rates and distribution.

This is a per-special-action rate, not an accumulated shield cap. Shields still last until consumed and absorb at most 70% of a hit. Hero personal action clocks, stun timing, special damage and passives are unchanged. Existing commander defense bonuses still affect the defense used for the amount, not the stored rate.
