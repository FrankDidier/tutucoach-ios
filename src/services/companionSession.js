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
  section_pick: /段/,
};

// 这些是角色自己发挥的话（打招呼、哄回来、开场、道别），可以多说一点。
const FREE_INTENTS = /^(?:leave|nudge|start|review|bye|ack|stay)$/;

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
  // 故事/复习可以更长；着急哄人时一口气两三个短句；普通问句保持短。
  let cap = 56;
  if (plan.intent === 'review') cap = 320;
  else if ((plan.pace || 1) > 1) cap = 110;
  else if (free || plan.intent === 'ask') cap = 96;
  // 故事允许多句
  if (plan.intent === 'review') {
    const long = whole.match(/^(?:[^。！？!?]*[。！？!?]){1,8}/);
    if (long) t = long[0].trim();
  }
  if (t.length > cap) return '';
  if (/按你的年纪|好好记住你|我记下了/.test(t)) return '';
  // 时间还没到，改写时不能顺嘴说了再见。
  if (plan.intent === 'stay' && /明天见|下次再|再见|拜拜|今天就到这|明天再/.test(t)) return '';
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
  let talkingUntil = 0;
  let awaitingField = '';
  let listening = false;
  let listenAgainPlan = null;
  let boxed = false;
  let ended = false;
  const timerLeft = () => Math.max(0, Math.round((host.timerLeftSec && host.timerLeftSec()) || 0));
  // 每个角色各自认识学生：问到哪、记住了什么，都按角色分开。
  const planCompanionTick = body => planCompanion({coach_id: host.coachId ? host.coachId() || '' : '', ...(body || {})});
  // 按住说话、键盘弹起时把麦让出来：系统听写和我们同时开麦会让 App 闪退。
  const earHolds = new Set();
  const earHeld = () => earHolds.size > 0;

  // 最近念出去的几句。聊天回复、提醒也由屏幕念，都要算进来，不然麦里听回来会当成学生在说话。
  let recentSpoken = [];
  // 开场那一拍被别的事挡住（正在说话、在打字）时，下一拍补上。
  let needOpen = false;
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

  // 问「先练哪一段」「分段还是整首」时，在输入框上面给几个能直接点的答案。
  let choicesFor = '';
  const showChoices = plan => {
    if (!host.onChoices) return;
    const list = plan && plan.wait && plan.field && Array.isArray(plan.choices) ? plan.choices.filter(Boolean) : [];
    if (list.length) {
      choicesFor = plan.field;
      host.onChoices(list.slice(0, 12));
    } else if (choicesFor && awaitingField !== choicesFor) {
      choicesFor = '';
      host.onChoices(null);
    }
  };
  const hideChoices = () => {
    if (!choicesFor || !host.onChoices) return;
    choicesFor = '';
    host.onChoices(null);
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
      const label = box && !boxed ? box.line : '';
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
    showChoices(plan);
    const pace = Number(plan.pace) || 1;
    if (plan.verbatim || !plan.instruction) {
      lastSpokenText = plan.say;
      rememberSpeak(plan.say);
      host.speak(plan.say, true, pace);
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
    host.speak(line, true, pace);
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
      // line 只交给服务器认出并进重点里的旧框字；陪练只说「第几段」，不念框上的字
      sections = readingSections(manifest.confirmed_annotations || manifest.annotations || []).map(s => ({
        line: s.line || `第${s.n}段`,
        note: s.note || '',
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
    // 角色自己正在说话，麦里是它的声音，不是琴。
    // 有人在说话就说明人还在，这段时间不算「没动静」，不然会说「一声不吭就走了」。
    if (Date.now() < speakingUntil || (await isSpeaking())) {
      levels = levels.concat(0).slice(-6);
      return;
    }
    try {
      const lv = await Ear.readLevel();
      const raw = Number(lv && lv.rms) || 0;
      // 原生层分辨了是不是琴声：说话、电视、角色自己的声音再响也不算在弹。
      const piano = lv && lv.tone !== undefined ? Number(lv.tone) > 0 : raw >= 0.08;
      // 刚说完「我再弹一遍」就弹起来了：马上算在弹，不再当成还在说话。
      if (piano) {
        voiceUntil = 0;
        talkingUntil = 0;
      } else if (Date.now() < voiceUntil) {
        levels = levels.concat(0).slice(-6);
        return;
      }
      const rms = piano ? Math.max(raw, 0.08) : 0;
      if (!piano && raw >= 0.08) talkingUntil = Date.now() + 10000;
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
    if (event === 'tick' && needOpen) event = 'open';
    const urgent = event === 'background' || event === 'done' || event === 'timeup';
    // 上一句还没说完，不要再要下一句，也不要开麦。
    if (!urgent && Date.now() < speakingUntil) return;
    if (!urgent && busyCount > 0) return;
    if (host.isTyping && host.isTyping() && !urgent) return;
    if (!urgent && earHeld()) return;
    if (inBackground && event === 'tick') return;
    if (!urgent && host.isPaused && host.isPaused()) return;
    busyCount += 1;
    if (event === 'open') needOpen = false;
    try {
      if (event === 'tick') await sample();
      const plan = await planCompanionTick({
        student_id: host.studentId(),
        piece: piece || host.pieceName(),
        event,
        levels,
        sections: sections.map(s => s.line),
        section_notes: sections.map(s => s.note || ''),
        recent_lines: recentSpoken.slice(-3),
        globals,
        boxed,
        freq_sec: host.freqSec ? host.freqSec() : 45,
        had_playing: hadPlaying,
        silent_sec: Math.round(silentSec),
        timer_left_sec: timerLeft(),
        talking: Date.now() < talkingUntil || Date.now() < voiceUntil,
        background: event === 'background',
        roll: Math.random(),
      });
      if (stopped) return;
      if (plan && plan.profile) tarotOn = !!plan.profile.tarot_on;
      // 服务端把没回答的问题放下了（他开始弹琴或一直没出声），这边也别再等回答。
      if (event === 'tick' && plan && plan.profile && plan.profile.pending_field === ''
          && !plan.wait && awaitingField) {
        awaitingField = '';
        hideChoices();
      }
      await say(plan || null);
      const follow = plan;
      // 正在弹琴就先别开说话识别，麦让给听琴；安静几秒再听回答。
      const pianoLately = levels.some(x => Number(x) >= 0.08);
      if (follow && follow.wait && !pianoLately && silentSec >= 6) {
        listenLoop(follow);
      } else if (event === 'tick' && awaitingField && !listening
          && !pianoLately && silentSec >= 6) {
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
    // 几秒就够：太长会把马上接着弹的琴声当成还在说话。
    voiceUntil = Date.now() + 5000;
    levels = [];
    silentSec = 0;
  };

  const takeHeard = async text => {
    const ownLine = heardOwn(text);
    const profile = !!awaitingField;
    const keepListening = () => {
      if (listening) listenAgainPlan = {wait: true};
      else listenLoop({wait: true});
    };
    // 自己的回声不能当成学生说话，不然会把角色刚说的话又接一遍。
    if (ownLine) {
      if (profile) keepListening();
      return;
    }
    markVoice();
    // 正听着的时候问题被放下了（等太久、他开始弹了）：麦是因为问他才开的，这句话是冲着角色说的，照样接话。
    if (!profile) {
      if (host.onHeard && text.replace(/[\s，。！？、,.!?]/g, '').length >= 2) {
        host.onHeard(text, {free: true});
      }
      return;
    }
    const asked = awaitingField;
    const plan = await noteAnswer(text, {auto: true});
    if (!plan) {
      awaitingField = asked;
      return;
    }
    if (plan.hold) {
      awaitingField = plan.field || asked || 'section_ok';
      // 问「这段练得怎么样」时他说的是别的事（问重点、说不想练、聊天）：照样接话，不能吞掉。
      if (asked === 'section_ok' && host.onHeard && text.replace(/[\s，。！？、,.!?]/g, '').length >= 2) {
        host.onHeard(text, {free: true});
        return;
      }
      keepListening();
      return;
    }
    if (host.onHeard) host.onHeard(text, {profile: true});
    if (plan && plan.intent === 'bye') {
      await speakPlan(plan);
      return;
    }
    await say(plan || null);
    if (plan && plan.wait) {
      if (listening) listenAgainPlan = plan;
      else listenLoop(plan);
    }
  };

  // 回答发出去到回来之前不让 tick 插进来，不然服务端可能刚好把问题放下，先说一句「没听清」。
  const noteAnswer = async (text, extra) => {
    const field = awaitingField;
    awaitingField = '';
    hideChoices();
    busyCount += 1;
    try {
      return await planAnswer(text, field, extra);
    } finally {
      busyCount = Math.max(0, busyCount - 1);
    }
  };

  const planAnswer = (text, field, extra) =>
    planCompanionTick({
      student_id: host.studentId(),
      piece: piece || host.pieceName(),
      event: 'answer',
      answer: text,
      field,
      ...(extra || {}),
      last_said: lastSpokenText,
      timer_left_sec: timerLeft(),
      sections: sections.map(s => s.line),
      section_notes: sections.map(s => s.note || ''),
      globals,
      boxed,
      freq_sec: host.freqSec ? host.freqSec() : 45,
      had_playing: hadPlaying,
      silent_sec: 0,
      roll: Math.random(),
    });

  // 老师的重点，编好号，聊天时交给角色照着说。老师在谱上给某一段写的重点排在前面。
  const numberedPoints = () => {
    const echoes = new Set(boxed ? sections.map(s => s.line) : []);
    const own = sections
      .map((s, i) => (s.note ? `第${cnNum(i + 1)}段：${s.note}` : ''))
      .filter(Boolean);
    return own
      .concat(
        (globals || [])
          .filter(g => !String(g).split(/[：:]/).some(p => echoes.has(p.trim())))
          .map((g, i) => `第${cnNum(i + 1)}，${g}`),
      )
      .slice(0, 8);
  };

  // 他问「要注意什么」「重点是什么」：照老师的原话按编号说。
  const askPoints = async () => {
    if (!host.studentId) return null;
    const plan = await planCompanionTick({
      student_id: host.studentId(),
      piece: piece || host.pieceName(),
      event: 'points',
      sections: sections.map(s => s.line),
      section_notes: sections.map(s => s.note || ''),
      globals,
      boxed,
      freq_sec: host.freqSec ? host.freqSec() : 45,
      roll: Math.random(),
    });
    if (!plan || !plan.intent || plan.intent === 'none') return null;
    return speakPlan(plan);
  };

  // 道别以后不再听琴、不再开口，重点也不再念。
  const endNow = () => {
    ended = true;
    stopped = true;
    awaitingField = '';
    hideChoices();
    if (timer) clearInterval(timer);
    timer = null;
    try {
      if (Ear && Ear.stopMeter) Ear.stopMeter();
    } catch (e) {}
  };

  // 计时到了：道别，然后停下。
  const timeUp = async () => {
    if (stopped || ended) return;
    closeEar();
    await tick('timeup');
    endNow();
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
    // 没定时间时他说不练了，角色道别以后就真的停下，不再念重点、不再哄。
    if (plan.intent === 'bye') {
      endNow();
      if (host.onEnded) host.onEnded();
      return plan;
    }
    if (plan.wait) listenLoop(plan);
    return plan;
  };

  // 他说「不练了」「明天再练」：定了时间就哄他坚持到点，没定时间就道别并停下。
  const wantsEnd = async text => {
    if (!host.studentId || ended) return null;
    const plan = await planCompanionTick({
      student_id: host.studentId(),
      event: 'said',
      text,
      typed: true,
      last_said: lastSpokenText,
      timer_left_sec: timerLeft(),
      roll: Math.random(),
    });
    if (!plan || !plan.intent || plan.intent === 'none') return null;
    return speakPlan(plan);
  };

  // 聊天里顺口纠正：我不叫杨同 / 叫我小桐 / 忘了我吧。服务端认出来就由这一轮接话，不再走闲聊。
  const said = async text => {
    if (!host.studentId) return null;
    const plan = await planCompanionTick({
      student_id: host.studentId(),
      piece: piece || host.pieceName(),
      event: 'said',
      text,
      sections: boxed ? sections.map(s => s.line) : [],
      typed: true,
      last_said: lastSpokenText,
      timer_left_sec: timerLeft(),
      roll: Math.random(),
    });
    if (!plan || !plan.intent || plan.intent === 'none') return null;
    return speakPlan(plan);
  };

  // 打字或按住说的回答：和听到的回答走同一条路。
  // 「这段怎么样」没答成好了/再练，多半是在跟角色说别的事，返回 {chat:true} 交给聊天接，问题留着。
  const answerTyped = async text => {
    const field = awaitingField;
    const plan = await noteAnswer(text, {typed: true});
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
    const plan = await forgetCompanionProfile(host.studentId(), host.coachId ? host.coachId() : '');
    return speakPlan(plan);
  };

  const start = () => {
    stopped = false;
    needOpen = true;
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
      awaitingField = '';
      hideChoices();
      await loadPiece(name);
      // 换曲后让服务端按新曲重出段落选项（分段练时）。
      return tick('piece_change');
    },
    // 换了角色：新角色有自己的记忆，重新开场（认识他、问练法），不接着上一个角色的话说。
    reopen() {
      awaitingField = '';
      hideChoices();
      recentSpoken = [];
      lastSpokenText = '';
      needOpen = true;
      tick('open');
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
    wantsEnd,
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
