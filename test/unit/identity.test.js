import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayName, buildParticipantQr, parseParticipantQr, escapeHtml } from '../../js/core/identity.js';

test('R-17: 名前の正規化・コードポイント境界・制御文字',()=>{
	for(const [input,expected] of [['',''],['  花子  ','花子'],['e\u0301','é'],['😀'.repeat(32),'😀'.repeat(32)],['<img src=x onerror=alert(1)>','<img src=x onerror=alert(1)>']]) assert.equal(normalizeDisplayName(input),expected);
	for(const input of [null,42,{},'あ'.repeat(33),'😀'.repeat(33),' '.repeat(257),...['\0','\n','\r','\t','\x7f','\x85','\u2028','\u2029','\u202a','\u202e','\u2066','\u2069'].map(c=>'a'+c+'b')])assert.equal(normalizeDisplayName(input),null,String(input));
	assert.equal(normalizeDisplayName(' '.repeat(256)),'');
});
test('R-17: v2QRの厳密な往復・旧QRの名前なし契約',()=>{
	for(const name of ['', '山田 😀', '\"<>&\''])assert.deepEqual(parseParticipantQr(buildParticipantQr('ABCD',name)),{seed:'ABCD',displayName:name});
	for(const input of ['ABCD','mobingo:child:ABCD'])assert.deepEqual(parseParticipantQr(input),{seed:'ABCD',displayName:null});
	assert.throws(()=>buildParticipantQr('bad',''));assert.throws(()=>buildParticipantQr('ABCD','a'.repeat(33)));
	for(const input of [null,32,'x'.repeat(513),'mobingo:child:ABCDextra','abcd','https://x/ABCD','mobingo:child:v2:{','mobingo:child:v2:null','mobingo:child:v2:[]',...[
		{}, {seed:'ABCD'}, {seed:'ABCD',displayName:null},{seed:'ABCD',displayName:42},{seed:'abcd',displayName:''}, {seed:'ABCD',displayName:'a'.repeat(33)}, {seed:'ABCD',displayName:'a\nb'}, {seed:'ABCD',displayName:'',extra:1},
	].map(v=>'mobingo:child:v2:'+JSON.stringify(v)),'mobingo:child:v2:{"seed":"ABCD","displayName":"","__proto__":{}}'])assert.equal(parseParticipantQr(input),null,String(input));
	assert.equal(escapeHtml(`\"'&<>`),'&quot;&#39;&amp;&lt;&gt;');
});
