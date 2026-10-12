"use strict";
var SpmtMicrophone = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ops/mobile-voice-spmt-20261012/browser/microphone-recognition.ts
  var microphone_recognition_exports = {};
  __export(microphone_recognition_exports, {
    MicrophoneRecognition: () => MicrophoneRecognition,
    getSpeechRecognitionConstructor: () => getSpeechRecognitionConstructor
  });

  // ops/mobile-voice-spmt-20261012/browser/microphone-capture.ts
  var MIC_SAMPLE_RATE = 16e3;
  var MIC_MAX_SECONDS = 15;
  function encodeMonoWav(samples, sampleRate = MIC_SAMPLE_RATE) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, buffer.byteLength - 8, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((value, i) => {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    });
    return new Blob([buffer], { type: "audio/wav" });
  }
  function microphoneError(error) {
    const e = error;
    if (["NotAllowedError", "SecurityError"].includes(e?.name || "")) return "Microphone permission is blocked. Allow Microphone for this site, then tap again.";
    if (e?.name === "NotFoundError") return "No microphone was found on this device.";
    if (e?.name === "NotReadableError") return "The microphone is busy. Close the other microphone session and try again.";
    return e?.message || "The microphone could not start.";
  }
  function captureMicrophone(options = {}) {
    let stream;
    let context;
    let source;
    let processor;
    let sink;
    let timer;
    let ended = false;
    let requestedStop = false;
    let sampleCount = 0;
    let heardSound = false;
    let lastSoundAt = 0;
    const chunks = [];
    let resolve;
    let reject;
    const finished = new Promise((done, fail2) => {
      resolve = done;
      reject = fail2;
    });
    const cleanup = () => {
      clearTimeout(timer);
      if (processor) processor.onaudioprocess = null;
      try {
        source?.disconnect();
        processor?.disconnect();
        sink?.disconnect();
      } catch {
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => {
      });
    };
    const fail = (error) => {
      if (ended) return;
      ended = true;
      cleanup();
      reject(new Error(microphoneError(error)));
    };
    const stop = () => {
      if (ended) return;
      if (!stream || !processor) {
        requestedStop = true;
        return;
      }
      ended = true;
      cleanup();
      if (!heardSound || sampleCount < MIC_SAMPLE_RATE / 4) {
        reject(new Error("No microphone speech was captured. Speak after the microphone is ready, then tap Finish."));
        return;
      }
      const samples = new Float32Array(sampleCount);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(encodeMonoWav(samples));
    };
    const cancel = () => {
      if (ended) return;
      ended = true;
      cleanup();
      reject(new Error("Microphone capture cancelled."));
    };
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture needs a secure browser page. Open this page in Chrome or Safari.");
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("This browser cannot record microphone audio. Open this page in Chrome or Safari.");
      context = new Context();
      const resume = context.resume();
      void navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(async (acquired) => {
        stream = acquired;
        if (ended) {
          cleanup();
          return;
        }
        await resume;
        if (ended) {
          cleanup();
          return;
        }
        if (requestedStop) {
          cancel();
          return;
        }
        source = context.createMediaStreamSource(acquired);
        processor = context.createScriptProcessor(4096, 1, 1);
        sink = context.createGain();
        sink.gain.value = 0;
        const maxSamples = MIC_SAMPLE_RATE * Math.min(MIC_MAX_SECONDS, Math.max(1, options.maxSeconds || MIC_MAX_SECONDS));
        processor.onaudioprocess = (event) => {
          if (ended) return;
          const input = event.inputBuffer.getChannelData(0);
          let energy = 0;
          for (const value of input) energy += value * value;
          const level = Math.sqrt(energy / input.length);
          options.level?.(level);
          if (level > 8e-3) {
            heardSound = true;
            lastSoundAt = Date.now();
          }
          const ratio = context.sampleRate / MIC_SAMPLE_RATE;
          const count = Math.min(Math.floor(input.length / ratio), maxSamples - sampleCount);
          const output = new Float32Array(count);
          for (let i = 0; i < count; i++) {
            const from = Math.floor(i * ratio), to = Math.min(input.length, Math.floor((i + 1) * ratio));
            let sum = 0;
            for (let j = from; j < to; j++) sum += input[j];
            output[i] = sum / Math.max(1, to - from);
          }
          chunks.push(output);
          sampleCount += count;
          if (sampleCount >= maxSamples || heardSound && Number(options.silenceTimeoutMs) > 0 && Date.now() - lastSoundAt >= Number(options.silenceTimeoutMs)) stop();
        };
        source.connect(processor);
        processor.connect(sink);
        sink.connect(context.destination);
        timer = setTimeout(stop, Math.min(MIC_MAX_SECONDS, Math.max(1, options.maxSeconds || MIC_MAX_SECONDS)) * 1e3);
        options.ready?.();
      }).catch(fail);
      void resume.catch(fail);
    } catch (error) {
      fail(error);
    }
    return { stop, cancel, finished };
  }
  async function microphoneBlobToBase64(blob) {
    if (!blob.size || blob.size > 512e3) throw new Error("Microphone clip is empty or exceeds the 15-second limit.");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read microphone recording."));
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(blob);
    });
  }

  // ops/mobile-voice-spmt-20261012/browser/microphone-recognition.ts
  var MicrophoneRecognition = class {
    continuous = false;
    interimResults = false;
    lang = "en-US";
    silenceTimeoutMs = 0;
    microphoneOnly = true;
    onstart = null;
    onprocessing = null;
    onresult = null;
    onerror = null;
    onend = null;
    capture = null;
    aborted = false;
    busy = false;
    request = null;
    start() {
      if (this.busy) throw new Error("Microphone recording is already in progress.");
      this.busy = true;
      this.aborted = false;
      this.capture = captureMicrophone({
        silenceTimeoutMs: this.silenceTimeoutMs,
        ready: () => {
          if (!this.aborted) this.onstart?.();
        }
      });
      void this.capture.finished.then(async (blob) => {
        if (this.aborted) return;
        this.onprocessing?.();
        const base64Audio = await microphoneBlobToBase64(blob);
        if (this.aborted) return;
        this.request = new AbortController();
        const timer = setTimeout(() => this.request?.abort(), 25e3);
        let response;
        try {
          response = await fetch("/api/commlink/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64Audio, freeOnly: true }),
            signal: this.request.signal
          });
        } finally {
          clearTimeout(timer);
        }
        const body = await response.json().catch(() => ({}));
        const data = body.data || body;
        if (!response.ok || data.error) throw new Error(data.error || body.error || "Microphone transcription is unavailable. Try again shortly or type your message.");
        const transcript = String(data.transcription || "").trim();
        if (!transcript) throw new Error("No spoken words were found in the microphone recording. Try again or type your message.");
        if (this.aborted) return;
        const result = [{ transcript, confidence: 1 }];
        result.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [result] });
      }).catch((error) => {
        if (!this.aborted) this.onerror?.({ error: "microphone-capture", message: error instanceof Error ? error.message : String(error) });
      }).finally(() => {
        this.capture = null;
        this.request = null;
        this.busy = false;
        if (!this.aborted) this.onend?.();
      });
    }
    stop() {
      this.capture?.stop();
    }
    abort() {
      this.aborted = true;
      this.request?.abort();
      this.capture?.cancel();
    }
  };
  function getSpeechRecognitionConstructor() {
    if (typeof window === "undefined") return null;
    const native = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent);
    return mobile || !native ? MicrophoneRecognition : native;
  }
  return __toCommonJS(microphone_recognition_exports);
})();
