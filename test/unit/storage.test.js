import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../../js/core/storage.js';

let values;
beforeEach(() => {
	values = new Map();
	globalThis.localStorage = {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: (key) => values.delete(key),
	};
});
const child = { childSeed: 'ABCD', openedCellCoords: ['2,2', '0,0'], specialRuleActive: false };
const parent = { parentSeed: '1234', mode: 'mode_a', currentTurn: 3, specialRuleTurn: 4, registeredChildSeeds: ['ABCD'] };

test('R-01/12: hostを含む役割の保存復元', () => {
	assert.equal(storage.loadAppMode(), 'select');
	for (const mode of ['host', 'child', 'select']) {
		storage.saveAppMode(mode); assert.equal(storage.loadAppMode(), mode);
	}
	for (const invalid of ['parent', 'other', '']) { storage.saveAppMode(invalid); assert.equal(storage.loadAppMode(), 'select'); }
});

test('R-12: 両ゲームの保存復元と個別削除', () => {
	assert.equal(storage.loadChildState(), null);
	assert.equal(storage.loadParentState(), null);
	storage.saveChildState(child); storage.saveParentState(parent);
	assert.deepEqual(storage.loadChildState(), child);
	assert.deepEqual(storage.loadParentState(), parent);
	storage.clearChildState(); assert.equal(storage.loadChildState(), null);
	assert.deepEqual(storage.loadParentState(), parent);
	storage.clearParentState(); assert.equal(storage.loadParentState(), null);
});

for (const [name, key, load, valid, invalids] of [
	['child', 'mobingo_child_state', storage.loadChildState, child, [
		{ childSeed: '"><img src=x onerror=alert(1)>', openedCellCoords: [], specialRuleActive: false },
		{ ...child, openedCellCoords: 'bad' }, { ...child, openedCellCoords: ['5,0'] },
		{ ...child, specialRuleActive: 'false' }, { ...child, openedCellCoords: [null] },
	]],
	['parent', 'mobingo_parent_state', storage.loadParentState, parent, [
		{ ...parent, parentSeed: '<svg' }, { ...parent, mode: 'other' },
		{ ...parent, currentTurn: -1 }, { ...parent, currentTurn: 76 }, { ...parent, currentTurn: 1.5 },
		{ ...parent, specialRuleTurn: -1 }, { ...parent, specialRuleTurn: 76 },
		{ ...parent, registeredChildSeeds: ['bad'] }, { ...parent, registeredChildSeeds: ['ABCD', 'ABCD'] },
		{ ...parent, registeredChildSeeds: null },
	]],
]) {
	test(`R-12: ${name}不正保存JSON・型・範囲を拒否する`, () => {
		for (const raw of ['{', 'null', '[]', 'true', '42', '"text"', '{}', ...invalids.map((value) => JSON.stringify(value))]) {
			values.set(key, raw);
			assert.equal(load(), null, raw);
		}
		values.set(key, JSON.stringify({ ...valid, injected: '<img>' }));
		assert.deepEqual(load(), valid);
	});
}

test('R-12: 保存・読込・削除例外を隔離する', () => {
	globalThis.localStorage = new Proxy({}, { get() { throw new Error('denied'); } });
	assert.equal(storage.loadAppMode(), 'select');
	assert.equal(storage.loadParentState(), null);
	assert.equal(storage.loadChildState(), null);
	for (const action of [() => storage.saveAppMode('host'), () => storage.saveParentState(parent),
		() => storage.saveChildState(child), storage.clearParentState, storage.clearChildState]) assert.doesNotThrow(action);
});


test('R-17/18: 名前・照合済みIDの保存検査と旧形式維持',()=>{
	storage.saveChildState({...child,displayName:' e\u0301 '});
	assert.deepEqual(storage.loadChildState(),{...child,displayName:'é'});
	storage.saveParentState({...parent,participantNames:{ABCD:' 花子 '},verifiedChildSeeds:['ZZZZ']});
	assert.deepEqual(storage.loadParentState(),{...parent,participantNames:{ABCD:'花子'},verifiedChildSeeds:['ZZZZ']});
	for(const displayName of [null,32,'a'.repeat(33),'a\nb']){storage.saveChildState({...child,displayName});assert.equal(storage.loadChildState(),null);}
	for(const extra of [{participantNames:null},{participantNames:[]},{participantNames:{bad:'x'}},{participantNames:{ABCD:32}},{participantNames:{ABCD:'a\nb'}},{participantNames:JSON.parse('{"__proto__":"x"}')},{verifiedChildSeeds:['ABCD','ABCD']},{verifiedChildSeeds:['bad']},{verifiedChildSeeds:null}]){
		storage.saveParentState({...parent,...extra});assert.equal(storage.loadParentState(),null,JSON.stringify(extra));
	}
});

test('R-17: 方向制御文字を含む保存名は両ゲーム全体を拒否する',()=>{
	for(const control of ['\u061c','\u200e','\u200f']){
		storage.saveChildState({...child,displayName:'a'+control});assert.equal(storage.loadChildState(),null);
		storage.saveParentState({...parent,participantNames:{ABCD:'a'+control}});assert.equal(storage.loadParentState(),null);
	}
});
