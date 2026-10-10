// 陪练开口循环。规则在服务端：先问一句、按段落说一句、错了马上说、离开时带情绪。
import {NativeModules} from 'react-native';
import {chat, forgetCompanionProfile, planCompanion, refineTarot} from './companionChat';
import {fetchScore} from './score';
import {setCompanionTarot} from './companionTarot';
import {isSpeaking} from './voice';
import {cnNum, readingSections} from '../utils/sections';

const Ear = NativeModules.TutuRecorder || null;

const PROFILE_FIELDS = {
  name: /名|叫|称呼/,
  gender: /男[\s\S]*女|女[\s\S]*男/,
  age: /岁|多大|年纪|年龄/,
  likes: /喜欢|爱|玩|兴趣|干|做/,
  mode: /分段[\s\S]*整首|整首[\s\S]*分段/,
};

// 这些是角色自己发挥的话（打招呼、哄回来、开场、道别），可以多说一点。
const FREE_INTENTS = /^(?:leave|nudge|start|review|bye|ack)$/;

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
  const free = FREE_INTENTS.test(plan.intent || '') || plan.intent === 'ask';
  const whole = t;
  const m = t.match(free ? /^(?:[^。！？!?]*[。！？!?]){1,3}/ : /^(?:[^。！？!?]*[。！？!?]){1,2}/);
  if (m) t = m[0].trim();
  // 角色先接了两三句话再问，截短时问句不能丢。
  if (plan.intent === 'ask' && !/[？?]/.test(t)) {
    const q = whole.match(/[^。！？!?]*[？?]/g);
    const first = whole.match(/^[^。！？!?]*[。！？!?]/);
    if (q && q.length) t = ((first && !/[？?]$/.test(first[0]) ? first[0] : '') + q[q.length - 1]).trim();
  }
  if (t.length > (free || plan.intent === 'ask' ? 80 : 56)) return '';
  if (/按你的年纪|好好记住你|我记下了/.test(t)) return '';
  // 改写把参考句原样说了两遍（「A：A」），不能念出来。
  if (/([\u4e00-\u9fff，]{6,}).*\1/.test(t)) return '';
  const rule = PROFILE_FIELDS[plan.field];
  if (plan.intent === 'ask' && rule) {
    if (!/[？?]|吗|呢/.test(t) || !rule.test(t)) return '';
  }
  // 「」里是老师写的段落名，改写时丢了就不知道今天从哪弹了。
  const named = String(plan.say || '').match(/「[^」]+」/g) || [];
  if (named.some(q => !t.includes(q.slice(1, -1)))) return '';
  return t;
}

export function createCompanionSession(host) {
  let timer = null;
  let stopped = false;
  let levels = [];
  let silentSec = 0;
  let quietAt = 0;
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
  let boxed = false;
  let ended = false;
  // 按住说话、键盘弹起时把麦让出来：系统听写和我们同时开麦会让 App 闪退。
  const earHolds = new Set();
  const earHeld = () => earHolds.size > 0;

  // 最近念出去的几句。聊天回复、提醒也由屏幕念，都要算进来，不然麦里听回来会当成学生在说话。
  let recentSpoken = [];
  // 角色一开口就把正在听的那一轮关掉。聊天回复常在麦已经打开之后才到，会被录成学生的话。
  const closeEar = () => {
    if (Ear && Ear.cancelListen) Ear.cancelListen().catch(() => {});
  };
  const noteSpoken = text => {
    const t = String(text || '').trim();
    if (!t) return;
    closeEar();
    recentSpoken = recentSpoken.concat(t).slice(-4);
    const ms = Math.max(2500, t.length * 220) + 1600;
    speakingUntil = Math.max(speakingUntil, Date.now() + ms);
  };
  const heardOwn = heard => {
    // 「老师说先分段练」和问句「先分段练还是整首弹」字面很像，只挑了一边就是学生在回答。
    if (awaitingField === 'mode' && /分段|整首|一段|整个|从头/.test(heard)
        && !PROFILE_FIELDS.mode.test(heard)) return false;
    // 回答常照着问句的词说（「我最喜欢弹琴」对「你最喜欢干啥」），等回答时只把问句里原样的一截当回声。
    const strict = !!awaitingField;
    if (echoes(lastSpokenText, heard, strict) || recentSpoken.some(s => echoes(s, heard, strict))) return true;
    // 在等回答时，「女生」「九岁」这种短回答常和问句里的词一样，仍算学生的回答。
    if (awaitingField) return false;
    // 刚说完话时麦里漏进来的两三个字（「听到的」「那我」），是自己那句的碎片。
    const b = String(heard || '').replace(/[\s，。！？、!?,.…~～]/g, '');
    if (b.length < 2 || b.length >= 4 || Date.now() > speakingUntil + 8000) return false;
    return recentSpoken
      .concat(lastSpokenText)
      .some(s => String(s || '').replace(/[\s，。！？、!?,.…~～]/g, '').includes(b));
  };

  const echoes = (said, heard, strict) => {
    const a = String(said || '').replace(/\s/g, '');
    const b = String(heard || '').replace(/\s/g, '');
    if (a.length < 2 || b.length < 2) return false;
    if (b.includes(a)) return true;
    // 问句里带了「女孩」这类短词。学生真的回答这两个字时，不要当成自己的回声。
    if (b.length < 4) return false;
    return a.includes(b) || (!strict && soundsLike(b, a));
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
    closeEar();
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
    // 念重点这类不等回答的话，不能把还没答的「这段练得怎么样」清掉。
    if (plan.wait && plan.field) awaitingField = plan.field;
    else if (plan.profile && typeof plan.profile.pending_field === 'string') {
      awaitingField = plan.profile.pending_field;
    }
    if (plan.verbatim || !plan.instruction) {
      lastSpokenText = plan.say;
      rememberSpeak(plan.say);
      host.speak(plan.say, true);
      return;
    }
    let spoken = '';
    const personal = plan.intent === 'ask' || plan.intent === 'fix' || FREE_INTENTS.test(plan.intent);
    // 问身份、接住回答时让角色用自己的口吻说，多等一会儿；练琴中的短接话不能拖。
    speakingUntil = Date.now() + (personal ? 5000 : 2400);
    closeEar();
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
    boxed = false;
    globals = host.globalLines ? host.globalLines() : [];
    if (!piece || !host.studentId) return;
    try {
      const score = await fetchScore(host.studentId(), piece);
      const manifest = (score && (score.manifest || score)) || {};
      sections = readingSections(manifest.confirmed_annotations || manifest.annotations || []).map(s => ({
        line: s.line,
        page: s.head.page || 0,
        y: s.head.y || 0,
      }));
      boxed = sections.length > 0;
    } catch (e) {}
    if (!sections.length) {
      sections = (globals || []).map(line => ({line, page: 0, y: 0}));
    }
  };

  const sample = async () => {
    if (!Ear || !Ear.readLevel || earHeld()) return;
    // 刚说完话，或者学生刚开口，麦里是人声，不是琴。
    // 有人在说话就说明人还在，这段时间不算「没动静」，不然会说「一声不吭就走了」。
    if (Date.now() < speakingUntil || Date.now() < voiceUntil || (await isSpeaking())) {
      levels = levels.concat(0).slice(-6);
      return;
    }
    try {
      const lv = await Ear.readLevel();
      const rms = Number(lv && lv.rms) || 0;
      levels = levels.concat(rms).slice(-6);
      // 按真实过去的秒数算没动静多久；角色自己说话那几秒最多算一个间隔。
      const at = Date.now();
      const gap = quietAt ? Math.min(5, Math.max(0, (at - quietAt) / 1000)) : 4;
      quietAt = at;
      if (rms >= 0.08) {
        hadPlaying = true;
        silentSec = 0;
      } else {
        silentSec += gap;
      }
    } catch (e) {}
  };

  const tick = async event => {
    if (stopped) return;
    const urgent = event === 'background' || event === 'done' || event === 'timeup';
    // 上一句还没说完，不要再要下一句，也不要开麦。
    if (!urgent && Date.now() < speakingUntil) return;
    if (!urgent && busyCount > 0) return;
    if (host.isTyping && host.isTyping() && !urgent) return;
    if (!urgent && earHeld()) return;
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
        boxed,
        freq_sec: host.freqSec ? host.freqSec() : 45,
        had_playing: hadPlaying,
        silent_sec: Math.round(silentSec),
        background: event === 'background',
        roll: Math.random(),
      });
      if (stopped) return;
      if (plan && plan.profile) tarotOn = !!plan.profile.tarot_on;
      // 服务端把没回答的问题放下了（他开始弹琴或一直没出声），这边也别再等回答。
      if (event === 'tick' && plan && plan.profile && plan.profile.pending_field === ''
          && !plan.wait && awaitingField) {
        awaitingField = '';
      }
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
  };

  // 只在角色刚问了一句、等回答时自己开麦。没问的时候不听，房间里的杂音不会变成聊天。
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
        if (stopped || earHeld() || !awaitingField) return;
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

  const markVoice = () => {
    voiceUntil = Date.now() + 20000;
    levels = [];
    silentSec = 0;
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
    // 问题已经放下了：自己听到的话不发到聊天里，想聊就按住说或打字。
    if (!profile) return;
    const asked = awaitingField;
    const plan = await noteAnswer(text, {auto: true});
    if (!plan) {
      awaitingField = asked;
      return;
    }
    if (plan.hold) {
      awaitingField = plan.field || asked || 'section_ok';
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

  const noteAnswer = (text, extra) => {
    const field = awaitingField;
    awaitingField = '';
    return planCompanion({
      student_id: host.studentId(),
      piece: piece || host.pieceName(),
      event: 'answer',
      answer: text,
      field,
      ...(extra || {}),
      last_said: lastSpokenText,
      sections: sections.map(s => s.line),
      globals,
      boxed,
      freq_sec: host.freqSec ? host.freqSec() : 45,
      had_playing: hadPlaying,
      silent_sec: 0,
      roll: Math.random(),
    });
  };

  // 老师的重点，编好号，聊天时交给角色照着说。
  const numberedPoints = () => {
    if (boxed && sections.length) {
      return sections
        .map((s, i) => `第${cnNum(i + 1)}段：${s.line}`)
        .concat((globals || []).map(g => `老师还说：${g}`))
        .slice(0, 8);
    }
    return (globals || []).map((g, i) => `第${cnNum(i + 1)}，${g}`).slice(0, 8);
  };

  // 他问「要注意什么」「重点是什么」：照老师的原话按编号说。
  const askPoints = async () => {
    if (!host.studentId) return null;
    const plan = await planCompanion({
      student_id: host.studentId(),
      piece: piece || host.pieceName(),
      event: 'points',
      sections: sections.map(s => s.line),
      globals,
      boxed,
      freq_sec: host.freqSec ? host.freqSec() : 45,
      roll: Math.random(),
    });
    if (!plan || !plan.intent || plan.intent === 'none') return null;
    return speakPlan(plan);
  };

  // 计时到了：道别，然后不再听琴、不再开口。
  const timeUp = async () => {
    if (stopped || ended) return;
    closeEar();
    await tick('timeup');
    ended = true;
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    try {
      if (Ear && Ear.stopMeter) Ear.stopMeter();
    } catch (e) {}
  };

  // 按住说话、键盘弹起：先把麦让出来。放开后如果还在等回答，接着听。
  const pauseEar = (reason, on) => {
    if (on) {
      earHolds.add(reason);
      closeEar();
      try {
        if (Ear && Ear.stopMeter) Ear.stopMeter();
      } catch (e) {}
      return;
    }
    earHolds.delete(reason);
    if (!earHeld() && awaitingField && !listening && !stopped) {
      setTimeout(() => listenLoop({wait: true}), 600);
    }
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

  // 打字或按住说的回答：和听到的回答走同一条路。
  // 「这段怎么样」没答成好了/再练，多半是在跟角色说别的事，返回 {chat:true} 交给聊天接，问题留着。
  const answerTyped = async text => {
    const field = awaitingField;
    const plan = await noteAnswer(text);
    if (!plan) {
      awaitingField = field;
      return null;
    }
    if (plan.hold) {
      awaitingField = plan.field || field || 'section_ok';
      return {chat: true};
    }
    return speakPlan(plan);
  };

  // 没被问，自己说「这段差不多了」「还没练好」。服务端认不出就返回空，交给闲聊。
  const volunteerSection = async text => {
    if (!host.studentId || awaitingField) return null;
    awaitingField = 'section_ok';
    const plan = await noteAnswer(text, {volunteer: true});
    if (!plan || plan.hold || !plan.intent || plan.intent === 'none') {
      awaitingField = '';
      return null;
    }
    return speakPlan(plan);
  };

  const forget = async () => {
    if (!host.studentId) return null;
    awaitingField = '';
    const plan = await forgetCompanionProfile(host.studentId());
    return speakPlan(plan);
  };

  const start = () => {
    stopped = false;
    loadPiece(host.pieceName()).then(() => tick('open'));
    if (timer) clearInterval(timer);
    timer = setInterval(() => tick('tick'), 4000);
  };

  return {
    start,
    // 时间到以后又选了一段时间：重新打招呼，接着练。
    restart() {
      if (!ended) return;
      ended = false;
      levels = [];
      silentSec = 0;
      hadPlaying = false;
      awaitingField = '';
      start();
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
      if (ended) {
        stopped = true;
        return;
      }
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
    volunteerSection,
    forget,
    askPoints,
    timeUp,
    pauseEar,
    numberedPoints,
    ended: () => ended,
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
