(() => {
  'use strict';
  const tenant = new URLSearchParams(location.search).get('tenant') || '';
  const waiting = document.getElementById('waiting'), headline = document.getElementById('headline'), detail = document.getElementById('detail'), sound = document.getElementById('sound');
  let player = null, videoId = '', busy = false, apiReady = false, desiredId = '';
  function notice(title, message) { headline.textContent = title; detail.textContent = message; waiting.hidden = false; }
  function playWithSound() {
    if (!player?.playVideo) return;
    player.unMute(); player.setVolume(100); player.setPlaybackRate(1); player.playVideo();
  }
  sound.onclick = playWithSound;
  function mount(id) {
    desiredId = id;
    if (!apiReady || !id) return;
    if (player) { if (id !== videoId) { videoId=id; notice('Loading your PS5 broadcast…','Waiting for gameplay picture and sound.'); player.loadVideoById(id); } return; }
    videoId=id;
    player = new YT.Player('player', {
      width:'100%',height:'100%',videoId:id,
      playerVars:{autoplay:1,playsinline:1,controls:1,rel:0,origin:location.origin},
      events:{
        onReady:playWithSound,
        onAutoplayBlocked:() => { notice('Gameplay needs permission to play','Enable gameplay sound in this preview. If this appears in Restream, check playback in the Studio widget before going live.'); sound.hidden=false; },
        onStateChange: event => {
          if(event.data===YT.PlayerState.PLAYING){ waiting.hidden=true; sound.hidden= !player.isMuted(); }
          else if(event.data===YT.PlayerState.BUFFERING){ notice('Buffering gameplay…','Keeping playback at normal speed.'); }
          else if(event.data===YT.PlayerState.ENDED){ notice('PS5 broadcast ended','Start the next broadcast and save its new YouTube link in Stream Setup.'); sound.hidden=true; player.stopVideo(); }
        },
        onError: event => {
          const messages = {2:'The broadcast link is invalid.',5:'The browser could not play this broadcast.',100:'The broadcast is unavailable. Start it on PS5 and check its visibility.',101:'YouTube embedding is disabled for this broadcast.',150:'YouTube embedding is disabled for this broadcast.',153:'YouTube could not identify this player. Reload the Studio widget.'};
          notice('Gameplay could not start',messages[event.data] || 'Check the PS5 broadcast in YouTube Studio.'); sound.hidden=true;
        }
      }
    });
  }
  window.onYouTubeIframeAPIReady=() => { apiReady=true; mount(desiredId); };
  const api=document.createElement('script');api.src='https://www.youtube.com/iframe_api';api.onerror=()=>notice('Gameplay player unavailable','Could not load YouTube. Check the network and reload the widget.');document.head.appendChild(api);
  async function refresh() {
    if(busy)return;busy=true;
    try{
      const response=await fetch('/api/console-input/'+encodeURIComponent(tenant),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Input unavailable');
      const data=await response.json();
      if(data.configured && /^[A-Za-z0-9_-]{11}$/.test(data.videoId)){mount(data.videoId);}
      else {
        desiredId='';videoId='';
        if(player){player.destroy();player=null;const target=document.createElement('div');target.id='player';document.body.prepend(target);}
        notice('Waiting for your PS5 broadcast','Start broadcasting to YouTube from PS5, then save that broadcast link in Stream Setup.');sound.hidden=true;
      }
    }catch{if(!player)notice('Connecting to SpaceMountain…','Your gameplay input will reconnect when the service is available.');}
    finally{busy=false;}
  }
  if(!/^[a-z0-9_]{3,25}$/.test(tenant)){notice('Account missing','Open the gameplay link from your own Stream Setup.');return;}
  refresh();setInterval(refresh,5000);
})();
