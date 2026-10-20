// Print an actionable full-roster parity report in CI or locally:
// node scripts/report-commander-parity.mjs
import {auditIncrementalRoster} from '../commander-roster-parity-audit.js';
const report=auditIncrementalRoster();
console.log(JSON.stringify({total:report.total,candidateReady:report.ready,blocked:report.blocked,issueCounts:report.issueCounts,blockedHeroes:report.rows.filter(x=>!x.ready).map(x=>({id:x.id,issues:x.issues}))},null,2));
if(report.blocked===0)console.log('All known roster mechanics have candidate paths; battle parity still requires replay comparison.');
