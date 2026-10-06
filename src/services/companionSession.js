// 陪练开口循环。规则在服务端：先问一句、按段落说一句、错了马上说、离开时带情绪。
import {NativeModules} from 'react-native';
import {chat, planCompanion, refineTarot} from './companionChat';
import {fetchScore} from './score';
import {setCompanionTarot} from './companionTarot';

const Ear = NativeModules.TutuRecorder || null;

function firstLine(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.split(/[。！？!?]/)[0].trim();
}

export function createCompanionSession(host) {
  let timer = null;
  let stopped = false;
  let levels = [];
  let silentSec = 0;
  let hadPlaying = false;
  let sections = [];
  let globals = [];
  let piece = '';
  let speakingUntil = 0;
  let busyCount = 0;
  let tarotOn = false;
  let inBackground = false;
  let lastSpokenText = '';
  let voiceUntil = 0;
  let awaitingField = '';
  let listening = false;
  let listenAgainPlan = null;

  const echoes = (said, heard) => {
    const a = String(said || '').replace(/\s/g, '');
    const b = String(heard || '').replace(/\s/g, '');
    if (a.length < 2 || b.length < 2) return false;
    if (b.includes(a)) return true;
    // 问句里带了「女孩」这类短词。学生真的回答这两个字时，不要当成自己的回声。
    if (b.length < 4) return false;
    return a.includes(b);
  };

  const rememberSpeak = text => {
    // 自己的声音还会在麦里留一会儿。这段时间记成安静，避免把刚说的话当成琴声。
    speakingUntil = Date.now() + Math.max(2500, String(text || '').length * 220) + 1600;
  };

  const say = async plan => {
    if (stopped || !plan || !plan.intent || plan.intent === 'none' || !plan.say) return;
    if (plan.tarot && tarotOn) {
      const box = sections[plan.section] || null;
      setCompanionTarot({
        piece,
        page: box ? box.page : 0,
        y: box ? box.y : 0,
        name: plan.tarot.name,
        line: plan.tarot.line,
      });
      if (host.onTarot) host.onTarot(plan.tarot);
      const label = box ? box.line : '';
      if (label) {
        refineTarot(label).then(card => {
          if (stopped || !card) return;
          setCompanionTarot({
            piece,
            page: box ? box.page : 0,
            y: box ? box.y : 0,
            name: card.name || plan.tarot.name,
            line: card.line || plan.tarot.line,
          });
        });
      }
    }
    awaitingField = plan.wait && plan.field ? plan.field : '';
    if (plan.verbatim || !plan.instruction) {
      lastSpokenText = plan.say;
      rememberSpeak(plan.say);
      host.speak(plan.say, true);
      return;
    }
    let spoken = '';
    try {
      spoken = await Promise.race([
        chat(host.coachId(), host.studentName(), host.history(), 'proactive', '', plan.instruction)
          .then(r => (r && r.text) || ''),
        new Promise(resolve => setTimeout(() => resolve(''), 2200)),
      ]);
    } catch (e) {
      spoken = '';
    }
    if (stopped || (host.isPaused && host.isPaused())) return;
    const line = spoken || plan.say;
    lastSpokenText = line;
    rememberSpeak(line);
    host.speak(line, true);
    if (host.pushAssistant) host.pushAssistant(line);
  };

  const loadPiece = async name => {
    piece = name || '';
    sections = [];
    globals = host.globalLines ? host.globalLines() : [];
    if (!piece || !host.studentId) return;
    try {
      const score = await fetchScore(host.studentId(), piece);
      const manifest = (score && (score.manifest || score)) || {};
      const boxes = (manifest.confirmed_annotations || manifest.annotations || []).slice();
      boxes.sort((a, b) => (a.page || 0) - (b.page || 0) || (a.y || 0) - (b.y || 0));
      sections = boxes
        .map(b => ({
          line: firstLine(b.label || b.text || ''),
          page: b.page || 0,
          y: b.y || 0,
        }))
        .filter(b => b.line);
    } catch (e) {}
    if (!sections.length) {
      sections = (globals || []).map(line => ({line, page: 0, y: 0}));
    }
  };

  const sample = async () => {
    if (!Ear || !Ear.readLevel) return;
    // 刚说完话，或者学生刚开口，麦里是人声，不是琴。
    if (Date.now() < speakingUntil || Date.now() < voiceUntil) {
      levels = levels.concat(0).slice(-6);
      silentSec += 2;
      return;
    }
    try {
      const lv = await Ear.readLevel();
      const rms = Number(lv && lv.rms) || 0;
      levels = levels.concat(rms).slice(-6);
      if (rms >= 0.08) {
        hadPlaying = true;
        silentSec = 0;
      } else {
        silentSec += 2;
      }
    } catch (e) {}
  };

  const tick = async event => {
    if (stopped) return;
    const urgent = event === 'background' || event === 'done';
    // 上一句还没说完，不要再要下一句，也不要开麦。
    if (!urgent && Date.now() < speakingUntil) return;
    if (!urgent && busyCount > 0) return;
    if (host.isTyping && host.isTyping() && !urgent) return;
    if (inBackground && event === 'tick') return;
    if (!urgent && host.isPaused && host.isPaused()) return;
    busyCount += 1;
    try {
      if (event === 'tick') await sample();
      const plan = await planCompanion({
        student_id: host.studentId(),
        piece: piece || host.pieceName(),
        event,
        levels,
        sections: sections.map(s => s.line),
        globals,
        had_playing: hadPlaying,
        silent_sec: silentSec,
        background: event === 'background',
        roll: Math.random(),
      });
      if (plan && plan.profile) tarotOn = !!plan.profile.tarot_on;
      await say(plan || null);
      const follow = plan;
      if (follow && follow.wait) {
        listenLoop(follow);
      } else if (event === 'tick' && awaitingField && !listening) {
        listenLoop({wait: true});
      }
    } finally {
      busyCount = Math.max(0, busyCount - 1);
    }
  };

  const listenLoop = async plan => {
    if (listening || stopped || !plan || !plan.wait || !Ear || !Ear.listenOnce) return;
    listening = true;
    try {
      for (let tries = 0; tries < 3 && !stopped; tries += 1) {
        const waitMs = tries === 0 ? Math.max(0, speakingUntil - Date.now()) + 600 : 500;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        if (stopped) return;
        let text = '';
        try {
          const heard = await Ear.listenOnce();
          text = ((heard && heard.text) || '').trim();
        } catch (e) {
          text = '';
        }
        if (text) {
          await takeHeard(text);
          return;
        }
      }
    } finally {
      listening = false;
      const next = listenAgainPlan;
      listenAgainPlan = null;
      if (next && !stopped) listenLoop(next);
    }
  };

  const markVoice = () => {
    voiceUntil = Date.now() + 14000;
    levels = [];
    silentSec += 2;
  };

  const takeHeard = async text => {
    markVoice();
    const ownLine = echoes(lastSpokenText, text);
    const profile = !!awaitingField;
    const keepListening = () => {
      if (listening) listenAgainPlan = {wait: true};
      else listenLoop({wait: true});
    };
    // 麦里又听到了刚问的那句，或者琴声被认成了一句废话。问题留着，继续听。
    if (ownLine) {
      if (profile) keepListening();
      return;
    }
    if (!profile) {
      if (host.onHeard) host.onHeard(text);
      return;
    }
    const plan = await noteAnswer(text);
    if (plan && plan.hold) {
      awaitingField = plan.field || 'section_ok';
      keepListening();
      return;
    }
    if (host.onHeard) host.onHeard(text, {profile: true});
    await say(plan || null);
    if (plan && plan.wait) {
      if (listening) listenAgainPlan = plan;
      else listenLoop(plan);
    }
  };

  const noteAnswer = text => {
    awaitingField = '';
    return planCompanion({
      student_id: host.studentId(),
      piece: piece || host.pieceName(),
      event: 'answer',
      answer: text,
      sections: sections.map(s => s.line),
      globals,
      had_playing: hadPlaying,
      silent_sec: 0,
      roll: Math.random(),
    });
  };

  return {
    start() {
      stopped = false;
      loadPiece(host.pieceName()).then(() => tick('open'));
      if (timer) clearInterval(timer);
      timer = setInterval(() => tick('tick'), 4000);
    },
    async setPiece(name) {
      await loadPiece(name);
    },
    onBackground() {
      inBackground = true;
      tick('background');
    },
    onForeground() {
      inBackground = false;
    },
    finish() {
      if (timer) clearInterval(timer);
      timer = null;
      stopped = false;
      tick('done').finally(() => {
        stopped = true;
      });
    },
    noteAnswer,
    markVoice,
    lastSpoken: () => lastSpokenText,
    awaiting: () => awaitingField,
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      try {
        if (Ear && Ear.stopMeter) Ear.stopMeter();
      } catch (e) {}
    },
  };
}
