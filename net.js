"use strict";
// Peer-to-peer transport for friend matches — raw WebRTC DataChannels, no server.
// Signaling is a one-time manual exchange per friend: the host shares an invite code,
// the friend answers with a reply code, and from then on the browsers talk directly.
// The host is the hub: it can hold several connections (one per friend); guests hold one.
window.NET=(()=>{
  // Optional signaling relay (Google Apps Script web app, see signaling.gs). When set, invites
  // become 6-character codes: the relay stores the offer under the code, the friend fetches it
  // (which deletes it) and posts the answer back, the host picks that up — then everything is
  // direct P2P as before. When empty, the manual long-code exchange is used instead.
  let SIGNAL_URL="";
  const CODE_ALPHABET="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const gen6=()=>{ let c=""; const a=new Uint32Array(6); crypto.getRandomValues(a); for(let i=0;i<6;i++) c+=CODE_ALPHABET[a[i]%CODE_ALPHABET.length]; return c; };
  async function sigPut(code,kind,sdp){
    const r=await fetch(SIGNAL_URL,{method:"POST",body:JSON.stringify({op:"put",code,kind,sdp})});
    const j=await r.json(); if(!j.ok) throw new Error(j.err||"relay refused"); return true;
  }
  async function sigTake(code,kind){
    const r=await fetch(SIGNAL_URL+"?op=take&code="+encodeURIComponent(code)+"&kind="+kind);
    const j=await r.json(); return j.sdp||null;
  }
  async function sigWait(code,kind,timeoutMs){
    const t0=Date.now();
    for(;;){
      const sdp=await sigTake(code,kind);
      if(sdp) return sdp;
      if(Date.now()-t0>timeoutMs) throw new Error("timed out");
      await new Promise(r=>setTimeout(r,2500));
    }
  }

  const peers=new Map();                 // host side: id -> {id, pc, ch, open}
  let nextId=1, pending=null;            // the most recent un-answered host offer
  let guest=null;                        // guest side: {pc, ch, open}
  let role=null;
  let onMsg=()=>{}, onOpen=()=>{}, onClose=()=>{};
  const cfg={ iceServers:[{urls:"stun:stun.l.google.com:19302"}] };

  const b64=(buf)=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const unb64=(s)=>{ s=s.replace(/-/g,"+").replace(/_/g,"/"); const bin=atob(s); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return u.buffer; };
  async function pack(obj){
    const raw=new TextEncoder().encode(JSON.stringify(obj));
    if(typeof CompressionStream==="undefined") return "r."+b64(raw.buffer);
    const cs=new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return "z."+b64(await new Response(cs).arrayBuffer());
  }
  async function unpack(code){
    code=code.trim();
    const kind=code.slice(0,2), body=unb64(code.slice(2));
    if(kind==="r.") return JSON.parse(new TextDecoder().decode(body));
    const ds=new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return JSON.parse(await new Response(ds).text());
  }
  function iceDone(pc){
    return new Promise(res=>{
      if(pc.iceGatheringState==="complete") return res();
      const t=setTimeout(res,3500);
      pc.addEventListener("icegatheringstatechange",()=>{ if(pc.iceGatheringState==="complete"){ clearTimeout(t); res(); } });
    });
  }
  function wire(p){
    p.ch.onopen=()=>{ p.open=true; onOpen(p.id); };
    p.ch.onmessage=e=>{ try{ onMsg(JSON.parse(e.data), p.id); }catch(err){} };
    p.ch.onclose=()=>{ const was=p.open; p.open=false; if(role==="host") peers.delete(p.id); if(was) onClose(p.id); };
    p.pc.onconnectionstatechange=()=>{ const st=p.pc.connectionState;
      if(st==="failed"||st==="disconnected"||st==="closed"){ const was=p.open; p.open=false; if(role==="host") peers.delete(p.id); if(was) onClose(p.id); } };
  }
  return {
    // host: one invite per friend; call again for the next friend
    async host(){
      role="host";
      const pc=new RTCPeerConnection(cfg);
      const p={id:nextId++, pc, ch:pc.createDataChannel("influence",{ordered:true}), open:false};
      wire(p); peers.set(p.id,p); pending=p;
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc);
      return pack(pc.localDescription);
    },
    async acceptAnswer(code){
      if(!pending) throw new Error("no open invite");
      await pending.pc.setRemoteDescription(await unpack(code));
      pending=null;
    },
    async join(code){
      role="guest";
      const pc=new RTCPeerConnection(cfg);
      guest={id:0, pc, ch:null, open:false};
      pc.ondatachannel=e=>{ guest.ch=e.channel; wire(guest); };
      await pc.setRemoteDescription(await unpack(code));
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc);
      return pack(pc.localDescription);
    },
    send(obj){                                          // host: broadcast · guest: to host
      const s=JSON.stringify(obj);
      if(role==="host"){ for(const p of peers.values()) if(p.open){ try{ p.ch.send(s); }catch(e){} } }
      else if(guest && guest.open){ try{ guest.ch.send(s); }catch(e){} }
    },
    sendTo(id,obj){ const p=peers.get(id); if(p && p.open){ try{ p.ch.send(JSON.stringify(obj)); }catch(e){} } },
    close(){ try{ for(const p of peers.values()){ p.ch&&p.ch.close(); p.pc.close(); } if(guest){ guest.ch&&guest.ch.close(); guest.pc.close(); } }catch(e){}
             peers.clear(); guest=null; pending=null; role=null; },
    role:()=>role,
    connected:()=> role==="host" ? [...peers.values()].some(p=>p.open) : !!(guest && guest.open),
    peerCount:()=> role==="host" ? [...peers.values()].filter(p=>p.open).length : (guest&&guest.open?1:0),
    onMsg:f=>onMsg=f, onOpen:f=>onOpen=f, onClose:f=>onClose=f,
    setSignal(u){ SIGNAL_URL=String(u||""); },
    shortCodes(){ return !!SIGNAL_URL; },
    // host with a 6-char code: park the offer on the relay, then poll for the guest's answer in
    // the background and apply it when it arrives (onDone/onFail report the outcome to the UI).
    async hostCode(onDone,onFail){
      const offer=await this.host();
      const myPeer=pending; pending=null;              // this invite is now tied to its code
      const code=gen6();
      await sigPut(code,"o",offer);
      (async()=>{
        try{
          const ans=await sigWait(code,"a",180000);
          await myPeer.pc.setRemoteDescription(await unpack(ans));
          if(onDone) onDone();
        }catch(e){ if(onFail) onFail(e); }
      })();
      return code;
    },
    // guest with a 6-char code: fetch the offer (which deletes it), answer through the relay
    async joinCode(code){
      code=String(code).trim().toUpperCase();
      let offer;
      try{ offer=await sigWait(code,"o",12000); }
      catch(e){ throw new Error("code not found — check it and try again"); }
      const answer=await this.join(offer);
      await sigPut(code,"a",answer);
    },
  };
})();
