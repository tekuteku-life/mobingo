import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {CDP,stopBrowserProcess} from '../helpers/browser.js';
class Socket extends EventTarget{
	readyState=1;messages=[];
	send(text){this.messages.push(JSON.parse(text))}
	message(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}))}
	close(){this.readyState=3;this.dispatchEvent(new Event('close'))}
}
test('R-16/21 driver: 応答・拒否・期限・接続終了を区別し、保留を解放する',async()=>{
	const socket=new Socket(),cdp=new CDP(socket),first=cdp.send('ok');socket.message({id:1,result:{value:7}});assert.deepEqual(await first,{value:7});
	const failed=cdp.send('bad');socket.message({id:2,error:{message:'denied'}});await assert.rejects(failed,/denied/);
	await assert.rejects(cdp.send('timeout',{},10),/CDP timeout/);
	const pending=cdp.send('pending'),rejected=assert.rejects(pending,/connection closed/);cdp.close();await rejected;await assert.rejects(cdp.send('after-close'),/connection closed/);
});
test('R-16 driver: WebSocket接続自体にも期限を設ける',async()=>{
	const sockets=new Set(),server=createServer();server.on('upgrade',(_,socket)=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
	try{await assert.rejects(CDP.connect(`ws://127.0.0.1:${server.address().port}`,30),/connection timeout/)}finally{for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r))}
});
test('R-16 driver: 親終了後に子がstderrを保持しても終了処理を完了する',async()=>{
	const source=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','ignore',2]});process.stderr.write(String(child.pid)+'\\n');process.exit(0)`;
	const child=spawn(process.execPath,['-e',source],{detached:true,stdio:['ignore','ignore','pipe']}),exited=once(child,'exit');const [data]=await once(child.stderr,'data');const descendant=Number(data.toString().match(/^\d+/)[0]);await exited;
	try{const start=Date.now();await stopBrowserProcess(child,null,50);assert.ok(child.stderr.destroyed);assert.ok(Date.now()-start<1000);assert.equal(child.listenerCount('exit'),0);
		const running=async()=>{try{const stat=await readFile(`/proc/${descendant}/stat`,'utf8');return !['Z','X'].includes(stat.slice(stat.lastIndexOf(')')+2).split(' ')[0])}catch(error){if(error.code==='ENOENT')return false;throw error}};const until=Date.now()+1000;while(await running()&&Date.now()<until)await new Promise(r=>setTimeout(r,10));assert.equal(await running(),false);
	}finally{try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}child.stderr.destroy()}
});
test('R-16 driver: 終了要求とSIGTERMに反応しない所有プロセスも期限付きで停止する',async()=>{
	const child=spawn(process.execPath,['-e',`process.on('SIGTERM',()=>{});process.stderr.write('ready');setInterval(()=>{},1000)`],{detached:true,stdio:['ignore','ignore','pipe']});await once(child.stderr,'data');let closed=0;
	try{await stopBrowserProcess(child,{send:()=>new Promise(()=>{}),close:()=>closed++},40);assert.equal(closed,1);assert.equal(child.signalCode,'SIGKILL');assert.ok(child.stderr.destroyed);assert.equal(child.listenerCount('exit'),0)}finally{if(child.signalCode===null)process.kill(-child.pid,'SIGKILL')}
});
