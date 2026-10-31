import test from 'node:test';
import assert from 'node:assert/strict';
import { createScope } from '../../js/core/lifecycle.js';

test('R-16: スコープ破棄は子・タイマーを解放し繰り返せる',async()=>{
	const scope=createScope();const child=scope.child();let cleaned=0,expired=0;
	child.add(()=>cleaned++);child.timeout(()=>expired++,10);
	scope.dispose();scope.dispose();
	await new Promise(resolve=>setTimeout(resolve,20));
	assert.equal(scope.active,false);assert.equal(child.active,false);assert.equal(cleaned,1);assert.equal(expired,0);
	scope.add(()=>cleaned++);assert.equal(cleaned,2);
	const late=scope.child();assert.equal(late.active,false);
	late.timeout(()=>expired++,1);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(expired,0);
});

test('R-16: 生存中のタイマーだけが発火し、先に閉じた子を再破棄しない',async()=>{
	const scope=createScope();let calls=0;const child=scope.child();
	child.add(()=>calls++);child.dispose();
	await new Promise(resolve=>scope.timeout(()=>{calls++;resolve();},1));
	scope.dispose();assert.equal(calls,2);
});
