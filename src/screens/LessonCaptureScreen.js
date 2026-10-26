// 上课录音：先点学生；上课时老师说「现在开始下一首」或点「下一首」切曲子；
// 下课整理成重点，老师改好、选好曲目再挂到学生的曲目重点。
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  AppState,
  ActivityIndicator,
  NativeModules,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {speak, isSpeaking, setKeepAwake, setScreenDim} from '../services/voice';
import {getJson, setJson} from '../services/storage';
import {listStudents} from '../services/students';
import {fetchScore} from '../services/score';
import {readingSections} from '../utils/sections';
import {
  startLesson,
  pushLessonChunk,
  confirmLesson,
  fetchLessonStudents,
  fetchLessonSession,
  summarizeLesson,
} from '../services/companionChat';

const Ear = NativeModules.TutuRecorder || null;
const OPEN_KEY = 'lesson_capture_open';
// 系统识别一轮最长一分钟，留点余量。
const LISTEN_SEC = 50;
const MID_SUMMARY_MS = 5 * 60 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function clock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function LessonCaptureScreen({navigation}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [phase, setPhase] = useState('pick');
  const [students, setStudents] = useState(null);
  const [filter, setFilter] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState('');
  const [resumable, setResumable] = useState(null);
  const [student, setStudent] = useState(null);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [segments, setSegments] = useState([]);
  const [pieceFor, setPieceFor] = useState({});
  const [newPieceOpen, setNewPieceOpen] = useState(false);
  const [edits, setEdits] = useState({});
  const [skip, setSkip] = useState({});
  const [fullText, setFullText] = useState(null);
  const [openText, setOpenText] = useState({});
  const [netBad, setNetBad] = useState(false);
  const [gapNote, setGapNote] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [nextPending, setNextPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  // targets: { `${segIdx}:${pointIdx}`: {target:'global'|'section', seg:n} }
  const [targets, setTargets] = useState({});
  // piece name -> [1,2,3...] 分段号
  const [pieceSegs, setPieceSegs] = useState({});

  const mounted = useRef(true);
  const live = useRef(false);
  const loopDone = useRef(null);
  const queue = useRef([]);
  const seq = useRef(0);
  const draining = useRef(false);
  const wantNext = useRef(false);
  const sessionRef = useRef('');
  const studentRef = useRef(null);
  const pieceRef = useRef({});
  const lastSummary = useRef(0);
  const midRunning = useRef(false);
  const bgAt = useRef(0);

  useEffect(() => {
    pieceRef.current = pieceFor;
  }, [pieceFor]);

  const undim = () => {
    setDimmed(false);
    setScreenDim(false);
  };

  const dimOn = () => {
    setDimmed(true);
    setScreenDim(true);
  };

  useEffect(() => {
    return () => {
      setScreenDim(false);
      setKeepAwake(false);
    };
  }, []);

  const loadPieceSections = async pieceName => {
    const name = (pieceName || '').trim();
    const sid = studentRef.current && studentRef.current.id;
    if (!name || !sid || pieceSegs[name]) return;
    try {
      const r = await fetchScore(sid, name, getDeviceId(), 'teacher');
      const marks = readingSections(r?.manifest?.annotations || r?.annotations || []);
      const nums = marks.map(m => m.n).filter(n => n >= 1);
      setPieceSegs(prev => ({...prev, [name]: nums}));
    } catch (e) {
      setPieceSegs(prev => ({...prev, [name]: []}));
    }
  };

  const persist = () => {
    if (!sessionRef.current) return;
    setJson(OPEN_KEY, {
      sessionId: sessionRef.current,
      student: studentRef.current,
      seq: seq.current,
      pieces: pieceRef.current,
      queue: queue.current,
      at: Date.now(),
    });
  };

  const clearOpen = () => setJson(OPEN_KEY, null);

  // ---------- 选学生 ----------
  useEffect(() => {
    mounted.current = true;
    (async () => {
      const [server, local] = await Promise.all([
        fetchLessonStudents(getDeviceId()),
        listStudents().catch(() => []),
      ]);
      const byId = new Map();
      (server || []).forEach(s => byId.set(s.id, {...s, pieces: s.pieces || []}));
      (local || []).forEach(s => {
        const id = (s && s.studentId ? String(s.studentId) : '').trim();
        if (!id) return;
        const name = (s.name || '').trim();
        const had = byId.get(id);
        if (had) {
          if (!had.name && name) had.name = name;
        } else {
          byId.set(id, {id, name, pieces: []});
        }
      });
      if (mounted.current) setStudents(Array.from(byId.values()));
      const saved = await getJson(OPEN_KEY, null);
      if (saved && saved.sessionId) {
        const s = await fetchLessonSession(saved.sessionId);
        if (s && s.status === 'open' && mounted.current) {
          setResumable({...saved, server: s});
        } else if (!s || s.status !== 'open') {
          clearOpen();
        }
      }
    })();
    return () => {
      mounted.current = false;
      live.current = false;
      setKeepAwake(false);
      try {
        Ear && Ear.cancelListen && Ear.cancelListen();
      } catch (e) {}
    };
  }, []);

  const shownStudents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = students || [];
    if (!q) return list;
    return list.filter(
      s => (s.name || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [students, filter]);

  const nameOf = s => (s && (s.name || '').trim()) || (s ? '学生 ' + s.id.slice(-6) : '');

  // ---------- 上课 ----------
  useEffect(() => {
    if (!listening) return undefined;
    const t = setInterval(() => setElapsed(v => v + 1), 1000);
    return () => clearInterval(t);
  }, [listening]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (!live.current) return;
      if (st === 'active') {
        setKeepAwake(true);
        if (bgAt.current) {
          const gap = Math.round((Date.now() - bgAt.current) / 1000);
          bgAt.current = 0;
          if (gap >= 8) {
            setGapNote(
              `刚才离开了本页 ${gap >= 60 ? Math.round(gap / 60) + ' 分钟' : gap + ' 秒'}，这段时间没有记上。上课时请停在本页，屏幕会保持常亮。`,
            );
          }
        }
      } else if (st === 'background') {
        bgAt.current = bgAt.current || Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  const applySegments = segs => {
    if (!Array.isArray(segs) || !mounted.current) return;
    setSegments(segs);
  };

  const maybeMidSummary = () => {
    if (midRunning.current || Date.now() - lastSummary.current < MID_SUMMARY_MS) return;
    midRunning.current = true;
    lastSummary.current = Date.now();
    summarizeLesson(sessionRef.current, false)
      .then(resp => {
        if (resp && resp.segments && live.current) applySegments(resp.segments);
      })
      .finally(() => {
        midRunning.current = false;
      });
  };

  const drain = async () => {
    if (draining.current) return;
    draining.current = true;
    while (queue.current.length && mounted.current) {
      const item = queue.current[0];
      const resp = await pushLessonChunk(sessionRef.current, item.text, item.seq, item.next);
      if (!resp) {
        setNetBad(true);
        await sleep(3000);
        continue;
      }
      queue.current.shift();
      setNetBad(false);
      applySegments(resp.segments);
      if (item.next) setNextPending(false);
      persist();
    }
    draining.current = false;
    if (live.current) maybeMidSummary();
  };

  const enqueue = (text, next) => {
    queue.current.push({text: text || '', next: !!next, seq: seq.current++});
    persist();
    drain();
  };

  const loop = async () => {
    while (live.current) {
      if (wantNext.current) {
        wantNext.current = false;
        enqueue('', true);
      }
      let res = null;
      const t0 = Date.now();
      try {
        res = Ear.listenFor ? await Ear.listenFor(LISTEN_SEC) : await Ear.listenOnce();
      } catch (e) {
        res = null;
      }
      const quick = Date.now() - t0 < 1500;
      if (res && res.denied) {
        live.current = false;
        setListening(false);
        setKeepAwake(false);
        Alert.alert('需要麦克风和语音识别权限', '请到「设置 → 兔教练」里打开麦克风和语音识别，再回来点「继续听」。');
        break;
      }
      const text = ((res && res.text) || '').trim();
      const next = wantNext.current;
      wantNext.current = false;
      if (text || next) enqueue(text, next);
      if (!text && (!res || res.busy || quick)) await sleep(1000);
    }
  };

  const startListening = () => {
    if (!Ear || !(Ear.listenFor || Ear.listenOnce)) {
      Alert.alert('这台手机还不能边听边记', '请更新到最新版兔教练后再试。');
      return;
    }
    if (live.current) return;
    live.current = true;
    setListening(true);
    setKeepAwake(true);
    setGapNote('');
    loopDone.current = loop();
  };

  const waitOpening = async say => {
    const est = Math.min(14000, say.length * 230);
    const t0 = Date.now();
    let sawBusy = false;
    await sleep(700);
    while (Date.now() - t0 < 16000) {
      const busy = await isSpeaking();
      if (busy) sawBusy = true;
      if (!busy && Date.now() - t0 >= (sawBusy ? 1000 : est)) break;
      await sleep(300);
    }
  };

  const begin = async stu => {
    if (starting) return;
    setStarting(true);
    const started = await startLesson(getDeviceId(), stu.id, stu.name || '');
    if (!started) {
      setStarting(false);
      Alert.alert('没能开始', '网络不好，过一会儿再试。');
      return;
    }
    const pieces = Array.from(new Set([...(started.pieces || []), ...(stu.pieces || [])]));
    const who = {id: stu.id, name: stu.name || '', pieces};
    studentRef.current = who;
    sessionRef.current = started.session_id;
    seq.current = 0;
    queue.current = [];
    lastSummary.current = Date.now();
    setStudent(who);
    setSegments([{idx: 0, piece: '', points: [], chars: 0, text: ''}]);
    setPieceFor({});
    setElapsed(0);
    setPhase('live');
    persist();
    setKeepAwake(true);
    if (started.say) {
      try {
        speak(started.say, {lang: 'zh'});
      } catch (e) {}
      // 念完再开麦，不然开场这句会被当成老师说的话记下来。
      await waitOpening(started.say);
    }
    setStarting(false);
    if (mounted.current) startListening();
  };

  const resume = async saved => {
    const s = await fetchLessonSession(saved.sessionId);
    if (!s) {
      Alert.alert('网络不好', '过一会儿再点「接着这节课」。');
      return;
    }
    setResumable(null);
    if (s.status !== 'open') {
      clearOpen();
      Alert.alert('这节课已经结束了');
      return;
    }
    const who = saved.student || {id: s.student_id, name: s.student_name, pieces: []};
    studentRef.current = who;
    sessionRef.current = saved.sessionId;
    seq.current = Math.max(Number(saved.seq) || 0, (Number(s.last_seq) || -1) + 1);
    queue.current = (saved.queue || []).filter(q => q.seq > (Number(s.last_seq) || -1));
    setStudent(who);
    setSegments(s.segments || []);
    setPieceFor(saved.pieces || {});
    setPhase('live');
    if (queue.current.length) drain();
  };

  const pause = () => {
    live.current = false;
    setListening(false);
    undim();
    setKeepAwake(false);
    try {
      Ear && Ear.talkEnd && Ear.talkEnd();
    } catch (e) {}
  };

  const pressNext = () => {
    if (!sessionRef.current) return;
    setNextPending(true);
    if (live.current) {
      wantNext.current = true;
      // 把正在听的这一轮马上收尾，这一轮的话算上一首的。
      try {
        Ear && Ear.talkEnd && Ear.talkEnd();
      } catch (e) {}
    } else {
      enqueue('', true);
    }
  };

  const loadFullText = async () => {
    const s = await fetchLessonSession(sessionRef.current);
    if (!s || !mounted.current) return;
    const map = {};
    (s.segments || []).forEach(g => {
      map[g.idx] = g.text || '';
    });
    setFullText(map);
  };

  const runSummary = async () => {
    setSummarizing(true);
    setSummaryFailed(false);
    while (midRunning.current) await sleep(500);
    const resp = await summarizeLesson(sessionRef.current, true);
    if (!mounted.current) return;
    setSummarizing(false);
    if (!resp) {
      setSummaryFailed(true);
      return;
    }
    applySegments(resp.segments);
    const nextEdits = {};
    const nextTargets = {};
    (resp.segments || []).forEach(g => {
      const pts = (g.points || []).map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean);
      nextEdits[g.idx] = pts;
      pts.forEach((_, j) => {
        nextTargets[`${g.idx}:${j}`] = {target: 'global', seg: 0};
      });
      if (g.piece) loadPieceSections(g.piece);
    });
    setEdits(prev => ({...nextEdits, ...prev}));
    setTargets(prev => ({...nextTargets, ...prev}));
    setPieceFor(prev => {
      const out = {...prev};
      (resp.segments || []).forEach(g => {
        if (!out[g.idx] && g.piece) out[g.idx] = g.piece;
      });
      return out;
    });
  };

  const finishLesson = async () => {
    pause();
    setPhase('review');
    setSummarizing(true);
    if (loopDone.current) {
      await Promise.race([loopDone.current, sleep(6000)]);
    }
    const t0 = Date.now();
    while ((queue.current.length || draining.current) && Date.now() - t0 < 30000) {
      await sleep(400);
    }
    await runSummary();
  };

  const askFinish = () => {
    Alert.alert('下课了吗？', '会把这节课说的话整理成每首曲子的重点，你看过、改好再挂给学生。', [
      {text: '还没', style: 'cancel'},
      {text: '下课，整理重点', onPress: finishLesson},
    ]);
  };

  const leave = () => {
    if (phase === 'live' || phase === 'review') {
      Alert.alert('先离开？', '这节课会留着，下次进来可以接着录或者整理。', [
        {text: '留在这里', style: 'cancel'},
        {
          text: '离开',
          onPress: () => {
            pause();
            persist();
            navigation.goBack();
          },
        },
      ]);
      return;
    }
    navigation.goBack();
  };

  // ---------- 确认 ----------
  const pickPiece = (idx, name) => {
    setPieceFor(prev => ({...prev, [idx]: name}));
    loadPieceSections(name);
  };

  const reviewSegs = segments.filter(
    g => (g.chars || 0) > 0 || (g.points || []).length || (edits[g.idx] || []).length,
  );

  const setPointTarget = (segIdx, pointIdx, target, seg = 0) => {
    setTargets(prev => ({
      ...prev,
      [`${segIdx}:${pointIdx}`]: {target, seg: target === 'section' ? seg : 0},
    }));
  };

  const confirm = async () => {
    const body = [];
    for (const g of reviewSegs) {
      if (skip[g.idx]) continue;
      const raw = (edits[g.idx] || g.points || []).map(p => String(p || '').trim());
      const points = [];
      raw.forEach((text, j) => {
        if (!text) return;
        const t = targets[`${g.idx}:${j}`] || {target: 'global', seg: 0};
        points.push({
          text,
          target: t.target === 'section' ? 'section' : 'global',
          seg: t.target === 'section' ? t.seg || 0 : 0,
        });
      });
      if (!points.length) continue;
      const piece = (pieceFor[g.idx] || g.piece || '').trim();
      if (!piece) {
        Alert.alert('还没选曲目', `第 ${reviewSegs.indexOf(g) + 1} 首还没选是哪首曲子。`);
        return;
      }
      body.push({idx: g.idx, piece, points});
    }
    if (!body.length) {
      Alert.alert('没有可以挂的重点', '这节课没有整理出重点。可以手动加几条，或者直接离开。');
      return;
    }
    setSaving(true);
    const resp = await confirmLesson(
      sessionRef.current,
      getDeviceId(),
      studentRef.current.id,
      body,
      studentRef.current.name || '',
    );
    setSaving(false);
    if (!resp) {
      Alert.alert('没能挂上', '网络不好，再点一次确认。');
      return;
    }
    clearOpen();
    const lines = (resp.pieces || []).map(p => `《${p.name}》${(p.lines || []).length} 条`).join('\n');
    const secN = resp.section_writes || 0;
    Alert.alert(
      '已挂到曲目重点',
      `${nameOf(studentRef.current)}：\n${lines || '（本课只挂了分段重点）'}${
        secN ? `\n另有 ${secN} 处写进了谱面分段重点。` : ''
      }\n\n学生可在「练琴 → 课堂重点历史」里看到；通用重点也会进陪练。`,
      [{text: '好', onPress: () => navigation.goBack()}],
    );
  };

  // ---------- 画面 ----------
  const current = segments.length ? segments[segments.length - 1] : null;
  const curIdx = current ? current.idx : 0;
  const curPiece = pieceFor[curIdx] || (current && current.piece) || '';
  const pieces = (student && student.pieces) || [];

  const pieceChips = (idx, chosen) => (
    <View style={styles.chipWrap}>
      {pieces.map(p => (
        <TouchableOpacity
          key={p}
          style={[styles.chip, chosen === p && styles.chipOn]}
          onPress={() => pickPiece(idx, p)}>
          <Text style={[styles.chipText, chosen === p && styles.chipTextOn]}>{p}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderPick = () => (
    <>
      {resumable ? (
        <View style={[styles.card, styles.warnCard]}>
          <Text style={styles.cardTitle}>
            {nameOf(resumable.student)} 的课还没确认
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.flex]} onPress={() => resume(resumable)}>
              <Text style={styles.btnText}>接着这节课</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnGhost, styles.flex]}
              onPress={() => {
                setResumable(null);
                clearOpen();
              }}>
              <Text style={styles.btnGhostText}>不要了</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <Text style={styles.title}>这节课是谁？点名字就开始</Text>
      {students && students.length > 8 ? (
        <TextInput
          style={styles.input}
          value={filter}
          onChangeText={setFilter}
          placeholder="搜名字"
          placeholderTextColor={colors.textSecondary}
        />
      ) : null}
      {students == null ? (
        <ActivityIndicator color={colors.primary} style={styles.spin} />
      ) : (
        <View style={styles.chipWrap}>
          {shownStudents.map(s => (
            <TouchableOpacity
              key={s.id}
              style={styles.stuChip}
              disabled={starting}
              onPress={() => begin(s)}>
              <Text style={styles.stuName}>{nameOf(s)}</Text>
              <Text style={styles.stuSub}>
                {s.pieces && s.pieces.length ? `${s.pieces.length} 首曲目` : '还没有曲目'}
              </Text>
            </TouchableOpacity>
          ))}
          {!shownStudents.length ? (
            <Text style={styles.hint}>还没有学生。可以在「学生信息录入」或「陪练提示设置」里先添加。</Text>
          ) : null}
        </View>
      )}
      {starting ? <ActivityIndicator color={colors.primary} style={styles.spin} /> : null}
      <TouchableOpacity onPress={() => setManualOpen(v => !v)}>
        <Text style={styles.link}>{manualOpen ? '收起' : '名单里没有？用学生码'}</Text>
      </TouchableOpacity>
      {manualOpen ? (
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={manualId}
            onChangeText={setManualId}
            placeholder="学生码"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.btnSmall}
            onPress={() => {
              const id = manualId.trim();
              if (!id) return;
              const known = (students || []).find(s => s.id === id);
              begin(known || {id, name: '', pieces: []});
            }}>
            <Text style={styles.btnText}>开始</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.hint}>
        上课时把手机放在琴边、停在本页。可点「关屏省电」几乎熄屏省电（识别不停），点屏幕即可亮回。换曲子时说「现在开始下一首」，或点「下一首」。下课点「下课，整理重点」，每条可选挂到通用重点或谱面分段重点。
      </Text>
    </>
  );

  const renderLive = () => (
    <>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>{nameOf(student)}</Text>
          <Text style={[styles.status, listening ? styles.statusOn : null]}>
            {listening ? `● 正在听 ${clock(elapsed)}` : starting ? '准备中…' : '已暂停'}
          </Text>
        </View>
        {netBad ? <Text style={styles.warn}>网络不稳，说的话先存在手机上，连上后自动补传。</Text> : null}
        {gapNote ? <Text style={styles.warn}>{gapNote}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          第 {segments.length || 1} 首：{curPiece || '还没选曲目'}
        </Text>
        {pieceChips(curIdx, curPiece)}
        {newPieceOpen ? (
          <TextInput
            style={styles.input}
            value={pieces.includes(curPiece) ? '' : curPiece}
            onChangeText={t => pickPiece(curIdx, t)}
            placeholder="新曲目的名字"
            placeholderTextColor={colors.textSecondary}
          />
        ) : (
          <TouchableOpacity onPress={() => setNewPieceOpen(true)}>
            <Text style={styles.link}>＋ 新曲目</Text>
          </TouchableOpacity>
        )}
        {current && (current.points || []).length ? (
          (current.points || []).map((p, i) => (
            <Text key={i} style={styles.point}>
              · {p}
            </Text>
          ))
        ) : null}
        <Text style={styles.heard} numberOfLines={3}>
          {current && current.chars
            ? `已记下 ${current.chars} 字：…${(current.text || '').slice(-60)}`
            : '还没听到这首的内容'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.nextBtn, nextPending && styles.btnDim]}
        disabled={nextPending}
        onPress={() => {
          pressNext();
          setNewPieceOpen(false);
        }}>
        <Text style={styles.nextText}>{nextPending ? '正在切到下一首…' : '下一首 ▶'}</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        {listening ? (
          <TouchableOpacity style={[styles.btnGhost, styles.flex]} onPress={pause}>
            <Text style={styles.btnGhostText}>暂停</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btnGhost, styles.flex]}
            disabled={starting}
            onPress={startListening}>
            <Text style={styles.btnGhostText}>继续听</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.btnGhost, styles.flex]}
          onPress={() => (dimmed ? undim() : dimOn())}>
          <Text style={styles.btnGhostText}>{dimmed ? '亮屏' : '关屏省电'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.flex]} disabled={starting} onPress={askFinish}>
          <Text style={styles.btnText}>下课，整理重点</Text>
        </TouchableOpacity>
      </View>
      {dimmed ? (
        <Text style={styles.warn}>已关屏省电（识别仍在跑）。点屏幕任意处，或点「亮屏」恢复亮度。</Text>
      ) : (
        <Text style={styles.hint}>可点「关屏省电」几乎熄屏省电，点屏幕即可亮回；识别不会停。</Text>
      )}

      {segments.length > 1 ? (
        <View style={styles.card}>
          <Text style={styles.cardSub}>这节课已经上过</Text>
          {segments.slice(0, -1).map((g, i) => (
            <Text key={g.idx} style={styles.point}>
              第 {i + 1} 首 {pieceFor[g.idx] || g.piece || '（未选曲目）'} · {g.chars || 0} 字
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );

  const renderReview = () => {
    if (summarizing) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.hint}>正在把这节课整理成重点，长的课要几十秒…</Text>
        </View>
      );
    }
    return (
      <>
        {summaryFailed ? (
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.warn}>整理没成功（网络不好）。可以重试，也可以自己加几条再挂。</Text>
            <TouchableOpacity style={styles.btn} onPress={runSummary}>
              <Text style={styles.btnText}>重新整理</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Text style={styles.title}>{nameOf(student)} · 这节课的重点</Text>
        <Text style={styles.hint}>
          选好曲目，每条重点选挂到「通用重点」或「第N段」谱面分段重点。分段建议会出现在谱面编辑里原有快捷语下面。
        </Text>
        {reviewSegs.map((g, i) => {
          const chosen = pieceFor[g.idx] || g.piece || '';
          const pts = edits[g.idx] || g.points || [];
          const off = !!skip[g.idx];
          const segs = pieceSegs[chosen] || [];
          return (
            <View key={g.idx} style={[styles.card, off && styles.cardOff]}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>
                  第 {i + 1} 首：{chosen || '还没选曲目'}
                </Text>
                <TouchableOpacity onPress={() => setSkip(prev => ({...prev, [g.idx]: !off}))}>
                  <Text style={styles.link}>{off ? '要挂' : '这首不挂'}</Text>
                </TouchableOpacity>
              </View>
              {!off ? (
                <>
                  {pieceChips(g.idx, chosen)}
                  <TextInput
                    style={styles.input}
                    value={pieces.includes(chosen) ? '' : chosen}
                    onChangeText={t => pickPiece(g.idx, t)}
                    placeholder="或者写新曲目的名字"
                    placeholderTextColor={colors.textSecondary}
                  />
                  {pts.map((p, j) => {
                    const tg = targets[`${g.idx}:${j}`] || {target: 'global', seg: 0};
                    return (
                      <View key={j} style={{marginBottom: 10}}>
                        <View style={styles.row}>
                          <TextInput
                            style={[styles.input, styles.flex]}
                            value={p}
                            multiline
                            onChangeText={t =>
                              setEdits(prev => {
                                const arr = (prev[g.idx] || g.points || []).slice();
                                arr[j] = t;
                                return {...prev, [g.idx]: arr};
                              })
                            }
                          />
                          <TouchableOpacity
                            style={styles.del}
                            onPress={() =>
                              setEdits(prev => {
                                const arr = (prev[g.idx] || g.points || []).slice();
                                arr.splice(j, 1);
                                return {...prev, [g.idx]: arr};
                              })
                            }>
                            <Text style={styles.delText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.chipWrap}>
                          <TouchableOpacity
                            style={[styles.chip, tg.target === 'global' && styles.chipOn]}
                            onPress={() => setPointTarget(g.idx, j, 'global')}>
                            <Text style={[styles.chipText, tg.target === 'global' && styles.chipTextOn]}>
                              通用重点
                            </Text>
                          </TouchableOpacity>
                          {segs.map(n => (
                            <TouchableOpacity
                              key={n}
                              style={[
                                styles.chip,
                                tg.target === 'section' && tg.seg === n && styles.chipOn,
                              ]}
                              onPress={() => setPointTarget(g.idx, j, 'section', n)}>
                              <Text
                                style={[
                                  styles.chipText,
                                  tg.target === 'section' && tg.seg === n && styles.chipTextOn,
                                ]}>
                                第{n}段
                              </Text>
                            </TouchableOpacity>
                          ))}
                          {!segs.length ? (
                            <Text style={styles.hint}>该曲还没有分段；可先只挂通用，或去谱面编辑加段。</Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {!pts.length ? <Text style={styles.hint}>这首没整理出重点。</Text> : null}
                  <View style={styles.rowBetween}>
                    <TouchableOpacity
                      onPress={() => {
                        const arr = [...(edits[g.idx] || g.points || []), ''];
                        setEdits(prev => ({...prev, [g.idx]: arr}));
                        setPointTarget(g.idx, arr.length - 1, 'global');
                      }}>
                      <Text style={styles.link}>＋ 加一条</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (!fullText) loadFullText();
                        setOpenText(prev => ({...prev, [g.idx]: !prev[g.idx]}));
                      }}>
                      <Text style={styles.link}>{openText[g.idx] ? '收起原话' : `看原话（${g.chars || 0} 字）`}</Text>
                    </TouchableOpacity>
                  </View>
                  {openText[g.idx] ? (
                    <Text style={styles.heard}>{fullText ? fullText[g.idx] || '' : '加载中…'}</Text>
                  ) : null}
                </>
              ) : null}
            </View>
          );
        })}
        {!reviewSegs.length ? (
          <Text style={styles.hint}>
            这节课没有记到老师说的话。下次请停在本页；可点「关屏省电」省电，不要真正锁屏。
          </Text>
        ) : null}
        <TouchableOpacity style={[styles.btn, saving && styles.btnDim]} disabled={saving} onPress={confirm}>
          <Text style={styles.btnText}>{saving ? '正在挂…' : '确认并挂到曲目'}</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="上课录音" onBack={leave} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {phase === 'pick' ? renderPick() : phase === 'live' ? renderLive() : renderReview()}
        </ScrollView>
      </KeyboardAvoidingView>
      {dimmed && phase === 'live' ? (
        <TouchableOpacity style={styles.dimMask} activeOpacity={1} onPress={undim}>
          <Text style={styles.dimText}>点一下恢复亮度{"\n"}识别仍在继续</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  const line = colors.cardBorder || colors.divider || '#ddd';
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.bg},
    body: {padding: 16, paddingBottom: 48},
    title: {color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 10},
    hint: {color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginVertical: 8},
    link: {color: colors.primary, fontSize: 14, fontWeight: '600', paddingVertical: 8},
    input: {
      borderWidth: 1,
      borderColor: line,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.textPrimary,
      backgroundColor: colors.inputBg || 'transparent',
      marginBottom: 8,
      fontSize: 15,
    },
    row: {flexDirection: 'row', alignItems: 'center', gap: 10},
    rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    flex: {flex: 1},
    spin: {marginVertical: 16},
    center: {alignItems: 'center', paddingVertical: 60},
    chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6},
    chip: {
      borderWidth: 1,
      borderColor: line,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipOn: {backgroundColor: colors.primary, borderColor: colors.primary},
    chipText: {color: colors.textPrimary, fontSize: 14},
    chipTextOn: {color: '#fff', fontWeight: '700'},
    stuChip: {
      backgroundColor: colors.card || '#fff',
      borderWidth: 1,
      borderColor: line,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minWidth: 96,
    },
    stuName: {color: colors.textPrimary, fontSize: 16, fontWeight: '700'},
    stuSub: {color: colors.textSecondary, fontSize: 12, marginTop: 2},
    card: {
      backgroundColor: colors.card || '#fff',
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    cardOff: {opacity: 0.5},
    warnCard: {borderWidth: 1, borderColor: colors.orangeAccent || '#FF9A56'},
    cardTitle: {color: colors.textPrimary, fontSize: 16, fontWeight: '700', flexShrink: 1},
    cardSub: {color: colors.textSecondary, fontSize: 13, marginBottom: 4},
    status: {color: colors.textSecondary, fontSize: 13},
    statusOn: {color: colors.danger || '#FF5A7F', fontWeight: '700'},
    warn: {color: colors.orangeAccent || '#FF9A56', fontSize: 13, lineHeight: 19, marginTop: 6},
    point: {color: colors.textPrimary, fontSize: 15, lineHeight: 21, marginTop: 4},
    heard: {color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8},
    nextBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 20,
      alignItems: 'center',
      marginBottom: 12,
    },
    nextText: {color: '#fff', fontSize: 20, fontWeight: '800'},
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginBottom: 12,
    },
    btnSmall: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    btnDim: {opacity: 0.6},
    dimMask: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 50,
    },
    dimText: {color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', lineHeight: 28, opacity: 0.85},
    btnText: {color: '#fff', fontWeight: '700', fontSize: 15},
    btnGhost: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    btnGhostText: {color: colors.primary, fontWeight: '700', fontSize: 15},
    del: {paddingHorizontal: 8, paddingVertical: 8, marginBottom: 8},
    delText: {color: colors.textSecondary, fontSize: 16},
  });
}
