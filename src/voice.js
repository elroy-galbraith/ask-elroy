
/* =====================================================================
   Voice interaction — Web Speech API only: no new backend, no new
   secret, no new spend. Two independent pieces:
     STT  mic button -> SpeechRecognition -> one transcript -> ask()
     TTS  finished answer -> speechSynthesis, opt-in and off by default
   Chrome/Edge ship SpeechRecognition; Safari and Firefox mostly do not,
   so both buttons stay hidden (display:none in src/head.html) unless
   the constructor the browser actually needs is present — same
   graceful-degradation shape as the hybrid/lexical retrieval fallback:
   a working page either way, never an error state.
   ===================================================================== */

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
const VOICE_OUT_KEY = "askElroyVoiceOut";

const voice = {
  supported: { stt: !!SpeechRecognitionCtor, tts: "speechSynthesis" in window },
  listening: false,
  speakOn: false
};

// Answers carry citation markers ([1], [30, 41]) and the retrieval-only fallback
// hands over raw answer HTML — neither belongs in speech.
function stripForSpeech(text){
  return String(text)
    .replace(CITE_RE, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function setVoiceHint(text){
  const el = $("#voice-hint");
  if(el) el.textContent = text || "";
}

function stopSpeaking(){
  if(voice.supported.tts) speechSynthesis.cancel();
}

function speak(text){
  if(!voice.supported.tts || !voice.speakOn) return;
  const clean = stripForSpeech(text);
  if(!clean) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
}

function setSpeakOn(on){
  voice.speakOn = on;
  try{ localStorage.setItem(VOICE_OUT_KEY, on ? "1" : "0"); } catch {}
  const btn = $("#voice-btn"), icon = $("#voice-btn-icon");
  if(icon) icon.textContent = on ? "🔊" : "🔇";
  if(btn){
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Voice replies on — click to mute" : "Voice replies off — click to enable";
  }
  if(!on) stopSpeaking();
}

function initVoiceOut(){
  const btn = $("#voice-btn");
  if(!btn || !voice.supported.tts) return;
  btn.style.display = "";
  let saved = false;
  try{ saved = localStorage.getItem(VOICE_OUT_KEY) === "1"; } catch {}
  setSpeakOn(saved);
  btn.onclick = () => setSpeakOn(!voice.speakOn);
}

function initMic(){
  const btn = $("#mic-btn");
  if(!btn || !voice.supported.stt) return;
  btn.style.display = "";

  const rec = new SpeechRecognitionCtor();
  rec.lang = (navigator.language || "en-US");
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  const qEl = $("#q");

  function setListening(on){
    voice.listening = on;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("mic-live", on);
    setVoiceHint(on ? "listening…" : "");
  }

  rec.onresult = e => {
    let finalText = "", interim = "";
    for(let i = e.resultIndex; i < e.results.length; i++){
      const r = e.results[i];
      if(r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if(qEl) qEl.value = (finalText || interim).trim();
    if(finalText.trim()) rec.stop();
  };
  rec.onend = () => {
    setListening(false);
    const q = qEl ? qEl.value.trim() : "";
    if(q) ask(q);
  };
  rec.onerror = e => {
    setListening(false);
    setVoiceHint(e.error === "not-allowed" || e.error === "service-not-allowed"
      ? "microphone permission denied"
      : "voice input error: " + e.error);
  };

  btn.onclick = () => {
    if(voice.listening){ rec.stop(); return; }
    stopSpeaking();   // don't record over the agent's own reply
    if(qEl) qEl.value = "";
    setListening(true);
    try{ rec.start(); }
    catch(err){ setListening(false); setVoiceHint("could not start microphone"); }
  };
}

initMic();
initVoiceOut();

window.askElroy.voice = voice;
window.askElroy.speak = speak;
