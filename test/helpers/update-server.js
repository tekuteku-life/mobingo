import {readFile} from 'node:fs/promises';
import {startBrowser} from './browser.js';
import {APP_VERSION} from '../../js/core/version.js';
export const NEXT_VERSION='9.0.0';
export async function updateBrowser(){
	const release={next:false,fail:false,legacy:false,offline:false,failedSwRequests:0},worker=await readFile('sw.js','utf8'),version=await readFile('js/core/version.js','utf8');
	const browser=await startBrowser({route:async path=>{
		if(release.offline){if(path==='/sw.js')release.failedSwRequests++;return {status:503,body:'offline'}};
		if(release.fail&&path==='/css/style.css')return {status:503,body:'unavailable'};
		if(release.legacy&&!release.next&&path==='/sw.js')return {body:`const CACHE='mobingo-v0.9.0';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request))));`};
		if(release.legacy&&!release.next&&path==='/')return {type:'text/html',body:`<!doctype html><div id="app-main">旧アプリ</div><script>navigator.serviceWorker.register('./sw.js')</script>`};
		if(path==='/sw.js')return {body:release.next?worker.replace('mobingo-v'+APP_VERSION,'mobingo-v'+NEXT_VERSION):worker};
		if(path==='/js/core/version.js')return {body:release.next?version.replace(APP_VERSION,NEXT_VERSION):version};
		return null;
	}});
	return {browser,release};
}
export const savedSetup=`if(!localStorage.mobingo_app_mode){localStorage.setItem('mobingo_app_mode','child');localStorage.setItem('mobingo_child_state',JSON.stringify({childSeed:'ABCD',displayName:'花子',openedCellCoords:['2,2','0,0'],specialRuleActive:true}));localStorage.setItem('mobingo_parent_state',JSON.stringify({parentSeed:'1234',mode:'mode_a',currentTurn:50,specialRuleTurn:40,registeredChildSeeds:['ABCD'],participantNames:{ABCD:'花子'},verifiedChildSeeds:['ABCD']}));}`;
