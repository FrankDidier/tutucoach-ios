#ifndef TUTU_PIANO_TONE_H
#define TUTU_PIANO_TONE_H

// 分辨琴声和说话声。琴键按下后泛音的音高几乎一点不动，而且只会慢慢变弱；
// 人声（哼歌、拖长音、念经似的读）音高总在微微抖，响度是撑着或往上走的。
// 只看最近两秒。门限跟着房间底噪走，琴离得远也能听到。和安卓 PianoTone.java 是同一套算法。

#define TUTU_TONE_RATE 16000
#define TUTU_TONE_N 2048
#define TUTU_TONE_HOP 512
#define TUTU_TONE_LAG 3
#define TUTU_TONE_LAG2 6
#define TUTU_TONE_PEAKS 24
#define TUTU_TONE_FRAMES 62
// 每隔 16 帧（约半秒）看一次是不是琴声，最近约 2 秒里有两次是就算在弹。
// 停下来后不要拖太久还当成在弹，不然会一直念重点。
#define TUTU_TONE_CHECK 16
#define TUTU_TONE_RECENT 62
// 听音辨谱：每半秒把响着的泛音按十二个音名攒成一格，服务器拿它认弹到谱上哪一段。和安卓 PianoTone 一样。
#define TUTU_CHROMA_BLOCK 16
#define TUTU_CHROMA_MIN 4
#define TUTU_CHROMA_KEEP 32

typedef struct {
  float rms;      // 最近一秒的响度，0~1（原始振幅 / 0.20，和以前的刻度一样）
  float piano;    // 响着的那些帧里泛音锁得多紧，0~1。琴声多在 0.4 以上，说话接近 0
  float loud;     // 最近两秒里高过底噪的帧占多少
  float swing;    // 两秒里响的时候和轻的时候差几倍
  float tframes;  // 响着的帧里泛音锁住的帧占多少
  float fall;     // 锁住的泛音里在变弱的占多少（琴声只会变弱）
  float p3;       // 至少三个泛音连续 0.2 秒不动的帧占多少
} TutuToneLevel;

/* 0=piano 1=violin 2=guzheng 3=erhu —— 与安卓 InstrumentPrefs 对齐 */
#define TUTU_INST_PIANO 0
#define TUTU_INST_VIOLIN 1
#define TUTU_INST_GUZHENG 2
#define TUTU_INST_ERHU 3

typedef struct {
  float window[TUTU_TONE_N];
  float hann[TUTU_TONE_N];
  float hop[TUTU_TONE_HOP];
  float re[TUTU_TONE_N];
  float im[TUTU_TONE_N];
  float mag[TUTU_TONE_N / 2 + 1];
  int filled;
  int fresh;
  float peakFreq[TUTU_TONE_LAG2 + 1][TUTU_TONE_PEAKS];
  float peakAmp[TUTU_TONE_LAG2 + 1][TUTU_TONE_PEAKS];
  int peakCount[TUTU_TONE_LAG2 + 1];
  int peakAt;
  long frames;
  float floor;
  float rms[TUTU_TONE_FRAMES];
  float gate[TUTU_TONE_FRAMES];
  float tight[TUTU_TONE_FRAMES];
  float fall[TUTU_TONE_FRAMES];
  float rise[TUTU_TONE_FRAMES];
  int pers[TUTU_TONE_FRAMES];
  int ringAt;
  int ringCount;
  long hitLast;
  long hitPrev;
  TutuToneLevel hit;
  int instrument; // TUTU_INST_*
  float chromaAcc[12];
  int chromaFrames;
  int chromaVoiced;
  int chroma[TUTU_CHROMA_KEEP][12];
  int chromaHead;
  int chromaCount;
  int pitchCount[128];
  int pitch[TUTU_CHROMA_KEEP][4];
  int pitchN[TUTU_CHROMA_KEEP];
} TutuPianoTone;


void tutu_tone_reset(TutuPianoTone *t);
void tutu_tone_set_instrument(TutuPianoTone *t, int instrument);
int tutu_tone_instrument(const TutuPianoTone *t);
// 送进 16k 单声道样本，-1~1。
void tutu_tone_push(TutuPianoTone *t, const float *samples, int count);
TutuToneLevel tutu_tone_level(const TutuPianoTone *t);
// 像琴声：两秒里至少三成时间有声音、响度在起落，并且泛音锁住还在变弱，或者好几个泛音一直不动。
int tutu_tone_is_piano(TutuToneLevel lv);
// 按乐器场景判断是否在练（钢琴衰减 / 小提琴持续 / 古筝拨弦）。
int tutu_tone_is_playing(TutuToneLevel lv, int instrument);
// 最近 4 秒里有没有两次听到琴声。听到了 out 是最近那次的情况，没听到是现在的情况。
int tutu_tone_heard(const TutuPianoTone *t, TutuToneLevel *out);
// 取走上次之后攒下的音名格子，每格 12 个 0~99。返回取走了几格。
int tutu_tone_drain_chroma(TutuPianoTone *t, int out[][12], int max);
// 和上一批 chroma 格子对齐的 MIDI。先取 pitches 再取 chroma（chroma 会清掉计数）。
int tutu_tone_drain_pitches(TutuPianoTone *t, int out[][4], int *counts, int max);
// 从频谱峰留基频。mono 非 0 时只留一个音。返回写入 out 的个数。
int tutu_tone_fundamentals(const float *freq, const float *amp, int count, int mono, int *out, int max);

#endif
