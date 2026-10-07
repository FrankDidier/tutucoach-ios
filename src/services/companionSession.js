// 陪练开口循环。规则在服务端：先问一句、按段落说一句、错了马上说、离开时带情绪。
import {NativeModules} from 'react-native';
import {chat, forgetCompanionProfile, planCompanion, refineTarot} from './companionChat';
import {fetchScore} from './score';
import {setCompanionTarot} from './companionTarot';
import {isSpeaking} from './voice';

const Ear = NativeModules.TutuRecorder || null;

const PROFILE_FIELDS = {
  name: /名|叫|称呼/,
  gender: /男[\s\S]*女|女[\s\S]*男/,
  age: /岁|多大|年纪|年龄/,
  likes: /喜欢|爱|玩|兴趣|干|做/,
};

function bigrams(text) {
  const t = String(text || '').replace(/[\s，。！？、!?,.…~～：:；;「」"'（）()]/g, '');
  const out = [];
  for (let i = 0; i < t.length - 1; i += 1) out.push(t.slice(i, i + 2));
  return out;
}

// 麦里听回来的自己的话常错一两个字（按→爱）。按两字片段重合来认。
function soundsLike(heard, said) {
  const h = bigrams(heard);
  const s = new Set(bigrams(said));
  if (h.length < 3 || !s.size) return false;
  const hit = h.filter(g => s.has(g)).length;
  return hit >= 3 && hit >= 0.6 * h.length;
}

// 人设改写的那句要能直接念：去掉括号旁白，最多两句。问身份时必须还是在问这件事，否则用原意。
function fitLine(plan, text) {
  let t = String(text || '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[「」“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  const m = t.match(/^(?:[^。！？!?]*[。！？!?]){1,2}/);
  if (m) t = m[0].trim();
  if (t.length > 56) return '';
  if (/按你的年纪|好好记住你|我记下了/.test(t)) return '';
  const rule = PROFILE_FIELDS[plan.field];
  if (plan.intent === 'ask' && rule) {
    if (!/[？?]|吗|呢/.test(t) || !rule.test(t)) return '';
  }
  return t;
}

function firstLine(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.split(/[。！？!?]/)[0].trim();
}

// 至少两个汉字才算学生在说话。琴声和房间噪声经常被认成一个字母，不能拿来停掉练琴判断。
function spokenWords(text) {
  const chars = String(text || '').match(/[\u4e00-\u9fff]/g);
  return !!(chars && chars.length >= 2);
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

  // 最近念出去的几句。聊天回复、提醒也由屏幕念，都要算进来，不然麦里听回来会当成学生在说话。
  let recentSpoken = [];
  const noteSpoken = text => {
    const t = String(text || '').trim();
    if (!t) return;
    recentSpoken = recentSpoken.concat(t).slice(-4);
    const ms = Math.max(2500, t.length * 220) + 1600;
    speakingUntil = Math.max(speakingUntil, Date.now() + ms);
  };
  const heardOwn = heard =>
    echoes(lastSpokenText, heard) || recentSpoken.some(s => echoes(s, heard));

  const echoes = (said, heard) => {
    const a = String(said || '').replace(/\s/g, '');
    const b = String(heard || '').replace(/\s/g, '');
    if (a.length < 2 || b.length < 2) return false;
    if (b.includes(a)) return true;
    // 问句里带了「女孩」这类短词。学生真的回答这两个字时，不要当成自己的回声。
    if (b.length < 4) return false;
    return a.includes(b) || soundsLike(b, a);
  };

  // 等角色把这句真正念完。声音要先从网上拉，按字数估的时间常常不够，麦就把自己录进去了。
  const waitVoiceDone = async () => {
    const until = Date.now() + 20000;
    while (!stopped && Date.now() < until) {
      if (Date.now() < speakingUntil) {
        await new Promise(r => setTimeout(r, Math.min(600, speakingUntil - Date.now() + 50)));
        continue;
      }
      if (await isSpeaking()) {
        speakingUntil = Date.now() + 700;
        continue;
      }
      break;
    }
    await new Promise(r => setTimeout(r, 700));
  };

  const rememberSpeak = text => {
    // 自己的声音还会在麦里留一会儿。这段时间记成安静，避免把刚说的话当成琴声。
    speakingUntil = Date.now() + Math.max(2500, String(text || '').length * 220) + 1600;
    const t = String(text || '').trim();
    if (t) recentSpoken = recentSpoken.concat(t).slice(-4);
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
    const personal = plan.intent === 'ask' || plan.intent === 'ack' || plan.intent === 'fix';
    // 问身份、接住回答时让角色用自己的口吻说，多等一会儿；练琴中的短接话不能拖。
    speakingUntil = Date.now() + (personal ? 5000 : 2400);
    try {
      spoken = await Promise.race([
        chat(
          host.coachId(),
          host.studentName(),
          host.history(),
          'line',
          '',
          plan.instruction,
          host.studentId ? host.studentId() : '',
        ).then(r => (r && r.text) || ''),
        new Promise(resolve => setTimeout(() => resolve(''), personal ? 4500 : 2200)),
      ]);
    } catch (e) {
      spoken = '';
    }
    if (stopped || (host.isPaused && host.isPaused())) return;
    const line = fitLine(plan, spoken) || plan.say;
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
    if (Date.now() < speakingUntil || Date.now() < voiceUntil || (await isSpeaking())) {
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

  const resumeListen = () => {
    const next = listenAgainPlan;
    listenAgainPlan = null;
    if (stopped) return;
    if (next) listenLoop(next);
    else setTimeout(voiceWatch, 300);
  };

  const listenLoop = async plan => {
    if (stopped || !plan || !plan.wait || !Ear || !Ear.listenOnce) return;
    if (listening) {
      listenAgainPlan = plan;
      return;
    }
    listening = true;
    try {
      for (let tries = 0; tries < 3 && !stopped; tries += 1) {
        await waitVoiceDone();
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
      resumeListen();
    }
  };

  // 没有问题时也听。听到人说话就把这段响度清掉，别把聊天当成弹琴。
  const voiceWatch = async () => {
    if (stopped || !Ear || !Ear.listenOnce) return;
    if (listening || awaitingField) {
      setTimeout(voiceWatch, 700);
      return;
    }
    if (Date.now() < speakingUntil) {
      setTimeout(voiceWatch, Math.max(400, speakingUntil - Date.now() + 400));
      return;
    }
    if (await isSpeaking()) {
      setTimeout(voiceWatch, 600);
      return;
    }
    listening = true;
    let text = '';
    try {
      const heard = await Ear.listenOnce();
      text = ((heard && heard.text) || '').trim();
    } catch (e) {
      text = '';
    } finally {
      listening = false;
    }
    if (stopped) return;
    if (text && (heardOwn(text) || spokenWords(text))) {
      if (heardOwn(text)) markVoice();
      else if (awaitingField) await takeHeard(text);
      else if (host.onHeard) {
        markVoice();
        host.onHeard(text);
      }
    }
    resumeListen();
  };

  const markVoice = () => {
    voiceUntil = Date.now() + 20000;
    levels = [];
    silentSec += 2;
  };

  const takeHeard = async text => {
    markVoice();
    const ownLine = heardOwn(text);
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
      last_said: lastSpokenText,
      sections: sections.map(s => s.line),
      globals,
      had_playing: hadPlaying,
      silent_sec: 0,
      roll: Math.random(),
    });
  };

  const speakPlan = async plan => {
    if (!plan || !plan.intent || plan.intent === 'none') return null;
    await say(plan);
    if (plan.wait) listenLoop(plan);
    return plan;
  };

  // 聊天里顺口纠正：我不叫杨同 / 叫我小桐 / 忘了我吧。服务端认出来就由这一轮接话，不再走闲聊。
  const said = async text => {
    if (!host.studentId) return null;
    const plan = await planCompanion({
      student_id: host.studentId(),
      event: 'said',
      text,
      last_said: lastSpokenText,
      roll: Math.random(),
    });
    if (!plan || !plan.intent || plan.intent === 'none') return null;
    return speakPlan(plan);
  };

  // 打字回答问题：和听到的回答走同一条路，没听懂就接着等，不再把同一个问题念一遍。
  const answerTyped = async text => {
    const field = awaitingField;
    const plan = await noteAnswer(text);
    if (plan && plan.hold) {
      awaitingField = plan.field || field || 'section_ok';
      return plan;
    }
    return speakPlan(plan);
  };

  const forget = async () => {
    if (!host.studentId) return null;
    awaitingField = '';
    const plan = await forgetCompanionProfile(host.studentId());
    return speakPlan(plan);
  };

  return {
    start() {
      stopped = false;
      loadPiece(host.pieceName()).then(() => tick('open'));
      if (timer) clearInterval(timer);
      timer = setInterval(() => tick('tick'), 4000);
      setTimeout(voiceWatch, 1200);
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
    noteSpoken,
    said,
    answerTyped,
    forget,
    recentVoice: () => Date.now() < voiceUntil,
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
