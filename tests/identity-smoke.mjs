import assert from 'node:assert/strict';
import {instagramHandle,accountKey,creatorSearch,validateInstagramAccount} from '../src/identity.js';
for(const input of ['@Churroo_thepoodle','churroo_thepoodle','https://www.instagram.com/Churroo_thepoodle/?igsh=abc#x','instagram.com/churroo_thepoodle/','https://m.instagram.com/churroo_thepoodle'])assert.equal(instagramHandle(input),'churroo_thepoodle');
for(const input of ['https://evil.com/name','https://instagram.com.evil.com/name','https://instagram.com/p/abc/','https://instagram.com/reel/abc/','https://instagram.com/stories/name/123','https://u:p@instagram.com/name','hello world','https://instagram.com/a/b/'])assert.equal(instagramHandle(input),'');
assert.equal(creatorSearch('https://instagram.com/Some.Dog/?x=1'),'some.dog');
assert.equal(creatorSearch('Jane Smith'),'Jane Smith');
assert.equal(accountKey({handle:'@NAME'}),accountKey({profile_url:'https://instagram.com/name/'}));
assert.throws(()=>validateInstagramAccount({handle:'one',profile_url:'https://instagram.com/two/'}));
globalThis.window={MATCHMATE_CONFIG:{}};globalThis.location={search:'?demo=1&size=1000'};
const data=await import('../src/data.js');
const existing=(await data.existingCreatorAccounts())[0];
const matches=await data.findCreatorDuplicates(`https://instagram.com/${existing.handle}/?igsh=x`);
assert.ok(matches.some(x=>x.creator.id===existing.creator_id));
await assert.rejects(()=>data.createCreatorWithPrimaryAccount({account:{handle:`@${existing.handle.toUpperCase()}`}}),/already in/);
const result=await data.importCreators([
  {row:2,creator:{},account:{platform:'Instagram',handle:'dedup_test_dog'}},
  {row:3,creator:{},account:{platform:'Instagram',handle:'https://instagram.com/DEDUP_TEST_DOG/?x=1'}}
]);
assert.equal(result.created,1);assert.equal(result.skipped,1);
const search=await data.creatorPage({search:'https://instagram.com/dedup_test_dog/'});assert.equal(search.count,1);
console.log('Identity, URL search, existing creator lookup, duplicate add and CSV dedup passed');
