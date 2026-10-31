import assert from 'node:assert/strict';

// Test the visual viewport and every clipping ancestor, without moving the DOM.
export async function geometry(page, selector) {
	return page.eval(`(() => {
		const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
		const r=e.getBoundingClientRect(),v=visualViewport;
		const clip={left:v.offsetLeft,top:v.offsetTop,right:v.offsetLeft+v.width,bottom:v.offsetTop+v.height};
		for(let parent=e.parentElement;parent;parent=parent.parentElement){
			const s=getComputedStyle(parent),p=parent.getBoundingClientRect();
			if(/auto|scroll|hidden|clip/.test(s.overflowX)){clip.left=Math.max(clip.left,p.left+parent.clientLeft);clip.right=Math.min(clip.right,p.left+parent.clientLeft+parent.clientWidth);}
			if(/auto|scroll|hidden|clip/.test(s.overflowY)){clip.top=Math.max(clip.top,p.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,p.top+parent.clientTop+parent.clientHeight);}
		}
		const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y),s=getComputedStyle(e);
		return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,clip,
			visible:s.visibility==='visible'&&r.width>0&&r.height>0&&r.left>=clip.left-1&&r.right<=clip.right+1&&r.top>=clip.top-1&&r.bottom<=clip.bottom+1,
			hit:e===hit||e.contains(hit),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};
	})()`);
}

export async function visible(page, selector, interactive = false) {
	const r=await geometry(page,selector);
	assert.ok(r?.visible, `${selector} must fit viewport and ancestors: ${JSON.stringify(r)}`);
	if(interactive)assert.ok(r.hit, `${selector} must receive a touch`);
	return r;
}

export async function reveal(page, selector, scroller) {
	for(let attempt=0;attempt<10;attempt++){
		const r=await geometry(page,selector);
		if(r?.visible&&r.hit)return r;
		assert.ok(r,`Missing element: ${selector}`);
		const toward=r.top<r.clip.top?'start':'end';
		const overflow=toward==='start'?r.clip.top-r.top:r.bottom-r.clip.bottom;
		await page.swipe(scroller,toward,Math.max(32,overflow+24));
	}
	return visible(page,selector,true);
}

export async function tap(page, selector, scroller) {
	if(scroller)await reveal(page,selector,scroller);
	else await visible(page,selector,true);
	await page.tap(selector);
}
