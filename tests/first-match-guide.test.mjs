import test from 'node:test';
import assert from 'node:assert/strict';
import {guideSteps,guideCanAutoOpen} from '../public/first-match-guide.js';
import {crazyGamesSource} from '../crazygames-build.js';
import {readFileSync} from 'node:fs';
test('tutorial is short, bilingual and honest about practice and commander abilities',()=>{
 for(const locale of ['tr','en'])assert.equal(guideSteps[locale].length,3);
 assert.match(guideSteps.en[0][1],/20 credits/);assert.match(guideSteps.en[2][1],/both online and computer matches/);
 assert.match(guideSteps.en[2][1],/do not change/);
});
test('seen users, pending invites and hidden lobby never auto-open the guide',()=>{
 assert.equal(guideCanAutoOpen({seen:false,homeVisible:true,invited:false}),true);
 for(const state of [{seen:true,homeVisible:true},{seen:false,homeVisible:false},{seen:false,homeVisible:true,invited:true}])assert.equal(guideCanAutoOpen(state),false);
});
test('tutorial script stays available in both entry points with isolated portal storage',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/src="\/first-match-guide.js"/);
 assert.match(crazyGamesSource(html,'.html'),/src="\/crazygames\/first-match-guide.js"/);
 const script=readFileSync(new URL('../public/first-match-guide.js',import.meta.url),'utf8');
 assert.match(crazyGamesSource(script,'.js'),/hero-auction-cg-first-match-guide/);
});
