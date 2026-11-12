# Normal commander budget preparation

Local preparation only. No deployment. PR105 supplies the previously approved selected-role hero bonuses and permanent center defense. The following normal budgets preserve the selected level base and repeat use:

- Attack: round(level + 10% of battle-start fighter/assassin attack).
- Defense: round(level + 20% of battle-start tank defense).
- Support: round(level + 5% of battle-start support attack × base healing rate), summing hero contributions before rounding and excluding commanderHealingBonus.

Starting power includes preparation, formation, credit, passive, assassin and center modifiers. It stays fixed after casualties and later stat changes. Damage and shields divide their total among existing living targets with deterministic remainders. Healing retains lowest-health-ratio priority, missing-health caps and fully-healthy rejection. Level 15 and respective bases 200/160/100 yield 35/47/20. A team with no matching role receives only the flat level term.

TR/EN profile and auction descriptions show formulas. Support revival now returns the chosen fallen ally at 55% maximum HP, with the previous shield reset and next-round action eligibility. Other ultimates are unchanged. Mage normal costs 60 energy; other normal costs remain 40. Mage damage is integrated into both battle engines: round(level + 5% of battle-start energy-role attack), then round(main × 25%) per living adjacent occupant. The frozen visual-center slot map includes diagonal neighbors without shifting over empty slots. New stun skips the target's next scheduled action, including healing and shields; historical next-attack-only stuns keep their old meaning. See `mage-design-pending.md` for the implemented contract and regression scope.

Earlier experiments found material high-level loss-to-win reversals when only the weaker team used normals. These coefficients are not declared balanced or ready to publish. Earlier healing calibration also used hero power rather than this implementation's attack × base healing rate. Do not cite those calibration figures as verification of this formula. Final all-action-stun balance comparisons must use the actual integrated engine, rather than earlier attack-only-stun assumptions.

Exact finalized source passed 3,580 repository tests, strict roster audit, JavaScript syntax checks and diff checks. Local runtime is Node 24.22.1; repository CI targets Node 26.12.1. Browser visual QA remains blocked locally; DOM tests are not a visual verification claim.
