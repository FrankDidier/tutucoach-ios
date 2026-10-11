#ifndef TUTU_PIANO_TONE_H
#define TUTU_PIANO_TONE_H

// 分辨琴声和说话声。琴键按下后音高不动、慢慢变弱；说话、角色自己的声音音高一直在滑。
// 只看最近两秒：频谱里的峰在 0.1 秒后还在不在原来的位置。和安卓 PianoTone.java 是同一套算法。

#define TUTU_TONE_RATE 16000
#define TUTU_TONE_N 2048
#define TUTU_TONE_HOP 512
#define TUTU_TONE_LAG 3
#define TUTU_TONE_PEAKS 12
#define TUTU_TONE_FRAMES 62

typedef struct {
  float window[TUTU_TONE_N];
  float hann[TUTU_TONE_N];
  float hop[TUTU_TONE_HOP];
  float re[TUTU_TONE_N];
  float im[TUTU_TONE_N];
  float mag[TUTU_TONE_N / 2 + 1];
  int filled;
  int fresh;
  float peakFreq[TUTU_TONE_LAG + 1][TUTU_TONE_PEAKS];
  int peakCount[TUTU_TONE_LAG + 1];
  int peakAt;
  long frames;
  float rms[TUTU_TONE_FRAMES];
  float steady[TUTU_TONE_FRAMES];
  int ringAt;
  int ringCount;
} TutuPianoTone;

typedef struct {
  float rms;    // 最近一秒的响度，0~1（原始振幅 / 0.20，和以前的刻度一样）
  float piano;  // 响着的那些帧里音高稳不稳，0~1。琴声多在 0.5 以上，说话接近 0
  float loud;   // 最近两秒里有声音的帧占多少
  float swing;  // 两秒里响的时候和轻的时候差几倍
} TutuToneLevel;

void tutu_tone_reset(TutuPianoTone *t);
// 送进 16k 单声道样本，-1~1。
void tutu_tone_push(TutuPianoTone *t, const float *samples, int count);
TutuToneLevel tutu_tone_level(const TutuPianoTone *t);
// 像琴声：两秒里至少三成时间有声音，音高是稳的，响度还在起落。
int tutu_tone_is_piano(TutuToneLevel lv);

#endif
