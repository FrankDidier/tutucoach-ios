// 上课录音：先点学生；上课时老师说「现在开始下一首」或点「下一首」切曲子；
// 下课整理成重点，老师改好、选好曲目再挂到学生的曲目重点。
import {SafeAreaView as EdgeSafeArea} from 'react-native-safe-area-context';
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
  Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Images} from '../assets/images';
import {useTheme} from '../theme/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {getDeviceId} from '../services/device';
import {speak, isSpeaking, setKeepAwake, setScreenDim} from '../services/voice';
import {getItem, setItem, getJson, setJson} from '../services/storage';
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
  const {colors, mode: themeMode} = useTheme();
  const dark = themeMode === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);

  const [phase, setPhase] = useState('pick');
  const [students, setStudents] = useState(null);
  const [filter, setFilter] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState('');
  const [resumable, setResumable] = useState(null);
  const [selected, setSelected] = useState([]); // 挑学生阶段的多选
  const [student, setStudent] = useState(null); // 上课中主学生（首位）
  const [studentsInLesson, setStudentsInLesson] = useState([]); // 上课中全部学生
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
  const [scopeOpen, setScopeOpen] = useState({});

  const mounted = useRef(true);
  const live = useRef(false);
  const loopDone = useRef(null);
  const queue = useRef([]);
  const seq = useRef(0);
  const draining = useRef(false);
  const wantNext = useRef(false);
  const sessionRef = useRef('');
  const studentRef = useRef(null);
  const studentsRef = useRef([]);
  const pieceRef = useRef({});
  const lastSummary = useRef(0);
  const midRunning = useRef(false);
  const bgAt = useRef(0);

  // 界面核对用（仅当本地设置了 audit_capture_phase 才生效，正常用户不会有）
  useEffect(() => {
    (async () => {
      const v = await getItem('audit_capture_phase');
      if (!v) return;
      await setItem('audit_capture_phase', '');
      const st = {id: 'debug01', name: '卡贡CAGON', pieces: ['致爱丽丝']};
      setStudent(st);
      studentRef.current = st;
      setStudentsInLesson([st]);
      if (v === 'live' || v === 'liveon') {
        setSegments([{idx: 0, piece: '', points: [], chars: v === 'liveon' ? 86 : 0, text: ''}]);
        setElapsed(5);
        setListening(v === 'liveon');
        setPhase('live');
      } else if (v === 'review') {
        setSegments([
          {idx: 0, piece: '斯克里亚宾', points: ['左手分解和弦要轻', '右手主旋律突出'], chars: 120, text: ''},
        ]);
        setPhase('review');
      }
    })();
  }, []);

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
      students: studentsRef.current || [],
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

  const namesOf = list => {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return '';
    if (arr.length === 1) return nameOf(arr[0]);
    if (arr.length === 2) return `${nameOf(arr[0])}、${nameOf(arr[1])}`;
    return `${nameOf(arr[0])} 等 ${arr.length} 人`;
  };

  const toggleSelect = s => {
    if (!s || !s.id || starting) return;
    setSelected(prev => {
      const has = prev.some(x => x.id === s.id);
      if (has) return prev.filter(x => x.id !== s.id);
      return [...prev, {id: s.id, name: s.name || '', pieces: s.pieces || []}];
    });
  };

  const isSelected = id => selected.some(x => x.id === id);

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

  const begin = async list => {
    if (starting) return;
    const picks = (Array.isArray(list) ? list : list ? [list] : []).filter(s => s && s.id);
    if (!picks.length) {
      Alert.alert('请先选学生', '点名字勾选至少一位，再点「开始上课」。');
      return;
    }
    setStarting(true);
    const started = await startLesson(getDeviceId(), picks, picks[0].name || '');
    if (!started) {
      setStarting(false);
      Alert.alert('没能开始', '网络不好，过一会儿再试。');
      return;
    }
    const unionPieces = Array.from(
      new Set([
        ...(started.pieces || []),
        ...picks.flatMap(s => (Array.isArray(s.pieces) ? s.pieces : [])),
      ]),
    );
    const whoList = picks.map(s => ({
      id: s.id,
      name: s.name || '',
      pieces: Array.isArray(s.pieces) ? s.pieces : [],
    }));
    const who = {...whoList[0], pieces: unionPieces};
    studentRef.current = who;
    studentsRef.current = whoList;
    sessionRef.current = started.session_id;
    seq.current = 0;
    queue.current = [];
    lastSummary.current = Date.now();
    setStudent(who);
    setStudentsInLesson(whoList);
    setSelected([]);
    setSegments([{idx: 0, piece: '', points: [], chars: 0, text: ''}]);
    setPieceFor({});
    setElapsed(0);
    setPhase('live');
    persist();
    setKeepAwake(true);
    if (started.say) {
      try {
        // 与首页兔子同一声线：后端 home_rabbit → 预置「卡通猪小琪」
        speak(started.say, {lang: 'zh', coachId: 'home_rabbit'});
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
    const whoList =
      Array.isArray(saved.students) && saved.students.length
        ? saved.students
        : saved.student
          ? [saved.student]
          : [{id: s.student_id, name: s.student_name, pieces: []}];
    const who = saved.student || whoList[0] || {id: s.student_id, name: s.student_name, pieces: []};
    studentRef.current = who;
    studentsRef.current = whoList;
    sessionRef.current = saved.sessionId;
    seq.current = Math.max(Number(saved.seq) || 0, (Number(s.last_seq) || -1) + 1);
    queue.current = (saved.queue || []).filter(q => q.seq > (Number(s.last_seq) || -1));
    setStudent(who);
    setStudentsInLesson(whoList);
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
    const allStu =
      (studentsRef.current && studentsRef.current.length
        ? studentsRef.current
        : studentRef.current
          ? [studentRef.current]
          : []) || [];
    const resp = await confirmLesson(
      sessionRef.current,
      getDeviceId(),
      studentRef.current.id,
      body,
      studentRef.current.name || '',
      allStu,
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
      `${namesOf(allStu)}：\n${lines || '（本课只挂了分段重点）'}${
        secN ? `\n另有 ${secN} 处写进了谱面分段重点。` : ''
      }\n\n课堂反馈会同时出现在所选学生手里；通用重点也会进陪练。`,
      [{text: '好', onPress: () => navigation.goBack()}],
    );
  };

  // ---------- 画面 ----------
  const current = segments.length ? segments[segments.length - 1] : null;
  const curIdx = current ? current.idx : 0;
  const curPiece = pieceFor[curIdx] || (current && current.piece) || '';
  const pieces = (student && student.pieces) || [];
  const lessonPeople = studentsInLesson.length ? studentsInLesson : student ? [student] : [];

  useEffect(() => {
    if (phase === 'live' && curPiece) loadPieceSections(curPiece);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, curPiece]);

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

  const resumeNames = resumable
    ? namesOf(
        Array.isArray(resumable.students) && resumable.students.length
          ? resumable.students
          : resumable.student
            ? [resumable.student]
            : [],
      )
    : '';
  const codeQ = filter.trim();
  const codeIsNew =
    codeQ.length >= 4 && !(students || []).some(x => x.id === codeQ || nameOf(x) === codeQ) && !shownStudents.length;

  const addByCode = () => {
    const id = codeQ;
    if (!id) return;
    const known = (students || []).find(x => x.id === id);
    const stu = known || {id, name: '', pieces: []};
    if (!known) setStudents(prev => (prev ? [...prev, stu] : [stu]));
    if (!isSelected(id)) toggleSelect(stu);
    setFilter('');
  };

  const renderPick = () => (
    <>
      {resumable ? (
        <View style={styles.resumeCard}>
          <View style={styles.resumeTop}>
            <View style={styles.scoreTile}>
              <Text style={styles.scoreTileGlyph}>♪</Text>
            </View>
            <View style={styles.stuTexts}>
              <Text style={styles.stuTitle} numberOfLines={1}>
                {resumeNames}·尚未确认
              </Text>
              <Text style={styles.stuCaption}>有一节课程还未确认</Text>
            </View>
          </View>
          <View style={styles.resumeBtns}>
            <TouchableOpacity
              style={styles.resumeBtn}
              activeOpacity={0.88}
              onPress={() => resume(resumable)}>
              <LinearGradient
                colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                start={{x: 0.5, y: 0}}
                end={{x: 0.5, y: 1}}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.resumeBtnText}>继续课程</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resumeBtn, styles.resumeBtnGhost]}
              activeOpacity={0.8}
              onPress={() => {
                setResumable(null);
                clearOpen();
              }}>
              <Text style={[styles.resumeBtnText, styles.resumeBtnGhostText]}>暂不继续</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.pickCard}>
        <Text style={styles.pieceTitle}>选择上课学生</Text>
        <View style={styles.searchBox}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={filter}
            onChangeText={setFilter}
            placeholder="名单里没有，搜索学生码"
            placeholderTextColor="#A1A1B4"
            autoCapitalize="none"
          />
        </View>
        {students == null ? (
          <ActivityIndicator color={colors.primary} style={styles.spin} />
        ) : (
          <View style={styles.stuGrid}>
            {shownStudents.map(sd => {
              const on = isSelected(sd.id);
              return (
                <TouchableOpacity
                  key={sd.id}
                  style={[styles.stuTile, on && styles.stuTileOn]}
                  activeOpacity={0.85}
                  disabled={starting}
                  onPress={() => toggleSelect(sd)}>
                  <Image
                    source={dark ? Images.avatarCapDark : Images.avatarCapLight}
                    style={styles.stuTileAvatar}
                  />
                  <View style={styles.stuTexts}>
                    <Text style={styles.stuTileName} numberOfLines={1}>
                      {nameOf(sd)}
                    </Text>
                    <Text style={styles.stuTileSub} numberOfLines={1}>
                      {sd.pieces && sd.pieces.length ? `${sd.pieces.length} 首曲目` : '点击上课'}
                    </Text>
                  </View>
                  {on ? (
                    <View style={styles.stuTick}>
                      <Text style={styles.stuTickText}>✓</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {students != null && !shownStudents.length && !codeIsNew ? (
          <Text style={styles.hint}>
            {codeQ ? '没有找到这位学生。' : '还没有学生。可以在「学生信息录入」或「陪练提示设置」里先添加，或在上面输入学生码。'}
          </Text>
        ) : null}
        {codeIsNew ? (
          <TouchableOpacity style={styles.codeRow} activeOpacity={0.8} onPress={addByCode}>
            <Text style={styles.codeRowText}>用学生码「{codeQ}」加入本节课 ›</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {starting ? <ActivityIndicator color={colors.primary} style={styles.spin} /> : null}
      <Text style={styles.hint}>
        上课时把手机放在琴边、停在本页。可点「息屏省电」几乎熄屏省电（识别不停），点屏幕即可亮回。换曲子时说「现在开始下一首」，或点「下一首」。下课点「结束整理」，每条可选挂到通用重点或谱面分段重点。
      </Text>
    </>
  );

  const renderPickFooter = () => {
    const dis = starting || selected.length < 1;
    return (
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.88}
          disabled={dis}
          onPress={() => begin(selected)}
          style={[styles.footBtn, dis && styles.btnDim]}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.footText}>
            {starting ? '准备中…' : '开始上课'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const clock3 = sec => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const r = sec % 60;
    const z = n => (n < 10 ? '0' : '') + n;
    return `${z(h)}:${z(m)}:${z(r)}`;
  };

  const openScoreEditor = () => {
    if (!curPiece) {
      Alert.alert('先填曲目名称', '请先在「当前曲目」里输入曲目名称，再编辑乐谱。');
      return;
    }
    navigation.navigate('ScoreEditor', {
      studentId: (lessonPeople || [])[0]?.id || getDeviceId(),
      studentName: namesOf(lessonPeople),
      pieceName: curPiece,
    });
  };

  const segNums = curPiece ? pieceSegs[curPiece] : undefined;
  const scoreAdded = Array.isArray(segNums) && segNums.length > 0;
  const charsNow = current && current.chars ? current.chars : 0;
  const PlayGlyph = () => <View style={styles.playTri} />;
  const PauseGlyph = () => (
    <View style={styles.pauseWrap}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );

  const renderLive = () => (
    <>
      <View style={styles.stuCard}>
        <Image source={dark ? Images.avatarCapDark : Images.avatarCapLight} style={styles.stuAvatar} />
        <View style={styles.stuTexts}>
          <Text style={styles.stuTitle} numberOfLines={1}>
            {namesOf(lessonPeople)}
          </Text>
          <Text style={styles.stuCaption}>当前学生</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            Alert.alert('切换学生', '要换学生，请先点「结束整理」保存本节课，再重新开始上课录音。')
          }>
          <Text style={styles.stuSwitch}>切换学生 ›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusTop}>
          <View style={[styles.statusDot, listening && styles.statusDotOn]} />
          <Text style={[styles.statusName, listening && styles.statusNameOn]}>
            {listening ? '正在录音' : starting ? '等待开始' : '已暂停'}
          </Text>
          <View style={styles.flex} />
          <Text style={styles.statusClock}>{clock3(elapsed)}</Text>
        </View>
        <View style={styles.statusLine} />
        <View style={styles.statusChips}>
          <View style={[styles.sChip, listening && styles.sChipOn]}>
            <Text style={[styles.sChipText, listening && styles.sChipTextOn]}>
              {listening ? '正在识别' : starting ? '等待录音启动' : '已暂停'}
            </Text>
          </View>
          <View style={[styles.sChip, listening && styles.sChipOn]}>
            <Text style={[styles.sChipText, listening && styles.sChipTextOn]}>
              {charsNow ? `已记下 ${charsNow} 字` : '暂无录音内容'}
            </Text>
          </View>
        </View>
      </View>
      {netBad ? <Text style={styles.warn}>网络不稳，说的话先存在手机上，连上后自动补传。</Text> : null}
      {gapNote ? <Text style={styles.warn}>{gapNote}</Text> : null}

      <View style={styles.pieceCard}>
        <View style={styles.pieceHead}>
          <Text style={styles.pieceTitle}>当前曲目</Text>
          <View style={styles.pieceBadge}>
            <Text style={styles.pieceBadgeText}>第{segments.length || 1}首</Text>
          </View>
        </View>
        <TextInput
          style={styles.pieceInput}
          value={curPiece}
          onChangeText={t => pickPiece(curIdx, t)}
          placeholder="请输入曲目名称"
          placeholderTextColor="#A1A1B4"
        />
        {pieces.length ? pieceChips(curIdx, curPiece) : null}
        <View style={styles.pieceLine} />
        <TouchableOpacity style={styles.scoreRow} activeOpacity={0.8} onPress={openScoreEditor}>
          <View style={styles.scoreTile}>
            <Text style={styles.scoreTileGlyph}>♪</Text>
          </View>
          <View style={styles.stuTexts}>
            <Text style={styles.scoreTitle}>编辑和调整乐谱</Text>
            <Text style={styles.scoreSub} numberOfLines={1}>
              {scoreAdded ? `已添加乐谱·${segNums.length}条分段标记` : '点击上传乐谱，添加演奏重点'}
            </Text>
          </View>
          <View style={[styles.sChip, scoreAdded && styles.sChipOn]}>
            <Text style={[styles.sChipText, scoreAdded && styles.sChipTextOn]}>
              {scoreAdded ? '已添加' : '未添加'}
            </Text>
          </View>
        </TouchableOpacity>
        {current && (current.points || []).length
          ? (current.points || []).map((pt, i) => (
              <Text key={i} style={styles.point}>
                · {pt}
              </Text>
            ))
          : null}
      </View>

      <TouchableOpacity
        style={[styles.addPiece, nextPending && styles.btnDim]}
        activeOpacity={0.8}
        disabled={nextPending}
        onPress={() => {
          pressNext();
          setNewPieceOpen(false);
        }}>
        <Text style={styles.addPieceText}>＋  新增曲目</Text>
      </TouchableOpacity>

      {dimmed ? (
        <Text style={styles.warn}>已关屏省电（识别仍在跑）。点屏幕任意处，或点「亮屏」恢复亮度。</Text>
      ) : null}

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

  const renderLivePanel = () => (
    <View style={styles.panel}>
      <View style={styles.panelRow}>
        <TouchableOpacity
          style={styles.panelSide}
          activeOpacity={0.8}
          onPress={() => (dimmed ? undim() : dimOn())}>
          <View style={styles.panelPill}>
            <Text style={styles.panelPillGlyph}>☾</Text>
          </View>
          <Text style={styles.panelLabel}>{dimmed ? '亮屏' : '息屏省电'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={starting}
          onPress={listening ? pause : startListening}
          style={styles.panelMain}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={StyleSheet.absoluteFill}
          />
          {listening ? <PauseGlyph /> : <PlayGlyph />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.panelSide, nextPending && styles.btnDim]}
          activeOpacity={0.8}
          disabled={nextPending}
          onPress={() => {
            pressNext();
            setNewPieceOpen(false);
          }}>
          <View style={styles.panelPill}>
            <Text style={styles.panelPillGlyph}>⏭︎</Text>
          </View>
          <Text style={styles.panelLabel}>{nextPending ? '切换中' : '下一首'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity activeOpacity={0.88} disabled={starting} onPress={askFinish} style={styles.finishBtn}>
        <LinearGradient
          colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
          start={{x: 0.5, y: 0}}
          end={{x: 0.5, y: 1}}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.finishSq} />
        <Text style={styles.finishText}>结束整理</Text>
      </TouchableOpacity>
    </View>
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
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>如何分配课堂重点？</Text>
          <Text style={styles.howSub}>
            通用重点:适用于整首曲目。 分段重点:仅适用于指定乐段。
          </Text>
        </View>
        {reviewSegs.map((g, i) => {
          const chosen = pieceFor[g.idx] || g.piece || '';
          const pts = edits[g.idx] || g.points || [];
          const off = !!skip[g.idx];
          const segs = pieceSegs[chosen] || [];
          const zh = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
          return (
            <View key={g.idx} style={[styles.reviewCard, off && styles.cardOff]}>
              <View style={styles.scoreRowTop}>
                <View style={styles.scoreTile}>
                  <Text style={styles.scoreTileGlyph}>♪</Text>
                </View>
                <View style={styles.stuTexts}>
                  <Text style={styles.stuTitle} numberOfLines={1}>
                    第{zh[i] || i + 1}首·{chosen || '还没选曲目'}
                  </Text>
                  <Text style={styles.stuCaption}>{pts.length}条重点</Text>
                </View>
                <TouchableOpacity onPress={() => setSkip(prev => ({...prev, [g.idx]: !off}))}>
                  <Text style={styles.stuSwitch}>{off ? '要挂' : '这首不挂'}</Text>
                </TouchableOpacity>
              </View>
              {!off ? (
                <>
                  {pieces.length ? pieceChips(g.idx, chosen) : null}
                  <TextInput
                    style={styles.pieceInput}
                    value={pieces.includes(chosen) ? '' : chosen}
                    onChangeText={t => pickPiece(g.idx, t)}
                    placeholder="或者写新曲目的名字"
                    placeholderTextColor="#A1A1B4"
                  />
                  <View style={styles.pieceLine} />
                  <View style={styles.listHead}>
                    <Text style={styles.listTitle}>课堂重点列表（{pts.length}）</Text>
                    <TouchableOpacity
                      style={styles.addPill}
                      activeOpacity={0.8}
                      onPress={() => {
                        const arr = [...(edits[g.idx] || g.points || []), ''];
                        setEdits(prev => ({...prev, [g.idx]: arr}));
                        setPointTarget(g.idx, arr.length - 1, 'global');
                      }}>
                      <Text style={styles.addPillText}>＋ 添加重点</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.listLine} />
                  {pts.map((p, j) => {
                    const tg = targets[`${g.idx}:${j}`] || {target: 'global', seg: 0};
                    const key = `${g.idx}:${j}`;
                    const scopeText =
                      tg.target === 'section' && tg.seg ? `第${tg.seg}段` : '通用重点';
                    return (
                      <View key={j} style={styles.pointBlock}>
                        <View style={styles.pointHead}>
                          <View style={styles.pointBadge}>
                            <Text style={styles.pointBadgeText}>
                              重点{j + 1 < 10 ? '0' : ''}
                              {j + 1}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.delPill}
                            activeOpacity={0.8}
                            onPress={() =>
                              setEdits(prev => {
                                const arr = (prev[g.idx] || g.points || []).slice();
                                arr.splice(j, 1);
                                return {...prev, [g.idx]: arr};
                              })
                            }>
                            <Text style={styles.delPillText}>🗑 删除</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={styles.scopeRow}
                          activeOpacity={0.8}
                          onPress={() => setScopeOpen(prev => ({...prev, [key]: !prev[key]}))}>
                          <Text style={styles.scopeLabel}>适用范围</Text>
                          <Text style={styles.scopeValue}>{scopeText}  ›</Text>
                        </TouchableOpacity>
                        {scopeOpen[key] ? (
                          <View style={styles.scopeChips}>
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
                        ) : null}
                        <TextInput
                          style={styles.pointInput}
                          value={p}
                          multiline
                          placeholder="请输入教案内容"
                          placeholderTextColor="#A1A1B4"
                          onChangeText={t =>
                            setEdits(prev => {
                              const arr = (prev[g.idx] || g.points || []).slice();
                              arr[j] = t;
                              return {...prev, [g.idx]: arr};
                            })
                          }
                        />
                      </View>
                    );
                  })}
                  {!pts.length ? <Text style={styles.hint}>这首没整理出重点。</Text> : null}
                  <TouchableOpacity
                    onPress={() => {
                      if (!fullText) loadFullText();
                      setOpenText(prev => ({...prev, [g.idx]: !prev[g.idx]}));
                    }}>
                    <Text style={styles.link}>{openText[g.idx] ? '收起原话' : `看原话（${g.chars || 0} 字）`}</Text>
                  </TouchableOpacity>
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
      </>
    );
  };

  const renderReviewFooter = () =>
    summarizing ? null : (
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.88}
          disabled={saving}
          onPress={confirm}
          style={[styles.footBtn, saving && styles.btnDim]}>
          <LinearGradient
            colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
            start={{x: 0.5, y: 0}}
            end={{x: 0.5, y: 1}}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.footText}>{saving ? '正在挂…' : '确认并挂到曲目'}</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <EdgeSafeArea edges={['bottom', 'left', 'right']} style={styles.root}>
      <ScreenHeader
        title={phase === 'live' ? '录音详情' : '上课录音'}
        onBack={leave}
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.body, styles.bodyLive]}
          keyboardShouldPersistTaps="handled">
          {phase === 'pick' ? renderPick() : phase === 'live' ? renderLive() : renderReview()}
        </ScrollView>
        {phase === 'live'
          ? renderLivePanel()
          : phase === 'pick'
            ? renderPickFooter()
            : renderReviewFooter()}
      </KeyboardAvoidingView>
      {dimmed && phase === 'live' ? (
        <TouchableOpacity style={styles.dimMask} activeOpacity={1} onPress={undim}>
          <Text style={styles.dimText}>点一下恢复亮度{"\n"}识别仍在继续</Text>
        </TouchableOpacity>
      ) : null}
    </EdgeSafeArea>
  );
}

function makeStyles(colors, dark) {
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
    resumeCard: {
      borderRadius: 12,
      backgroundColor: colors.card,
      padding: 15,
      marginBottom: 15,
    },
    resumeTop: {flexDirection: 'row', alignItems: 'center'},
    resumeBtns: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 15},
    resumeBtn: {
      flex: 1,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    resumeBtnGhost: {borderWidth: 1, borderColor: dark ? '#B595FF' : colors.primary},
    resumeBtnText: {fontSize: 14, fontWeight: '500', color: '#fff'},
    resumeBtnGhostText: {color: dark ? '#B595FF' : colors.primary},
    pickCard: {
      borderRadius: 12,
      backgroundColor: colors.card,
      padding: 15,
      marginBottom: 15,
    },
    searchBox: {
      marginTop: 15,
      height: 44,
      borderRadius: 8,
      backgroundColor: dark ? '#131444' : '#F7F7F7',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    searchGlyph: {fontSize: 20, color: '#A1A1B4', marginRight: 8},
    searchInput: {flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: 0},
    stuGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 15},
    stuTile: {
      width: '48.5%',
      height: 60,
      borderRadius: 8,
      marginBottom: 15,
      paddingLeft: 11,
      backgroundColor: dark ? '#131444' : '#F7F7F7',
      borderWidth: 1,
      borderColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
    },
    stuTileOn: {borderColor: dark ? '#B595FF' : colors.primary},
    stuTileAvatar: {width: 36, height: 36, borderRadius: 18},
    stuTileName: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    stuTileSub: {fontSize: 12, color: '#A1A1B4', marginTop: 1},
    stuTick: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 20,
      height: 20,
      borderTopLeftRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? '#B595FF' : colors.primary,
    },
    stuTickText: {fontSize: 12, fontWeight: '700', color: '#fff'},
    codeRow: {
      marginTop: 4,
      height: 40,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.16)' : '#FFE9EE',
    },
    codeRowText: {fontSize: 13, fontWeight: '500', color: dark ? '#B595FF' : colors.primary},
    footer: {backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8},
    footBtn: {
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    footText: {fontSize: 16, fontWeight: '600', color: '#fff'},
    howCard: {borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 15, paddingVertical: 13, marginBottom: 15},
    howTitle: {fontSize: 16, fontWeight: '600', color: colors.textPrimary},
    howSub: {fontSize: 12, color: '#A1A1B4', marginTop: 5, lineHeight: 17},
    reviewCard: {borderRadius: 12, backgroundColor: colors.card, padding: 15, marginBottom: 15},
    scoreRowTop: {flexDirection: 'row', alignItems: 'center'},
    listHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12},
    listTitle: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    addPill: {
      height: 24,
      paddingHorizontal: 10,
      borderRadius: 6,
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.16)' : '#FFE9EE',
    },
    addPillText: {fontSize: 12, color: dark ? '#B595FF' : colors.primary},
    listLine: {height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(161,161,180,0.3)', marginTop: 12},
    pointBlock: {marginTop: 15},
    pointHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    pointBadge: {
      height: 24,
      paddingHorizontal: 10,
      borderRadius: 6,
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    pointBadgeText: {fontSize: 12, fontWeight: '500', color: '#fff'},
    delPill: {
      height: 24,
      paddingHorizontal: 10,
      borderRadius: 6,
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(255,55,97,0.16)' : '#FFE9EE',
    },
    delPillText: {fontSize: 12, color: '#FF3761'},
    scopeRow: {
      marginTop: 10,
      height: 44,
      borderRadius: 8,
      paddingHorizontal: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: dark ? '#131444' : '#F7F7F7',
    },
    scopeLabel: {fontSize: 14, color: colors.textPrimary},
    scopeValue: {fontSize: 14, color: colors.textPrimary},
    scopeChips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
    pointInput: {
      marginTop: 10,
      minHeight: 44,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: dark ? '#131444' : '#F7F7F7',
    },
    bodyLive: {paddingTop: 10, paddingHorizontal: 15, paddingBottom: 16},
    // ---- 录音详情（蓝湖 345 宽卡片，卡片色 / 内部块 #131444） ----
    stuCard: {
      height: 70,
      borderRadius: 12,
      backgroundColor: colors.card,
      paddingHorizontal: 15,
      marginBottom: 13,
      flexDirection: 'row',
      alignItems: 'center',
    },
    stuAvatar: {width: 44, height: 44, borderRadius: 22, backgroundColor: dark ? '#F3E6FF' : '#FFE3EA'},
    stuTexts: {flex: 1, marginLeft: 10, marginRight: 6},
    stuTitle: {fontSize: 16, fontWeight: '600', color: colors.textPrimary},
    stuCaption: {fontSize: 12, color: '#A1A1B4', marginTop: 3},
    stuSwitch: {fontSize: 12, color: '#A1A1B4'},
    statusCard: {
      borderRadius: 12,
      backgroundColor: colors.card,
      paddingHorizontal: 15,
      paddingTop: 11,
      paddingBottom: 15,
      marginBottom: 15,
    },
    statusTop: {flexDirection: 'row', alignItems: 'center', height: 24},
    statusDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#A1A1B4', marginRight: 5},
    statusDotOn: {backgroundColor: dark ? '#B595FF' : '#FF3761'},
    statusName: {fontSize: 14, fontWeight: '600', color: '#A1A1B4'},
    statusNameOn: {color: colors.textPrimary},
    statusClock: {fontSize: 15, fontWeight: '600', color: colors.textPrimary},
    statusLine: {height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(161,161,180,0.4)', marginTop: 11},
    statusChips: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 9},
    sChip: {
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 4,
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(161,161,180,0.16)' : 'rgba(161,161,180,0.18)',
    },
    sChipOn: {backgroundColor: dark ? 'rgba(25,196,138,0.16)' : 'rgba(25,196,138,0.14)'},
    sChipText: {fontSize: 11, color: '#A1A1B4'},
    sChipTextOn: {color: '#19C48A'},
    pieceCard: {
      borderRadius: 12,
      backgroundColor: colors.card,
      padding: 15,
      marginBottom: 15,
    },
    pieceHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 24},
    pieceTitle: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    pieceBadge: {
      height: 24,
      paddingHorizontal: 14,
      borderRadius: 6,
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : '#FFE9EE',
    },
    pieceBadgeText: {fontSize: 12, color: dark ? '#B595FF' : colors.primary},
    pieceInput: {
      marginTop: 11,
      height: 44,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: dark ? '#131444' : '#F7F7F7',
    },
    pieceLine: {height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(161,161,180,0.4)', marginTop: 15},
    scoreRow: {flexDirection: 'row', alignItems: 'center', marginTop: 15},
    scoreTile: {
      width: 44,
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : '#FFE9EE',
    },
    scoreTileGlyph: {fontSize: 22, color: dark ? '#B595FF' : colors.primary},
    scoreTitle: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    scoreSub: {fontSize: 12, color: '#A1A1B4', marginTop: 5},
    addPiece: {
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    addPieceText: {fontSize: 14, fontWeight: '600', color: dark ? '#B595FF' : colors.primary},
    panel: {
      marginHorizontal: 15,
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: dark ? 'rgba(181,149,255,0.35)' : 'rgba(255,55,97,0.2)',
      paddingTop: 26,
      paddingHorizontal: 15,
      paddingBottom: 15,
    },
    panelRow: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 30},
    panelSide: {width: 60, alignItems: 'center', marginTop: 12},
    panelPill: {
      width: 60,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.2)' : '#FFE9EE',
    },
    panelPillGlyph: {fontSize: 17, color: dark ? '#B595FF' : colors.primary},
    panelLabel: {fontSize: 12, color: '#A1A1B4', marginTop: 6},
    panelMain: {
      width: 60,
      height: 60,
      borderRadius: 30,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playTri: {
      marginLeft: 4,
      width: 0,
      height: 0,
      borderTopWidth: 9,
      borderBottomWidth: 9,
      borderLeftWidth: 15,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: '#FAFAFA',
    },
    pauseWrap: {flexDirection: 'row', gap: 6},
    pauseBar: {width: 4, height: 18, borderRadius: 2, backgroundColor: '#FAFAFA'},
    finishBtn: {
      height: 44,
      marginTop: 15,
      borderRadius: 10,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    finishSq: {
      width: 14,
      height: 14,
      borderWidth: 2,
      borderColor: '#fff',
      borderRadius: 2,
      marginRight: 10,
    },
    finishText: {fontSize: 14, fontWeight: '600', color: '#fff'},
    row: {flexDirection: 'row', alignItems: 'center', gap: 10},
    rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    flex: {flex: 1},
    spin: {marginVertical: 16},
    center: {alignItems: 'center', paddingVertical: 60},
    chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6},
    chip: {
      borderRadius: 6,
      height: 24,
      paddingHorizontal: 10,
      justifyContent: 'center',
      backgroundColor: dark ? 'rgba(181,149,255,0.16)' : '#FFE9EE',
    },
    chipOn: {backgroundColor: colors.primary},
    chipText: {color: dark ? '#B595FF' : colors.primary, fontSize: 12},
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
    stuChipOn: {backgroundColor: colors.primary, borderColor: colors.primary},
    stuName: {color: colors.textPrimary, fontSize: 16, fontWeight: '700'},
    stuNameOn: {color: '#fff'},
    stuSub: {color: colors.textSecondary, fontSize: 12, marginTop: 2},
    stuSubOn: {color: 'rgba(255,255,255,0.85)'},
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
