# Local ability balance — all 50 heroes

Source baseline: `f26ec3402c220a7156a341ad5729f36583de3493`. Base powers, economy, formations and commander rates are unchanged. Shield absorption stays at 70% per hit.

## Budget decisions

- Comparable families use narrow rarity bands, not identical modifiers. Higher base power remains a separate advantage.
- Burst heroes trade their former damage-only identity for protected, non-stunning turn delay; no 1.20 burst buff is added.
- Hybrid supports keep team healing and add a smaller shield to that same ally. There is no attack on a hybrid special. Their retained `active.power` field is catalogue-compatible metadata, not an additional damage or healing multiplier.
- Morvan keeps 3% regen and uses 27% splash instead of the legendary 30% to budget sustain.
- Kan Büyücüsü uses 1.20 primary multiplier and 18% primary-HP lifesteal; energy secondary splash stays 15% and does not heal.
- Altın Muhafız uses 20% front-line shield share rather than legendary 18% as his team-protection identity.
- Unique advanced execute (12%) and haste (+8) remain bounded identity tools; there is no legendary counterpart requiring inflated thresholds.
- Guard/resist and evasion/momentum remain aliases for defense/speed, not invented spell resistance or dodge.

## Full roster

| Hero | Tier / role | Before active | After active | Passive before → after |
|---|---|---|---|---|
| Obsidyen Muhafız | legendary / tank | effect=shield, power=1.12 | effect=shield, power=1.14, shieldRate=0.45, frontShieldRate=0.18, tankShieldRate=0.2 | guard 0.06 → 0.08 |
| Demir Sur | advanced / tank | effect=shield, power=1.12 | effect=shield, power=1.1, shieldRate=0.4, frontShieldRate=0.14, tankShieldRate=0.2 | guard 0.06 → 0.04 |
| Kaya Titanı | rare / tank | effect=shield, power=1.12 | effect=shield, power=1.12, shieldRate=0.42, frontShieldRate=0.16, tankShieldRate=0.2 | guard 0.06 → 0.06 |
| Buz Kalesi | rare / tank | effect=shield, power=1.12 | effect=shield, power=1.12, shieldRate=0.42, frontShieldRate=0.16, tankShieldRate=0.2 | guard 0.06 → 0.06 |
| Gölge Suikastçı | legendary / assassin | effect=pierce, power=1.12 | effect=pierce, power=1.14, pierceRate=0.45 | evasion 0.06 → 0.08 |
| Altın Muhafız | legendary / tank | effect=shield, power=1.12 | effect=shield, power=1.14, shieldRate=0.45, frontShieldRate=0.2, tankShieldRate=0.2 | guard 0.06 → 0.08 |
| Alev Zırhı | rare / fighter | effect=burst, power=1.12 | effect=burst, power=1.1, delay=True | rage 0.06 → 0.11 |
| Kadim Koruyucu | rare / fighter | effect=sunder, power=1.12 | effect=sunder, power=1.12, sunderRate=0.15 | focus 0.06 → 0.06 |
| Morvan | legendary / energy | effect=splash, power=1.12 | effect=splash, power=1.14, splashRate=0.27 | regen 0.03 → 0.03 |
| Brunn | rare / tank | effect=shield, power=1.12 | effect=shield, power=1.12, shieldRate=0.42, frontShieldRate=0.16, tankShieldRate=0.2 | guard 0.06 → 0.06 |
| Drogar | legendary / tank | effect=shield, power=1.12 | effect=shield, power=1.14, shieldRate=0.45, frontShieldRate=0.18, tankShieldRate=0.2 | guard 0.06 → 0.08 |
| Vandra | legendary / assassin | effect=pierce, power=1.12 | effect=pierce, power=1.14, pierceRate=0.45 | evasion 0.06 → 0.08 |
| Eloren | rare / fighter | effect=sunder, power=1.12 | effect=sunder, power=1.12, sunderRate=0.15 | focus 0.06 → 0.06 |
| Kael | legendary / fighter | effect=burst, power=1.12 | effect=burst, power=1.12, delay=True | rage 0.06 → 0.12 |
| Seraphine | legendary / support | effect=shield, power=1.12 | effect=shield, power=1.14, supportHybrid=True, healRate=0.52, allyShieldRate=0.28 | resist 0.06 → 0.08 |
| Yıldırım Hükümdarı | rare / energy | effect=splash, power=1.12 | effect=splash, power=1.12, splashRate=0.27 | focus 0.06 → 0.06 |
| Kum Hançeri | advanced / assassin | effect=pierce, power=1.12 | effect=pierce, power=1.1, pierceRate=0.35 | evasion 0.06 → 0.04 |
| Kuzey Baltası | rare / fighter | effect=sunder, power=1.12 | effect=sunder, power=1.12, sunderRate=0.15 | rage 0.06 → 0.11 |
| Kızıl Düellocu | rare / fighter | effect=drain, power=1.12 | effect=drain, power=1.12, drainRate=0.18 | focus 0.06 → 0.06 |
| Fener Şifacısı | advanced / support | effect=heal, power=1.12 | effect=heal, power=1.1, healRate=0.52 | resist 0.06 → 0.04 |
| Çan Muhafızı | rare / tank | effect=shield, power=1.12 | effect=shield, power=1.12, shieldRate=0.42, frontShieldRate=0.16, tankShieldRate=0.2 | guard 0.06 → 0.06 |
| Şafak Azizesi | rare / support | effect=heal, power=1.12 | effect=heal, power=1.12, healRate=0.58 | resist 0.06 → 0.06 |
| Ay Cadısı | rare / energy | effect=weaken, power=1.12 | effect=weaken, power=1.12, weakenRate=0.14 | focus 0.06 → 0.06 |
| Kara Siper | rare / tank | effect=shield, power=1.12 | effect=shield, power=1.12, shieldRate=0.42, frontShieldRate=0.16, tankShieldRate=0.2 | guard 0.06 → 0.06 |
| Ruh Dokuyucu | legendary / support | effect=heal, power=1.12 | effect=heal, power=1.14, healRate=0.64 | resist 0.06 → 0.08 |
| Kuzgun Hançer | rare / assassin | effect=pierce, power=1.12 | effect=pierce, power=1.12, pierceRate=0.4 | evasion 0.06 → 0.06 |
| Astral Kâhin | rare / energy | effect=splash, power=1.12 | effect=splash, power=1.12, splashRate=0.27 | focus 0.06 → 0.06 |
| Sis Bilgesi | advanced / energy | effect=weaken, power=1.12 | effect=weaken, power=1.1, weakenRate=0.12 | resist 0.06 → 0.04 |
| Kök Dervişi | rare / support | effect=heal, power=1.12 | effect=heal, power=1.12, healRate=0.58 | resist 0.06 → 0.06 |
| Güneş Mızrağı | legendary / fighter | effect=pierce, power=1.12 | effect=pierce, power=1.14, pierceRate=0.45 | focus 0.06 → 0.08 |
| Işık Serafı | legendary / support | effect=heal, power=1.12 | effect=heal, power=1.14, healRate=0.64 | guard 0.06 → 0.08 |
| Buz Gölgesi | rare / assassin | effect=weaken, power=1.12 | effect=weaken, power=1.12, weakenRate=0.12 | evasion 0.06 → 0.06 |
| Gece Orağı | advanced / assassin | effect=execute, power=1.12 | effect=execute, power=1.1, executeThreshold=0.12 | evasion 0.06 → 0.04 |
| Zehir Sarmaşığı | rare / assassin | effect=weaken, power=1.12 | effect=weaken, power=1.12, weakenRate=0.12 | evasion 0.06 → 0.06 |
| Kristal Şifacı | rare / support | effect=heal, power=1.12 | effect=heal, power=1.12, healRate=0.58 | resist 0.06 → 0.06 |
| Demir Düellocu | rare / fighter | effect=sunder, power=1.12 | effect=sunder, power=1.12, sunderRate=0.15 | focus 0.06 → 0.06 |
| Fırtına Çağıran | rare / energy | effect=splash, power=1.12 | effect=splash, power=1.12, splashRate=0.27 | momentum 0.06 → 0.06 |
| Altın Ozan | rare / support | effect=heal, power=1.12 | effect=heal, power=1.12, healRate=0.58 | resist 0.06 → 0.06 |
| Kadim Meşe | rare / tank | effect=shield, power=1.12 | effect=shield, power=1.12, shieldRate=0.42, frontShieldRate=0.16, tankShieldRate=0.2 | guard 0.06 → 0.06 |
| Mor Hilal | legendary / assassin | effect=pierce, power=1.12 | effect=pierce, power=1.14, pierceRate=0.45 | evasion 0.06 → 0.08 |
| Taş Yumruk | advanced / fighter | effect=sunder, power=1.12 | effect=sunder, power=1.1, sunderRate=0.12 | rage 0.06 → 0.1 |
| Kış Kraliçesi | legendary / energy | effect=splash, power=1.12 | effect=splash, power=1.14, splashRate=0.3 | resist 0.06 → 0.08 |
| Gök Çekici | legendary / fighter | effect=sunder, power=1.12 | effect=sunder, power=1.14, sunderRate=0.18 | guard 0.06 → 0.08 |
| Mor Gölge | rare / assassin | effect=drain, power=1.12 | effect=drain, power=1.12, drainRate=0.18 | evasion 0.06 → 0.06 |
| Sancak Bekçisi | rare / support | effect=shield, power=1.12 | effect=shield, power=1.12, supportHybrid=True, healRate=0.48, allyShieldRate=0.2 | guard 0.06 → 0.06 |
| Kül Bıçağı | advanced / assassin | effect=haste, power=1.12 | effect=haste, power=1.1, hasteAmount=8 | evasion 0.06 → 0.04 |
| Kan Büyücüsü | rare / energy | effect=drain, power=1.12 | effect=drain, power=1.2, drainRate=0.18 | focus 0.06 → 0.06 |
| Ay Rahibesi | rare / support | effect=heal, power=1.12 | effect=heal, power=1.12, healRate=0.58 | resist 0.06 → 0.06 |
| Yıldız Kraliçesi | legendary / energy | effect=splash, power=1.12 | effect=splash, power=1.14, splashRate=0.3 | focus 0.06 → 0.08 |
| Kristal Fırtına | rare / energy | effect=splash, power=1.12 | effect=splash, power=1.12, splashRate=0.27 | focus 0.06 → 0.06 |

The JSON companion records every hero’s target and cadence. This is a local implementation record, not a publication or live balance claim.
