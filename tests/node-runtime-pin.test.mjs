import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('deployment manifest and lockfile pin the existing patched Node runtime exactly',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.engines.node,'26.12.1');
 assert.equal(lock.packages[''].engines.node,pkg.engines.node);
 assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);
 for(const file of ['.node-version','.nvmrc'])assert.equal(existsSync(new URL('../'+file,import.meta.url)),false,'no repository runtime override: '+file);
});
test('aggregate CI reads the same runtime pin instead of retaining a different major',()=>{
 const workflow=read('.github/workflows/commander-regression.yml');
 assert.match(workflow,/uses: actions\/setup-node@v4\s+with:\s+node-version-file: 'package\.json'/);
 assert.doesNotMatch(workflow,/\bnode-version:/);
 assert.match(workflow,/node --test \*\.test\.js tests\/\*\.test\.\* test\/\*\.test\.js/);
});
