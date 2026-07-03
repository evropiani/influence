"use strict";
// Peer-to-peer transport for friend matches — raw WebRTC DataChannel, no server.
// Signaling is a one-time manual exchange: the host shares an invite code, the friend
// answers with a reply code, and from then on the browsers talk directly.
window.NET=(()=>{
  let pc=null, ch=null, role=null;
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
  function iceDone(){
    return new Promise(res=>{
      if(pc.iceGatheringState==="complete") return res();
      const t=setTimeout(res,3500);                                  // don't wait forever on slow candidates
      pc.addEventListener("icegatheringstatechange",()=>{ if(pc.iceGatheringState==="complete"){ clearTimeout(t); res(); } });
    });
  }
  function wire(){
    ch.onopen=()=>onOpen();
    ch.onmessage=e=>{ try{ onMsg(JSON.parse(e.data)); }catch(err){} };
    ch.onclose=()=>{ onClose(); };
  }
  function watchPc(){
    pc.onconnectionstatechange=()=>{ if(pc && (pc.connectionState==="failed"||pc.connectionState==="disconnected"||pc.connectionState==="closed")) onClose(); };
  }
  return {
    async host(){
      role="host"; pc=new RTCPeerConnection(cfg); watchPc();
      ch=pc.createDataChannel("influence",{ordered:true}); wire();
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone();
      return pack(pc.localDescription);
    },
    async acceptAnswer(code){
      await pc.setRemoteDescription(await unpack(code));
    },
    async join(code){
      role="guest"; pc=new RTCPeerConnection(cfg); watchPc();
      pc.ondatachannel=e=>{ ch=e.channel; wire(); };
      await pc.setRemoteDescription(await unpack(code));
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone();
      return pack(pc.localDescription);
    },
    send(obj){ if(ch && ch.readyState==="open"){ try{ ch.send(JSON.stringify(obj)); }catch(e){} } },
    close(){ try{ if(ch)ch.close(); if(pc)pc.close(); }catch(e){} pc=null; ch=null; role=null; },
    role:()=>role,
    connected:()=>!!(ch && ch.readyState==="open"),
    onMsg:f=>onMsg=f, onOpen:f=>onOpen=f, onClose:f=>onClose=f,
  };
})();
