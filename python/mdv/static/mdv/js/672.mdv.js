"use strict";(self.webpackChunkciview2=self.webpackChunkciview2||[]).push([[672],{8672:(n,t,e)=>{e.r(t),e.d(t,{default:()=>i});var r=e(7737);function o(n,t){for(let e=t.length-1;e>=0;e--)n.push(t[e]);return n}class i extends r.Z{decodeBlock(n){return function(n){const t=new Uint16Array(4093),e=new Uint8Array(4093);for(let n=0;n<=257;n++)t[n]=4096,e[n]=n;let r=258,i=9,f=0;function c(){r=258,i=9}function u(n){const t=function(n,t,e){const r=t%8,o=Math.floor(t/8),i=8-r,f=t+e-8*(o+1);let c=8*(o+2)-(t+e);const u=8*(o+2)-t;if(c=Math.max(0,c),o>=n.length)return console.warn("ran off the end of the buffer before finding EOI_CODE (end on input code)"),257;let s=n[o]&2**(8-r)-1;s<<=e-i;let l=s;if(o+1<n.length){let t=n[o+1]>>>c;t<<=Math.max(0,e-u),l+=t}if(f>8&&o+2<n.length){const r=8*(o+3)-(t+e);l+=n[o+2]>>>r}return l}(n,f,i);return f+=i,t}function s(n,o){return e[r]=o,t[r]=n,r++,r-1}function l(n){const r=[];for(let o=n;4096!==o;o=t[o])r.push(e[o]);return r}const a=[];c();const h=new Uint8Array(n);let d,w=u(h);for(;257!==w;){if(256===w){for(c(),w=u(h);256===w;)w=u(h);if(257===w)break;if(w>256)throw new Error(`corrupted code at scanline ${w}`);o(a,l(w)),d=w}else if(w<r){const n=l(w);o(a,n),s(d,n[n.length-1]),d=w}else{const n=l(d);if(!n)throw new Error(`Bogus entry. Not in dictionary, ${d} / ${r}, position: ${f}`);o(a,n),a.push(n[n.length-1]),s(d,n[n.length-1]),d=w}r+1>=2**i&&(12===i?d=void 0:i++),w=u(h)}return new Uint8Array(a)}(n).buffer}}}}]);